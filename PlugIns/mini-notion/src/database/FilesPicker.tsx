import { useEffect, useRef, useState } from 'react';
import { File, Link2, Upload, ArrowUp, ArrowDown, Download, Trash2, Pencil } from 'lucide-react';
import { useWorkspace } from '../store';
import { Popover, IconButton } from '../ui';
import { saveAsset } from '../content/assets';
import type { FileValue } from '../types';
export function FilesPicker({
  value,
  onChange,
  label,
  disabled = false,
  onBusyChange,
}: {
  value: unknown;
  onChange: (value: FileValue[]) => void;
  label: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { notify } = useWorkspace();
  const files = Array.isArray(value) ? (value as FileValue[]) : [];
  const latest = useRef(files);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  latest.current = files;
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState(false),
    [url, setUrl] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const upload = async (selected: FileList | File[]) => {
    if (busy) return;
    setBusy(true);
    onBusyChange?.(true);
    try {
      const added: FileValue[] = [];
      for (const file of Array.from(selected))
        added.push({
          id: crypto.randomUUID(),
          name: file.name,
          url: await saveAsset(file),
          mimeType: file.type,
          size: file.size,
        });
      if (mounted.current) onChange([...latest.current, ...added]);
    } catch (error) {
      notify(`附件添加失败：${String(error)}`);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  const move = (id: string, direction: number) => {
    const index = files.findIndex((file) => file.id === id),
      next = [...files],
      target = index + direction;
    if (target < 0 || target >= files.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const open = (file: FileValue) =>
    window.native
      ? void window.native.openExternal(file.url)
      : window.open(file.url, '_blank', 'noopener,noreferrer');
  return (
    <>
      <button
        type="button"
        className="files-property"
        aria-label={label}
        disabled={disabled || busy}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPicker({ x: rect.left, y: rect.bottom + 4 });
        }}
        onDragOver={(event) => {
          if (!disabled && event.dataTransfer.types.includes('Files')) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!disabled && event.dataTransfer.files.length) {
            event.preventDefault();
            event.stopPropagation();
            void upload(event.dataTransfer.files);
          }
        }}
      >
        {files.length ? (
          files.map((file) => (
            <span className="file-badge" key={file.id}>
              {file.mimeType?.startsWith('image/') ? <img src={file.url} alt="" /> : <File size={14} />}
              <span>{file.name}</span>
            </span>
          ))
        ) : (
          <span className="property-empty">{busy ? '正在保存…' : '添加文件或图片…'}</span>
        )}
      </button>
      <input
        ref={input}
        hidden
        type="file"
        multiple
        aria-label={`${label}上传文件`}
        onChange={(event) => {
          if (event.target.files) void upload(event.target.files);
          event.target.value = '';
        }}
      />
      {picker && (
        <Popover {...picker} width={420} className="files-picker" onClose={() => setPicker(null)}>
          <div className="files-toolbar">
            <button type="button" disabled={busy} onClick={() => input.current?.click()}>
              <Upload size={14} /> 上传文件
            </button>
            <button type="button" onClick={() => setLink(!link)}>
              <Link2 size={14} /> 添加链接
            </button>
          </div>
          {link && (
            <form
              className="file-url"
              onSubmit={(event) => {
                event.preventDefault();
                if (!/^https?:\/\//i.test(url)) return;
                onChange([
                  ...files,
                  {
                    id: crypto.randomUUID(),
                    name: decodeURIComponent(new URL(url).pathname.split('/').pop() || new URL(url).hostname),
                    url,
                  },
                ]);
                setUrl('');
                setLink(false);
              }}
            >
              <input
                aria-label="附件链接"
                type="url"
                placeholder="https://…"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <button type="submit">添加</button>
            </form>
          )}
          {files.map((file, index) => (
            <div
              className="file-entry"
              key={file.id}
              draggable
              onDragStart={(event) => event.dataTransfer.setData('application/x-mini-file', file.id)}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes('application/x-mini-file')) event.preventDefault();
              }}
              onDrop={(event) => {
                const id = event.dataTransfer.getData('application/x-mini-file');
                if (!id) return;
                event.preventDefault();
                const moved = files.find((item) => item.id === id);
                if (!moved) return;
                const next = files.filter((item) => item.id !== id);
                next.splice(index, 0, moved);
                onChange(next);
              }}
            >
              <button type="button" className="file-preview" title="打开文件" onClick={() => open(file)}>
                {file.mimeType?.startsWith('image/') ? (
                  <img src={file.url} alt={file.name} />
                ) : (
                  <File size={24} />
                )}
              </button>
              <input
                aria-label={`文件名称 ${index + 1}`}
                value={file.name}
                onChange={(event) =>
                  onChange(
                    files.map((item) => (item.id === file.id ? { ...item, name: event.target.value } : item)),
                  )
                }
              />
              <IconButton label="上移文件" disabled={!index} onClick={() => move(file.id, -1)}>
                <ArrowUp size={13} />
              </IconButton>
              <IconButton
                label="下移文件"
                disabled={index === files.length - 1}
                onClick={() => move(file.id, 1)}
              >
                <ArrowDown size={13} />
              </IconButton>
              <IconButton
                label="下载文件"
                onClick={() => {
                  if (window.native && file.url.startsWith('asset:'))
                    void window.native
                      .exportAsset(file.url, file.name)
                      .catch((error) => notify(String(error)));
                  else open(file);
                }}
              >
                <Download size={13} />
              </IconButton>
              <IconButton
                label="移除文件"
                onClick={() => onChange(files.filter((item) => item.id !== file.id))}
              >
                <Trash2 size={13} />
              </IconButton>
            </div>
          ))}
          {!files.length && (
            <div
              className="files-empty"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void upload(event.dataTransfer.files);
              }}
            >
              拖入文件，或点击上方上传
            </div>
          )}
        </Popover>
      )}
    </>
  );
}
