import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import transport


class DisconnectTests(unittest.TestCase):
    def test_disconnect_stops_running_command_and_children(self):
        with tempfile.TemporaryDirectory() as directory:
            config = {'directory': directory, 'os': 'windows' if os.name == 'nt' else 'macos' if sys.platform == 'darwin' else 'linux'}
            bootstrap = "import sys,base64,zlib;exec(zlib.decompress(base64.b64decode(sys.stdin.readline())))"
            process = subprocess.Popen([sys.executable, '-c', bootstrap], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                process.stdin.write(transport.source_line(config))
                command = ('New-Item started -ItemType File | Out-Null; '
                           '& powershell.exe -NoProfile -Command "Start-Sleep -Seconds 3; New-Item leaked -ItemType File | Out-Null"'
                           if os.name == 'nt' else 'touch started; (sleep 3; touch leaked) & wait')
                process.stdin.write(json.dumps({'id': 1, 'method': 'tools/call', 'params': {'name': 'execute', 'arguments': {'command': command}}})+'\n')
                process.stdin.flush()
                end = time.monotonic()+15
                while not (Path(directory)/'started').exists() and time.monotonic() < end:
                    time.sleep(.02)
                self.assertTrue((Path(directory)/'started').exists())
                self.assertEqual(len(list(Path(directory).glob('.agents-company-tmp-*'))), 1)
                process.stdin.close()
                process.wait(timeout=10)
                time.sleep(3.2)
                self.assertFalse((Path(directory)/'leaked').exists())
                self.assertEqual(list(Path(directory).glob('.agents-company-tmp-*')), [])
            finally:
                if process.poll() is None:
                    process.kill(); process.wait()
                process.stdout.close(); process.stderr.close()


if __name__ == '__main__':
    unittest.main()
