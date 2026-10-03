"""The same scoped editor protocol as Agents Company's local workspace API."""
import hashlib
import json
from pathlib import Path
import uuid
import base64
import os
import re
import shutil
import sqlite3
import tempfile
import threading
import time

_asset_jobs = {}
_asset_caches = {}
_asset_lock = threading.Lock()

def asset_inventory(root, args):
    key = hashlib.sha256(str(root).encode()).hexdigest()
    with _asset_lock:
        if key not in _asset_caches: _asset_caches[key] = Path(tempfile.mkdtemp(prefix="agents-assets-")) / "inventory.sqlite"
        cache = _asset_caches[key]
    def build():
        errors = []
        db = None
        try:
            db = sqlite3.connect(cache)
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS entries(path TEXT PRIMARY KEY, data TEXT)")
            db.execute("DELETE FROM entries")
            def walk(folder, private=False):
                total = visible = folders = shown = 0
                try:
                    entries = list(os.scandir(folder))
                except OSError as error:
                    errors.append(str(error)); entries = []
                for entry in entries:
                    if entry.is_symlink() or entry.name == ".agents-company" or entry.name.startswith(".agents-transfer-"): continue
                    hidden = private or entry.name.startswith(".")
                    if entry.is_dir(follow_symlinks=False):
                        count, count_visible = walk(Path(entry.path), hidden)
                        total += count; visible += count_visible; folders += bool(count); shown += bool(count_visible)
                    elif entry.is_file(follow_symlinks=False):
                        stat = entry.stat(follow_symlinks=False)
                        value = dict(path=Path(entry.path).relative_to(root).as_posix(), name=entry.name, bytes=stat.st_size, modifiedAt=stat.st_mtime * 1000, directory=False, symlink=False)
                        db.execute("INSERT OR REPLACE INTO entries VALUES(?,?)", (value["path"], json.dumps(value)))
                        total += 1; visible += not hidden
                relative = folder.relative_to(root).as_posix()
                value = dict(path="" if relative == "." else relative, directory=True, files=total, visibleFiles=visible, folders=folders, visibleFolders=shown)
                db.execute("INSERT OR REPLACE INTO entries VALUES(?,?)", (value["path"], json.dumps(value)))
                return total, visible
            walk(root); db.commit(); db.close()
            os.chmod(cache, 0o600)
        except Exception as error:
            errors.append(str(error))
        finally:
            if db is not None: db.close()
            with _asset_lock: _asset_jobs[key] = dict(indexing=False, at=time.time(), errors=errors)
    with _asset_lock:
        job = _asset_jobs.get(key)
        if job is None or not job["indexing"] and ((time.time() - job["at"] > 30 and not args.get("cursor", 0)) or args.get("refresh")):
            _asset_jobs[key] = dict(indexing=True, at=time.time(), errors=[])
            threading.Thread(target=build, daemon=True).start()
        job = _asset_jobs[key]
    if job["indexing"]: return dict(indexing=True, entries=[], directories=[])
    cursor = int(args.get("cursor", 0))
    with sqlite3.connect(cache) as db: rows = db.execute("SELECT data FROM entries ORDER BY path LIMIT 1001 OFFSET ?", (cursor,)).fetchall()
    values = [json.loads(row[0]) for row in rows[:1000]]
    return dict(indexing=False, entries=[v for v in values if not v["directory"]], directories=[v for v in values if v["directory"]], nextCursor=cursor + 1000 if len(rows) > 1000 else None, errors=job["errors"])



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
    if operation == 'directory-plan':
        rows = []
        def walk(folder):
            stat = folder.stat()
            rows.append(dict(fromPath=str(folder), name=folder.name, parent=str(folder.parent), siblings=os.listdir(folder.parent), inode=stat.st_ino, device=stat.st_dev))
            for entry in os.scandir(folder):
                if entry.is_dir(follow_symlinks=False) and entry.name != '.agents-company' and not entry.name.startswith('.agents-transfer-'): walk(Path(entry.path))
        walk(root)
        metadata = root / '.agents-company' / 'directory-renames.json'
        return dict(root=str(root), directories=rows, aliasesBefore=metadata.read_text(encoding='utf-8') if metadata.exists() else None)
    if operation == 'directory-rollback':
        plan = args['plan']
        if Path(plan['root']).resolve() != root: raise ValueError('Unexpected directory rollback root')
        for item in reversed(plan['renames']):
            old, new = Path(item['from']), Path(item['to'])
            if not old.is_symlink() or old.resolve() != new.resolve(): raise ValueError('Migration link changed before rollback')
            old.unlink(); new.rename(old)
        metadata = Path(plan['root']) / '.agents-company' / 'directory-renames.json'
        if plan.get('aliasesBefore') is None:
            metadata.unlink(missing_ok=True)
        else:
            metadata.write_text(plan['aliasesBefore'], encoding='utf-8')
        return dict(rolledBack=True)
    if operation == 'directory-apply':
        plan = args['plan']
        if plan['root'] != str(root): raise ValueError('Remote workspace changed since preview')
        completed = []
        try:
            for item in plan['renames']:
                old, new = Path(item['from']), Path(item['to'])
                if old != root: old.relative_to(root)
                if old.parent != new.parent or not re.fullmatch(r'[a-z0-9_-]+', new.name): raise ValueError('Invalid directory migration target')
                stat = old.lstat()
                if not old.is_dir() or old.is_symlink() or stat.st_ino != item['inode'] or stat.st_dev != item['device']: raise ValueError('Remote directory changed since preview')
                if new.exists() or new.is_symlink(): raise ValueError('Directory migration target exists')
                old.rename(new)
                try: os.symlink(new.name, old, target_is_directory=True)
                except Exception:
                    new.rename(old); raise
                completed.append(item)
            def rebased(value):
                for item in plan['renames']:
                    old = item['from']
                    if value == old or value.startswith(old + os.sep): value = item['to'] + value[len(old):]
                return value
            next_root = Path(rebased(str(root)))
            aliases = [dict(fromPath=Path(item['from']).relative_to(root).as_posix(), toPath=Path(rebased(item['from'])).relative_to(next_root).as_posix()) for item in plan['renames'] if Path(item['from']) != root]
            if aliases:
                metadata = next_root / '.agents-company' / 'directory-renames.json'
                metadata.parent.mkdir(exist_ok=True)
                metadata.write_text(json.dumps(dict(version=1, aliases=[{'from':i['fromPath'], 'to':i['toPath']} for i in aliases])), encoding='utf-8')
            return dict(root=str(next_root), renamed=len(completed), paths=[dict(fromPath=i['from'], toPath=rebased(i['from'])) for i in plan['renames']])
        except Exception:
            for item in reversed(completed):
                old, new = Path(item['from']), Path(item['to'])
                old.unlink(); new.rename(old)
            raise
    if operation == 'inventory':
        return asset_inventory(root, args)
    if operation == 'copy-info':
        original = root / value
        if not original.exists() and not original.is_symlink():
            return dict(exists=False)
        stat = original.lstat()
        return dict(exists=True, directory=original.is_dir(), regular=original.is_file(), symlink=original.is_symlink(), bytes=stat.st_size, modifiedAt=stat.st_mtime*1000, mode=stat.st_mode & 0o777)
    if operation == 'copy-read':
        offset, length = args['offset'], args['length']
        if type(offset) is not int or offset < 0 or type(length) is not int or not 0 < length <= 262144:
            raise ValueError('Invalid transfer range')
        if (root / value).is_symlink() or not file.is_file():
            raise ValueError('只能传输普通文件')
        with file.open('rb') as stream:
            stream.seek(offset)
            data = stream.read(length)
        return dict(data=base64.b64encode(data).decode(), bytes=len(data))
    if operation in ['copy-write', 'copy-commit', 'copy-remove']:
        locate(value, True)
        if not any(re.fullmatch(r'\.agents-transfer-[a-f0-9-]{36}', p) for p in file.relative_to(root).parts):
            raise ValueError('Invalid transfer staging path')
        if operation == 'copy-remove':
            if file.is_dir(): shutil.rmtree(file)
            elif file.exists(): file.unlink()
            return dict(removed=True)
        if operation == 'copy-commit':
            target = locate(args['to'], True)
            if target.exists(): raise ValueError('目标已有同名文件，未覆盖')
            if file.is_dir(): file.rename(target)
            else:
                os.link(file, target)
                file.unlink()
            return dict(path=args['to'])
        offset, encoded = args['offset'], args['data']
        if type(offset) is not int or offset < 0 or not isinstance(encoded, str) or len(encoded) > 349528:
            raise ValueError('Invalid transfer chunk')
        data = base64.b64decode(encoded, validate=True)
        with file.open('xb' if offset == 0 else 'r+b') as stream:
            if os.fstat(stream.fileno()).st_size != offset: raise ValueError('Transfer offset mismatch')
            stream.seek(offset)
            stream.write(data)
        if args.get('final') and os.name != 'nt': file.chmod(args.get('mode') or 0o600)
        return dict(bytes=len(data))
    if operation == 'remove-empty-directory':
        if file == root:
            raise ValueError('Cannot remove the workspace root')
        file.rmdir()
        return {'removed': True}
    if operation == 'remove-directory':
        if file == Path(file.anchor) or file == Path.home().resolve():
            raise ValueError('不能删除主机根目录或用户主目录')
        if file != root or args.get('allowRoot') is not True:
            locate(value, True)
        protected = [Path(p).resolve() for p in args.get('protectedPaths', [])]
        if any(p == file or file in p.parents for p in protected):
            raise ValueError('工作文件夹仍被其他员工或 Team 使用，请选择 only employee')
        if (root / value).is_symlink() or (file.exists() and not file.is_dir()):
            raise ValueError('工作目录不是普通文件夹，请选择 only employee')
        if not args.get('preview') and file.exists():
            shutil.rmtree(file)
        return {'removed': not args.get('preview', False), 'path': str(file)}
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
        if args.get('contentBase64') is not None:
            encoded = args['contentBase64']
            if not isinstance(encoded, str) or len(encoded) > 14 * 1024 * 1024:
                raise ValueError('图片不能超过 10 MB')
            data = base64.b64decode(encoded, validate=True)
            if len(data) > 10 * 1024 * 1024 or not (data.startswith(b'\x89PNG\r\n\x1a\n') or data.startswith(b'\xff\xd8\xff') or data[:6] in (b'GIF87a', b'GIF89a') or data[:4] == b'RIFF' and data[8:12] == b'WEBP'):
                raise ValueError('请选择 10 MB 以内的 PNG、JPEG、GIF 或 WebP 图片')
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(data)
            return dict(path=value, saved=True)
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
        info = json.loads((trash/(identity+'.json')).read_text(encoding='utf-8'))
        target = locate(info['path'], True)
        if target.exists():
            raise ValueError('原路径已有文件')
        (trash/identity).rename(target)
        (trash/(identity+'.json')).unlink()
        return dict(path=info['path'])
    raise ValueError('Unknown file operation')
