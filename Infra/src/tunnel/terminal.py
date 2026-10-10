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
sys.dont_write_bytecode = True
import termios
import transport

config = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
target = config.get('remote')
if target:
    args = transport.ssh_args(target)
    args[args.index('-T')] = '-tt'
    if target['os'] == 'windows':
        directory = target['directory'].replace("'", "''")
        script = "try { Set-Location -LiteralPath '" + directory + "' -ErrorAction Stop } catch { Write-Error $_; exit 1 }"
        args += ['powershell.exe -NoLogo -NoProfile -NoExit -EncodedCommand ' + base64.b64encode(script.encode('utf-16le')).decode()]
    else:
        args += ['cd -- ' + shlex.quote(target['directory']) + ' && exec "${SHELL:-/bin/bash}" -l']
else:
    args = [os.environ.get('SHELL', '/bin/bash'), '-l']

pid, master = pty.fork()
if pid == 0:
    os.chdir(config['cwd'])
    os.environ['TERM'] = 'xterm-256color'
    os.execvpe(args[0], args, transport.ssh_env(target) if target else os.environ)

def send(value):
    print(json.dumps(value), flush=True)

def resize(cols, rows):
    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', max(2, rows), max(2, cols), 0, 0))

def terminate(*_):
    raise SystemExit(0)

signal.signal(signal.SIGTERM, terminate)
resize(config.get('cols', 100), config.get('rows', 24))
selector = selectors.DefaultSelector()
selector.register(master, selectors.EVENT_READ)
selector.register(0, selectors.EVENT_READ)
buffer = b''
try:
    while True:
        for key, _ in selector.select():
            if key.fd == master:
                try:
                    data = os.read(master, 65536)
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
                        os.write(master, request['data'].encode('utf-8'))
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
