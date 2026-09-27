#!/usr/bin/env python3
"""Optional global CLI routing: local Agent, remote workspace tools."""
import json
import os
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import adapters
import commands
import transport

HELP = '''Tunnel — local Agent processes, remote workspace tools

  tunnel install                  Install reversible CLI wrappers for zsh/bash
  tunnel uninstall                Remove the shell PATH entry
  tunnel doctor --tunnel-profile ubuntu
  tunnel run codex --tunnel-host user@host --tunnel-path /workspace [CLI args...]

After installation, from any directory:
  codex                           Original local behavior
  claude                          Original local behavior
  cline                           Original local behavior
  codex --tunnel-host user@host --tunnel-path /workspace
  claude --tunnel-profile ubuntu -p "Inspect the project"
  cline --tunnel-profile ubuntu "Run the tests"

Shared options (use before a literal --):
  --tunnel-host HOST              SSH IP, hostname, user@host, or SSH alias
  --tunnel-path PATH              Existing target workspace directory
  --tunnel-profile NAME           Load profiles/NAME.json
  --tunnel-os linux|macos|windows Default: linux
  --tunnel-port PORT
  --tunnel-identity FILE
  --tunnel-known-hosts FILE
  --tunnel-ssh-config FILE
  --tunnel-jump HOST
'''


def launch(agent, argv):
    if agent not in commands.AGENTS:
        raise ValueError('Supported CLIs: claude, codex, cline')
    options, native = commands.parse(argv)
    executable = commands.native_executable(agent)
    if not options:
        os.execv(executable, [executable] + native)
    cfg = commands.target(options)
    info = transport.doctor(cfg)
    session, args, env = adapters.prepare(agent, cfg, native)
    print('Tunnel: ' + info + '\nLocal session: ' + str(session), file=sys.stderr)
    return subprocess.call([executable] + args, cwd=session, env=env)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    try:
        if not argv or argv[0] in ['--help', '-h']:
            print(HELP)
            return 0
        action, *args = argv
        if action in ['_launch', 'run']:
            return launch(args[0], args[1:])
        if action == 'install':
            commands.install(sys.executable)
        elif action == 'uninstall':
            commands.uninstall()
        elif action == 'doctor':
            options, native = commands.parse(args)
            if native:
                raise ValueError('Unexpected arguments: ' + ' '.join(native))
            print(transport.doctor(commands.target(options)))
        elif action == '_serve':
            return transport.serve(json.loads(Path(args[0]).read_text(encoding='utf-8')))
        elif action == '_guard':
            print(json.dumps(adapters.guard(json.load(sys.stdin))))
        else:
            raise ValueError('Unknown command: ' + action)
        return 0
    except (OSError, ValueError, RuntimeError, IndexError, subprocess.SubprocessError) as error:
        print('Tunnel: ' + str(error), file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 130


if __name__ == '__main__':
    sys.exit(main())
