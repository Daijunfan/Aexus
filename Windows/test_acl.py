#!/usr/bin/env python3
"""Non-Windows unit checks for Windows private-key ACL command generation."""
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase, main
from unittest.mock import patch
from migrate import icacls_private


class ImportedKeyAclTest(TestCase):
    def test_uses_current_sid_not_userdomain_username(self):
        seen = []
        def run(command, **kwargs):
            seen.append(command)
            if command[0] == "whoami":
                return SimpleNamespace(returncode=0, stdout='"WORKSTATION\\user","S-1-5-21-22-33-44-1001"\n', stderr="")
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        with patch("migrate.subprocess.run", side_effect=run):
            icacls_private(Path(r"C:\Users\user\AppData\Roaming\Toolbox\CloudHosts\ssh\id_key"))
        self.assertEqual(seen[0], ["whoami", "/user", "/fo", "csv", "/nh"])
        self.assertEqual(seen[1][2:], ["/inheritance:r", "/grant:r", "*S-1-5-21-22-33-44-1001:(F)"])

    def test_invalid_identity_fails_closed(self):
        with patch("migrate.subprocess.run", return_value=SimpleNamespace(
            returncode=0, stdout='"WORKSTATION\\user","unexpected"\n', stderr=""
        )) as run:
            with self.assertRaisesRegex(RuntimeError, "Invalid Windows user SID"):
                icacls_private(Path("id_key"))
            run.assert_called_once()

    def test_icacls_failure_aborts_migration(self):
        answers = [
            SimpleNamespace(returncode=0, stdout='"WORKSTATION\\user","S-1-5-21-22-33-44-1001"\n', stderr=""),
            SimpleNamespace(returncode=5, stdout="", stderr="Access denied"),
        ]
        with patch("migrate.subprocess.run", side_effect=answers):
            with self.assertRaisesRegex(RuntimeError, "icacls exit 5"):
                icacls_private(Path("id_key"))


if __name__ == "__main__":
    main()
