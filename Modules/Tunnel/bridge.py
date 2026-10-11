"""Host adapter: JSON in/out, without changing global CLI or SSH configuration."""
import json
from pathlib import Path
import sys

# Resolve bundled sibling modules even with the Windows embedded Python runtime.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import adapters
import commands
import transport

try:
    request = json.load(sys.stdin)
    config = commands.target(request['target'])
    if sys.argv[1] == 'ping':
        print(json.dumps(transport.ping(config)))
    elif sys.argv[1] == 'check':
        print(json.dumps(transport.doctor(config, details=True)))
    elif sys.argv[1] == 'prepare':
        session, args, _ = adapters.prepare(request['engine'], config, [], request['session'])
        print(json.dumps({'cwd': str(session), 'args': args,
                          'server': {'command': sys.executable, 'args': [str(commands.ROOT/'tunnel.py'), '_serve', str(session/'target.json')]},
                          'instructions': (session/'AGENTS.md').read_text(encoding='utf-8')}))
    else:
        raise ValueError('Unknown host operation')
except Exception as error:
    print(str(error), file=sys.stderr)
    sys.exit(1)
