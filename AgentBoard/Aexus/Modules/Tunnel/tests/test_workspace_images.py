import base64
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from workspace_files import workspace_files

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=')

class WorkspaceImageTests(unittest.TestCase):
    def test_clipboard_image_round_trip(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            target = '.agents-attachments/screenshot.png'
            workspace_files(root, 'write', {'path': target, 'contentBase64': base64.b64encode(PNG).decode(), 'create': True})
            self.assertEqual((root / target).read_bytes(), PNG)
            self.assertEqual(workspace_files(root, 'read-image', {'path': target})['mimeType'], 'image/png')
            with self.assertRaises(ValueError):
                workspace_files(root, 'write', {'path': target, 'contentBase64': base64.b64encode(PNG).decode(), 'create': True})

if __name__ == '__main__': unittest.main()
