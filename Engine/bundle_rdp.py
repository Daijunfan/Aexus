"""Bundle the native RDP engine and rewrite its dylib dependencies locally."""
from pathlib import Path
import json
import os
import shutil
import subprocess

root = Path(__file__).resolve().parent.parent
engine = root / 'Runtime/rdp'
library = engine / 'lib'


def dependencies(file):
    lines = subprocess.check_output(['otool', '-L', str(file)], text=True).splitlines()[1:]
    return [line.strip().split(' (', 1)[0] for line in lines]


def bundle():
    pending = [(p, p) for p in library.glob('*.dylib') if not p.is_symlink()]
    pending.append((engine / 'sbin/guacd', engine / 'sbin/guacd'))
    processed = set()
    while pending:
        source, destination = pending.pop()
        if destination in processed:
            continue
        processed.add(destination)
        for dep in dependencies(source):
            if dep.startswith(('/usr/lib/', '/System/Library/')):
                continue
            if dep.startswith('@loader_path/'):
                native = source.parent / dep.removeprefix('@loader_path/')
            elif dep.startswith('@rpath/'):
                name = dep.removeprefix('@rpath/')
                native = source.parent / name
                if not native.exists():
                    candidates = list(Path('/opt/homebrew/opt').glob('*/lib/' + name))
                    if not candidates:
                        raise RuntimeError('Unresolved native dependency: ' + dep)
                    native = candidates[0]
            elif dep.startswith('/'):
                native = Path(dep)
            else:
                raise RuntimeError('Unresolved native dependency: ' + dep)
            target = library / native.name
            if not target.exists():
                shutil.copy2(native.resolve(), target)
            if target not in processed:
                pending.append((native.resolve(), target))
            replacement = '@loader_path/' + os.path.relpath(target, destination.parent)
            subprocess.run(['install_name_tool', '-change', dep, replacement, str(destination)], check=True, capture_output=True)
        if destination.suffix == '.dylib':
            subprocess.run(['install_name_tool', '-id', '@rpath/' + destination.name, str(destination)], check=True, capture_output=True)
    for file in processed:
        subprocess.run(['codesign', '--force', '--sign', '-', str(file)], check=True, capture_output=True)
    for pattern in ['*.a', '*.la']:
        for file in library.glob(pattern):
            file.unlink()
    for name in ['include', 'share']:
        shutil.rmtree(engine / name, ignore_errors=True)
    # The Guacamole plugin loader uses .so even on macOS.
    plugin = library / 'libguac-client-rdp.so'
    if not plugin.exists():
        plugin.symlink_to('libguac-client-rdp.0.dylib')
    print('Bundled RDP engine:', len(processed), 'native libraries and executables')


if __name__ == '__main__':
    bundle()
