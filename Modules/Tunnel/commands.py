"""Command-line routing and reversible shell installation."""
import json
import os
from pathlib import Path
import shlex
import shutil

ROOT = Path(__file__).resolve().parent
AGENTS = ("claude", "codex", "cline")
OPTIONS = {"host": "host", "path": "directory", "profile": "profile", "os": "os",
           "port": "port", "identity": "identity_file", "known-hosts": "known_hosts",
           "ssh-config": "ssh_config", "jump": "proxy_jump"}
BEGIN = "# >>> Tunnel CLI routing >>>"
END = "# <<< Tunnel CLI routing <<<"


def parse(args):
    """Consume only our namespaced options; preserve every native argument."""
    options, native = {}, []
    index = 0
    while index < len(args):
        arg = args[index]
        if arg == "--":
            native.extend(args[index:])
            break
        if not arg.startswith("--tunnel-"):
            native.append(arg)
            index += 1
            continue
        name, separator, value = arg[len("--tunnel-"):].partition("=")
        if name not in OPTIONS:
            raise ValueError("Unknown Tunnel option: " + arg)
        if not separator:
            index += 1
            if index == len(args) or args[index].startswith("--"):
                raise ValueError("Missing value for " + arg)
            value = args[index]
        if not value:
            raise ValueError("Empty value for " + arg)
        options[OPTIONS[name]] = value
        index += 1
    return options, native


def target(options):
    profile = options.get("profile")
    cfg = {}
    if profile:
        if Path(profile).name != profile or profile in (".", ".."):
            raise ValueError("Profile must be a name from profiles/")
        cfg = json.loads((ROOT / "profiles" / (profile + ".json")).read_text(encoding='utf-8'))
    cfg.update({key: value for key, value in options.items() if key != "profile"})
    if not cfg.get("host") or not cfg.get("directory"):
        raise ValueError("Remote mode requires --tunnel-host and --tunnel-path, or --tunnel-profile")
    if cfg["host"].startswith("-"):
        raise ValueError("Invalid SSH host")
    cfg.setdefault("os", "linux")
    if cfg["os"] not in ("linux", "macos", "windows"):
        raise ValueError("Target OS must be linux, macos, or windows")
    for field in ("identity_file", "known_hosts", "ssh_config"):
        if cfg.get(field):
            # Profiles are portable with the project; explicit CLI paths use the caller's cwd.
            base = Path.cwd() if field in options else ROOT
            cfg[field] = str((base / Path(cfg[field]).expanduser()).resolve())
    return cfg


def native_executable(agent):
    paths = [p for p in os.get_exec_path() if Path(p).resolve() != (ROOT / "bin").resolve()]
    executable = shutil.which(agent, path=os.pathsep.join(paths))
    if not executable and agent == "cline":
        bundled = ROOT / ".tunnel/cline/node_modules/.bin/cline"
        if bundled.exists():
            executable = str(bundled)
    if not executable:
        raise FileNotFoundError("Install the original " + agent + " CLI first")
    return executable


def shell_config():
    shell = Path(os.environ.get("SHELL", "/bin/zsh")).name
    if shell == "zsh":
        return Path.home() / ".zshrc"
    if shell == "bash":
        return Path.home() / (".bash_profile" if __import__('sys').platform == "darwin" else ".bashrc")
    raise ValueError("Automatic PATH setup supports zsh/bash; add Tunnel/bin to your shell PATH manually")


def edit_shell(path, install):
    content = path.read_text(encoding='utf-8') if path.exists() else ""
    if BEGIN in content:
        start = content.index(BEGIN)
        end = content.index(END, start) + len(END)
        if content[end:end+1] == "\n":
            end += 1
        content = content[:start] + content[end:]
    if install:
        if content and not content.endswith("\n"):
            content += "\n"
        content += BEGIN + "\nexport PATH=" + shlex.quote(str(ROOT / "bin")) + ':"$PATH"\n' + END + "\n"
    path.write_text(content)


def install(python):
    directory = ROOT / "bin"
    directory.mkdir(exist_ok=True)
    for agent in (*AGENTS, "tunnel"):
        args = [python, str(ROOT / "tunnel.py")]
        if agent != "tunnel":
            args += ["_launch", agent]
        path = directory / agent
        path.write_text("#!/bin/sh\nexec " + shlex.join(args) + ' "$@"\n')
        path.chmod(0o755)
    rc = shell_config()
    state = ROOT / ".tunnel"
    state.mkdir(exist_ok=True, mode=0o700)
    backup = state / (rc.name + ".before-install")
    if rc.exists() and not backup.exists():
        shutil.copy2(rc, backup)
    edit_shell(rc, True)
    (state / "installation.json").write_text(json.dumps({"shell_file": str(rc)}))
    print("Installed wrappers in " + str(directory))
    print("New terminals will load them; in an existing terminal: export PATH=" +
          shlex.quote(str(directory)) + ':"$PATH"')


def uninstall():
    state = ROOT / ".tunnel/installation.json"
    if state.exists():
        edit_shell(Path(json.loads(state.read_text(encoding='utf-8'))["shell_file"]), False)
        state.unlink()
    for name in (*AGENTS, "tunnel"):
        path = ROOT / "bin" / name
        if path.exists() and str(ROOT / "tunnel.py") in path.read_text(encoding='utf-8'):
            path.unlink()
    print("Removed Tunnel's shell PATH block. Original CLI installations are unchanged.")
