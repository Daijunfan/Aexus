import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from workspace_files import workspace_files

class WorkspaceRemovalTests(unittest.TestCase):
    def test_explicit_removal_and_protected_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            nested = root / 'employee' / 'nested'
            nested.mkdir(parents=True)
            (nested / 'file.txt').write_text('data')
            call = lambda **args: workspace_files(root, 'remove-directory', args)
            call(path='employee', preview=True)
            self.assertTrue(nested.exists())
            with self.assertRaises(ValueError): call(path='.')
            with self.assertRaises(ValueError): call(path='../outside')
            with self.assertRaises(ValueError): call(path='employee', protectedPaths=[str(nested)])
            sibling = root / 'sibling'; sibling.mkdir(); (sibling / 'keep.txt').write_text('keep')
            (nested / 'link').symlink_to(sibling, target_is_directory=True)
            with self.assertRaises(ValueError): call(path='employee/nested/link')
            call(path='employee', protectedPaths=[str(sibling)])
            self.assertFalse((root / 'employee').exists())
            self.assertTrue((sibling / 'keep.txt').exists())
            call(path='employee')  # A missing directory is safe to retry.

    def test_explicit_team_root_removal(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / 'selected-team'
            root.mkdir()
            (root / 'employee.txt').write_text('selected data')
            call = lambda **args: workspace_files(root, 'remove-directory', args)
            with self.assertRaises(ValueError): call(path='.', allowRoot='yes')
            with self.assertRaises(ValueError): call(path='.', allowRoot=True, protectedPaths=[str(root / 'employee.txt')])
            call(path='.', allowRoot=True, preview=True)
            self.assertTrue(root.exists())
            call(path='.', allowRoot=True)
            self.assertFalse(root.exists())
        with self.assertRaises(ValueError):
            workspace_files(Path.home().parent, 'remove-directory', {'path': Path.home().name, 'preview': True})
        for protected in [Path.home(), Path(Path.home().anchor)]:
            with self.assertRaises(ValueError):
                workspace_files(protected, 'remove-directory', {'path': '.', 'allowRoot': True, 'preview': True})

if __name__ == '__main__': unittest.main()
