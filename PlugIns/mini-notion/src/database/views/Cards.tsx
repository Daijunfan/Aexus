import { coverPresentation } from '../../presentation';
import { isSelectProperty, isReadOnlyProperty } from '../propertySchema';
import { useContext } from 'react';
import { AppearanceTheme, recordAppearanceStyle } from '../../appearance';
import { Calendar, ChevronRight, Plus } from 'lucide-react';
import { BlockPreview } from '../../components/BlockPreview';
import type { JsonBlock } from '../../types';
import { useWorkspace } from '../../store';
import { PageIcon, IconButton, formatDate } from '../../ui';
import { plainText, readProperty } from '../../model';
import { groupRows, valueForGroup, type RowGroup } from '../model';
import { PropertyValue, Tag } from '../Properties';
import type { Page } from '../../types';
import type { ViewProps } from './types';
import { hierarchyRows, subItemDisplay } from '../structure';
import { RecordTitle, SubitemPreview } from '../RecordTitle';

function RecordCard({
  row,
  props,
  gallery = false,
  groupKey = '',
}: {
  row: Page;
  props: ViewProps;
  gallery?: boolean;
  groupKey?: string;
}) {
  const { setPageMenu, workspace } = useWorkspace();
  const theme = useContext(AppearanceTheme);
  const { view, page, openRow, columns } = props;
  const preview = view.cardPreview || (gallery ? 'content' : 'none');
  const readOnlyGroup = [view.groupBy, view.subGroupBy].some((id) =>
    page.database!.columns.some(
      (column) => column.id === id && (isReadOnlyProperty(column) || column.type === 'files'),
    ),
  );
  return (
    <div
      role="button"
      tabIndex={0}
      className={`database-card ${gallery ? 'gallery-card' : ''}`}
      style={recordAppearanceStyle(row, theme, workspace!.settings.appearance)}
      draggable={!readOnlyGroup && !page.locked && !row.locked}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-mini-row', row.id);
        e.dataTransfer.setData('application/x-mini-row-group', groupKey);
      }}
      onClick={() => openRow(row.id)}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && event.key === 'Enter') openRow(row.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setPageMenu({ id: row.id, x: e.clientX, y: e.clientY });
      }}
    >
      {preview !== 'none' && (
        <div
          className={`gallery-preview ${preview === 'cover' ? coverPresentation(row.cover).className : ''}`}
          style={preview === 'cover' ? coverPresentation(row.cover, row.coverPosition).style : undefined}
        >
          {(preview === 'content' || !row.cover) && <span>{plainText(row.blocks).slice(0, 240)}</span>}
        </div>
      )}
      <div className="database-card-body">
        <strong>
          <PageIcon icon={row.icon} size={16} />
          {row.title || '无标题'}
        </strong>
        {columns
          .filter(
            (c) =>
              c.id !== view.groupBy &&
              !(c.system === 'subItems' && page.database!.subItems && subItemDisplay(view) === 'card'),
          )
          .map((column) => {
            const value = readProperty(row, column, workspace!.pages);
            if (value === '' || value === false || (Array.isArray(value) && !value.length)) return null;
            if (isSelectProperty(column) || column.type === 'multiSelect')
              return (
                <div className="database-card-tags" key={column.id}>
                  {(Array.isArray(value) ? value : [String(value)]).map((value) => (
                    <Tag key={value} value={value} options={column.options} column={column} />
                  ))}
                </div>
              );
            return (
              <small key={column.id}>
                {column.type === 'date' && <Calendar size={12} />}
                <span>{Array.isArray(value) ? value.join('、') : value === true ? '☑' : String(value)}</span>
              </small>
            );
          })}
        {page.database!.subItems && subItemDisplay(view) === 'card' && (
          <SubitemPreview row={row} onOpen={openRow} />
        )}
      </div>
    </div>
  );
}

export function BoardView(props: ViewProps) {
  const { workspace, patch } = useWorkspace();
  const { rows, view, page, updateView, addRow } = props;
  const groupBy = view.groupBy || page.database!.columns.find((c) => isSelectProperty(c))?.id;
  const readOnlyGroup = [groupBy, view.subGroupBy].some((id) =>
    page.database!.columns.some(
      (column) => column.id === id && (isReadOnlyProperty(column) || column.type === 'files'),
    ),
  );
  const groups = groupRows(rows, groupBy, page.database!, workspace!.pages, view);
  const subgroups = groupRows(rows, view.subGroupBy, page.database!, workspace!.pages);
  return (
    <div className={`board-outer card-size-${view.cardSize || 'medium'}`}>
      {subgroups.map((subgroup) => (
        <section key={subgroup.key}>
          {view.subGroupBy && (
            <div className="database-group-heading">
              <strong>{subgroup.label}</strong>
              <span>{subgroup.rows.length}</span>
            </div>
          )}
          <div className="board-view">
            {groups.map((group) => {
              const records = group.rows.filter((row) => subgroup.rows.includes(row));
              return (
                <div
                  className="board-column"
                  key={group.key}
                  onDragOver={(e) => {
                    if (
                      !readOnlyGroup &&
                      !page.locked &&
                      e.dataTransfer.types.includes('application/x-mini-row')
                    ) {
                      e.preventDefault();
                      e.currentTarget.classList.add('drag-over');
                    }
                  }}
                  onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('drag-over');
                    const row = rows.find(
                      (row) => row.id === e.dataTransfer.getData('application/x-mini-row'),
                    );
                    if (!row || !groupBy || readOnlyGroup || page.locked || row.locked) return;
                    const property = page.database!.columns.find((c) => c.id === groupBy);
                    const value = valueForGroup(
                      property,
                      group.key,
                      row.values[groupBy],
                      e.dataTransfer.getData('application/x-mini-row-group'),
                    );
                    patch(row.id, {
                      values: {
                        ...row.values,
                        [groupBy]: value,
                        ...(view.subGroupBy && subgroup.key !== '__all'
                          ? {
                              [view.subGroupBy]: valueForGroup(
                                page.database!.columns.find((c) => c.id === view.subGroupBy),
                                subgroup.key,
                              ),
                            }
                          : {}),
                      },
                    });
                  }}
                >
                  <div className="board-column-title">
                    <button
                      className="board-toggle"
                      onClick={() =>
                        updateView({
                          collapsedGroups: view.collapsedGroups?.includes(group.key)
                            ? view.collapsedGroups.filter((key) => key !== group.key)
                            : [...(view.collapsedGroups || []), group.key],
                        })
                      }
                    >
                      <ChevronRight
                        size={12}
                        className={!view.collapsedGroups?.includes(group.key) ? 'rotated' : ''}
                      />
                      {group.key ? (
                        <Tag
                          value={group.label}
                          options={page.database!.columns.find((c) => c.id === groupBy)?.options}
                          column={page.database!.columns.find((c) => c.id === groupBy)}
                        />
                      ) : (
                        <span>未分组</span>
                      )}
                    </button>
                    <small>{records.length}</small>
                    <IconButton
                      label={`在 ${group.label} 中新建`}
                      disabled={readOnlyGroup || page.locked}
                      onClick={() =>
                        addRow(
                          groupBy
                            ? {
                                [groupBy]: valueForGroup(
                                  page.database!.columns.find((c) => c.id === groupBy),
                                  group.key,
                                ),
                              }
                            : undefined,
                        )
                      }
                    >
                      <Plus size={15} />
                    </IconButton>
                  </div>
                  {!view.collapsedGroups?.includes(group.key) && (
                    <>
                      {records.map((row) => (
                        <RecordCard key={row.id} row={row} props={props} groupKey={group.key} />
                      ))}
                      <button
                        className="board-add"
                        disabled={readOnlyGroup || page.locked}
                        onClick={() =>
                          addRow(
                            groupBy
                              ? {
                                  [groupBy]: valueForGroup(
                                    page.database!.columns.find((c) => c.id === groupBy),
                                    group.key,
                                  ),
                                }
                              : undefined,
                          )
                        }
                      >
                        <Plus size={15} />
                        新建
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function GalleryView(props: ViewProps) {
  const { workspace } = useWorkspace();
  const groups = groupRows(
    props.rows,
    props.view.groupBy,
    props.page.database!,
    workspace!.pages,
    props.view,
  );
  return (
    <>
      {groups.map((group) => (
        <section key={group.key}>
          {props.view.groupBy && (
            <div className="database-group-heading">
              <strong>{group.label}</strong>
              <span>{group.rows.length}</span>
            </div>
          )}
          <div className={`gallery-view card-size-${props.view.cardSize || 'medium'}`}>
            {group.rows.map((row) => (
              <RecordCard key={row.id} row={row} props={props} gallery />
            ))}
            <button className="gallery-add" disabled={props.page.locked} onClick={() => props.addRow()}>
              <Plus size={20} />
              新建页面
            </button>
          </div>
        </section>
      ))}
    </>
  );
}

export function ListView(props: ViewProps) {
  const { workspace } = useWorkspace();
  const { rows, view, page, columns, openRow, updateOptions, addRow, updateView } = props;
  return (
    <div className="database-list">
      {groupRows(rows, view.groupBy, page.database!, workspace!.pages, view).map((group) => (
        <section key={group.key}>
          {view.groupBy && (
            <div className="database-group-heading">
              <strong>{group.label}</strong>
              <span>{group.rows.length}</span>
            </div>
          )}
          {hierarchyRows(group.rows, view, !!page.database!.subItems).map((entry) => {
            const row = entry.page;
            return (
              <div className="database-list-row" key={row.id}>
                <RecordTitle
                  entry={entry}
                  database={page}
                  view={view}
                  onViewChange={updateView}
                  onOpen={openRow}
                />
                {columns.map((column) => (
                  <div key={column.id}>
                    <PropertyValue
                      column={column}
                      page={row}
                      disabled={page.locked || row.locked}
                      onOptionsChange={(options) => updateOptions(column, options)}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </section>
      ))}
      <button className="database-add-row" disabled={page.locked} onClick={() => addRow()}>
        <Plus size={16} />
        新建页面
      </button>
    </div>
  );
}

export function FeedView(props: ViewProps) {
  const { patch, workspace } = useWorkspace();
  const groups = groupRows(
    props.rows,
    props.view.groupBy,
    props.page.database!,
    workspace!.pages,
    props.view,
  );
  const entries: (Page | RowGroup)[] = props.view.groupBy
    ? groups.flatMap((group) => [
        group,
        ...(props.view.collapsedGroups?.includes(group.key) ? [] : group.rows),
      ])
    : props.rows;
  const toggle = (row: Page, path: number[], checked: boolean) => {
    const update = (blocks: JsonBlock[], depth = 0): JsonBlock[] =>
      blocks.map((block, index) =>
        index !== path[depth]
          ? block
          : depth === path.length - 1
            ? { ...block, props: { ...block.props, checked } }
            : { ...block, children: update(block.children || [], depth + 1) },
      );
    patch(row.id, { blocks: update(row.blocks) });
  };
  return (
    <div className="feed-view">
      {entries.map((item) => {
        if ('rows' in item)
          return (
            <button
              key={`group-${item.key}`}
              className="database-group-heading"
              onClick={() =>
                props.updateView({
                  collapsedGroups: props.view.collapsedGroups?.includes(item.key)
                    ? props.view.collapsedGroups.filter((key) => key !== item.key)
                    : [...(props.view.collapsedGroups || []), item.key],
                })
              }
            >
              <ChevronRight
                size={13}
                className={props.view.collapsedGroups?.includes(item.key) ? '' : 'rotated'}
              />
              <strong>{item.label}</strong>
              <span>{item.rows.length}</span>
            </button>
          );
        const row = item;
        return (
          <article key={row.id} className="feed-record">
            <div className="feed-record-meta">
              <span className="workspace-avatar">M</span>
              <span>
                我的工作空间<small>{formatDate(row.updatedAt)}</small>
              </span>
              <IconButton label={`打开 ${row.title || '无标题'}`} onClick={() => props.openRow(row.id)}>
                <ChevronRight size={17} />
              </IconButton>
            </div>
            <button className="feed-record-title" onClick={() => props.openRow(row.id)}>
              <PageIcon icon={row.icon} size={24} />
              <h3>{row.title || '无标题'}</h3>
            </button>
            <div className="feed-record-properties">
              {props.columns.map((column) => (
                <div key={column.id}>
                  <span>{column.name}</span>
                  <PropertyValue column={column} page={row} disabled={props.page.locked || row.locked} />
                </div>
              ))}
            </div>
            <BlockPreview
              blocks={row.blocks}
              onToggle={
                !props.page.locked && !row.locked ? (path, checked) => toggle(row, path, checked) : undefined
              }
            />
            <button className="text-button" onClick={() => props.openRow(row.id)}>
              打开页面 →
            </button>
          </article>
        );
      })}
      {!props.rows.length && <div className="empty-state">这个视图还没有记录。</div>}
    </div>
  );
}
