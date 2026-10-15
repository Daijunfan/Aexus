"""Interactive PTY broker. JSON lines in/out; the shell never sees protocol data."""
import base64
import errno
import fcntl
import json
import os
from pathlib import Path
import pty
import selectors
import shlex
import signal
import struct
import sys
import termios
import transport
from terminal_io import PendingWriter

config_file = Path(sys.argv[1])
config = json.loads(config_file.read_text(encoding='utf-8'))
# Broker configuration can contain a single-use Codex TUI connection token.
# It is transferred into the child environment below, and should not sit on
# disk for the lifetime of an interactive terminal session.
config_file.unlink(missing_ok=True)
target = config.get('remote')
agent = config.get('command')
if agent is not None and agent not in ('codex', 'claude', 'cline', 'pi'):
    raise ValueError('Invalid agent executable')
tui_token = config.get('tuiToken')
tui_token_file = config.get('tuiTokenFile')
if tui_token_file is not None and (agent != 'codex' or not target or not isinstance(tui_token_file, str) or any(c in tui_token_file for c in '\x00\r\n')):
    raise ValueError('Invalid remote Codex TUI token file')
if tui_token is not None:
    if agent != 'codex' or target or not isinstance(tui_token,str) or len(tui_token) != 64 or any(c not in '0123456789abcdef' for c in tui_token):
        raise ValueError('Invalid local Codex TUI auth token')
agent_args = config.get('commandArgs', [])
if not isinstance(agent_args, list) or len(agent_args)>24 or any(not isinstance(arg,str) or len(arg)>4096 or '\n' in arg or '\r' in arg for arg in agent_args):
    raise ValueError('Invalid native Agent startup arguments')
if target:
    args = transport.ssh_args(target)
    args[args.index('-T')] = '-tt'
    if target['os'] == 'windows':
        directory = target['directory'].replace("'", "''")
        script = "try { Set-Location -LiteralPath '" + directory + "' -ErrorAction Stop } catch { Write-Error $_; exit 1 }"
        # -EncodedCommand does not reliably auto-load PSReadLine. Import it
        # explicitly in this interactive session, retaining the user's profile.
        if agent:
            if tui_token_file:
                token_path = "'" + tui_token_file.replace("'", "''") + "'"
                script += "; $env:CLOUD_HOSTS_TUI_AUTH_TOKEN=([IO.File]::ReadAllText(" + token_path + ")).Trim(); Remove-Item -LiteralPath " + token_path + " -Force"
            script += "; $program=(Get-Command -Name '" + agent + "' -CommandType Application -ErrorAction Stop|Select-Object -First 1).Source; & $program " + ' '.join("'"+arg.replace("'","''")+"'" for arg in agent_args) + '; exit $LASTEXITCODE'
        else:
            script += "; if (Get-Module -ListAvailable PSReadLine) { Import-Module PSReadLine -ErrorAction SilentlyContinue }"
        args += ['powershell.exe -NoLogo ' + ('' if agent else '-NoExit ') + '-EncodedCommand ' + base64.b64encode(script.encode('utf-16le')).decode()]
    else:
        handoff = ('IFS= read -r CLOUD_HOSTS_TUI_AUTH_TOKEN < ' + shlex.quote(tui_token_file) + '; export CLOUD_HOSTS_TUI_AUTH_TOKEN; rm -f -- ' + shlex.quote(tui_token_file) + '; ') if tui_token_file else ''
        startup = (' -lic ' + shlex.quote('export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"; ' + handoff + 'exec ' + agent + ''.join(' ' + shlex.quote(arg) for arg in agent_args))) if agent else ' -il'
        args += ['cd -- ' + shlex.quote(target['directory']) + ' && exec "${SHELL:-/bin/bash}"' + startup]
else:
    args = [config.get('executable') or agent, *agent_args] if agent else [os.environ.get('SHELL', '/bin/bash'), '-l']

pid, master = pty.fork()
if pid == 0:
    os.chdir(config['cwd'])
    os.environ['TERM'] = 'xterm-256color'
    environment = transport.ssh_env(target) if target else os.environ.copy()
    if tui_token:
        environment['CLOUD_HOSTS_TUI_AUTH_TOKEN'] = tui_token
    os.execvpe(args[0], args, environment)

def send(value):
    print(json.dumps(value), flush=True)

def resize(cols, rows):
    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', max(2, rows), max(2, cols), 0, 0))

pending_input = PendingWriter(lambda data: os.write(master, data), lambda input_id: send({'inputId': input_id}))
input_ready = not target

def flush_input():
    global input_ready
    # SSH may flush its local tty while entering raw mode after authentication.
    if not input_ready:
        input_ready = not (termios.tcgetattr(master)[3] & termios.ICANON)
    if input_ready:
        pending_input.drain()
    selector.modify(master, selectors.EVENT_READ | (selectors.EVENT_WRITE if pending_input and input_ready else 0))

def terminate(*_):
    raise SystemExit(0)

signal.signal(signal.SIGTERM, terminate)
resize(config.get('cols', 100), config.get('rows', 24))
os.set_blocking(master, False)
selector = selectors.DefaultSelector()
selector.register(master, selectors.EVENT_READ)
selector.register(0, selectors.EVENT_READ)
buffer = b''
try:
    while True:
        flush_input()
        for key, events in selector.select(0.02 if pending_input and not input_ready else None):
            if key.fd == master:
                if events & selectors.EVENT_WRITE:
                    flush_input()
                if not events & selectors.EVENT_READ:
                    continue
                try:
                    data = os.read(master, 65536)
                except BlockingIOError:
                    continue
                except OSError as error:
                    if error.errno == errno.EIO:
                        data = b''
                    else:
                        raise
                if not data:
                    _, status = os.waitpid(pid, 0)
                    send({'exitCode': os.waitstatus_to_exitcode(status)})
                    raise SystemExit(0)
                send({'data': base64.b64encode(data).decode()})
            else:
                data = os.read(0, 65536)
                if not data:
                    raise SystemExit(0)
                buffer += data
                while b'\n' in buffer:
                    line, buffer = buffer.split(b'\n', 1)
                    request = json.loads(line)
                    if request['op'] == 'input':
                        pending_input.append(request)
                        flush_input()
                    elif request['op'] == 'resize':
                        resize(request['cols'], request['rows'])
                    elif request['op'] == 'close':
                        raise SystemExit(0)
finally:
    selector.close()
    try:
        os.killpg(pid, signal.SIGHUP)
    except ProcessLookupError:
        pass
    os.close(master)
