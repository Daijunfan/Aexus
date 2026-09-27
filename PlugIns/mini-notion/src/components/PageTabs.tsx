import { House, Plus, X } from 'lucide-react';
import { useWorkspace } from '../store';
import { PageIcon } from '../ui';
export function PageTabs() {
  const { workspace, navigate, closeTab } = useWorkspace();
  const tabs = workspace!.settings.pageTabs;
  if (!tabs) return null;
  const active = workspace!.settings.activeTab || 0;
  const target = (id: string | null) => workspace!.pages.find((page) => page.id === id && !page.trashedAt);
  return (
    <div className="page-tabs" role="tablist" aria-label="页面标签">
      {tabs.map((id, index) => {
        const page = target(id),
          title = page?.title || (page ? '无标题' : '主页');
        return (
          <div key={index} className={`page-tab ${index === active ? 'active' : ''}`}>
            <button
              role="tab"
              aria-selected={index === active}
              tabIndex={index === active ? 0 : -1}
              onClick={() => navigate(page?.id || null, undefined, index)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                navigate(target(tabs[next])?.id || null, undefined, next);
                event.currentTarget
                  .closest('[role="tablist"]')
                  ?.querySelectorAll<HTMLElement>('[role="tab"]')
                  [next]?.focus();
              }}
            >
              {page ? <PageIcon icon={page.icon} size={14} /> : <House size={14} />}
              <span>{title}</span>
            </button>
            <button
              className="page-tab-close"
              aria-label={`关闭标签 ${title}`}
              onClick={() => closeTab(index)}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
      <button
        className="page-tab-new"
        aria-label="新建标签页"
        onClick={() => navigate(null, undefined, 'new')}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
