"""Private transport for Codex's native execution protocol. Not a model tool."""
import json
import os
import shlex
import signal
import subprocess
import sys
import threading
from transport import ssh_args

config = json.loads(sys.stdin.readline())
if config['os'] == 'windows':
    quote = lambda value: "'" + value.replace("'", "''") + "'"
    script = "$ErrorActionPreference = 'Stop'; Set-Location -LiteralPath " + quote(config['directory']) + "; codex exec-server --listen stdio; exit $LASTEXITCODE"
    import base64
    command = 'powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ' + base64.b64encode(script.encode('utf-16le')).decode()
else:
    command = 'cd ' + shlex.quote(config['directory']) + ' && exec codex exec-server --listen stdio'
process = subprocess.Popen(ssh_args(config) + [command], stdin=subprocess.PIPE)

def stop(*_):
    process.terminate()
signal.signal(signal.SIGTERM, stop)

def forward():
    try:
        for line in sys.stdin:
            process.stdin.write(line.encode())
            process.stdin.flush()
    except BrokenPipeError:
        pass
    finally:
        process.stdin.close()
threading.Thread(target=forward, daemon=True).start()
sys.exit(process.wait())
