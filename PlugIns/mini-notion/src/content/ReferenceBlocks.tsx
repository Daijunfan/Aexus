import { useContext, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { defaultProps } from '@blocknote/core';
import { ChevronRight, Globe, Link, Pencil } from 'lucide-react';
import { useWorkspace } from '../store';
import { ancestors } from '../model';
import { PageIcon, Popover } from '../ui';
import { EditorPageContext } from './SyncedBlock';

export const Breadcrumb = createReactBlockSpec(
  { type: 'breadcrumb', propSchema: { ...defaultProps }, content: 'none' },
  {
    meta: { selectable: false },
    render: () => {
      const { pageId } = useContext(EditorPageContext),
        { workspace, navigate } = useWorkspace();
      const current = workspace!.pages.find((page) => page.id === pageId);
      const path = current ? [...ancestors(workspace!.pages, pageId), current] : [];
      return (
        <nav onMouseDownCapture={event => event.stopPropagation()} className="breadcrumb-block" aria-label="页面路径" contentEditable={false}>
          {path.map((page, index) => (
            <span key={page.id}>
              {index > 0 && <ChevronRight size={12} />}
              <button onClick={() => navigate(page.id)}>
                <PageIcon icon={page.icon} size={14} />
                {page.title || '无标题'}
              </button>
            </span>
          ))}
        </nav>
      );
    },
    toExternalHTML: () => <p>页面路径</p>,
  },
);
export const Bookmark = createReactBlockSpec(
  {
    type: 'bookmark',
    propSchema: {
      ...defaultProps,
      url: { default: '' },
      title: { default: '' },
      description: { default: '' },
    },
    content: 'none',
  },
  {
    meta: { selectable: false },
    render: ({ block, editor }) => {
      const [popup, setPopup] = useState<{ x: number; y: number } | null>(null);
      const [draft, setDraft] = useState(block.props);
      const [error, setError] = useState('');
      const { navigate } = useWorkspace();
      const edit = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        setDraft(block.props);
        setError('');
        setPopup({ x: rect.left, y: rect.bottom + 4 });
      };
      const save = () => {
        if (draft.url && !/^(https?:\/\/|mininotion:\/\/page\/)/i.test(draft.url)) {
          setError('请输入 http、https 或本地页面链接');
          return;
        }
        editor.updateBlock(block, {
          props: { url: draft.url, title: draft.title, description: draft.description },
        });
        setPopup(null);
      };
      return (
        <div onMouseDownCapture={event => event.stopPropagation()} className="bookmark-block" contentEditable={false}>
          <button
            className="bookmark-card"
            onClick={(event) => {
              if (!block.props.url) {
                if (editor.isEditable) edit(event.currentTarget);
                return;
              }
              if (block.props.url.startsWith('mininotion://page/')) navigate(block.props.url);
              else if (window.native) void window.native.openExternal(block.props.url);
              else window.open(block.props.url, '_blank', 'noopener,noreferrer');
            }}
          >
            <span className="bookmark-copy">
              <strong>{block.props.title || block.props.url || '添加网页书签'}</strong>
              {block.props.description && <small>{block.props.description}</small>}
              <span className="bookmark-url">
                <Globe size={13} />
                {block.props.url || '保存链接、标题和说明'}
              </span>
            </span>
            <Link size={24} />
          </button>
          {editor.isEditable && (
            <button
              className="bookmark-edit"
              aria-label="编辑书签"
              onClick={(event) => edit(event.currentTarget)}
            >
              <Pencil size={14} />
            </button>
          )}
          {popup && (
            <Popover
              {...popup}
              width={360}
              role="dialog"
              label="编辑书签"
              className="bookmark-popover"
              onClose={() => setPopup(null)}
            >
              <div className="picker-heading">网页书签</div>
              <label>
                链接
                <input
                  autoFocus
                  aria-label="书签链接"
                  placeholder="https://…"
                  value={draft.url}
                  onChange={(event) => setDraft({ ...draft, url: event.target.value })}
                />
              </label>
              <label>
                标题
                <input
                  aria-label="书签标题"
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              </label>
              <label>
                说明
                <textarea
                  aria-label="书签说明"
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </label>
              {error && <p role="alert">{error}</p>}
              <footer>
                <button className="primary-button" onClick={save}>
                  完成
                </button>
              </footer>
            </Popover>
          )}
        </div>
      );
    },
    toExternalHTML: ({ block }) => (
      <a data-mini-bookmark={block.props.url} href={block.props.url}>
        {block.props.title || block.props.url}
      </a>
    ),
    parse: (element) =>
      element.hasAttribute('data-mini-bookmark')
        ? { url: element.getAttribute('data-mini-bookmark') || '', title: element.textContent || '' }
        : undefined,
  },
);
