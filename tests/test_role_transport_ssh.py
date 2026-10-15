"""Real OpenSSH option parsing, without connecting to a host."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

source = Path(__file__).resolve().parents[1] / 'AgentBoard/Aexus/Modules/Tunnel/transport.py'
spec = importlib.util.spec_from_file_location('role_transport', source)
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)

class RoleSshTrustPathTest(unittest.TestCase):
    def test_host_trust_path_with_spaces_is_passed_as_one_path(self):
        with tempfile.TemporaryDirectory(prefix='aexus trust ') as folder:
            trust = str(Path(folder) / 'known_hosts')
            args = transport.ssh_args({'host': 'fixture.invalid', 'known_hosts': trust, 'ssh_config': '/dev/null'})
            result = subprocess.run([args[0], '-G', *args[1:]], text=True, capture_output=True, check=True)
            line = next(line for line in result.stdout.splitlines() if line.startswith('userknownhostsfile '))
            self.assertEqual(line, 'userknownhostsfile ' + trust)
            self.assertIn('StrictHostKeyChecking=yes', args)

if __name__ == '__main__':
    unittest.main()
