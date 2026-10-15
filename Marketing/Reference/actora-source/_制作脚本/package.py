"""Validate all final posters and rebuild the public promotional archive."""
from pathlib import Path
import hashlib, json, struct, zipfile
from datetime import datetime, timezone
root = Path(__file__).resolve().parent.parent
art = root.parent / 'artifacts/brand-github-update'
repo = 'https://github.com/Daijunfan/Agents-Company'
checks = json.loads((art / 'poster-link-checks.json').read_text())
cover = json.loads((root.parent / 'artifacts/collaboration-cover/poster-layout.json').read_text())
assert cover['url'] == repo
checks.append({'file': '01_我给AI开了家公司/01_封面.png', 'width': 3600, 'height': 4800, 'url': repo, 'urlBounds': cover['urlBounds']})
checks.sort(key=lambda item: item['file'])
assert len(checks) == 31
images = sorted(root.glob('[0-1][0-9]_*/*.png'))
assert set(images) == {root/item['file'] for item in checks}
files = []
for item in checks:
    file = root / item['file']
    data = file.read_bytes()
    assert data.startswith(b'\x89PNG\r\n\x1a\n')
    assert struct.unpack('>II', data[16:24]) == (item['width'], item['height']), file
    assert item['url'] == repo
    item['sha256'] = hashlib.sha256(data).hexdigest()
    files.append(file)
assert len({item['sha256'] for item in checks}) == 31
posts = sorted({file.parent for file in files})
assert len(posts) == 10
for index, post in enumerate(posts):
    assert len(list(post.glob('*.png'))) == (4 if index == 0 else 3), post
    text = post / '发布文案.md'
    assert repo in text.read_text()
    files.append(text)
previews = [root/'00_十篇封面总览.jpg', *sorted(root.glob('预览_*.jpg'))]
assert len(previews) == 6
files += [root / name for name in ['README_先看这里.md', '10篇文案合集.md']] + previews
archive = root / '小红书_10篇_发布包.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=7) as output:
    for file in files:
        output.write(file, file.relative_to(root))
with zipfile.ZipFile(archive) as output:
    assert output.testzip() is None
    assert len(output.namelist()) == 49
    for file in files:
        assert output.read(str(file.relative_to(root))) == file.read_bytes()
(root / '交付校验.json').write_text(json.dumps({
    'verifiedAt': datetime.now(timezone.utc).isoformat(), 'posts': 10, 'images': 31,
    'previews': 6, 'github': repo,
    'cover': 'Installed 0.50.2: Codex, Claude Code, Cline and Pi run real delegated tasks; DeepSeek Flash with thinking off; green task lines matched to Core currentTask IDs, no manufactured activity; original employee layout retained',
    'otherImages': 'Previously captured, labelled demonstrations; source screenshots unchanged',
    'archive': archive.name, 'archiveBytes': archive.stat().st_size,
    'archiveSHA256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'imagesChecked': checks
}, ensure_ascii=False, indent=2))
(root / '_制作脚本/成品清单.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2))
print(f'PASS: 10 posts, 31 PNGs, 6 previews, 49 archive entries, every archived byte verified. ZIP {archive.stat().st_size/1024/1024:.1f} MiB')
