import { useMemo, useState } from 'react';
import { Search as SearchIcon, FileText, CornerDownLeft, ArrowUpDown } from 'lucide-react';
import { useWorkspace } from '../store';
import { ancestors, plainText, searchPages, isInternalPage } from '../model';
import { EmptyState, Modal, PageIcon, relativeDate } from '../ui';

export function Search() {
  const { workspace, navigate, setModal, create, modal } = useWorkspace();
  const [query, setQuery] = useState(modal?.query || '');
  const [selected, setSelected] = useState(0);
  const results = useMemo(
    () =>
      query.trim()
        ? searchPages(workspace!.pages, query)
        : workspace!.recent
            .map((id) =>
              workspace!.pages.find(
                (p) => p.id === id && !p.trashedAt && !isInternalPage(p, workspace!.pages),
              ),
            )
            .filter((p): p is NonNullable<typeof p> => !!p),
    [workspace, query],
  );
  return (
    <Modal title="搜索" className="search-modal" onClose={() => setModal(null)}>
      <div className="search-input-wrap">
        <SearchIcon size={22} />
        <input
          autoFocus
          aria-label="搜索所有笔记"
          placeholder="搜索页面或页面中的内容…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setSelected(
                (i) =>
                  (i + (e.key === 'ArrowDown' ? 1 : -1) + Math.max(results.length, 1)) %
                  Math.max(results.length, 1),
              );
            }
            if (e.key === 'Enter' && results[selected]) navigate(results[selected].id);
          }}
        />
        <kbd>esc</kbd>
      </div>
      <div className="search-results">
        <div className="search-label">{query.trim() ? `搜索结果 · ${results.length}` : '最近浏览'}</div>
        {results.length ? (
          results.slice(0, 60).map((page, index) => (
            <button
              key={page.id}
              className={`search-result ${index === selected ? 'selected' : ''}`}
              onMouseMove={() => setSelected(index)}
              onClick={() => navigate(page.id)}
              ref={(element) => {
                if (index === selected) element?.scrollIntoView({ block: 'nearest' });
              }}
            >
              <div className="search-result-icon">
                <PageIcon icon={page.icon} size={23} />
              </div>
              <div>
                <strong>{page.title || '无标题'}</strong>
                <small>
                  {ancestors(workspace!.pages, page.id)
                    .map((p) => p.title || '无标题')
                    .join(' / ') || workspace!.name}
                  {query && <span> · {plainText(page.blocks).slice(0, 90)}</span>}
                </small>
              </div>
              <span className="search-result-date">{relativeDate(page.updatedAt)}</span>
              {selected === index && <CornerDownLeft size={15} />}
            </button>
          ))
        ) : (
          <EmptyState
            icon={<FileText size={30} />}
            title="没有找到相关页面"
            description="试试其他关键词，或者把它变成一个新想法。"
          >
            <button className="text-button" onClick={() => create({ title: query })}>
              创建「{query || '新页面'}」
            </button>
          </EmptyState>
        )}
      </div>
      <div className="search-footer">
        <span>
          <ArrowUpDown size={12} />
          选择
        </span>
        <span>
          <CornerDownLeft size={12} />
          打开
        </span>
        <span>搜索整个本地工作空间</span>
      </div>
    </Modal>
  );
}
