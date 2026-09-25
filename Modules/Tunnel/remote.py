"""Small MCP tool server executed on the target through SSH; Python 3.8+."""
import json
import os
from pathlib import Path
import platform
import shlex
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import queue


def schema(properties, required):
    return {"type": "object", "properties": properties, "required": required,
            "additionalProperties": False}


STRING = {"type": "string"}
TOOLS = [
    {"name": "execute", "description": "Execute a command in the working environment. Returns stdout, stderr, exit_code and cwd. cd persists across calls; environment variables do not.",
     "inputSchema": schema({"command": STRING, "timeout": {"type": "number", "minimum": 0.1, "maximum": 600}}, ["command"])},
    {"name": "read_file", "description": "Read a UTF-8 text file from the working environment. Optional one-based line range.",
     "inputSchema": schema({"path": STRING, "start_line": {"type": "integer", "minimum": 1}, "end_line": {"type": "integer", "minimum": 1}}, ["path"])},
    {"name": "write_file", "description": "Write a UTF-8 text file in the working environment. Creates parent directories and replaces existing content.",
     "inputSchema": schema({"path": STRING, "content": STRING}, ["path", "content"])},
    {"name": "edit_file", "description": "Replace an exact text occurrence in an existing file. Multiple matches require replace_all=true.",
     "inputSchema": schema({"path": STRING, "old_text": STRING, "new_text": STRING, "replace_all": {"type": "boolean"}}, ["path", "old_text", "new_text"])},
    {"name": "list_files", "description": "List a directory in the working environment, including hidden entries.",
     "inputSchema": schema({"path": STRING}, [])},
]


def linux_distribution(text):
    values = {}
    for line in text.splitlines():
        if '=' in line and not line.startswith('#'):
            key, value = line.split('=', 1)
            if key in ('ID', 'PRETTY_NAME'):
                values[key] = value.strip().strip('"\'')
    return {'distribution': values.get('ID', '').lower(),
            'distributionName': values.get('PRETTY_NAME', '')}


if "workspace_files" not in globals():
    from workspace_files import workspace_files


class Workspace:
    def __init__(self, config, state):
        self.cwd = Path(config["directory"]).expanduser().resolve()
        if not self.cwd.is_dir():
            raise ValueError("Target working directory does not exist: " + str(self.cwd))
        self.root = self.cwd
        self.env=dict(os.environ)
        if config.get("cli_bin"):self.env["PATH"]=config["cli_bin"]+os.pathsep+self.env.get("PATH","")
        self.process = None
        self.closed = False
        self.windows = os.name == "nt"
        if self.windows != (config["os"] == "windows"):
            raise ValueError("Target OS does not match --tunnel-os")
        self.shell = config.get("shell", "powershell.exe" if self.windows else "/bin/bash")
        self.state = Path(state) / "cwd"
        self.info = {"os": platform.system(), "hostname": socket.gethostname(), "cwd": str(self.cwd),
                     "shell": self.shell, "pid": os.getpid()}
        if self.info['os'] == 'Linux':
            try:
                self.info.update(linux_distribution(Path('/etc/os-release').read_text(encoding='utf-8')))
            except OSError:
                pass

    def path(self, value):
        return (self.cwd / Path(value).expanduser()).resolve()

    @staticmethod
    def read(path):
        with path.open(encoding="utf-8", newline="") as stream:
            return stream.read()

    @staticmethod
    def write(path, content):
        with path.open("w", encoding="utf-8", newline="") as stream:
            stream.write(content)

    def cancel(self):
        process = self.process
        if process is not None and process.poll() is None:
            if self.windows:
                subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass

    def execute(self, command, timeout=120):
        if not .1 <= timeout <= 600:
            raise ValueError("timeout must be between 0.1 and 600 seconds")
        if self.windows:
            import base64
            quote = lambda value: "'" + value.replace("'", "''") + "'"
            script = ("[Console]::OutputEncoding = [Text.UTF8Encoding]::new()\n"
                      "$ErrorActionPreference = 'Stop'; $global:LASTEXITCODE = 0\ntry {\n& {\n" + command +
                      "\n}\nif (!$? -and $LASTEXITCODE -eq 0) { $global:LASTEXITCODE = 1 }\n"
                      "} catch { [Console]::Error.WriteLine($_); $global:LASTEXITCODE = 1 }\n"
                      "finally { [IO.File]::WriteAllText(" + quote(str(self.state)) + ", (Get-Location).Path) }\nexit $LASTEXITCODE")
            args = [self.shell, "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
                    base64.b64encode(script.encode("utf-16le")).decode()]
        else:
            trap = "pwd -P > " + shlex.quote(str(self.state))
            args = [self.shell, "-c", "trap " + shlex.quote(trap) + " EXIT\n" + command]
        process = subprocess.Popen(args, cwd=self.cwd, stdin=subprocess.DEVNULL,env=self.env,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   start_new_session=not self.windows)
        self.process = process
        if self.closed:
            self.cancel()
        try:
            stdout, stderr = process.communicate(timeout=timeout)
            status = process.returncode
        except subprocess.TimeoutExpired:
            if self.windows:
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate()
            stderr += b"\nCommand timed out"
            status = 124
        self.process = None
        if self.state.exists():
            value = self.state.read_text(encoding="utf-8").strip()
            if value:
                self.cwd = Path(value)
        return {"stdout": stdout.decode("utf-8", errors="replace"),
                "stderr": stderr.decode("utf-8", errors="replace"),
                "exit_code": status, "cwd": str(self.cwd)}

    def call(self, name, args):
        if not self.root.is_dir():
            raise ValueError("Target working directory does not exist: " + str(self.root))
        if name == "workspace":
            return workspace_files(self.root, args["operation"], args.get("args", {}))
        if name == "execute":
            return self.execute(**args)
        path = self.path(args.get("path", "."))
        if name == "list_files":
            return [{"name": p.name, "directory": p.is_dir()} for p in sorted(path.iterdir())]
        if name == "read_file":
            text = self.read(path)
            if "start_line" in args or "end_line" in args:
                text = "".join(text.splitlines(keepends=True)[args.get("start_line", 1)-1:args.get("end_line")])
            return {"path": str(path), "content": text}
        if name == "write_file":
            path.parent.mkdir(parents=True, exist_ok=True)
            self.write(path, args["content"])
        elif name == "edit_file":
            text, old = self.read(path), args["old_text"]
            count = text.count(old) if old else 0
            if count == 0 or (count > 1 and not args.get("replace_all")):
                raise ValueError("old_text must match exactly once, or set replace_all=true")
            self.write(path, text.replace(old, args["new_text"], -1 if args.get("replace_all") else 1))
        else:
            raise ValueError("Unknown tool: " + name)
        return {"path": str(path), "written": True}


def serve(config):
    root = Path(config["directory"]).expanduser().resolve()
    if not root.is_dir():
        raise ValueError("Target working directory does not exist: " + str(root))
    with tempfile.TemporaryDirectory(prefix=".agents-company-tmp-", dir=root) as state:
        workspace = Workspace(config, state)
        requests = queue.Queue()
        def receive():
            try:
                for line in sys.stdin:
                    request = json.loads(line)
                    if request.get('method') == 'notifications/cancelled':
                        workspace.cancel()
                    else:
                        requests.put(request)
            finally:
                workspace.closed = True
                workspace.cancel()
                requests.put(None)
        threading.Thread(target=receive, daemon=True).start()
        while True:
            request = requests.get()
            if request is None:
                break
            if "id" not in request:
                continue
            method = request.get("method")
            response = {"jsonrpc": "2.0", "id": request["id"]}
            if method == "initialize":
                response["result"] = {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}},
                    "serverInfo": {"name": "workspace", "version": "2.0.0"},
                    "environment": workspace.info,
                    "instructions": "Working environment: " + json.dumps(workspace.info) +
                    ". Use these tools for ALL filesystem and command operations. Paths refer to this environment."}
            elif method == "tools/list":
                response["result"] = {"tools": TOOLS}
            elif method == "ping":
                response["result"] = {}
            elif method == "tools/call":
                try:
                    result = workspace.call(request["params"]["name"], request["params"].get("arguments", {}))
                    failed = isinstance(result, dict) and result.get("exit_code", 0) != 0
                except (OSError, ValueError, TypeError, KeyError) as error:
                    result, failed = {"error": str(error)}, True
                response["result"] = {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}], "isError": failed}
            else:
                response["error"] = {"code": -32601, "message": "Method not found"}
            print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        serve(CONFIG)
    except (OSError, ValueError) as error:
        print("Tunnel: " + str(error), file=sys.stderr)
        sys.exit(1)
