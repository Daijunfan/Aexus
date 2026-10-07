import { EventIndicators } from '../components/EventSummary';
import { eventSignals } from '../scheduling/presentation';
import { ChevronRight, Plus, ArrowUpRight } from 'lucide-react';
import { useWorkspace } from '../store';
import { IconButton, PageIcon } from '../ui';
import type { DatabaseView, Page } from '../types';
import { subItemDisplay, type HierarchyRow } from './structure';

export function RecordTitle({
  entry,
  database,
  view,
  onViewChange,
  onOpen,
}: {
  entry: HierarchyRow;
  database: Page;
  view: DatabaseView;
  onViewChange: (changes: Partial<DatabaseView>) => void;
  onOpen: (id: string) => void;
}) {
  const { command, notify, workspace } = useWorkspace();
  const row = entry.page;
  const signals = eventSignals(row, workspace!.pages);
  const nested = database.database?.subItems && subItemDisplay(view) === 'nested';
  const childCount = database.database?.subItems
    ? workspace!.pages.filter((page) => page.subItemOf === row.id && !page.trashedAt).length
    : 0;
  return (
    <div className="record-title-tree" style={{ paddingLeft: entry.depth * 18 }}>
      {nested &&
        (entry.childCount ? (
          <IconButton
            label={`${entry.expanded ? '折叠' : '展开'} ${row.title || '无标题'} 的子项目`}
            onClick={() =>
              onViewChange({
                collapsedItems: entry.expanded
                  ? [...(view.collapsedItems || []), row.id]
                  : view.collapsedItems?.filter((id) => id !== row.id) || [],
              })
            }
          >
            <ChevronRight size={14} className={entry.expanded ? 'rotated' : ''} />
          </IconButton>
        ) : (
          <span className="tree-toggle-space" />
        ))}
      <button className="database-row-title" onClick={() => onOpen(row.id)}>
        <PageIcon icon={row.icon} size={16} />
        <span className="record-title-copy"><strong>{row.title || '无标题'}</strong>
          {(signals.repeat || signals.reminders > 0) && <span className="record-event-flags"><EventIndicators {...signals} /></span>}
        </span>
        <ArrowUpRight size={13} />
      </button>
      {!!childCount && <small className="subitem-count">{childCount}</small>}
      {database.database?.subItems && (
        <IconButton
          label={`为 ${row.title || '无标题'} 添加子项目`}
          className="add-subitem"
          disabled={database.locked || row.locked}
          onClick={() => {
            try {
              const child = command('subitem.create', { pageId: row.id, color: row.color });
              onViewChange({ collapsedItems: view.collapsedItems?.filter((id) => id !== row.id) || [] });
              onOpen(child.id);
            } catch (error) {
              notify(error instanceof Error ? error.message : String(error));
            }
          }}
        >
          <Plus size={13} />
        </IconButton>
      )}
    </div>
  );
}
export function SubitemPreview({ row, onOpen }: { row: Page; onOpen: (id: string) => void }) {
  const { workspace } = useWorkspace();
  const children = workspace!.pages.filter((page) => page.subItemOf === row.id && !page.trashedAt);
  if (!children.length) return null;
  return (
    <div className="card-subitems">
      {children.map((child) => (
        <button
          key={child.id}
          draggable={!child.locked}
          onDragStart={(event) => {
            event.stopPropagation();
            event.dataTransfer.setData('application/x-mini-row', child.id);
          }}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(child.id);
          }}
        >
          <span>↳</span>
          <PageIcon icon={child.icon} size={12} />
          {child.title || '无标题'}
        </button>
      ))}
    </div>
  );
}
