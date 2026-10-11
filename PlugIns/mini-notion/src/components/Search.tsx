import { useMemo, useState } from 'react';
import { Search as SearchIcon, FileText, CornerDownLeft, ArrowUpDown, Filter } from 'lucide-react';
import { useWorkspace } from '../store';
import { isInternalPage } from '../model';
import { searchTerms, type SearchOptions } from '../core/search';
import { EmptyState, Modal, PageIcon, relativeDate } from '../ui';
import { AppSelect } from './AppSelect';

type SearchResult = {
  id: string;
  icon: string;
  title: string;
  updatedAt: number;
  excerpt?: string;
  blockId?: string;
  path?: string;
};
export function Search() {
  const { workspace, navigate, setModal, create, modal, command } = useWorkspace();
  const [query, setQuery] = useState(modal?.query || '');
  const [selected, setSelected] = useState(0);
  const [filters, setFilters] = useState<SearchOptions>({});
  const filtered = Object.values(filters).some(Boolean);
  const options = (changes: Partial<SearchOptions>) => {
    setFilters((value) => ({ ...value, ...changes }));
    setSelected(0);
  };
  const results = useMemo<SearchResult[]>(() => {
    if (query.trim() || filtered)
      return command('search', { query, ...filters, limit: 200 }) as {
        id: string;
        icon: string;
        title: string;
        updatedAt: number;
        excerpt?: string;
        blockId?: string;
        path?: string;
      }[];
    return workspace!.recent
      .map((id) =>
        workspace!.pages.find(
          (page) => page.id === id && !page.trashedAt && !isInternalPage(page, workspace!.pages),
        ),
      )
      .filter((page): page is NonNullable<typeof page> => !!page);
  }, [workspace, query, filters, filtered, command]);
  const index = Math.min(selected, Math.max(0, results.length - 1));
  const highlight = (text: string) => {
    const terms = searchTerms(query)
      .filter(Boolean)
      .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!terms.length) return text;
    const pattern = new RegExp(`(${terms.join('|')})`, 'gi');
    return text.split(pattern).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
  };
  return (
    <Modal title="搜索" className="search-modal" onClose={() => setModal(null)}>
      <div className="search-input-wrap">
        <SearchIcon size={22} />
        <input
          autoFocus
          aria-label="搜索所有笔记"
          placeholder="搜索页面或页面中的内容…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setSelected(
                (index + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(1, results.length)) %
                  Math.max(1, results.length),
              );
            }
            if (event.key === 'Enter' && results[index]) {
              event.preventDefault();
              navigate(
                results[index].id,
                results[index].blockId,
                event.metaKey || event.ctrlKey ? 'new' : undefined,
              );
            }
          }}
        />
        <kbd>esc</kbd>
      </div>
      <div className="search-filters">
        <Filter size={14} />
        <button
          className={filters.titleOnly ? 'active' : ''}
          aria-pressed={!!filters.titleOnly}
          onClick={() => options({ titleOnly: !filters.titleOnly })}
        >
          仅标题
        </button>
        <AppSelect
          aria-label="搜索范围"
          value={filters.inPageId || ''}
          onChange={(event) => options({ inPageId: event.target.value || undefined })}
        >
          <option value="">位置：全部页面</option>
          {workspace!.pages
            .filter((page) => !page.trashedAt && !isInternalPage(page, workspace!.pages))
            .map((page) => (
              <option key={page.id} value={page.id}>
                {page.title || '无标题'}
              </option>
            ))}
        </AppSelect>
        <AppSelect
          aria-label="搜索排序"
          value={filters.sort || 'relevance'}
          onChange={(event) => options({ sort: event.target.value as SearchOptions['sort'] })}
        >
          <option value="relevance">最佳匹配</option>
          <option value="edited-desc">最后编辑：从新到旧</option>
          <option value="edited-asc">最后编辑：从旧到新</option>
          <option value="created-desc">创建时间：从新到旧</option>
          <option value="created-asc">创建时间：从旧到新</option>
        </AppSelect>
        <details className="search-date-filter">
          <summary>日期</summary>
          <div>
            <AppSelect
              aria-label="日期字段"
              value={filters.dateField || 'edited'}
              onChange={(event) => options({ dateField: event.target.value as 'edited' | 'created' })}
            >
              <option value="edited">最后编辑</option>
              <option value="created">创建时间</option>
            </AppSelect>
            <label>
              从
              <input
                aria-label="搜索起始日期"
                type="date"
                value={filters.after || ''}
                onChange={(event) => options({ after: event.target.value || undefined })}
              />
            </label>
            <label>
              到
              <input
                aria-label="搜索结束日期"
                type="date"
                value={filters.before || ''}
                onChange={(event) => options({ before: event.target.value || undefined })}
              />
            </label>
          </div>
        </details>
        {filtered && (
          <button
            onClick={() => {
              setFilters({});
              setSelected(0);
            }}
          >
            重置
          </button>
        )}
      </div>
      <div className="search-results">
        <div className="search-label">
          {query.trim() || filtered ? `搜索结果 · ${results.length}` : '最近浏览'}
        </div>
        {results.length ? (
          results.map((page, position) => (
            <button
              key={page.id}
              className={`search-result ${position === index ? 'selected' : ''}`}
              onMouseMove={() => setSelected(position)}
              onClick={(event) =>
                navigate(page.id, page.blockId, event.metaKey || event.ctrlKey ? 'new' : undefined)
              }
              ref={(element) => {
                if (position === index) element?.scrollIntoView({ block: 'nearest' });
              }}
            >
              <div className="search-result-icon">
                <PageIcon icon={page.icon} size={23} />
              </div>
              <div className="search-result-content">
                <strong>{highlight(page.title || '无标题')}</strong>
                <small>{page.path || workspace!.name}</small>
                {page.excerpt && <p className="search-excerpt">{highlight(page.excerpt)}</p>}
              </div>
              <span className="search-result-date">{relativeDate(page.updatedAt)}</span>
              {position === index && <CornerDownLeft size={15} />}
            </button>
          ))
        ) : (
          <EmptyState
            icon={<FileText size={30} />}
            title="没有找到相关页面"
            description="试试其他关键词或调整筛选条件。"
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
