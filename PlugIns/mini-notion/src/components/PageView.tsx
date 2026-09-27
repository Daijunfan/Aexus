import { useEffect, useRef, useState } from 'react';
import { ImagePlus, SmilePlus, Plus, LockKeyhole, Link2, ArrowUpRight } from 'lucide-react';
import { Editor } from './Editor';
import { CoverPicker, EmojiPicker } from './Pickers';
import { Database } from './Database';
import { PropertyIcon, PropertyValue } from '../database/Properties';
import { useWorkspace } from '../store';
import { PageIcon } from '../ui';
import type { Page } from '../types';
import { ancestors, isTemplatePage } from '../model';
import { databaseTemplates } from '../database/templatesModel';
import { syncedReferences } from '../content/references';
import { pageAppearanceStyle, palette } from '../appearance';

export function PageView({
  page,
  theme,
  peek = false,
}: {
  page: Page;
  theme: 'light' | 'dark';
  peek?: boolean;
}) {
  const { workspace, patch, navigate, create, setModal, command, notify, setPeekId, setSpacePanel } =
    useWorkspace();
  const [picker, setPicker] = useState<{ type: 'icon' | 'cover'; x: number; y: number } | null>(null);
  const [reposition, setReposition] = useState(false);
  const title = useRef<HTMLTextAreaElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const parent = workspace!.pages.find((p) => p.id === page.parentId);
  const templateRoot = page.templateFor
    ? page
    : ancestors(workspace!.pages, page.id).find((parent) => parent.templateFor);
  const blankBody = page.blocks.every(
    (block) => block.type === 'paragraph' && (!block.content || !block.content.length),
  );
  const children = workspace!.pages.filter(
    (p) => p.parentId === page.id && !p.trashedAt && !JSON.stringify(page.blocks).includes(p.id),
  );
  const backlinks = workspace!.pages.filter(
    (p) => p.id !== page.id && !p.trashedAt && JSON.stringify(p.blocks).includes(page.id),
  );
  useEffect(() => {
    if (title.current) {
      title.current.style.height = 'auto';
      title.current.style.height = `${title.current.scrollHeight}px`;
    }
  }, [page.title]);
  useEffect(() => {
    container.current?.scrollTo(0, 0);
    if (!page.title && Date.now() - page.createdAt < 5000) title.current?.focus();
  }, [page.id]);
  const showPicker = (type: 'icon' | 'cover', element: HTMLElement) => {
    const r = element.getBoundingClientRect();
    setPicker({ type, x: r.left, y: r.bottom + 5 });
  };
  const fileCover = /^(asset:|data:|https?:)/.test(page.cover || '');
  const linkedFiles = (page.files || []).filter((file) => !file.name.startsWith('.'));
  return (
    <div ref={container} className={`page-scroll ${peek ? 'peek-scroll' : ''} page-title-${page.appearance?.titleAlign || 'left'}`} data-page={page.id}
      style={pageAppearanceStyle(page, theme, workspace!.settings.appearance)}>
      {page.syncedSource && (
        <div className="template-edit-banner">
          <span>正在编辑共享正文 · 修改会同步到 {syncedReferences(workspace!, page.id).length} 处引用</span>
          <button onClick={() => setModal({ type: 'history', pageId: page.id })}>查看正文历史</button>
        </div>
      )}
      {templateRoot && (
        <div className="template-edit-banner">
          <span>
            正在编辑模板 <strong>{templateRoot.title || '无标题模板'}</strong>
          </span>
          <button onClick={() => navigate(templateRoot.templateFor!)}>完成编辑 → 返回数据库</button>
        </div>
      )}
      {page.cover && (
        <div
          className={`page-cover cover-${fileCover ? 'custom' : page.cover} ${reposition ? 'repositioning' : ''}`}
          style={{
            backgroundPosition: `center ${page.coverPosition}%`,
            ...(fileCover ? { backgroundImage: `url("${page.cover}")` } : {}),
          }}
          onPointerDown={(e) => {
            if (!reposition || (e.target as HTMLElement).closest('button')) return;
            const start = e.clientY;
            const initial = page.coverPosition;
            let position = initial;
            const cover = e.currentTarget;
            const drag = (event: PointerEvent) => {
              position = Math.max(0, Math.min(100, initial - (event.clientY - start) / 2));
              cover.style.backgroundPosition = `center ${position}%`;
            };
            const end = () => {
              document.removeEventListener('pointermove', drag);
              document.removeEventListener('pointerup', end);
              patch(page.id, { coverPosition: position });
            };
            document.addEventListener('pointermove', drag);
            document.addEventListener('pointerup', end);
          }}
        >
          {!page.locked && (
            <div className="cover-actions">
              {reposition ? (
                <button onClick={() => setReposition(false)}>完成</button>
              ) : (
                <>
                  <button onClick={(e) => showPicker('cover', e.currentTarget)}>更换封面</button>
                  <button onClick={() => setReposition(true)}>调整位置</button>
                </>
              )}
            </div>
          )}
          {reposition && <span className="cover-drag-hint">上下拖动图片以调整位置</span>}
        </div>
      )}
      <article
        className={`page-content ${page.database ? 'database-page' : ''} ${page.fullWidth ? 'full-width' : ''} ${page.smallText ? 'small-text' : ''} font-${page.font} ${page.cover ? 'has-cover' : ''} ${page.icon ? 'has-icon' : ''}`}
      >
        {page.icon && (
          <button
            className="page-large-icon"
            aria-label="更换页面图标"
            disabled={page.locked}
            onClick={(e) => showPicker('icon', e.currentTarget)}
          >
            <PageIcon icon={page.icon} size={68} />
          </button>
        )}
        <div className={`page-meta-actions ${!page.title ? 'always-visible' : ''}`}>
          {!page.locked && (
            <>
              {!page.icon && (
                <button onClick={(e) => showPicker('icon', e.currentTarget)}>
                  <SmilePlus size={14} />
                  添加图标
                </button>
              )}
              {!page.cover && (
                <button onClick={(e) => showPicker('cover', e.currentTarget)}>
                  <ImagePlus size={14} />
                  添加封面
                </button>
              )}
            </>
          )}
          {page.locked && (
            <span>
              <LockKeyhole size={13} />
              页面已锁定
            </span>
          )}
        </div>
        <textarea
          ref={title}
          className="page-title"
          aria-label="页面标题"
          placeholder="无标题"
          rows={1}
          value={page.title}
          readOnly={page.locked}
          onChange={(e) => patch(page.id, { title: e.target.value.replace(/\n/g, '') })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (page.database && blankBody && !page.showDescription)
                patch(page.id, { showDescription: true });
              else window.dispatchEvent(new CustomEvent('mini:focus', { detail: page.id }));
            }
          }}
        />
        {page.color !== 'white' && <button className="page-color-label" disabled={page.locked} onClick={() => setModal({ type: 'appearance', pageId: page.id })} title="编辑页面颜色标记">
          <span />{palette[page.color as keyof typeof palette]?.name || page.color}
        </button>}
        {parent?.database && (
          <div className="page-properties">
            {parent.database.columns.map((column) => (
              <div className="page-property" key={column.id}>
                <span className="page-property-label">
                  <PropertyIcon type={column.type} />
                  {column.name}
                </span>
                <PropertyValue
                  column={column}
                  page={page}
                  disabled={page.locked || parent.locked}
                  onOptionsChange={(options) =>
                    patch(parent.id, {
                      database: {
                        ...parent.database!,
                        columns: parent.database!.columns.map((c) =>
                          c.id === column.id ? { ...c, options } : c,
                        ),
                      },
                    })
                  }
                />
              </div>
            ))}
          </div>
        )}
        {backlinks.length > 0 && (
          <details className="backlinks">
            <summary>
              <Link2 size={12} />
              {backlinks.length} 个反向链接
            </summary>
            {backlinks.map((p) => (
              <button key={p.id} onClick={() => navigate(p.id)}>
                <PageIcon icon={p.icon} size={14} />
                {p.title || '无标题'}
              </button>
            ))}
          </details>
        )}
        {page.database && blankBody && !page.showDescription ? (
          <button
            className="add-database-description"
            disabled={page.locked}
            onClick={() => patch(page.id, { showDescription: true })}
          >
            添加描述
          </button>
        ) : (
          <Editor
            key={page.id}
            page={page}
            theme={theme}
            autoFocus={!!page.database && !!page.showDescription && blankBody}
          />
        )}
        {parent?.database?.subItems && (
          <section className="subitems-panel">
            <h4>
              子项目{' '}
              <small>
                {workspace!.pages.filter((child) => child.subItemOf === page.id && !child.trashedAt).length}
              </small>
            </h4>
            {workspace!.pages
              .filter((child) => child.subItemOf === page.id && !child.trashedAt)
              .map((child) => (
                <button key={child.id} onClick={() => setPeekId(child.id)}>
                  <PageIcon icon={child.icon} size={15} />
                  {child.title || '无标题'}
                </button>
              ))}
            <button
              className="text-button"
              disabled={page.locked || parent.locked}
              onClick={() => {
                try {
                  const child = command('subitem.create', { pageId: page.id, color: page.color });
                  setPeekId(child.id);
                } catch (error) {
                  notify(String(error));
                }
              }}
            >
              <Plus size={14} />
              添加子项目
            </button>
          </section>
        )}
        {parent?.database &&
          !isTemplatePage(page, workspace!.pages) &&
          blankBody &&
          databaseTemplates(workspace!, parent.id).length > 0 && (
            <div className="record-template-options">
              <p>选择一个模板开始</p>
              {databaseTemplates(workspace!, parent.id).map((template) => (
                <button
                  key={template.id}
                  onClick={() => {
                    try {
                      command('template.apply', { templateId: template.id, pageId: page.id });
                    } catch (error) {
                      notify(String(error));
                    }
                  }}
                >
                  <PageIcon icon={template.icon} size={17} />
                  {template.title || '无标题模板'}
                </button>
              ))}
            </div>
          )}
        {page.database ? (
          <Database page={page} />
        ) : (
          children.length > 0 && (
            <div className="child-pages">
              {children.map((p) => (
                <button className="page-link-block" key={p.id} onClick={() => navigate(p.id)}>
                  <PageIcon icon={p.icon} />
                  <span>{p.title || '无标题'}</span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          )
        )}
        {!page.title &&
          !parent?.database &&
          !page.database &&
          page.blocks.every(
            (b) => !b.content || (typeof b.content === 'string' ? !b.content : !b.content.length),
          ) && (
            <div className="empty-page-actions">
              <span>开始写作，或者选择一个模板</span>
              <button onClick={() => setModal({ type: 'templates', pageId: page.id })}>从模板开始</button>
              <button onClick={() => create({ parentId: page.id })}>
                <Plus size={14} />
                添加子页面
              </button>
            </div>
          )}
        {page.space && linkedFiles.length > 0 && (
          <section className="page-workspace-files" aria-label="Workspace 文件链接">
            <h3>
              空间文件 <span>{linkedFiles.length}</span>
            </h3>
            {linkedFiles.map((file) => (
              <button
                className="page-link-block"
                key={file.id}
                onClick={() => setSpacePanel({ pageId: page.id, fileId: file.id })}
              >
                <PageIcon />
                <span>{file.name}</span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </section>
        )}
        <div className="page-bottom-space" />
      </article>
      {picker?.type === 'icon' && (
        <EmojiPicker
          {...picker}
          value={page.icon}
          onChange={(icon) => patch(page.id, { icon })}
          onClose={() => setPicker(null)}
        />
      )}
      {picker?.type === 'cover' && (
        <CoverPicker
          {...picker}
          onChange={(cover) => patch(page.id, { cover, coverPosition: 50 })}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
