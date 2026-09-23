import { useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { defaultProps } from '@blocknote/core';
import { ArrowUpRight, Database as DatabaseIcon, Link2 } from 'lucide-react';
import { useWorkspace } from '../store';
import { MenuItem, PageIcon, Popover } from '../ui';
import { Database } from '../components/Database';
import { newView } from './model';
import type { DatabaseViewState } from '../types';

function parseViewState(value: string): DatabaseViewState | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export const InlineDatabaseSpec = createReactBlockSpec(
  {
    type: 'databaseView',
    propSchema: {
      ...defaultProps,
      databaseId: { default: '' },
      linked: { default: false },
      viewState: { default: '' },
      title: { default: '数据库' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const { workspace, patch, navigate } = useWorkspace();
      const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
      const [query, setQuery] = useState('');
      const source = workspace!.pages.find(
        (page) => page.id === block.props.databaseId && !page.trashedAt && page.database,
      );
      const choose = (id: string) => {
        const page = workspace!.pages.find((page) => page.id === id)!;
        const view = newView('table');
        editor.updateBlock(block, {
          props: {
            databaseId: id,
            linked: true,
            title: page.title || '无标题数据库',
            viewState: JSON.stringify({ views: [view], activeViewId: view.id, view: view.type }),
          },
        });
        setPicker(null);
      };
      return (
        <div className="inline-database" contentEditable={false} data-linked={block.props.linked}>
          {source ? (
            <>
              <div className="inline-database-title">
                <PageIcon icon={source.icon || '📋'} size={22} />
                {block.props.linked ? (
                  <button onClick={() => navigate(source.id)}>
                    <Link2 size={14} />
                    {source.title || '无标题数据库'}
                    <ArrowUpRight size={13} />
                  </button>
                ) : (
                  <input
                    aria-label="内联数据库名称"
                    value={source.title}
                    placeholder="无标题数据库"
                    readOnly={source.locked}
                    onChange={(e) => patch(source.id, { title: e.target.value })}
                  />
                )}
                <button
                  className="text-button"
                  aria-label="打开数据库完整页面"
                  onClick={() => navigate(source.id)}
                >
                  <ArrowUpRight size={15} />
                </button>
              </div>
              <Database
                page={source}
                viewState={block.props.linked ? parseViewState(block.props.viewState) : undefined}
                onViewStateChange={
                  block.props.linked
                    ? (state) => editor.updateBlock(block, { props: { viewState: JSON.stringify(state) } })
                    : undefined
                }
              />
            </>
          ) : (
            <button
              className="linked-database-placeholder"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setPicker({ x: rect.left, y: rect.bottom + 5 });
              }}
            >
              <DatabaseIcon size={20} />
              <span>
                {block.props.databaseId ? '原数据库已删除 · 选择其他数据源' : '选择一个数据库，创建关联视图'}
              </span>
            </button>
          )}
          {picker && (
            <Popover {...picker} width={360} onClose={() => setPicker(null)}>
              <div className="picker-heading">关联到现有数据库</div>
              <input
                className="menu-search"
                placeholder="搜索数据库…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {workspace!.pages
                .filter(
                  (page) =>
                    page.database &&
                    !page.trashedAt &&
                    page.title.toLowerCase().includes(query.toLowerCase()),
                )
                .map((page) => (
                  <MenuItem
                    key={page.id}
                    icon={<PageIcon icon={page.icon} />}
                    onClick={() => choose(page.id)}
                  >
                    {page.title || '无标题数据库'}
                  </MenuItem>
                ))}
            </Popover>
          )}
        </div>
      );
    },
    toExternalHTML: ({ block }) => (
      <p>
        <a href={`mininotion://page/${block.props.databaseId}`}>{block.props.title}</a>
      </p>
    ),
  },
);
