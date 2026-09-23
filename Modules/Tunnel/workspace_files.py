"""The same scoped editor protocol as Agents Company's local workspace API."""
import hashlib
import json
from pathlib import Path
import uuid


def workspace_files(root, operation, args):
    root = Path(root).resolve()
    def locate(value='.', write=False):
        file = (root / value).resolve()
        try:
            relative = file.relative_to(root)
        except ValueError:
            raise ValueError('文件路径或软链接超出工作目录')
        if write and (file == root or '.agents-company' in relative.parts):
            raise ValueError('不能修改工作目录本身或宿主管理文件')
        return file
    def digest(file):
        return hashlib.sha256(file.read_bytes()).hexdigest()
    value = args.get('path') or '.'
    file = locate(value, operation in ['write', 'mkdir', 'move', 'trash'])
    if operation == 'remove-empty-directory':
        if file == root:
            raise ValueError('Cannot remove the workspace root')
        file.rmdir()
        return {'removed': True}
    if operation == 'directory':
        if args.get('create'):
            locate(value, True)
            if args.get('exclusive') and file.exists():
                raise ValueError('这个文件夹已存在，请选择绑定已有文件夹')
            if not args.get('preview'):
                file.mkdir(parents=True, exist_ok=not args.get('exclusive'))
        if (not args.get('create') or file.exists()) and not file.is_dir():
            raise ValueError('所选云端文件夹不存在或不是文件夹')
        return dict(path=str(file), root=str(root))
    if operation == 'list':
        entries = []
        for child in file.iterdir():
            if not args.get('hidden') and child.name.startswith('.'):
                continue
            stat = child.lstat()
            entries.append(dict(name=child.name, path=child.relative_to(root).as_posix(), directory=child.is_dir() and not child.is_symlink(),
                                symlink=child.is_symlink(), bytes=stat.st_size, modifiedAt=stat.st_mtime*1000))
        return dict(root=str(root), path=file.relative_to(root).as_posix(), entries=sorted(entries, key=lambda e:(not e['directory'], e['name'])))
    if operation == 'read-image':
        import base64
        if file.stat().st_size > 10 * 1024 * 1024:
            raise ValueError('图片不能超过 10 MB')
        data = file.read_bytes()
        mime = 'image/png' if data.startswith(b'\x89PNG\r\n\x1a\n') else 'image/jpeg' if data.startswith(b'\xff\xd8\xff') else 'image/gif' if data[:6] in (b'GIF87a', b'GIF89a') else 'image/webp' if data[:4] == b'RIFF' and data[8:12] == b'WEBP' else None
        if not mime:
            raise ValueError('请选择 PNG、JPEG、GIF 或 WebP 图片')
        return dict(path=value, mimeType=mime, data=base64.b64encode(data).decode(), bytes=len(data), binary=True)
    if operation == 'read':
        if not file.is_file():
            raise ValueError('请选择一个文件')
        if file.stat().st_size > 4*1024*1024:
            return dict(path=value, bytes=file.stat().st_size, binary=True)
        data = file.read_bytes()
        try:
            content = data.decode('utf-8') if b'\0' not in data else None
        except UnicodeDecodeError:
            content = None
        return dict(path=value, bytes=len(data), binary=content is None, content=content, hash=hashlib.sha256(data).hexdigest())
    if operation == 'write':
        if args.get('hash') and (not file.exists() or digest(file) != args['hash']):
            raise ValueError('文件已被其他操作修改，请重新读取后保存')
        if args.get('create') and file.exists():
            raise ValueError('同名文件已存在')
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(args.get('content', ''), encoding='utf-8')
        return dict(path=value, saved=True)
    if operation == 'mkdir':
        file.mkdir()
        return dict(path=value, created=True)
    if operation == 'move':
        target = locate(args['to'], True)
        if target.exists():
            raise ValueError('目标路径已存在')
        file.rename(target)
        return dict(path=args['to'])
    trash = locate('.agents-company/trash')
    if operation == 'trash':
        identity = str(uuid.uuid4())
        trash.mkdir(parents=True, exist_ok=True)
        file.rename(trash / identity)
        (trash/(identity+'.json')).write_text(json.dumps({'path':value}))
        return dict(id=identity, path=value)
    if operation == 'restore':
        identity = str(uuid.UUID(args['id']))
        info = json.loads((trash/(identity+'.json')).read_text())
        target = locate(info['path'], True)
        if target.exists():
            raise ValueError('原路径已有文件')
        (trash/identity).rename(target)
        (trash/(identity+'.json')).unlink()
        return dict(path=info['path'])
    raise ValueError('Unknown file operation')
