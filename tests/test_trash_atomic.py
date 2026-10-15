"""Deterministic fault-injection regressions for the trash operation.

Runs the same cases against both copies of the scoped file protocol so they
stay in lockstep:

- Runtime/workspace_files.py (trash dir ``.cloud-hosts/trash``) — the unified
  CloudHosts/Aexus workbench: local Core host files and SSH host files.
- AgentBoard/Aexus/Modules/Tunnel/workspace_files.py (``.agents-company/trash``)
  — the embedded Role Core cloud-host Team workspace (tunnel.ts -> remote.py).

All state lives in isolated temporary directories; no user files, credentials
or real trash are touched, and no model calls are made.
"""
import errno
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


IMPLEMENTATIONS = [
    ('runtime', _load(ROOT / 'Runtime' / 'workspace_files.py', 'aexus_runtime_wsf'),
     '.cloud-hosts', True),
    ('tunnel', _load(ROOT / 'AgentBoard' / 'Aexus' / 'Modules' / 'Tunnel' / 'workspace_files.py', 'aexus_tunnel_wsf'),
     '.agents-company', False),
]


class PartialWriter:
    """Writes a prefix of the payload, then fails as if the disk filled."""
    def __init__(self, stream):
        self._stream = stream
    def __enter__(self):
        self._stream.__enter__()
        return self
    def __exit__(self, *exc):
        return self._stream.__exit__(*exc)
    def write(self, data):
        self._stream.write(data[:max(1, len(data) // 2)])
        raise OSError(errno.ENOSPC, 'No space left on device')
    def flush(self):
        self._stream.flush()
    def fileno(self):
        return self._stream.fileno()


class TrashAtomicRegression(unittest.TestCase):
    def _trash_dir(self, root, hidden):
        return root / hidden / 'trash'

    def _write(self, module, root, path, content):
        return module.workspace_files(root, 'write', {'path': path, 'content': content, 'create': True})

    def _list(self, module, root):
        # Runtime exposes trash-list; the Tunnel copy has no list operation and
        # restores by id only. Both are checked for bad-json leaks below.
        try:
            return [item['path'] for item in module.workspace_files(root, 'trash-list', {})['items']]
        except ValueError:
            return None

    def _assert_no_trash_leaks(self, root, hidden):
        trash = self._trash_dir(root, hidden)
        self.assertEqual(list(trash.glob('*.json')), [])
        self.assertEqual(list(trash.glob(hidden + '-trash-*')), [])

    def _assert_failure_preserves(self, module, root, hidden, has_list, is_dir, injected):
        if is_dir:
            self._write(module, root, 'folder/sub/note.txt', 'keep')
            src = root / 'folder' / 'sub' / 'note.txt'
            path = 'folder'
        else:
            self._write(module, root, 'keep.txt', 'precious')
            src = root / 'keep.txt'
            path = 'keep.txt'
        with injected:
            with self.assertRaises(OSError):
                module.workspace_files(root, 'trash', {'path': path})
        self.assertEqual(src.read_text(encoding='utf-8'), 'keep' if is_dir else 'precious')
        self._assert_no_trash_leaks(root, hidden)
        if has_list:
            self.assertEqual(self._list(module, root), [])

    def _fsync_enospc(self, module):
        return patch.object(module.os, 'fsync', side_effect=OSError(errno.ENOSPC, 'No space left on device'))

    def _partial_write_enospc(self, module):
        real = module.os.fdopen
        def fake(fd, mode='wb'):
            return PartialWriter(real(fd, mode))
        return patch.object(module.os, 'fdopen', side_effect=fake)

    def test_trash_metadata_fsync_enospc_preserves_source(self):
        for name, module, hidden, has_list in IMPLEMENTATIONS:
            for is_dir in (False, True):
                with self.subTest(impl=name, directory=is_dir):
                    with tempfile.TemporaryDirectory(prefix='trash-atomic-') as td:
                        self._assert_failure_preserves(module, Path(td), hidden, has_list, is_dir, self._fsync_enospc(module))

    def test_trash_metadata_partial_write_enospc_preserves_source(self):
        for name, module, hidden, has_list in IMPLEMENTATIONS:
            for is_dir in (False, True):
                with self.subTest(impl=name, directory=is_dir):
                    with tempfile.TemporaryDirectory(prefix='trash-atomic-') as td:
                        self._assert_failure_preserves(module, Path(td), hidden, has_list, is_dir, self._partial_write_enospc(module))

    def test_trash_metadata_publish_failure_preserves_source(self):
        for name, module, hidden, has_list in IMPLEMENTATIONS:
            with self.subTest(impl=name):
                with tempfile.TemporaryDirectory(prefix='trash-atomic-') as td:
                    self._assert_failure_preserves(module, Path(td), hidden, has_list, False,
                        patch.object(module.os, 'replace', side_effect=OSError('controlled disk failure')))

    def test_trash_data_move_failure_cleans_metadata(self):
        for name, module, hidden, has_list in IMPLEMENTATIONS:
            with self.subTest(impl=name):
                with tempfile.TemporaryDirectory(prefix='trash-atomic-') as td:
                    self._assert_failure_preserves(module, Path(td), hidden, has_list, False,
                        patch.object(module.os, 'rename', side_effect=OSError('controlled disk failure')))

    def test_trash_roundtrip_lists_and_restores_content(self):
        for name, module, hidden, has_list in IMPLEMENTATIONS:
            with self.subTest(impl=name):
                with tempfile.TemporaryDirectory(prefix='trash-atomic-') as td:
                    root = Path(td)
                    self._write(module, root, 'doc.txt', 'file body')
                    self._write(module, root, 'bundle/inner/deep.txt', 'dir body')
                    trashed_file = module.workspace_files(root, 'trash', {'path': 'doc.txt'})
                    trashed_dir = module.workspace_files(root, 'trash', {'path': 'bundle'})
                    if has_list:
                        items = {row['id']: row['path'] for row in module.workspace_files(root, 'trash-list', {})['items']}
                        self.assertEqual(items[trashed_file['id']], 'doc.txt')
                        self.assertEqual(items[trashed_dir['id']], 'bundle')
                    # Every published json parses cleanly — no bad-json pollution.
                    parsed = []
                    for meta in sorted(self._trash_dir(root, hidden).glob('*.json')):
                        parsed.append(json.loads(meta.read_text(encoding='utf-8'))['path'])
                    self.assertEqual(sorted(parsed), ['bundle', 'doc.txt'])
                    self.assertFalse((root / 'doc.txt').exists())
                    self.assertFalse((root / 'bundle').exists())
                    module.workspace_files(root, 'restore', {'id': trashed_file['id']})
                    module.workspace_files(root, 'restore', {'id': trashed_dir['id']})
                    self.assertEqual((root / 'doc.txt').read_text(encoding='utf-8'), 'file body')
                    self.assertEqual((root / 'bundle' / 'inner' / 'deep.txt').read_text(encoding='utf-8'), 'dir body')
                    if has_list:
                        self.assertEqual(module.workspace_files(root, 'trash-list', {})['items'], [])


if __name__ == '__main__':
    unittest.main()
