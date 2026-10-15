import base64
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import adapters
import commands
import transport
import remote


class Client:
    def __init__(self, cfg):
        self.process = subprocess.Popen(transport.server_command(cfg), stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.process.stdin.write(transport.source_line(cfg))
        self.sequence = 0
        self.request('initialize', {'protocolVersion': '2024-11-05', 'capabilities': {},
                                   'clientInfo': {'name': 'test', 'version': '1'}})

    def request(self, method, params):
        self.sequence += 1
        self.process.stdin.write(json.dumps({'jsonrpc': '2.0', 'id': self.sequence, 'method': method, 'params': params})+'\n')
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError(self.process.stderr.read())
        return json.loads(line)['result']

    def call(self, name, **args):
        result = self.request('tools/call', {'name': name, 'arguments': args})
        return json.loads(result['content'][0]['text']), result['isError']

    def close(self):
        self.process.stdin.close()
        self.process.wait(timeout=10)
        self.process.stdout.close()
        self.process.stderr.close()


class RoutingTests(unittest.TestCase):
    def test_linux_distribution_identifier_for_team_icon(self):
        self.assertEqual(remote.linux_distribution('ID=kali\nPRETTY_NAME="Kali GNU/Linux Rolling"\n'),
                         {'distribution': 'kali', 'distributionName': 'Kali GNU/Linux Rolling'})

    def test_local_arguments_are_unchanged(self):
        args = ['exec', '-c', 'model="test"', '--json', 'literal --tunnel-host text', '--', '--tunnel-path']
        options, native = commands.parse(args)
        self.assertEqual((options, native), ({}, args))

    def test_remote_flags_do_not_consume_native_flags(self):
        options, native = commands.parse(['--tunnel-host=user@example', '--tunnel-path', '/path with space',
                                         'exec', '--json', "print '$HOME'"])
        self.assertEqual(options, {'host': 'user@example', 'directory': '/path with space'})
        self.assertEqual(native, ['exec', '--json', "print '$HOME'"])

    def test_incomplete_remote_configuration_is_an_error(self):
        for args in [['--tunnel-host'], ['--tunnel-wrong', 'x']]:
            with self.assertRaises(ValueError):
                commands.parse(args)
        with self.assertRaises(ValueError):
            commands.target({'host': 'example'})

    def test_shell_install_is_idempotent_and_reversible(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'shellrc'
            original = 'export PATH="/custom/bin:$PATH"\n# keep this\n'
            path.write_text(original)
            commands.edit_shell(path, True)
            once = path.read_text()
            commands.edit_shell(path, True)
            self.assertEqual(path.read_text(), once)
            commands.edit_shell(path, False)
            self.assertEqual(path.read_text(), original)

    def test_native_lookup_skips_our_wrappers(self):
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory)/('codex.cmd' if os.name == 'nt' else 'codex')
            executable.write_text('@exit /b 0\r\n' if os.name == 'nt' else '#!/bin/sh\nexit 0\n'); executable.chmod(0o755)
            with patch.dict(os.environ, {'PATH': str(commands.ROOT/'bin')+os.pathsep+directory}):
                self.assertEqual(os.path.normcase(commands.native_executable('codex')), os.path.normcase(str(executable)))

    def test_route_guard_allows_only_workspace_and_conversation_tools(self):
        for name in ['mcp__tunnel__read_file', 'tunnel_execute', 'tunnel__edit_file']:
            out = adapters.guard({'hookName': 'tool_call', 'tool_call': {'name': name}})
            self.assertFalse(out.get('cancel'))
        for name in ['Bash', 'Read', 'Write', 'apply_patch', 'mcp__other__execute', 'Agent']:
            out = adapters.guard({'tool_name': name})
            self.assertEqual(out['hookSpecificOutput']['permissionDecision'], 'deny')

    def test_cloud_context_only_describes_cloud_tools_and_os(self):
        for os_name, label in [('linux', 'Linux'), ('macos', 'macOS'), ('windows', 'Windows')]:
            with self.subTest(os=os_name), tempfile.TemporaryDirectory() as directory:
                cfg = {'host': 'example', 'directory': '/home/user/project', 'os': os_name}
                session, args, _ = adapters.prepare('claude', cfg, [], directory)
                instructions = (session/'AGENTS.md').read_text()
                self.assertEqual(instructions, (
                    'Your work runs on a cloud host. '
                    'Use the provided tunnel MCP APIs for all commands and file operations. '
                    f'Cloud operating system: {label}.\n'))
                self.assertEqual((session/'CLAUDE.md').read_text(), instructions)
                self.assertIn('mcp__tunnel__*', args)

    def test_missing_workspace_exits_cleanly_with_host_stdin_still_open(self):
        with tempfile.TemporaryDirectory() as directory:
            cfg = {'host': 'fixture', 'directory': directory + '/missing', 'os': 'linux'}
            # Use the real bootstrap/transport, replacing only the SSH executable.
            code = "import sys,base64,zlib;exec(zlib.decompress(base64.b64decode(sys.stdin.readline())))"
            limit_core = "import resource;resource.setrlimit(resource.RLIMIT_CORE,(0,0));" if os.name != 'nt' else ''
            script = ("import sys;" + limit_core +
                      "sys.path.insert(0," + repr(str(commands.ROOT)) + ");import transport;"
                      "transport.server_command=lambda cfg:" + repr([sys.executable, '-c', code]) + ";"
                      "sys.exit(transport.serve(" + repr(cfg) + "))")
            process = subprocess.Popen([sys.executable, '-c', script], stdin=subprocess.PIPE,
                                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                self.assertEqual(process.wait(timeout=5), 1)
                error = process.stderr.read().decode()
                self.assertIn('Target working directory does not exist:', error)
                self.assertNotIn('Fatal Python error', error)
                self.assertNotIn('.agents-company-tmp-', error)
                self.assertFalse(Path(cfg['directory']).exists())
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()
                process.stdin.close()
                process.stdout.close()
                process.stderr.close()

    def test_windows_command_is_short_and_literal(self):
        cfg = {'host': 'example', 'directory': "C:\\中文's files", 'os': 'windows', 'python': 'C:\\Program Files\\Python\\python.exe'}
        cmd = transport.server_command(cfg)[-1]
        self.assertLess(len(cmd), 8191)
        code = base64.b64decode(cmd.split()[-1]).decode('utf-16le')
        self.assertIn("'C:\\Program Files\\Python\\python.exe'", code)
        self.assertNotIn(cfg['directory'], cmd)


@unittest.skipUnless(os.environ.get('TUNNEL_LIVE') == '1', 'set TUNNEL_LIVE=1 for Ubuntu SSH tests')
class RemoteTests(unittest.TestCase):
    def setUp(self):
        self.cfg = commands.target({'profile': 'ubuntu'})
        self.client = Client(self.cfg)
        self.folder = 'v2-test-' + uuid.uuid4().hex
        self.client.call('execute', command='mkdir '+self.folder+' && cd '+self.folder)

    def tearDown(self):
        self.client.call('execute', command='cd .. && rm -rf -- '+self.folder)
        self.client.close()

    def test_all_file_operations_are_remote(self):
        value = "中文\nquotes '$HOME'\n"
        _, failed = self.client.call('write_file', path='nested/proof.txt', content=value)
        self.assertFalse(failed)
        result, _ = self.client.call('read_file', path='nested/proof.txt')
        self.assertEqual(result['content'], value)
        self.client.call('edit_file', path='nested/proof.txt', old_text='中文', new_text='远程')
        result, _ = self.client.call('read_file', path='nested/proof.txt')
        self.assertEqual(result['content'], value.replace('中文', '远程'))
        result, _ = self.client.call('list_files', path='nested')
        self.assertEqual(result, [{'name': 'proof.txt', 'directory': False}])
        self.assertFalse((commands.ROOT/self.folder).exists())

    def test_execution_output_directory_and_isolation(self):
        result, failed = self.client.call('execute', command='uname -s; printf ERROR >&2; exit 7')
        self.assertTrue(failed)
        self.assertEqual((result['stdout'], result['stderr'], result['exit_code']), ('Linux\n', 'ERROR', 7))
        self.assertTrue(result['cwd'].endswith(self.folder))
        other = Client(self.cfg)
        try:
            result, _ = other.call('execute', command='pwd')
            self.assertEqual(result['stdout'].strip(), self.cfg['directory'])
        finally:
            other.close()

    def test_timeout_stops_remote_children(self):
        result, failed = self.client.call('execute', command='(sleep 1; touch leaked) & wait', timeout=.1)
        self.assertTrue(failed)
        self.assertEqual(result['exit_code'], 124)
        result, failed = self.client.call('execute', command='sleep 1.1; test ! -e leaked')
        self.assertFalse(failed)

    def test_failed_connection_does_not_execute_locally(self):
        bad = dict(self.cfg, host='127.0.0.1', port=1)
        with self.assertRaises(RuntimeError):
            transport.doctor(bad)


if __name__ == '__main__':
    unittest.main()
