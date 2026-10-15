"""CLI-isolated File Board mutations. All files live in temporary workspaces."""
import concurrent.futures
import os
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sys

root_dir=Path(__file__).resolve().parents[1]
runtime_dir=root_dir/'Runtime' if (root_dir/'Runtime').exists() else root_dir/'backend'/'Runtime'
sys.path.insert(0,str(runtime_dir))
import workspace_files as ws


class FileBoardEdits(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='cloudhosts-file-board-test-')
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def call(self, operation, **args):
        return ws.workspace_files(self.root, operation, args)

    def test_file_and_nested_folders_create_rename_and_trash_restore(self):
        self.call('mkdir', path='workspace')
        self.call('mkdir', path='workspace/.internal')
        created = self.call('write', path='workspace/.internal/notes.md', content='Hello 文件看板\n', create=True)
        self.assertTrue(created['saved'])
        listed = self.call('list', path='workspace/.internal', hidden=True)['entries']
        self.assertEqual([item['name'] for item in listed], ['notes.md'])
        self.assertEqual(self.call('read', path='workspace/.internal/notes.md')['content'], 'Hello 文件看板\n')
        self.call('move', path='workspace/.internal', to='workspace/renamed')
        self.assertTrue((self.root/'workspace/renamed/notes.md').is_file())
        trashed = self.call('trash', path='workspace/renamed')
        self.assertFalse((self.root/'workspace/renamed').exists())
        self.assertTrue(any(row['id']==trashed['id'] for row in self.call('trash-list')['items']))
        self.call('restore', id=trashed['id'])
        self.assertEqual((self.root/'workspace/renamed/notes.md').read_text(encoding='utf-8'), 'Hello 文件看板\n')

    def test_text_utf8_roundtrip_avoids_binary_corruption(self):
        p = self.root/'data.txt'
        p.write_bytes('Hello\r\n世界\n'.encode())
        original = p.read_bytes()
        read = self.call('read', path='data.txt')
        self.assertFalse(read['binary'])
        self.assertEqual(read['hash'], hashlib.sha256(original).hexdigest())
        # No-op save uses the identical content and retains every byte.
        self.call('write', path='data.txt', content=read['content'], hash=read['hash'])
        self.assertEqual(p.read_bytes(), original)
        p.write_bytes(b'original:\xff\xfe\x80')
        self.assertTrue(self.call('read', path='data.txt')['binary'])
        self.assertEqual(p.read_bytes(), b'original:\xff\xfe\x80')

    def test_optimistic_conflict_saves_first_edit_and_preserves_second_draft(self):
        self.call('write', path='shared.txt', create=True, content='Old')
        token = self.call('read', path='shared.txt')['hash']
        self.call('write', path='shared.txt', hash=token, content='New from editor A')
        with self.assertRaisesRegex(ValueError, '其他操作'):
            self.call('write', path='shared.txt', hash=token, content='Later editor B')
        self.assertEqual((self.root/'shared.txt').read_text(), 'New from editor A')
        self.assertEqual(list(self.root.glob('.cloud-hosts-write-*')), [])
        self.assertEqual(list(self.root.glob('.cloud-hosts-save-*')), [])

    def test_concurrent_edits_cannot_overwrite_one_another(self):
        self.call('write', path='shared.txt', create=True, content='Original')
        token = self.call('read', path='shared.txt')['hash']
        def save(text):
            try:
                self.call('write', path='shared.txt', hash=token, content=text)
                return 'ok'
            except ValueError as error:
                self.assertIn('其他操作', str(error))
                return 'conflict'
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = list(executor.map(save, ['Editor A', 'Editor B']))
        self.assertCountEqual(outcomes, ['ok','conflict'])
        self.assertIn((self.root/'shared.txt').read_text(), ['Editor A', 'Editor B'])

    def test_failed_atomic_replace_preserves_original_file_and_permissions(self):
        file = self.root/'existing.txt'
        file.write_text('preserved',encoding='utf-8')
        if os.name != 'nt': file.chmod(0o640)
        token = self.call('read', path='existing.txt')['hash']
        with patch.object(ws.os,'replace',side_effect=OSError('controlled disk failure')):
            with self.assertRaisesRegex(OSError,'controlled disk failure'):
                self.call('write',path='existing.txt',hash=token,content='should not replace')
        self.assertEqual(file.read_text(), 'preserved')
        if os.name != 'nt': self.assertEqual(file.stat().st_mode&0o777,0o640)
        self.assertEqual(list(self.root.glob('.cloud-hosts-*')),[])
        self.call('write',path='existing.txt',hash=token,content='updated')
        if os.name != 'nt': self.assertEqual(file.stat().st_mode&0o777,0o640)

    def test_create_exclusive_prevents_overwriting_and_root_escape(self):
        self.call('write', path='already.txt',content='original',create=True)
        with self.assertRaisesRegex(ValueError,'同名文件'):
            self.call('write',path='already.txt',content='overwritten',create=True)
        self.assertEqual((self.root/'already.txt').read_text(), 'original')
        with self.assertRaisesRegex(ValueError,'超出'):
            self.call('write',path='../outside.txt',content='escape',create=True)
        with self.assertRaisesRegex(ValueError,'宿主|本身'):
            self.call('mkdir',path='.cloud-hosts')


if __name__ == '__main__':
    unittest.main()
