import { useEffect, useState } from 'react';
import { FolderOpen, Copy } from 'lucide-react';
import { useWorkspace } from '../store';

type Location = { path: string; absoluteDirectory: string };
/** File details are fetched only inside the explicitly opened page menu. */
export function WorkspaceLocation({ pageId }: { pageId: string }) {
  const { api, notify } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState<Location | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLocation(null); setError('');
    void api('fs.path', { pageId }).then(value => {
      if (active) setLocation(value);
    }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [pageId, open]);
  return <details className="folder-page-location" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><FolderOpen size={14} />文件位置</summary>
    {location ? <>
      <div><code>{location.path}</code></div>
      <div><code>{location.absoluteDirectory}</code></div>
      <button type="button" aria-label="复制员工绑定目录" onClick={() => {
        void navigator.clipboard.writeText(location.absoluteDirectory).then(() => notify('已复制目录')).catch(() => notify('无法访问剪贴板，请选择并复制目录文字'));
      }}><Copy size={13} />复制文件夹路径</button>
    </> : <small>{error || '读取文件位置…'}</small>}
  </details>;
}
