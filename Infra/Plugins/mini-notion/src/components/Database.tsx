import {AppSelect} from './AppSelect';
import { isSelectProperty, isReadOnlyProperty } from '../database/propertySchema';
import { PeoplePicker } from '../database/PeoplePicker';
import { FilesPicker } from '../database/FilesPicker';
import { Zap } from 'lucide-react';
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppearanceTheme, viewAppearanceStyle } from '../appearance';
import {
  ArrowDownUp,
  Copy,
  Filter,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
  Check,
  ChevronDown,
} from 'lucide-react';
import type { Database as DatabaseType, DatabaseView, DatabaseViewState, Page, Property } from '../types';
import { useWorkspace } from '../store';
import { IconButton, MenuItem, Modal, Popover } from '../ui';
import { restorePage, trashPage } from '../model';
import {
  activeView,
  emptyFilters,
  getViews,
  queryRows,
  selectView,
  updateView,
  visibleColumns,
} from '../database/model';
import { DateInput } from '../database/DateInput';
import type { DateValue } from '../types';
import { PropertyEditor, PropertyValue } from '../database/Properties';
import { CreateViewDialog, ViewSettings, type SettingsSection } from '../database/ViewSettings';
import { viewTypes } from '../database/viewTypes';
import { TableView } from '../database/views/TableView';
import { BoardView, GalleryView, ListView, FeedView } from '../database/views/Cards';
import { TimelineView } from '../database/views/TimelineView';
import { ChartView } from '../database/views/ChartView';
import { FormView } from '../database/views/FormView';
import { PlanView } from '../database/views/PlanView';
import { CalendarView } from './CalendarView';
import { TemplateMenu } from '../database/TemplateMenu';
import { defaultTemplateId } from '../database/templatesModel';
import { StructureSettings } from '../database/StructureSettings';
import type { ViewProps } from '../database/views/types';

export function Database({
  page,
  viewState,
  onViewStateChange,
}: {
  page: Page;
  viewState?: DatabaseViewState;
  onViewStateChange?: (state: DatabaseViewState) => void;
}) {
  const { workspace, patch, update, create, navigate, setPeekId, setPeekMode, notify, command, setModal } =
    useWorkspace();
  const db = { ...page.database!, ...viewState };
  const theme = useContext(AppearanceTheme);
  const views = getViews(db);
  const view = activeView(db);
  const [query, setQuery] = useState('');
  const [property, setProperty] = useState<Property | null>(null);
  const [creatingView, setCreatingView] = useState(false);
  const [structure, setStructure] = useState(false);
  const [templateMenu, setTemplateMenu] = useState<{ x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<{
    type: 'view' | 'settings' | 'view-list';
    id?: string;
    section?: SettingsSection;
    x: number;
    y: number;
  } | null>(null);
  const [selected, setSelected] = useState(new Set<string>());
  const [bulkProperty, setBulkProperty] = useState('');
  const [bulkValue, setBulkValue] = useState<Page['values'][string]>('');
  const [bulkUploading, setBulkUploading] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const showSettings = (event: Event) => {
      const { databaseId, viewId, section = 'main', visible } = (event as CustomEvent).detail;
      if (visible === false) { setMenu(null); return; }
      if (databaseId !== page.id || (viewId && viewId !== view.id)) return;
      if (!['main', 'layout', 'properties', 'filter', 'sort', 'group', 'appearance'].includes(section)) return;
      const rect = tabsRef.current?.parentElement?.getBoundingClientRect();
      if (rect) setMenu({ type: 'settings', section, x: rect.right - (section === 'filter' ? 580 : 380), y: rect.bottom + 5 });
    };
    window.addEventListener('mini:view-settings', showSettings);
    return () => window.removeEventListener('mini:view-settings', showSettings);
  }, [page.id, view.id]);
  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    const button = Array.from(tabs?.querySelectorAll<HTMLButtonElement>('[data-view-id]') || []).find(
      (button) => button.dataset.viewId === view.id,
    );
    if (!tabs || !button) return;
    const left = button.getBoundingClientRect().left - tabs.getBoundingClientRect().left + tabs.scrollLeft;
    const right = left + button.offsetWidth;
    if (left < tabs.scrollLeft) tabs.scrollLeft = left;
    else if (right > tabs.scrollLeft + tabs.clientWidth - 65) tabs.scrollLeft = right - tabs.clientWidth + 65;
  }, [view.id, view.name, views.length]);
  useEffect(() => setSelected(new Set()), [view.id, view.type, page.id]);
  const saveDatabase = (database: DatabaseType) => {
    if (onViewStateChange) {
      if (database.columns !== page.database!.columns)
        patch(page.id, { database: { ...page.database!, columns: database.columns } });
      onViewStateChange({
        views: getViews(database),
        activeViewId: activeView(database).id,
        view: activeView(database).type,
      });
    } else patch(page.id, { database });
  };
  const changeView = (changes: Partial<DatabaseView>) => saveDatabase(updateView(db, view.id, changes));
  const rows = queryRows(page, view, workspace!.pages, query);
  const columns = visibleColumns(db, view);
  const openRow = (id: string) => {
    if (view.openPagesIn === 'full') navigate(id);
    else {
      setPeekMode(view.openPagesIn === 'center' ? 'center' : 'side');
      setPeekId(id);
    }
  };
  const addRow = (values: Page['values'] = {}, templateId = defaultTemplateId(db, view)) => {
    const row = create({ parentId: page.id, values }, false, templateId);
    openRow(row.id);
  };
  const options = (column: Property, options: string[]) =>
    saveDatabase({ ...db, columns: db.columns.map((c) => (c.id === column.id ? { ...c, options } : c)) });
  const selectRow = (id: string, checked: boolean) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  const openSettings = (event: React.MouseEvent<HTMLButtonElement>, section: SettingsSection) => {
    const r = event.currentTarget.getBoundingClientRect();
    setMenu({ type: 'settings', section, x: r.right - (section === 'filter' ? 570 : 370), y: r.bottom + 5 });
  };
  const addView = (next: DatabaseView) => {
    if (next.type === 'board' && !next.groupBy)
      next.groupBy = db.columns.find((c) => isSelectProperty(c))?.id;
    next.calendarBy ??= db.columns.find((c) => c.type === 'date')?.id;
    next.chartGroup ??= db.columns.find((c) => isSelectProperty(c))?.id;
    saveDatabase({ ...db, views: [...views, next], activeViewId: next.id, view: next.type });
    setCreatingView(false);
    setMenu(null);
  };
  const deleteSelected = () => {
    const ids = [...selected];
    update((state) => ids.reduce((state, id) => trashPage(state, id), state));
    notify(`已将 ${ids.length} 个页面移到回收站`, () =>
      update((state) => ids.reduce((state, id) => restorePage(state, id), state)),
    );
    setSelected(new Set());
  };
  const applyBulk = () => {
    if (page.locked) return;
    const column = db.columns.find((c) => c.id === bulkProperty);
    if (!column) return;
    const value =
      column.type === 'number'
        ? bulkValue === ''
          ? ''
          : Number(bulkValue)
        : column.type === 'checkbox'
          ? bulkValue === 'true'
          : column.type === 'multiSelect'
            ? String(bulkValue)
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean)
            : bulkValue;
    update((state) => ({
      ...state,
      pages: state.pages.map((row) =>
        selected.has(row.id) && !row.locked
          ? { ...row, values: { ...row.values, [column.id]: value }, updatedAt: Date.now() }
          : row,
      ),
    }));
    notify(`已更新 ${selected.size} 条记录`);
    setBulkProperty('');
  };
  const props: ViewProps = {
    page,
    view,
    rows,
    columns,
    updateView: changeView,
    editProperty: setProperty,
    updateOptions: options,
    openRow,
    addRow,
    selected,
    selectRow,
  };
  const filterCount = (group = view.filters): number =>
    group?.rules.reduce((count, rule) => count + ('rules' in rule ? filterCount(rule) : 1), 0) || 0;
  const menuView = views.find((v) => v.id === menu?.id) || view;

  return (
    <div className={`database saved-view-database ${Object.values(view.appearance || {}).some((value) => value && value !== 'default') ? 'styled-database' : ''}`} data-database-id={page.id} style={viewAppearanceStyle(view.appearance, theme, workspace!.settings.appearance)}>
      <div className="database-toolbar">
        <div className="view-tabs" ref={tabsRef}>
          {views.map((item) => {
            const Icon = viewTypes.find((type) => type.type === item.type)!.icon;
            return (
              <button
                key={item.id}
                draggable={!page.locked}
                className={item.id === view.id ? 'active' : ''}
                data-view-id={item.id}
                title={item.name}
                onClick={(e) => {
                  if (item.id === view.id) {
                    const r = e.currentTarget.getBoundingClientRect();
                    setMenu({ type: 'view', id: item.id, x: r.left, y: r.bottom + 5 });
                  } else {
                    saveDatabase(selectView(db, item.id));
                    setQuery('');
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ type: 'view', id: item.id, x: e.clientX, y: e.clientY });
                }}
                onDragStart={(e) => e.dataTransfer.setData('application/x-mini-view', item.id)}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('application/x-mini-view')) e.preventDefault();
                }}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData('application/x-mini-view');
                  const moved = views.find((v) => v.id === id);
                  if (!moved) return;
                  e.preventDefault();
                  const next = views.filter((v) => v.id !== id);
                  next.splice(
                    next.findIndex((v) => v.id === item.id),
                    0,
                    moved,
                  );
                  saveDatabase({ ...db, views: next, activeViewId: view.id });
                }}
              >
                <Icon size={16} />
                <span>{item.name || '无标题视图'}</span>
              </button>
            );
          })}
          <div className="view-tab-actions">
            <IconButton
              label="全部视图"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setMenu({ type: 'view-list', x: r.right - 260, y: r.bottom + 5 });
              }}
            >
              <ChevronDown size={14} />
            </IconButton>
            <IconButton label="添加视图" disabled={page.locked} onClick={() => setCreatingView(true)}>
              <Plus size={17} />
            </IconButton>
          </div>
        </div>
        <div className="database-tools">
          {view.type !== 'form' && (
            <div className="database-search">
              <Search size={14} />
              <input
                aria-label="搜索数据库"
                placeholder="搜索…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
          {view.type !== 'form' && (
            <IconButton label="筛选" active={!!filterCount()} onClick={(e) => openSettings(e, 'filter')}>
              <Filter size={17} />
            </IconButton>
          )}
          {!['form', 'chart'].includes(view.type) && (
            <IconButton label="排序" active={!!view.sorts?.length} onClick={(e) => openSettings(e, 'sort')}>
              <ArrowDownUp size={17} />
            </IconButton>
          )}
          <IconButton label="自动化" onClick={() => setModal({ type: 'automations', pageId: page.id })}>
            <Zap size={17} />
          </IconButton>
          <IconButton label="数据库设置" onClick={(e) => openSettings(e, 'main')}>
            <Settings2 size={18} />
          </IconButton>
          <div className="database-new-split">
            <button className="primary-button database-new" disabled={page.locked} onClick={() => addRow()}>
              新建
            </button>
            <button
              className="database-new-options"
              aria-label="新建模板与选项"
              disabled={page.locked}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setTemplateMenu({ x: rect.right - 330, y: rect.bottom + 5 });
              }}
            >
              <ChevronDown size={14} />
            </button>
          </div>
        </div>
      </div>
      {view.type !== 'form' && (!!filterCount() || (!!view.sorts?.length && view.type !== 'chart')) && (
        <div className="database-active-filters">
          {!!filterCount() && (
            <button onClick={(e) => openSettings(e, 'filter')}>
              <Filter size={12} />
              {filterCount()} 个筛选条件
            </button>
          )}
          {view.type !== 'chart' && !!view.sorts?.length && (
            <button onClick={(e) => openSettings(e, 'sort')}>
              <ArrowDownUp size={12} />
              {view.sorts.length} 个排序
            </button>
          )}
          <button onClick={() => changeView({ filters: emptyFilters(), sorts: [] })}>
            <X size={12} />
            清除
          </button>
        </div>
      )}
      {!!selected.size && (
        <div className="database-selection-toolbar">
          <span>已选择 {selected.size} 条记录</span>
          <AppSelect
            aria-label="批量编辑属性"
            value={bulkProperty}
            onChange={(e) => {
              setBulkProperty(e.target.value);
              setBulkValue('');
            }}
          >
            <option value="">编辑属性…</option>
            {db.columns
              .filter((c) => !isReadOnlyProperty(c) && c.type !== 'relation')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </AppSelect>
          {bulkProperty && (
            <>
              {db.columns.find((c) => c.id === bulkProperty)?.type === 'person' ? (
                <PeoplePicker label="批量设置的人员" value={bulkValue} onChange={setBulkValue} />
              ) : db.columns.find((c) => c.id === bulkProperty)?.type === 'files' ? (
                <FilesPicker
                  label="批量设置的文件"
                  value={bulkValue}
                  onChange={setBulkValue}
                  onBusyChange={setBulkUploading}
                />
              ) : db.columns.find((c) => c.id === bulkProperty)?.options ? (
                <AppSelect
                  aria-label="批量设置的值"
                  value={String(bulkValue)}
                  onChange={(e) => setBulkValue(e.target.value)}
                >
                  <option value="">清空</option>
                  {db.columns
                    .find((c) => c.id === bulkProperty)
                    ?.options?.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                </AppSelect>
              ) : db.columns.find((c) => c.id === bulkProperty)?.type === 'checkbox' ? (
                <AppSelect
                  aria-label="批量设置的值"
                  value={String(bulkValue)}
                  onChange={(e) => setBulkValue(e.target.value)}
                >
                  <option value="false">未勾选</option>
                  <option value="true">已勾选</option>
                </AppSelect>
              ) : db.columns.find((c) => c.id === bulkProperty)?.type === 'date' ? (
                <DateInput label="批量设置的日期" value={bulkValue} onChange={setBulkValue} />
              ) : (
                <input
                  type={db.columns.find((c) => c.id === bulkProperty)?.type === 'number' ? 'number' : 'text'}
                  aria-label="批量设置的值"
                  value={String(bulkValue)}
                  onChange={(e) => setBulkValue(e.target.value)}
                  placeholder="输入新值"
                />
              )}
              <button className="text-button" disabled={page.locked || bulkUploading} onClick={applyBulk}>
                <Check size={14} />
                应用
              </button>
            </>
          )}
          <button className="text-button danger" disabled={page.locked} onClick={deleteSelected}>
            <Trash2 size={14} />
            移到回收站
          </button>
          <IconButton label="取消选择" onClick={() => setSelected(new Set())}>
            <X size={15} />
          </IconButton>
        </div>
      )}
      {view.type === 'table' && <TableView {...props} />}
      {view.type === 'board' && <BoardView {...props} />}
      {view.type === 'gallery' && <GalleryView {...props} />}
      {view.type === 'list' && <ListView {...props} />}
      {view.type === 'calendar' && (
        <CalendarView page={page} rows={rows} view={view} onViewChange={changeView} openRow={openRow} />
      )}
      {view.type === 'timeline' && <TimelineView {...props} />}
      {view.type === 'plan' && <PlanView {...props} />}
      {view.type === 'chart' && <ChartView {...props} />}
      {view.type === 'feed' && <FeedView {...props} />}
      {view.type === 'form' && <FormView {...props} />}
      {structure && (
        <StructureSettings
          page={page}
          view={view}
          onViewChange={changeView}
          onClose={() => setStructure(false)}
        />
      )}
      {templateMenu && (
        <TemplateMenu
          page={page}
          view={view}
          {...templateMenu}
          onClose={() => setTemplateMenu(null)}
          onNew={(templateId) => addRow({}, templateId)}
          onViewDefault={(id) => changeView({ defaultTemplateId: id })}
        />
      )}
      {creatingView && <CreateViewDialog onCreate={addView} onClose={() => setCreatingView(false)} />}
      {menu?.type === 'view-list' && (
        <Popover x={menu.x} y={menu.y} width={280} onClose={() => setMenu(null)}>
          <div className="picker-heading">全部视图 · {views.length}</div>
          {views.map((item) => {
            const Icon = viewTypes.find((type) => type.type === item.type)!.icon;
            return (
              <MenuItem
                key={item.id}
                icon={<Icon size={16} />}
                checked={item.id === view.id}
                onClick={() => {
                  saveDatabase(selectView(db, item.id));
                  setMenu(null);
                  setQuery('');
                }}
              >
                {item.name}
              </MenuItem>
            );
          })}
          <div className="menu-divider" />
          <MenuItem
            icon={<Plus size={15} />}
            onClick={() => {
              setMenu(null);
              setCreatingView(true);
            }}
          >
            添加视图
          </MenuItem>
        </Popover>
      )}
      {menu?.type === 'settings' && (
        <Popover
          x={menu.x}
          y={menu.y}
          width={menu.section === 'filter' ? 580 : 380}
          onClose={() => setMenu(null)}
        >
          <ViewSettings
            key={menu.section}
            view={view}
            database={db}
            section={menu.section}
            onChange={changeView}
            onStructure={() => {
              setMenu(null);
              setStructure(true);
            }}
            onAddProperty={() => {
              setMenu(null);
              setProperty({ id: crypto.randomUUID(), name: '', type: 'text' });
            }}
          />
        </Popover>
      )}
      {menu?.type === 'view' && (
        <Popover x={menu.x} y={menu.y} onClose={() => setMenu(null)} width={255}>
          <div className="picker-heading">{menuView.name}</div>
          <MenuItem
            icon={<Settings2 size={15} />}
            onClick={() => {
              saveDatabase(selectView(db, menuView.id));
              setMenu({ ...menu, type: 'settings', section: 'main' });
            }}
          >
            编辑视图
          </MenuItem>
          <MenuItem
            icon={<Copy size={15} />}
            disabled={page.locked}
            onClick={() =>
              addView({
                ...structuredClone(menuView),
                id: crypto.randomUUID(),
                name: `${menuView.name}（副本）`,
              })
            }
          >
            复制视图
          </MenuItem>
          <MenuItem
            icon={<Trash2 size={15} />}
            danger
            disabled={page.locked || views.length <= 1}
            onClick={() => {
              const next = views.filter((v) => v.id !== menuView.id);
              const selected = next.find((v) => v.id === view.id) || next[0];
              saveDatabase({ ...db, views: next, activeViewId: selected.id, view: selected.type });
              setMenu(null);
            }}
          >
            删除视图
          </MenuItem>
          <div className="menu-divider" />
          <MenuItem
            icon={<Plus size={15} />}
            onClick={() => {
              setMenu(null);
              setCreatingView(true);
            }}
          >
            添加视图
          </MenuItem>
        </Popover>
      )}
      {property && (
        <PropertyEditor
          page={page}
          column={property}
          onClose={() => setProperty(null)}
          onSave={(column, optionRenames) => {
            try {
              if (db.columns.some((value) => value.id === column.id))
                command('property.update', {
                  databaseId: page.id,
                  propertyId: column.id,
                  changes: column,
                  optionRenames,
                });
              else command('property.add', { databaseId: page.id, definition: column });
              return true;
            } catch (error) {
              notify(error instanceof Error ? error.message : String(error));
              return false;
            }
          }}
          onDelete={
            db.columns.some((column) => column.id === property.id)
              ? () => {
                  try {
                    command('property.delete', { databaseId: page.id, propertyId: property.id });
                    return true;
                  } catch (error) {
                    notify(error instanceof Error ? error.message : String(error));
                    return false;
                  }
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
