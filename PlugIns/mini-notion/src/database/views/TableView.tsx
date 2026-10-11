import { useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronRight, MoreHorizontal, Plus, Type } from 'lucide-react';
import { useWorkspace } from '../../store';
import { IconButton, PageIcon, Popover, MenuItem } from '../../ui';
import { aggregateRows, groupRows, valueForGroup } from '../model';
import { PropertyIcon, PropertyValue } from '../Properties';
import type { Aggregate, Page } from '../../types';
import type { ViewProps } from './types';
import { hierarchyRows } from '../structure';
import { RecordTitle } from '../RecordTitle';

export const calculations: [Aggregate, string][] = [
  ['count', '计数全部'],
  ['count_values', '计数非空值'],
  ['count_unique', '计数唯一值'],
  ['empty', '计数空值'],
  ['percent_filled', '非空百分比'],
  ['sum', '求和'],
  ['average', '平均值'],
  ['min', '最小值'],
  ['max', '最大值'],
];

export function TableView(props: ViewProps) {
  const {
    page,
    view,
    rows,
    columns,
    updateView,
    editProperty,
    updateOptions,
    openRow,
    addRow,
    selected,
    selectRow,
  } = props;
  const { workspace, setPageMenu } = useWorkspace();
  const [calculation, setCalculation] = useState<{ property: string; x: number; y: number } | null>(null);
  const groups = groupRows(rows, view.groupBy, page.database!, workspace!.pages, view);
  const resize = (id: string, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const initial = view.columnWidths?.[id] || (id === 'title' ? 280 : 160);
    const start = event.clientX;
    const header = event.currentTarget.parentElement!;
    let width = initial;
    const move = (e: PointerEvent) => {
      width = Math.max(90, Math.min(600, initial + e.clientX - start));
      header.style.width = width + 'px';
      header.style.minWidth = width + 'px';
    };
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      updateView({ columnWidths: { ...view.columnWidths, [id]: width } });
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
  };
  const table = (records: Page[], groupKey: string) => (
    <div className="database-table-wrap">
      <table className={`database-table enhanced-table ${view.wrapCells ? 'wrap-cells' : ''}`}>
        <thead>
          <tr>
            <th className="row-selection">
              <input
                aria-label="选择所有记录"
                type="checkbox"
                checked={!!records.length && records.every((row) => selected.has(row.id))}
                onChange={(e) => records.forEach((row) => selectRow(row.id, e.target.checked))}
              />
            </th>
            <th
              className="title-column"
              style={{ width: view.columnWidths?.title || 280, minWidth: view.columnWidths?.title || 280 }}
            >
              <Type size={16} />
              名称
              <span className="column-resize" onPointerDown={(e) => resize('title', e)} />
            </th>
            {columns.map((column) => (
              <th
                key={column.id}
                draggable={!page.locked}
                style={{
                  width: view.columnWidths?.[column.id] || 160,
                  minWidth: view.columnWidths?.[column.id] || 160,
                }}
                onDragStart={(e) => e.dataTransfer.setData('application/x-mini-property', column.id)}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('application/x-mini-property')) e.preventDefault();
                }}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData('application/x-mini-property');
                  if (!id) return;
                  e.preventDefault();
                  const order = (view.propertyOrder || page.database!.columns.map((c) => c.id)).filter(
                    (c) => c !== id,
                  );
                  order.splice(order.indexOf(column.id), 0, id);
                  updateView({ propertyOrder: order });
                }}
              >
                <button disabled={page.locked} onClick={() => editProperty(column)}>
                  <PropertyIcon type={column.type} />
                  {column.name}
                  <ChevronDown size={12} />
                </button>
                <span className="column-resize" onPointerDown={(e) => resize(column.id, e)} />
              </th>
            ))}
            <th className="add-property-cell">
              <IconButton
                label="添加属性"
                disabled={page.locked}
                onClick={() => editProperty({ id: crypto.randomUUID(), name: '', type: 'text' })}
              >
                <Plus size={17} />
              </IconButton>
            </th>
          </tr>
        </thead>
        <tbody>
          {hierarchyRows(records, view, !!page.database!.subItems).map((entry) => {
            const row = entry.page;
            return (
              <tr key={row.id} data-row-id={row.id} className={selected.has(row.id) ? 'selected-row' : ''}>
                <td className="row-selection">
                  <input
                    aria-label={`选择 ${row.title || '无标题'}`}
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={(e) => selectRow(row.id, e.target.checked)}
                  />
                </td>
                <td>
                  <RecordTitle
                    entry={entry}
                    database={page}
                    view={view}
                    onViewChange={updateView}
                    onOpen={openRow}
                  />
                </td>
                {columns.map((column) => (
                  <td key={column.id}>
                    <PropertyValue
                      column={column}
                      page={row}
                      disabled={page.locked || row.locked}
                      onOptionsChange={(options) => updateOptions(column, options)}
                    />
                  </td>
                ))}
                <td>
                  <IconButton
                    label={`${row.title || '无标题'} 的操作`}
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setPageMenu({ id: row.id, x: r.left, y: r.bottom });
                    }}
                  >
                    <MoreHorizontal size={16} />
                  </IconButton>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td />
            <td>
              <span className="table-total">{records.length} 条记录</span>
            </td>
            {columns.map((column) => (
              <td key={column.id}>
                <button
                  className="column-calculation"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setCalculation({ property: column.id, x: rect.left, y: rect.bottom });
                  }}
                >
                  {view.calculations?.[column.id] ? (
                    <>
                      {calculations.find(([id]) => id === view.calculations![column.id])?.[1]}{' '}
                      <strong>
                        {aggregateRows(
                          records,
                          column.id,
                          view.calculations[column.id],
                          page.database!,
                          workspace!.pages,
                        )}
                        {view.calculations[column.id] === 'percent_filled' ? '%' : ''}
                      </strong>
                    </>
                  ) : (
                    <>
                      计算
                      <ChevronDown size={11} />
                    </>
                  )}
                </button>
              </td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
      <button
        className="database-add-row"
        disabled={page.locked}
        onClick={() =>
          addRow(
            view.groupBy && groupKey && groupKey !== '__all'
              ? {
                  [view.groupBy]: valueForGroup(
                    page.database!.columns.find((c) => c.id === view.groupBy),
                    groupKey,
                  ),
                }
              : undefined,
          )
        }
      >
        <Plus size={16} />
        新建页面
      </button>
    </div>
  );
  return (
    <>
      {groups.map((group) => (
        <section className="database-group" key={group.key}>
          {view.groupBy && (
            <button
              className="database-group-heading"
              onClick={() =>
                updateView({
                  collapsedGroups: view.collapsedGroups?.includes(group.key)
                    ? view.collapsedGroups.filter((key) => key !== group.key)
                    : [...(view.collapsedGroups || []), group.key],
                })
              }
            >
              <ChevronRight
                className={!view.collapsedGroups?.includes(group.key) ? 'rotated' : ''}
                size={15}
              />
              <strong>{group.label}</strong>
              <span>{group.rows.length}</span>
            </button>
          )}
          {!view.collapsedGroups?.includes(group.key) && table(group.rows, group.key)}
        </section>
      ))}
      {calculation && (
        <Popover {...calculation} onClose={() => setCalculation(null)} width={220}>
          <div className="picker-heading">列计算</div>
          <MenuItem
            onClick={() => {
              const next = { ...view.calculations };
              delete next[calculation.property];
              updateView({ calculations: next });
              setCalculation(null);
            }}
          >
            无
          </MenuItem>
          {calculations.map(([id, label]) => (
            <MenuItem
              key={id}
              checked={view.calculations?.[calculation.property] === id}
              onClick={() => {
                updateView({ calculations: { ...view.calculations, [calculation.property]: id } });
                setCalculation(null);
              }}
            >
              {label}
            </MenuItem>
          ))}
        </Popover>
      )}
    </>
  );
}
