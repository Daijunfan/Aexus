import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { defaultProps } from '@blocknote/core';
import { Copy, Link2, MessageSquare, MoreHorizontal, Plus, RefreshCw, Unlink } from 'lucide-react';
import { useWorkspace } from '../store';
import { IconButton, MenuItem, PageIcon, Popover } from '../ui';
import { isInternalPage, plainText } from '../model';
import { portableBlocks } from '../transfer';
import { syncedReferences } from './references';
import type { Page } from '../types';

export const EditorPageContext = createContext<{
  pageId: string;
  theme: 'light' | 'dark';
  readOnly: boolean;
}>({ pageId: '', theme: 'light', readOnly: false });

function SyncedContent({
  block,
  editor,
  renderContent,
}: {
  block: any;
  editor: any;
  renderContent: (page: Page, theme: 'light' | 'dark', readOnly: boolean) => ReactNode;
}) {
  const { workspace, command, notify, navigate, setCommentPanel } = useWorkspace();
  const context = useContext(EditorPageContext);
  const source = workspace!.pages.find((page) => page.id === block.props.sourceId && page.syncedSource);
  const references = source ? syncedReferences(workspace!, source.id) : [];
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    type: 'actions' | 'pages' | 'sources' | 'references';
  } | null>(null);
  const [query, setQuery] = useState('');
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const stop = (event: Event) => event.stopPropagation();
    const events = [
      'keydown',
      'keyup',
      'beforeinput',
      'input',
      'compositionstart',
      'compositionend',
      'paste',
      'copy',
      'cut',
      'dragstart',
      'dragover',
      'drop',
    ];
    events.forEach((event) => element.addEventListener(event, stop));
    return () => events.forEach((event) => element.removeEventListener(event, stop));
  }, [source?.id, source?.trashedAt]);
  const openMenu = (event: React.MouseEvent, type: NonNullable<typeof menu>['type']) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ x: rect.left, y: rect.bottom + 4, type });
    setQuery('');
  };
  const execute = (method: string, params: any) => {
    try {
      return command(method, params);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
      return null;
    }
  };
  const copy = async () => {
    if (!source) return;
    try {
      const blocks = portableBlocks(source.blocks, workspace!);
      const html = `<div data-mini-notion-sync="${source.id}">${await editor.blocksToHTMLLossy(blocks)}</div>`;
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText(blocks)], { type: 'text/plain' }),
        }),
      ]);
      notify('已复制同步块，可粘贴到其他页面');
    } catch (error) {
      notify(`复制失败：${String(error)}`);
    }
  };
  return (
    <div className="synced-block" contentEditable={false} data-sync-source={block.props.sourceId}>
      {source && !source.trashedAt ? (
        <>
          <div className="synced-block-toolbar">
            <button onClick={(event) => openMenu(event, 'references')}>
              <RefreshCw size={13} />
              <span>{source.title || '同步内容'}</span>
              <small>{references.length} 处同步</small>
            </button>
            <div>
              <IconButton label="同步内容评论" onClick={() => setCommentPanel({ pageId: source.id })}>
                <MessageSquare size={13} />
              </IconButton>
              <IconButton label="复制并同步" onClick={() => void copy()}>
                <Copy size={13} />
              </IconButton>
              <IconButton label="同步到其他页面" onClick={(event) => openMenu(event, 'pages')}>
                <Link2 size={13} />
              </IconButton>
              <IconButton label="同步块操作" onClick={(event) => openMenu(event, 'actions')}>
                <MoreHorizontal size={14} />
              </IconButton>
            </div>
          </div>
          <div className="synced-block-editor" ref={content}>
            {renderContent(source, context.theme, context.readOnly || source.locked)}
          </div>
        </>
      ) : (
        <div className="synced-block-missing">
          <RefreshCw size={17} />
          <span>{source?.trashedAt ? '同步内容已移入回收站' : '选择已有同步内容'}</span>
          {source?.trashedAt ? (
            <button className="text-button" onClick={() => execute('page.restore', { pageId: source.id })}>
              恢复
            </button>
          ) : (
            <button className="text-button" onClick={(event) => openMenu(event, 'sources')}>
              选择
            </button>
          )}
        </div>
      )}
      {menu && (
        <Popover {...menu} width={330} onClose={() => setMenu(null)}>
          <div
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {menu.type === 'actions' && source && (
              <>
                <MenuItem
                  icon={<Unlink size={14} />}
                  disabled={context.readOnly}
                  onClick={() => {
                    execute('sync.unlink', { pageId: context.pageId, blockId: block.id });
                    setMenu(null);
                  }}
                >
                  取消此处同步
                </MenuItem>
                <MenuItem
                  icon={<Unlink size={14} />}
                  disabled={context.readOnly || source.locked}
                  onClick={() => {
                    execute('sync.delete', { sourceId: source.id, detach: true });
                    setMenu(null);
                  }}
                >
                  取消全部同步并保留正文
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    navigate(source.id);
                    setMenu(null);
                  }}
                >
                  打开共享正文
                </MenuItem>
              </>
            )}
            {menu.type === 'references' && (
              <>
                <div className="picker-heading">相同内容也出现在</div>
                {references.map((ref) => (
                  <MenuItem
                    key={`${ref.pageId}-${ref.blockId}`}
                    onClick={() => {
                      navigate(ref.pageId);
                      setMenu(null);
                    }}
                  >
                    {ref.title || '无标题'}
                  </MenuItem>
                ))}
              </>
            )}
            {menu.type === 'pages' && source && (
              <>
                <div className="picker-heading">插入到页面末尾</div>
                <input
                  className="menu-search"
                  aria-label="搜索同步目标页面"
                  placeholder="搜索页面…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {workspace!.pages
                  .filter(
                    (page) =>
                      !page.trashedAt &&
                      !page.locked &&
                      !isInternalPage(page, workspace!.pages) &&
                      page.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
                  )
                  .map((page) => (
                    <MenuItem
                      key={page.id}
                      icon={<PageIcon icon={page.icon} />}
                      onClick={() => {
                        if (execute('sync.link', { sourceId: source.id, pageId: page.id }))
                          notify(`已同步到 ${page.title || '无标题'}`);
                        setMenu(null);
                      }}
                    >
                      {page.title || '无标题'}
                    </MenuItem>
                  ))}
              </>
            )}
            {menu.type === 'sources' && (
              <>
                <div className="picker-heading">选择同步内容</div>
                {workspace!.pages
                  .filter((page) => page.syncedSource && !page.trashedAt)
                  .map((page) => (
                    <MenuItem
                      key={page.id}
                      icon={<RefreshCw size={14} />}
                      onClick={() => {
                        editor.updateBlock(block, { props: { sourceId: page.id } });
                        setMenu(null);
                      }}
                    >
                      {page.title || '同步内容'}
                    </MenuItem>
                  ))}
                <MenuItem
                  icon={<Plus size={14} />}
                  onClick={() => {
                    execute('sync.create', {
                      pageId: context.pageId,
                      blockIds: [block.id],
                      blocks: [{ type: 'paragraph', content: '' }],
                    });
                    setMenu(null);
                  }}
                >
                  新建同步内容
                </MenuItem>
              </>
            )}
          </div>
        </Popover>
      )}
    </div>
  );
}

export function syncedBlockSpec(
  renderContent: (page: Page, theme: 'light' | 'dark', readOnly: boolean) => ReactNode,
) {
  return createReactBlockSpec(
    { type: 'syncedBlock', propSchema: { ...defaultProps, sourceId: { default: '' } }, content: 'none' },
    {
      meta: { selectable: false },
      render: (props) => <SyncedContent {...props} renderContent={renderContent} />,
      toExternalHTML: ({ block }) => (
        <p>
          <a href={`mininotion://page/${block.props.sourceId}`}>同步内容</a>
        </p>
      ),
    },
  )();
}
