import { BlockPreview } from './BlockPreview';
import { useContext, useEffect, useState, useRef } from 'react';
import {
  ArrowRight,
  ChevronRight,
  Clock3,
  FileText,
  Folder,
  History,
  LayoutTemplate,
  LoaderCircle,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  Download,
  Check,
  Search as SearchIcon,
} from 'lucide-react';
import { useWorkspace } from '../store';
import { Modal, EmptyState, PageIcon, formatDate } from '../ui';
import { templates, filterTemplates } from '../seed';
import { AppearanceTheme, pageAppearanceStyle, appearanceColor } from '../appearance';
import { ancestors, defaultDatabase, descendants, makePage, plainText } from '../model';
import { createExportEditor } from './Editor';
import { csvPages, databaseCSV, portableBlocks } from '../transfer';
import type { JsonBlock, Page, Version } from '../types';

export function Templates() {
  const { workspace, modal, setModal, create, patch, navigate } = useWorkspace();
  const [selectedId, setSelectedId] = useState(templates[0].id);
  const [query, setQuery] = useState(modal?.query || '');
  const [category, setCategory] = useState('');
  const theme = useContext(AppearanceTheme);
  const shown = filterTemplates(query, category);
  const selected = shown.find((template) => template.id === selectedId) || shown[0];
  const useTemplate = () => {
    if (!selected) return;
    const data: Partial<Page> = {
      title: selected.id === 'blank' ? '' : selected.name,
      icon: selected.id === 'blank' ? '' : selected.icon,
      color: selected.color,
      textColor: selected.textColor,
      ...(selected.appearance ? { appearance: selected.appearance } : {}),
      ...(selected.cover ? { cover: selected.cover } : {}),
      ...(selected.font ? { font: selected.font } : {}),
      ...(selected.fullWidth !== undefined ? { fullWidth: selected.fullWidth } : {}),
      blocks: structuredClone(
        selected.blocks.length ? selected.blocks : [{ type: 'paragraph', content: '' }],
      ),
      ...(selected.id === 'database' ? { database: defaultDatabase(), fullWidth: true } : {}),
    };
    if (modal?.pageId) {
      patch(modal.pageId, data);
      navigate(modal.pageId);
      window.dispatchEvent(
        new CustomEvent('mini:restore', { detail: { id: modal.pageId, blocks: data.blocks } }),
      );
    } else create(data);
    setModal(null);
  };
  return (
    <Modal title="从一个好起点开始" onClose={() => setModal(null)} wide className="templates-modal">
      <div className="templates-layout">
        <div className="template-list">
          <div className="template-browser-tools">
            <div className="template-search">
              <SearchIcon size={14} />
              <input
                aria-label="搜索模板"
                placeholder="搜索模板…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="template-categories">
              {['', '基础', '工作', '学习', '生活', '创作'].map((name) => (
                <button
                  key={name}
                  className={category === name ? 'selected' : ''}
                  onClick={() => setCategory(name)}
                >
                  {name || '全部'}
                </button>
              ))}
            </div>
            <p>{shown.length} 个模板 · 为你的日常而设计</p>
          </div>
          {shown.map((template) => (
            <button
              key={template.id}
              className={selected?.id === template.id ? 'selected' : ''}
              onClick={() => setSelectedId(template.id)}
            >
              <span
                className="template-list-icon"
                style={{ background: appearanceColor(template.color, theme) }}
              >
                {template.icon}
              </span>
              <div>
                <strong>{template.name}</strong>
                <small>{template.description}</small>
              </div>
              <ChevronRight size={14} />
            </button>
          ))}
          {!shown.length && <p className="template-no-results">没有匹配的模板，试试其他关键词。</p>}
        </div>
        <div
          className="template-preview"
          style={pageAppearanceStyle(selected, theme, workspace!.settings.appearance)}
        >
          {selected ? (
            <>
              <div className="template-preview-scroll">
                {selected.cover && <div className={`template-cover-banner cover-${selected.cover}`} />}
                <article className={`template-preview-page font-${selected.font || 'default'}`}>
                  <span className="template-category-label">{selected.category}</span>
                  <span className="template-big-icon">{selected.icon}</span>
                  <h1 style={{ textAlign: selected.appearance?.titleAlign || 'left' }}>{selected.name}</h1>
                  <p className="muted">{selected.description}</p>
                  <div className="template-preview-blocks">
                    <BlockPreview blocks={selected.blocks.slice(0, 9)} />
                    {selected.id === 'blank' && <p className="template-empty">一切可能，始于空白。</p>}
                    {selected.id === 'database' && (
                      <div className="template-database-preview">
                        <div>
                          名称<span>状态</span>
                        </div>
                        <div>
                          新任务<span>未开始</span>
                        </div>
                        <div>
                          另一个好想法<span>进行中</span>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              </div>
              <button className="primary-button" onClick={useTemplate}>
                使用此模板
                <ArrowRight size={15} />
              </button>
            </>
          ) : (
            <div className="template-no-results">选择一个模板查看预览</div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function Trash() {
  const { workspace, setModal, restore, removePermanently } = useWorkspace();
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState<string | 'all' | null>(null);
  const pages = workspace!.pages.filter(
    (p) => p.trashedAt && p.title.toLowerCase().includes(query.toLowerCase()),
  );
  const all = workspace!.pages.filter((p) => p.trashedAt);
  return (
    <Modal title={confirm ? '永久删除页面？' : '回收站'} onClose={() => setModal(null)}>
      {confirm ? (
        <div className="modal-body">
          <p>
            {confirm === 'all'
              ? '回收站中的所有页面及其子页面将被永久删除。'
              : '这个页面及其子页面将被永久删除。'}
            此操作无法撤销。
          </p>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setConfirm(null)}>
              取消
            </button>
            <button
              className="danger-button"
              onClick={() => {
                if (confirm === 'all') all.forEach((p) => removePermanently(p.id));
                else removePermanently(confirm);
                setConfirm(null);
              }}
            >
              永久删除
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="trash-search">
            <SearchIcon size={16} />
            <input
              autoFocus
              aria-label="搜索回收站"
              placeholder="搜索回收站中的页面…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="trash-list">
            {pages.length ? (
              pages.map((page) => (
                <div className="trash-row" key={page.id}>
                  <PageIcon icon={page.icon} size={22} />
                  <div>
                    <strong>{page.title || '无标题'}</strong>
                    <small>
                      {ancestors(workspace!.pages, page.id)
                        .map((p) => p.title || '无标题')
                        .join(' / ') || workspace!.name}{' '}
                      · {formatDate(page.trashedAt!)}
                    </small>
                  </div>
                  <button
                    title="恢复页面"
                    aria-label={`恢复 ${page.title || '无标题'}`}
                    onClick={() => restore(page.id)}
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    className="danger"
                    title="永久删除"
                    aria-label={`永久删除 ${page.title || '无标题'}`}
                    onClick={() => setConfirm(page.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            ) : (
              <EmptyState
                icon={<Trash2 size={30} />}
                title={query ? '没有匹配的页面' : '回收站是空的'}
                description="删除的页面会留在这里，直到你恢复或永久删除它们。"
              />
            )}
          </div>
          {!!all.length && (
            <div className="trash-footer">
              <span>{all.length} 个已删除页面</span>
              <button className="text-button danger" onClick={() => setConfirm('all')}>
                清空回收站
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export function MoveDialog() {
  const { workspace, modal, setModal, move, notify } = useWorkspace();
  const [query, setQuery] = useState('');
  const id = modal!.pageId!;
  const excluded = descendants(workspace!.pages, id);
  const pages = workspace!.pages.filter(
    (p) => !p.trashedAt && !excluded.has(p.id) && p.title.toLowerCase().includes(query.toLowerCase()),
  );
  const choose = (parentId: string | null) => {
    move(id, parentId);
    setModal(null);
    notify('页面已移动');
  };
  return (
    <Modal title="移动到" onClose={() => setModal(null)}>
      <div className="modal-body">
        <input
          autoFocus
          className="full-input"
          placeholder="搜索目标页面…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="move-list">
          <button onClick={() => choose(null)}>
            <Folder size={18} />
            <div>
              <strong>个人页面</strong>
              <small>工作空间顶层</small>
            </div>
          </button>
          {pages.map((page) => (
            <button key={page.id} onClick={() => choose(page.id)}>
              <PageIcon icon={page.icon} />
              <div>
                <strong>{page.title || '无标题'}</strong>
                <small>
                  {ancestors(workspace!.pages, page.id)
                    .map((p) => p.title || '无标题')
                    .join(' / ') || workspace!.name}
                </small>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function HistoryDialog() {
  const { workspace, modal, setModal, patch, notify, retrySave, api } = useWorkspace();
  const [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState<Version | null>(null);
  const [loading, setLoading] = useState(true);
  const page = workspace!.pages.find((p) => p.id === modal?.pageId)!;
  useEffect(() => {
    (window.native?.versions(page.id) || Promise.resolve([]))
      .then((items) => {
        setVersions(items);
        setSelected(items[0] || null);
      })
      .catch(() => notify('无法读取页面历史'))
      .finally(() => setLoading(false));
  }, [page.id]);
  const restore = async () => {
    if (!selected) return;
    try {
      if (window.native) {
        if (!(await retrySave())) throw new Error('请先保存当前修改');
        await api('history.restore', { pageId: page.id, versionId: selected.id });
        setModal(null);
        notify('已恢复到所选版本，恢复前的版本已保留');
        return;
      }
      const { title, blocks, icon, cover, coverPosition, font, smallText, fullWidth, database, values } =
        selected.page;
      patch(page.id, {
        title,
        blocks,
        icon,
        cover,
        coverPosition,
        font,
        smallText,
        fullWidth,
        database,
        values,
      });
      window.dispatchEvent(new CustomEvent('mini:restore', { detail: { id: page.id, blocks } }));
      setModal(null);
      notify('已恢复到所选版本，恢复前的版本已保留');
    } catch {
      notify('恢复失败，请重试');
    }
  };
  return (
    <Modal title="页面历史" wide onClose={() => setModal(null)}>
      {loading ? (
        <div className="modal-loading">
          <LoaderCircle className="spin" />
        </div>
      ) : versions.length ? (
        <div className="history-layout">
          <div className="history-list">
            {versions.map((version) => (
              <button
                className={selected?.id === version.id ? 'selected' : ''}
                key={version.id}
                onClick={() => setSelected(version)}
              >
                <Clock3 size={15} />
                <div>
                  <strong>{formatDate(version.at)}</strong>
                  <small>{version.page.title || '无标题'}</small>
                </div>
              </button>
            ))}
          </div>
          <div className="history-preview">
            <h2>{selected?.page.title || '无标题'}</h2>
            <div>{selected && <BlockPreview blocks={selected.page.blocks} />}</div>
            <button className="primary-button" onClick={() => void restore()}>
              <RotateCcw size={15} />
              恢复此版本
            </button>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<History size={32} />}
          title="还没有历史版本"
          description="编辑页面时，应用会每隔 5 分钟保留一个版本。最多保留 60 个版本。"
        />
      )}
    </Modal>
  );
}

export function ImportDialog() {
  const { setModal, update, navigate, notify, retrySave, api } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const importFiles = async (files: { name: string; content?: string; path?: string }[]) => {
    setBusy(true);
    try {
      if (window.native) {
        if (!(await retrySave())) throw new Error('请先保存当前修改');
        let first: string | undefined;
        let omittedDependencies = 0;
        for (const file of files) {
          const result = await api('file.import', file);
          first ||= result.pages[0];
          omittedDependencies += result.omittedDependencies || 0;
        }
        if (first) {
          navigate(first);
          notify(
            `已导入 ${files.length} 个文件${omittedDependencies ? `；文件外的 ${omittedDependencies} 条依赖未复制，可用完整备份迁移` : ''}`,
          );
          setModal(null);
        }
        return;
      }
      const editor = createExportEditor();
      const pages: Page[] = [];
      for (const file of files) {
        if (/\.csv$/i.test(file.name)) pages.push(...csvPages(file.name, file.content!));
        else {
          const blocks = /\.html?$/i.test(file.name)
            ? await editor.tryParseHTMLToBlocks(file.content!)
            : await editor.tryParseMarkdownToBlocks(file.content!);
          pages.push(
            makePage({
              title: file.name.replace(/\.(md|markdown|txt|html|htm)$/i, ''),
              blocks: blocks.length ? (blocks as JsonBlock[]) : [{ type: 'paragraph', content: '' }],
            }),
          );
        }
      }
      if (pages.length) {
        update((s) => ({ ...s, pages: [...s.pages, ...pages] }));
        navigate(pages[0].id);
        notify(`已导入 ${files.length} 个文件`);
        setModal(null);
      }
    } catch (error) {
      notify(`导入失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="把你的笔记带进来" onClose={() => setModal(null)}>
      <div className="modal-body">
        <p className="muted">支持 Markdown、纯文本、HTML、CSV 和页面 JSON。CSV 会创建为可编辑的数据库。</p>
        <button
          className="import-dropzone"
          disabled={busy}
          onClick={async () => {
            if (window.native) {
              try {
                const paths = await window.native.chooseImports();
                await importFiles(paths.map((path) => ({ path, name: path.split('/').at(-1)! })));
              } catch (error) {
                notify(`无法读取文件：${String(error)}`);
              }
            } else input.current?.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            const files = await Promise.all(
              Array.from(e.dataTransfer.files).map(async (file) => ({
                name: file.name,
                content: await file.text(),
              })),
            );
            await importFiles(files);
          }}
        >
          {busy ? <LoaderCircle className="spin" size={32} /> : <Upload size={32} strokeWidth={1.3} />}
          <strong>{busy ? '正在导入…' : '选择文件，或将文件拖到这里'}</strong>
          <span>.md · .txt · .html · .csv</span>
        </button>
        <input
          hidden
          multiple
          type="file"
          ref={input}
          accept=".md,.markdown,.txt,.html,.htm,.csv"
          onChange={async (e) => {
            const files = await Promise.all(
              Array.from(e.target.files || []).map(async (file) => ({
                name: file.name,
                content: await file.text(),
              })),
            );
            await importFiles(files);
          }}
        />
        <p className="settings-footnote">
          从 Notion 导出 Markdown & CSV 后，解压并选择需要的文件。恢复 Mini Notion 完整备份，请前往「设置 →
          数据与备份」。
        </p>
      </div>
    </Modal>
  );
}

export function ExportDialog() {
  const { workspace, modal, setModal, notify, navigate, retrySave } = useWorkspace();
  const page = workspace!.pages.find((p) => p.id === (modal?.pageId || workspace!.activePageId));
  const [format, setFormat] = useState('md');
  const [busy, setBusy] = useState(false);
  const exportPage = async () => {
    if (!page) return;
    setBusy(true);
    try {
      let saved = false;
      if (window.native) {
        if (!(await retrySave())) throw new Error('请先保存当前修改');
        saved = await window.native.exportPage(page.id, format);
      } else {
        const editor = createExportEditor();
        const blocks = portableBlocks(page.blocks, workspace!);
        let content =
          format === 'csv'
            ? databaseCSV(page, workspace!)
            : format === 'html'
              ? await editor.blocksToFullHTML(blocks as any)
              : await editor.blocksToMarkdownLossy(blocks as any);
        if (format === 'md') content = `# ${page.title || '无标题'}\n\n${content}`;
        if (format === 'html') {
          const title = (page.title || '无标题')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
          content = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${title}</title><style>body{max-width:760px;margin:64px auto;font:16px/1.7 -apple-system,sans-serif;color:#37352f;padding:0 24px}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px}blockquote{border-left:3px solid #aaa;padding-left:16px}pre{background:#f5f5f5;padding:16px;overflow:auto}</style><body><h1>${title}</h1>${content}</body></html>`;
        }
        const name = `${page.title || '无标题'}.${format}`;
        {
          const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
          const a = document.createElement('a');
          a.href = url;
          a.download = name;
          a.click();
          URL.revokeObjectURL(url);
          saved = true;
        }
      }
      if (saved) {
        notify('页面已导出');
        setModal(null);
      }
    } catch (error) {
      notify(`导出失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="导出页面" onClose={() => setModal(null)}>
      <div className="modal-body">
        {page ? (
          <>
            <div className="export-page-name">
              <PageIcon icon={page.icon} size={26} />
              <strong>{page.title || '无标题'}</strong>
            </div>
            <label className="field-label">
              导出格式
              <select value={format} onChange={(e) => setFormat(e.target.value)}>
                <option value="md">Markdown (.md)</option>
                <option value="html">网页 (.html)</option>
                {window.native && <option value="json">完整页面 (.json)</option>}
                {window.native && !window.native.folderMode && <option value="pdf">PDF (.pdf)</option>}
                {page.database && <option value="csv">CSV 数据表 (.csv)</option>}
              </select>
            </label>
            <p className="muted">
              {format === 'pdf'
                ? '导出当前页面的打印版本。'
                : format === 'csv'
                  ? '导出数据库的全部记录及属性。'
                  : '导出页面正文，本地附件会一同复制到导出文件旁。'}
            </p>
            {page.database && format !== 'csv' && format !== 'pdf' && (
              <p className="settings-footnote">
                数据库记录请使用 CSV 导出；完整页面结构和附件请使用工作空间备份。
              </p>
            )}
            <div className="modal-actions">
              <button className="primary-button" disabled={busy} onClick={() => void exportPage()}>
                {busy ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}导出
              </button>
            </div>
          </>
        ) : (
          <p>请先打开需要导出的页面。</p>
        )}
      </div>
    </Modal>
  );
}

export function HelpDialog() {
  const { setModal } = useWorkspace();
  const shortcuts = [
    ['⌘ N', '新建页面'],
    ['⌘ K / ⌘ P', '搜索所有页面'],
    ['⌘ F', '在当前页面中查找'],
    ['⌘ \\', '展开 / 收起侧边栏'],
    ['⌘ [ / ⌘ ]', '后退 / 前进'],
    ['⌘ ,', '打开设置'],
    ['⌘ ⇧ L', '切换深色模式'],
    ['⌘ B / ⌘ I / ⌘ U', '加粗 / 斜体 / 下划线'],
    ['⌘ Z / ⌘ ⇧ Z', '撤销 / 重做'],
    ['/', '打开块插入菜单'],
    ['@', '链接到其他页面'],
    ['Tab / ⇧ Tab', '增加 / 减少列表缩进'],
    ['⌘ ⇧ E', '导出当前页面'],
  ];
  return (
    <Modal title="写作，得心应手" onClose={() => setModal(null)}>
      <div className="modal-body help-body">
        <p className="muted">选中文字即可格式化，拖动块左侧的 ⋮⋮ 调整顺序。</p>
        <div className="shortcut-list">
          {shortcuts.map(([key, label]) => (
            <div key={key}>
              <span>{label}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
        </div>
        <div className="help-tip">
          💡 输入 # 加空格创建标题，- 加空格创建列表，[] 加空格创建待办。所有修改会自动保存在本机。
        </div>
      </div>
    </Modal>
  );
}
