import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  Pencil,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useWorkspace } from '../store';
import { IconButton } from '../ui';
import { saveSpaceFile } from '../content/assets';
import type { Page, SpaceFileRecord, SpaceFolder } from '../types';

const isImage = (file: SpaceFileRecord) => (file.mimeType || '').startsWith('image/');

export function SpacePanel() {
  const { workspace, spacePanel, setSpacePanel, command, notify, setAgentPanel, api } = useWorkspace();
  const page = workspace!.pages.find((value) => value.id === spacePanel?.pageId);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | 'root' | null>(null);
  const [preview, setPreview] = useState('');
  const previewElement = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (spacePanel?.line)
      previewElement.current
        ?.querySelector(`[data-file-line="${spacePanel.line}"]`)
        ?.scrollIntoView({ block: 'center' });
  }, [preview, spacePanel?.line]);
  const previewFile = page?.files?.find((file) => file.id === spacePanel?.fileId);
  useEffect(() => {
    let cancelled = false;
    setPreview('');
    if (previewFile && !isImage(previewFile) && previewFile.mimeType !== 'application/pdf')
      void api('file.read', { pageId: spacePanel!.pageId, fileId: previewFile.id })
        .then((file) => {
          if (!cancelled) setPreview(file.content);
        })
        .catch((error) => {
          if (!cancelled) notify(error.message);
        });
    return () => {
      cancelled = true;
    };
  }, [spacePanel?.pageId, previewFile?.id, previewFile?.modifiedAt]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setExpanded([]);
    setSelected(null);
    setRenaming(null);
    if (spacePanel?.pageId && window.native)
      void api('space.sync', { pageId: spacePanel.pageId }).catch((error) => notify(String(error)));
  }, [spacePanel?.pageId]);
  if (!page || !spacePanel) return null;
  const folders = page.folders || [];
  const files = page.files || [];
  const space = workspace!.spaces?.[page.id];

  const execute = (method: string, params: Record<string, any>) => {
    try {
      return command(method, { pageId: page.id, ...params });
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
      return null;
    }
  };

  const upload = async (list: FileList | File[], folderId: string | null) => {
    const items = Array.from(list);
    if (!items.length) return;
    setBusy(true);
    try {
      for (const file of items) {
        const saved = await saveSpaceFile(page.id, folderId, file);
        if (!saved) {
          notify('浏览器预览不支持空间文件，请使用桌面应用');
          break;
        }
        execute('file.record', {
          name: saved.name || file.name,
          url: saved.url,
          folderId: saved.folderId,
          bytes: file.size,
          mimeType: file.type,
        });
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const createFolder = (parentId: string | null) => {
    const name = window.prompt('文件夹名称', '新建文件夹');
    if (!name) return;
    const folder = execute('folder.create', { name, parentId });
    if (folder && parentId) setExpanded((list) => [...new Set([...list, parentId])]);
  };

  const drop = (event: DragEvent, folderId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    const types = event.dataTransfer.types;
    if (types.includes('Files')) {
      void upload(event.dataTransfer.files, folderId);
      return;
    }
    const moveFolder = event.dataTransfer.getData('application/x-mini-space-folder');
    if (moveFolder) execute('folder.move', { folderId: moveFolder, parentId: folderId });
    const moveFile = event.dataTransfer.getData('application/x-mini-space-file');
    if (moveFile) execute('file.move', { fileId: moveFile, folderId });
  };

  const allowDrop = (event: DragEvent, key: string) => {
    if (
      !event.dataTransfer.types.includes('Files') &&
      !event.dataTransfer.types.includes('application/x-mini-space-folder') &&
      !event.dataTransfer.types.includes('application/x-mini-space-file')
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(key);
  };

  const row = (folder: SpaceFolder, depth: number) => {
    const children = folders.filter((value) => value.parentId === folder.id);
    const contents = files.filter((file) => file.folderId === folder.id);
    const open = expanded.includes(folder.id);
    return (
      <div key={folder.id}>
        <div
          className={`space-folder-row ${selected === folder.id ? 'selected' : ''} ${dropTarget === folder.id ? 'space-drop-target' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('application/x-mini-space-folder', folder.id);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(event) => allowDrop(event, folder.id)}
          onDragLeave={() => setDropTarget((value) => (value === folder.id ? null : value))}
          onDrop={(event) => drop(event, folder.id)}
          onClick={() => {
            setSelected(folder.id);
            setExpanded((list) =>
              list.includes(folder.id) ? list.filter((id) => id !== folder.id) : [...list, folder.id],
            );
          }}
        >
          <ChevronRight size={13} className={open ? 'rotated' : ''} />
          <Folder size={15} />
          {renaming === folder.id ? (
            <input
              className="space-rename"
              defaultValue={folder.name}
              autoFocus
              onClick={(event) => event.stopPropagation()}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value && value !== folder.name)
                  execute('folder.rename', { folderId: folder.id, name: value });
                setRenaming(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') setRenaming(null);
              }}
            />
          ) : (
            <span className="space-name">{folder.name}</span>
          )}
          <span className="space-row-actions" onClick={(event) => event.stopPropagation()}>
            <IconButton label="新建子文件夹" onClick={() => createFolder(folder.id)}>
              <FolderPlus size={13} />
            </IconButton>
            <IconButton label="重命名文件夹" onClick={() => setRenaming(folder.id)}>
              <Pencil size={12} />
            </IconButton>
            <IconButton
              label="删除文件夹"
              onClick={() => {
                if (window.confirm(`删除「${folder.name}」及其内容？`))
                  execute('folder.delete', { folderId: folder.id, confirm: true });
              }}
            >
              <Trash2 size={12} />
            </IconButton>
          </span>
        </div>
        {open && (
          <div>
            {children.map((child) => row(child, depth + 1))}
            {contents.map((file) => fileRow(file, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const fileRow = (file: SpaceFileRecord, depth: number) => (
    <div
      key={file.id}
      className={`space-file-row ${dropTarget === file.id ? 'space-drop-target' : ''}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-mini-space-file', file.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
    >
      {isImage(file) ? <img src={file.url} alt="" className="space-file-thumb" /> : <FileText size={15} />}
      <button
        className="space-name space-file-link"
        title={file.name}
        onClick={() => setSpacePanel({ pageId: page.id, fileId: file.id })}
      >
        {file.name}
      </button>
      <span className="space-row-actions">
        <IconButton label="打开文件" onClick={() => void window.native?.openExternal(file.url)}>
          <Download size={12} />
        </IconButton>
        <IconButton
          label="删除文件"
          onClick={() => {
            if (!window.confirm(`删除「${file.name}」？`)) return;
            void api('space.remove-file', { pageId: page.id, fileId: file.id }).catch((error) =>
              notify(error.message),
            );
          }}
        >
          <Trash2 size={12} />
        </IconButton>
      </span>
    </div>
  );

  return (
    <aside className="space-panel" aria-label="空间文件">
      <header>
        <HardDrive size={17} />
        <strong>空间文件</strong>
        <IconButton label="关闭文件面板" onClick={() => setSpacePanel(null)}>
          <X size={17} />
        </IconButton>
      </header>
      {previewFile && (
        <section className="space-preview" aria-label={`预览 ${previewFile.name}`}>
          <header>
            <strong>{previewFile.name}</strong>
            <IconButton label="关闭文件预览" onClick={() => setSpacePanel({ pageId: page.id })}>
              <X size={14} />
            </IconButton>
          </header>
          {isImage(previewFile) ? (
            <img src={previewFile.url} alt={previewFile.name} />
          ) : previewFile.mimeType === 'application/pdf' ? (
            <iframe src={previewFile.url} title={previewFile.name} />
          ) : (
            <pre ref={previewElement}>
              {preview.split('\n').map((text, index) => (
                <span
                  key={index}
                  data-file-line={index + 1}
                  className={`space-file-line ${spacePanel.line === index + 1 ? 'selected' : ''}`}
                >
                  <span className="space-file-line-number">{index + 1}</span>
                  {text}
                </span>
              ))}
            </pre>
          )}
        </section>
      )}
      <div className="space-toolbar">
        <button onClick={() => createFolder(selected)}>
          <FolderPlus size={14} />
          新建文件夹
        </button>
        <button onClick={() => input.current?.click()} disabled={busy}>
          <Upload size={14} />
          {busy ? '上传中…' : '上传文件'}
        </button>
        <IconButton label="在访达中显示" onClick={() => void window.native?.revealSpace(page.id)}>
          <HardDrive size={15} />
        </IconButton>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) void upload(event.target.files, selected);
            event.target.value = '';
          }}
        />
      </div>
      <div className="space-hint">
        {space?.title || page.title || '无标题'} · {folders.length} 个文件夹 · {files.length} 个文件
      </div>
      <div
        className={`space-tree ${dropTarget === 'root' ? 'space-drop-target' : ''}`}
        onDragOver={(event) => allowDrop(event, 'root')}
        onDragLeave={() => setDropTarget((value) => (value === 'root' ? null : value))}
        onDrop={(event) => drop(event, null)}
      >
        {folders.filter((folder) => !folder.parentId).map((folder) => row(folder, 0))}
        {files.filter((file) => !file.folderId).map((file) => fileRow(file, 0))}
        {!folders.length && !files.length && (
          <p className="space-empty">
            把文件拖到这里，或点击「上传文件」。可以新建文件夹整理，每个空间的文件彼此独立。
          </p>
        )}
      </div>
      {page.space && (
        <button className="space-agent-link" onClick={() => setAgentPanel({ pageId: page.id })}>
          用自然语言让 Agent 整理这个空间 →
        </button>
      )}
    </aside>
  );
}
