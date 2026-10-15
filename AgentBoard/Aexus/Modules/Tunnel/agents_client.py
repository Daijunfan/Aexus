"""Small identity-scoped CLI transport. Command parsing stays in the Mac's existing CLI."""
import json
import pathlib
import socket
import sys

CONFIG = json.loads(__AGENTS_CONFIG__)


def main():
    args = sys.argv[1:]
    files = {}
    json_flags = {'--spec', '--patch', '--params', '--data', '--from', '--to', '--teams'}
    file_flags = {'--file', '--prompt-file', '--command-file'}
    for index, value in enumerate(args):
        previous = args[index - 1] if index else ''
        file = value[1:] if previous in json_flags and value.startswith('@') else value if previous in file_flags else None
        if file is not None:
            files[file] = pathlib.Path(file).read_text(encoding='utf-8')
    token = pathlib.Path(CONFIG['tokenFile']).read_text(encoding='utf-8').strip()
    follow = [arg for arg in args if arg != '--json'][:2] == ['session', 'follow']
    with socket.create_connection(('127.0.0.1', CONFIG['port']), timeout=10) as connection:
        connection.settimeout(None)
        connection.sendall((json.dumps({'argv': args, 'files': files, 'auth': token}) + '\n').encode())
        with connection.makefile(encoding='utf-8') as response:
            for line in response:
                value = json.loads(line)
                if '--json' in args or follow:
                    print(line.rstrip(), flush=True)
                elif value.get('ok'):
                    data = value.get('data')
                    print(data if isinstance(data, str) else json.dumps(data, ensure_ascii=False, indent=2), flush=True)
                else:
                    print(value.get('error', 'Remote CLI request failed'), file=sys.stderr)
                if value.get('ok') is False:
                    return 1
                if not follow or value.get('type') == 'done':
                    return 0
    raise RuntimeError('Employee API connection closed before a response')


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        if '--json' in sys.argv:
            print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False))
        else:
            print(str(error), file=sys.stderr)
        sys.exit(1)
