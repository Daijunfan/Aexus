"""Private filesystem primitives for native CLI execution adapters."""
import base64
import mimetypes
import os
from pathlib import Path
import subprocess
import tempfile
import shutil
import platform


def native_search_program():
    name = 'rg.exe' if os.name == 'nt' else 'rg'
    root = Path(os.environ.get('PI_CODING_AGENT_DIR', str(Path.home() / '.pi' / 'agent')))
    bundled = root / 'bin' / name
    return str(bundled) if bundled.is_file() else shutil.which('rg')


def native_io(cwd, operation, args):
    path = (Path(cwd) / Path(args.get('path', '.')).expanduser()).resolve()
    if operation == 'tools':
        name = 'rg.exe' if os.name == 'nt' else 'rg'
        root = Path(os.environ.get('PI_CODING_AGENT_DIR', str(Path.home() / '.pi' / 'agent')))
        return {'rg': native_search_program(), 'rgPath': str(root / 'bin' / name), 'architecture': platform.machine()}
    if operation == 'spill':
        with tempfile.NamedTemporaryFile(prefix='pi-output-', suffix='.log', delete=False) as output:
            output.write(base64.b64decode(args['data']))
            return {'path': output.name}
    if operation == 'stat':
        return {'exists': path.exists(), 'directory': path.is_dir(),
                'mime': mimetypes.guess_type(str(path))[0]}
    if operation == 'access':
        if not path.is_file() or not os.access(path, os.R_OK):
            raise OSError('File is not readable: ' + str(path))
        return True
    if operation == 'read':
        return {'data': base64.b64encode(path.read_bytes()).decode('ascii')}
    if operation == 'write':
        opener = (lambda name, flags: os.open(name, flags, 0o600)) if args.get('private') else None
        with open(path, 'ab' if args.get('append') else 'wb', opener=opener) as output:
            output.write(base64.b64decode(args['data']))
        return True
    if operation == 'mkdir':
        path.mkdir(parents=True, exist_ok=True)
        return True
    if operation == 'readdir':
        return os.listdir(path)
    if operation == 'find':
        command = [native_search_program() or 'rg', '--files', '--hidden', '-g', '!.git', '-g', '!node_modules', '-g', args['pattern'], '.']
        result = subprocess.run(command, cwd=path, capture_output=True, timeout=30, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if result.returncode not in (0, 1):
            raise OSError(result.stderr.decode('utf-8', errors='replace'))
        return result.stdout.decode('utf-8', errors='replace').splitlines()[:args.get('limit', 1000)]
    if operation == 'grep':
        command = [native_search_program() or 'rg', '--json', '--line-number', '--color=never', '--hidden']
        if args.get('ignoreCase'):
            command.append('--ignore-case')
        if args.get('literal'):
            command.append('--fixed-strings')
        if args.get('glob'):
            command += ['--glob', args['glob']]
        if args.get('context'):
            command += ['--context', str(args['context'])]
        command += ['--', args['pattern'], str(path)]
        result = subprocess.run(command, cwd=cwd, capture_output=True, timeout=30, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        if result.returncode not in (0, 1):
            raise OSError(result.stderr.decode('utf-8', errors='replace'))
        return {'output': result.stdout.decode('utf-8', errors='replace'), 'directory': path.is_dir(), 'path': str(path)}
    raise ValueError('Unsupported native file operation: ' + operation)
