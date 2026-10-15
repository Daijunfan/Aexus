"""Isolated local Windows file-list regression; no existing host files touched."""
from pathlib import Path
import importlib.util
import subprocess
import tempfile

module_file = Path(__file__).resolve().parents[1] / 'backend' / 'Runtime' / 'workspace_files.py'
spec = importlib.util.spec_from_file_location('cloudhosts_workspace_files', module_file)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='cloudhosts-windows-hidden-') as folder:
    root = Path(folder)
    (root / 'visible').mkdir()
    (root / '.dot-hidden').mkdir()
    (root / 'attribute-hidden').mkdir()
    subprocess.run(['attrib.exe', '+h', str(root/'attribute-hidden')], check=True, capture_output=True)
    normal = module.workspace_files(root, 'list', {'path': '.', 'hidden': False})
    hidden = module.workspace_files(root, 'list', {'path': '.', 'hidden': True})
    names = {e['name'] for e in normal['entries']}
    all_names = {e['name']: e for e in hidden['entries']}
    assert names == {'visible'}, names
    assert all_names['attribute-hidden']['hidden'] is True
    assert all_names['.dot-hidden']['hidden'] is True
    assert all_names['visible']['hidden'] is False
    print('WINDOWS_HIDDEN_DOTFILE_AND_ATTRIBUTE=PASS')
