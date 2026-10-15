import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "Runtime"))
import transport


class WindowsTransportSelectionTests(unittest.TestCase):
    def test_explicit_ssh_command_is_preserved_in_remote_file_transport(self):
        with patch.dict(os.environ, {"CLOUD_HOSTS_SSH": "/some/custom/ssh"}):
            args = transport.ssh_args({"host": "example", "os": "linux"})
        self.assertEqual(args[0], "/some/custom/ssh")
        self.assertEqual(args[-1], "example")
        self.assertIn("StrictHostKeyChecking=yes", args)

    def test_non_windows_defaults_to_existing_ssh_command(self):
        if os.name != "nt":
            with patch.dict(os.environ, {"CLOUD_HOSTS_SSH": ""}):
                self.assertEqual(transport.ssh_executable(), "ssh")

    def test_windows_ssh_known_hosts_path_is_not_json_escaped(self):
        original = r"C:\\Users\\djf\\AppData\\Roaming\\Toolbox\\CloudHosts\\known_hosts"
        config = {"host": "server.example", "os": "linux", "known_hosts": original}
        args = transport.ssh_args(config, platform="nt")
        option = next(arg for arg in args if arg.startswith("UserKnownHostsFile="))
        self.assertEqual(option, "UserKnownHostsFile=C:/Users/djf/AppData/Roaming/Toolbox/CloudHosts/known_hosts")
        self.assertNotIn('"', option)
        self.assertIn("StrictHostKeyChecking=yes", args)
        self.assertEqual(args[-1], "server.example")
        posix = transport.ssh_args(config, platform="posix")
        self.assertTrue(next(arg for arg in posix if arg.startswith("UserKnownHostsFile=")).endswith('"' + original.replace('\\', '\\\\') + '"'))


if __name__ == "__main__":
    unittest.main()
