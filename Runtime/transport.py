"""Build an SSH argv, without passing user input through a local shell."""
import base64
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import threading
import zlib

ROOT = Path(__file__).resolve().parent


def ssh_executable():
    override = os.environ.get("CLOUD_HOSTS_SSH")
    if override:
        return override
    if os.name == "nt":
        # Windows OpenSSH can stall on redirected stdin in a console-less
        # process. Git for Windows SSH was verified with live stdout/stdin
        # pipes on DJF-Windows; keep the Windows OpenSSH fallback for others.
        for program_files in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)")):
            if program_files:
                candidate = Path(program_files) / "Git" / "usr" / "bin" / "ssh.exe"
                if candidate.is_file():
                    return str(candidate)
    return "ssh"


def ssh_args(config, platform=None):
    platform = platform or os.name
    args = [ssh_executable(), "-T", "-o", "BatchMode=no" if config.get("askpass") else "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
            "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2"]
    for field, flag in (("port", "-p"), ("user", "-l"), ("proxy_jump", "-J"),
                        ("identity_file", "-i"), ("ssh_config", "-F")):
        if config.get(field):
            args += [flag, str(config[field])]
    if config.get("askpass"):
        args += ["-o", "NumberOfPasswordPrompts=1"]
    if config.get("identity_file"):
        args += ["-o", "IdentitiesOnly=yes"]
    if config.get("known_hosts"):
        known = str(config["known_hosts"])
        # Windows Git/OpenSSH rejects the JSON-escaped native path inside -o:
        # UserKnownHostsFile="C:\\\\Users..." -> "invalid quotes". Arguments
        # are already passed separately, so use the forward-slash pathname.
        if platform == "nt":
            known = known.replace("\\\\", "/")
        else:
            known = json.dumps(known)
        args += ["-o", "UserKnownHostsFile=" + known]
    return args + [config["host"]]


def ssh_env(config):
    env = os.environ.copy()
    if config.get("askpass"):
        env.update(SSH_ASKPASS=config["askpass"], SSH_ASKPASS_REQUIRE="force", DISPLAY="cloud-hosts")
    return env


def server_command(config):
    code = ("import sys,base64,zlib;sys.stdin.reconfigure(encoding='utf-8');"
            "sys.stdout.reconfigure(encoding='utf-8');"
            "exec(zlib.decompress(base64.b64decode(sys.stdin.readline())))")
    python = config.get("python", "python" if config["os"] == "windows" else "python3")
    if config["os"] == "windows":
        # PowerShell's encoded bootstrap avoids quoting through Windows OpenSSH/cmd.
        quote = lambda s: "'" + s.replace("'", "''") + "'"
        script = "& " + quote(python) + " -c " + quote(code) + "; exit $LASTEXITCODE"
        encoded = base64.b64encode(script.encode("utf-16le")).decode()
        return ssh_args(config) + ["powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand " + encoded]
    return ssh_args(config) + [shlex.join([python, "-c", code])]


def source_line(config):
    target = {k: config[k] for k in ("directory", "os", "shell", "cli_bin") if k in config}
    source = "import json\nCONFIG=json.loads(" + repr(json.dumps(target)) + ")\n"
    source += (ROOT / "workspace_files.py").read_text(encoding='utf-8') + "\n"
    source += (ROOT / "native_io.py").read_text(encoding='utf-8') + "\n"
    source += (ROOT / "remote.py").read_text(encoding='utf-8')
    return base64.b64encode(zlib.compress(source.encode())).decode() + "\n"


def serve(config):
    process = subprocess.Popen(server_command(config), stdin=subprocess.PIPE, env=ssh_env(config),
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    process.stdin.write(source_line(config).encode())
    process.stdin.flush()
    def pump():
        try:
            # A child may fail while the host keeps stdin open. Raw reads avoid
            # holding BufferedReader locks during interpreter shutdown.
            while True:
                chunk = os.read(sys.stdin.fileno(), 65536)
                if not chunk:
                    break
                process.stdin.write(chunk)
                process.stdin.flush()
        except BrokenPipeError:
            pass
        finally:
            process.stdin.close()
    threading.Thread(target=pump, daemon=True).start()
    try:
        return process.wait()
    except KeyboardInterrupt:
        process.terminate()
        return process.wait()


def doctor(config, details=False):
    request = {"jsonrpc": "2.0", "id": 1, "method": "initialize",
               "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "tunnel-doctor", "version": "2"}}}
    result = subprocess.run(server_command(config), input=source_line(config)+json.dumps(request)+"\n", capture_output=True, text=True, timeout=20, env=ssh_env(config),
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "SSH tool server failed")
    response = json.loads(result.stdout)
    return ({'info': response['result']['instructions'],
             'environment': response['result'].get('environment', {})}
            if details else response['result']['instructions'])


def ping(config):
    result = subprocess.run(ssh_args(config) + ["echo __CLOUD_HOSTS_ALIVE__"],
                            capture_output=True, text=True, timeout=20, env=ssh_env(config),
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if result.returncode or "__CLOUD_HOSTS_ALIVE__" not in result.stdout.splitlines():
        raise RuntimeError(result.stderr.strip() or "SSH connection failed")
    return {"connected": True}
