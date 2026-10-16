"""Regression: Tunnel helper entry points must not write bytecode into the signed bundle.

Runs the real entry-point scripts (not just their source) in a writable copy with
no existing ``__pycache__`` and with both ``PYTHONDONTWRITEBYTECODE`` and
``PYTHONPYCACHEPREFIX`` unset. The interpreter flag is never passed as ``-B``.
"""
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]  # Modules/Tunnel


class NoBytecodeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='ac-no-bytecode-')
        self.copy = Path(self.tmp) / 'Tunnel'
        shutil.copytree(ROOT, self.copy,
                        ignore=shutil.ignore_patterns('__pycache__', '*.pyc', 'tests', 'windows', 'bin', '.tunnel'))
        self.env = os.environ.copy()
        self.env.pop('PYTHONDONTWRITEBYTECODE', None)
        self.env.pop('PYTHONPYCACHEPREFIX', None)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_entry(self, *args, input=''):
        return subprocess.run([sys.executable, *args], cwd=str(self.copy), env=self.env,
                              input=input, capture_output=True, text=True)

    def bytecode(self):
        return list(self.copy.rglob('*.pyc'))

    def assert_no_bytecode(self):
        written = self.bytecode()
        self.assertEqual(written, [], 'bytecode written into the bundle copy: ' + ', '.join(map(str, written)))

    def test_harness_detects_bytecode_when_the_guard_is_absent(self):
        # Negative control: prove this harness would catch a missing guard.
        probe = self.copy / '_probe_import.py'
        probe.write_text("import pathlib,sys\nsys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))\nimport transport\n")
        subprocess.run([sys.executable, str(probe)], cwd=str(self.copy), env=self.env,
                       input='', capture_output=True, text=True)
        self.assertTrue(self.bytecode(), 'probe should have written transport bytecode')

    def test_agent_process_imports_transport_without_bytecode(self):
        payload = base64.urlsafe_b64encode(json.dumps({'target': {}, 'engine': 'bogus', 'args': []}).encode()).decode().rstrip('=')
        result = self.run_entry('agent_process.py', payload)
        self.assertEqual(result.returncode, 1)
        self.assertIn('Unknown remote Coding Agent', result.stderr)
        self.assert_no_bytecode()

    def test_native_executor_imports_transport_without_bytecode(self):
        result = self.run_entry('native_executor.py')
        self.assertEqual(result.returncode, 1)
        self.assertIn('Expecting value', result.stderr)
        self.assert_no_bytecode()

    def test_terminal_imports_transport_without_bytecode(self):
        result = self.run_entry('terminal.py', str(self.copy / 'missing-config.json'))
        self.assertEqual(result.returncode, 1)
        self.assertIn('No such file or directory', result.stderr)
        self.assert_no_bytecode()

    def test_guarded_entry_points_keep_behavior_without_bytecode(self):
        help_result = self.run_entry('tunnel.py', '--help')
        self.assertEqual(help_result.returncode, 0, help_result.stderr)
        self.assertIn('local Agent processes', help_result.stdout)

        session = Path(self.tmp) / 'session'
        request = {'engine': 'claude',
                   'target': {'host': 'fixture', 'directory': str(session), 'os': 'linux'},
                   'session': str(session)}
        prepare = self.run_entry('bridge.py', 'prepare', input=json.dumps(request))
        self.assertEqual(prepare.returncode, 0, prepare.stderr)
        output = json.loads(prepare.stdout)
        self.assertEqual(output['cwd'], str(session))
        self.assertTrue(output['args'])
        self.assertTrue((session / 'AGENTS.md').exists())
        self.assert_no_bytecode()


if __name__ == '__main__':
    unittest.main()
