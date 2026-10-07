import {AppSelect} from '../components/AppSelect';
import { isSelectProperty, isDateProperty } from './propertySchema';
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Trash2,
  SlidersHorizontal,
  Columns3,
  ArrowDownUp,
  Filter,
  LayoutGrid,
  ChevronRight,
  GitBranch,
  Palette,
} from 'lucide-react';
import type {
  Database,
  DatabaseView,
  FilterGroup,
  FilterOperator,
  FilterRule,
  Property,
  SortRule,
  ViewType,
} from '../types';
import { IconButton, MenuItem, Modal } from '../ui';
import { emptyFilters, newView } from './model';
import { PropertyIcon } from './Properties';
import { viewTypes } from './viewTypes';
import { useWorkspace } from '../store';
import { workspacePeople } from './propertySchema';
import { ViewAppearanceControls } from '../components/AppearanceControls';

export type SettingsSection = 'main' | 'layout' | 'properties' | 'filter' | 'sort' | 'group' | 'appearance';
const operatorLabels: Record<FilterOperator, string> = {
  is: '等于',
  is_not: '不等于',
  contains: '包含',
  not_contains: '不包含',
  starts_with: '开头是',
  ends_with: '结尾是',
  empty: '为空',
  not_empty: '不为空',
  gt: '大于',
  gte: '大于或等于',
  lt: '小于',
  lte: '小于或等于',
  before: '早于',
  after: '晚于',
  on_or_before: '不晚于',
  on_or_after: '不早于',
};
function operators(column?: Property): FilterOperator[] {
  if (column?.type === 'number' || column?.type === 'rollup' || column?.type === 'formula')
    return ['is', 'is_not', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty'];
  if (column && isDateProperty(column))
    return ['is', 'before', 'after', 'on_or_before', 'on_or_after', 'empty', 'not_empty'];
  if (column?.type === 'checkbox') return ['is', 'is_not'];
  if ((column && isSelectProperty(column)) || column?.type === 'multiSelect' || column?.type === 'relation')
    return ['contains', 'not_contains', 'empty', 'not_empty'];
  return ['contains', 'not_contains', 'is', 'is_not', 'starts_with', 'ends_with', 'empty', 'not_empty'];
}

export function FilterEditor({
  group,
  database,
  onChange,
  depth = 0,
}: {
  group: FilterGroup;
  database: Database;
  onChange: (group: FilterGroup) => void;
  depth?: number;
}) {
  const { workspace } = useWorkspace();
  const change = (id: string, next: FilterRule | FilterGroup) =>
    onChange({ ...group, rules: group.rules.map((rule) => (rule.id === id ? next : rule)) });
  return (
    <div className={`advanced-filter-group ${depth ? 'nested' : ''}`}>
      <div className="filter-conjunction">
        <span>满足</span>
        <AppSelect
          aria-label="筛选组合"
          value={group.conjunction}
          onChange={(e) => onChange({ ...group, conjunction: e.target.value as 'and' | 'or' })}
        >
          <option value="and">所有条件 · AND</option>
          <option value="or">任一条件 · OR</option>
        </AppSelect>
      </div>
      {group.rules.map((rule) => (
        <div className="advanced-filter-entry" key={rule.id}>
          {'rules' in rule ? (
            <FilterEditor
              group={rule}
              database={database}
              depth={depth + 1}
              onChange={(next) => change(rule.id, next)}
            />
          ) : (
            <div className="advanced-filter-rule">
              <AppSelect
                aria-label="筛选属性"
                value={rule.property}
                onChange={(e) => {
                  const column = database.columns.find((c) => c.id === e.target.value);
                  change(rule.id, {
                    ...rule,
                    property: e.target.value,
                    operator: operators(column)[0],
                    value: column?.type === 'checkbox' ? 'true' : '',
                  });
                }}
              >
                <option value="title">名称</option>
                {database.columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </AppSelect>
              <AppSelect
                aria-label="筛选运算符"
                value={rule.operator}
                onChange={(e) => change(rule.id, { ...rule, operator: e.target.value as FilterOperator })}
              >
                {operators(database.columns.find((c) => c.id === rule.property)).map((operator) => (
                  <option key={operator} value={operator}>
                    {operatorLabels[operator]}
                  </option>
                ))}
              </AppSelect>
              {!['empty', 'not_empty'].includes(rule.operator) &&
                (() => {
                  const column = database.columns.find((c) => c.id === rule.property);
                  return column?.options ? (
                    <AppSelect
                      aria-label="筛选内容"
                      value={rule.value}
                      onChange={(e) => change(rule.id, { ...rule, value: e.target.value })}
                    >
                      <option value="">选择选项</option>
                      {column.options.map((value) => (
                        <option value={value} key={value}>
                          {value}
                        </option>
                      ))}
                    </AppSelect>
                  ) : column?.type === 'person' ? (
                    <AppSelect
                      aria-label="筛选内容"
                      value={rule.value}
                      onChange={(event) => change(rule.id, { ...rule, value: event.target.value })}
                    >
                      <option value="">选择人员</option>
                      {workspacePeople(workspace!).map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </AppSelect>
                  ) : column?.type === 'checkbox' ? (
                    <AppSelect
                      aria-label="筛选内容"
                      value={rule.value}
                      onChange={(e) => change(rule.id, { ...rule, value: e.target.value })}
                    >
                      <option value="true">已勾选</option>
                      <option value="false">未勾选</option>
                    </AppSelect>
                  ) : (
                    <input
                      aria-label="筛选内容"
                      placeholder="输入值…"
                      type={
                        column?.type === 'number'
                          ? 'number'
                          : column && isDateProperty(column)
                            ? 'date'
                            : 'text'
                      }
                      value={rule.value}
                      onChange={(e) => change(rule.id, { ...rule, value: e.target.value })}
                    />
                  );
                })()}
            </div>
          )}
          <IconButton
            label="删除筛选条件"
            onClick={() => onChange({ ...group, rules: group.rules.filter((item) => item.id !== rule.id) })}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      ))}
      <div className="filter-add-actions">
        <button
          className="text-button"
          onClick={() =>
            onChange({
              ...group,
              rules: [
                ...group.rules,
                { id: crypto.randomUUID(), property: 'title', operator: 'contains', value: '' },
              ],
            })
          }
        >
          <Plus size={14} />
          添加条件
        </button>
        {depth < 2 && (
          <button
            className="text-button"
            onClick={() => onChange({ ...group, rules: [...group.rules, emptyFilters()] })}
          >
            <Plus size={14} />
            添加筛选组
          </button>
        )}
      </div>
    </div>
  );
}

export function ViewSettings({
  view,
  database,
  section: initialSection = 'main',
  onChange,
  onAddProperty,
  onStructure,
}: {
  view: DatabaseView;
  database: Database;
  section?: SettingsSection;
  onChange: (changes: Partial<DatabaseView>) => void;
  onAddProperty: () => void;
  onStructure?: () => void;
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const names = {
    main: '视图设置',
    appearance: '外观',
    layout: '布局',
    properties: '属性',
    filter: '筛选',
    sort: '排序',
    group: '分组',
  };
  const columns = [...database.columns].sort(
    (a, b) => (view.propertyOrder || []).indexOf(a.id) - (view.propertyOrder || []).indexOf(b.id),
  );
  const sort = (id: string, changes: Partial<SortRule>) =>
    onChange({ sorts: view.sorts?.map((rule) => (rule.id === id ? { ...rule, ...changes } : rule)) });
  return (
    <div className="view-settings">
      <div className="view-settings-heading">
        {section !== 'main' && (
          <IconButton label="返回视图设置" onClick={() => setSection('main')}>
            <ArrowLeft size={16} />
          </IconButton>
        )}
        <strong>{names[section]}</strong>
      </div>
      {section === 'main' && (
        <>
          <div className="view-settings-name">
            <label>
              视图名称
              <input
                aria-label="视图名称"
                value={view.name}
                onChange={(e) => onChange({ name: e.target.value })}
              />
            </label>
          </div>
          {(
            [
              { id: 'appearance', label: '外观', icon: Palette, value: '背景与卡片配色' },
              {
                id: 'layout',
                label: '布局',
                icon: LayoutGrid,
                value: viewTypes.find((v) => v.type === view.type)?.name,
              },
              {
                id: 'properties',
                label: '属性',
                icon: SlidersHorizontal,
                value: `${database.columns.length - (view.hiddenProperties?.length || 0)} 个显示`,
              },
              {
                id: 'filter',
                label: '筛选',
                icon: Filter,
                value: `${view.filters?.rules.length || 0} 个条件`,
              },
              { id: 'sort', label: '排序', icon: ArrowDownUp, value: `${view.sorts?.length || 0} 个排序` },
              {
                id: 'group',
                label: '分组',
                icon: Columns3,
                value: database.columns.find((c) => c.id === view.groupBy)?.name || '无',
              },
            ] as const
          )
            .filter(
              (item) =>
                !(item.id === 'properties' && ['chart', 'timeline'].includes(view.type)) &&
                !(item.id === 'group' && ['chart', 'calendar', 'form'].includes(view.type)) &&
                !(item.id === 'sort' && ['chart', 'form'].includes(view.type)) &&
                !(item.id === 'filter' && view.type === 'form'),
            )
            .map((item) => (
              <MenuItem
                key={item.id}
                icon={<item.icon size={16} />}
                onClick={() => setSection(item.id)}
                submenu
              >
                <span className="settings-item-label">
                  {item.label}
                  <small>{item.value}</small>
                </span>
              </MenuItem>
            ))}
          {onStructure && (
            <>
              <div className="menu-divider" />
              <MenuItem icon={<GitBranch size={16} />} submenu onClick={onStructure}>
                子项目与依赖
              </MenuItem>
            </>
          )}
        </>
      )}
      {section === 'appearance' && <ViewAppearanceControls value={view.appearance} onChange={(appearance) => onChange({ appearance })} />}
      {section === 'layout' && (
        <div className="view-settings-body">
          <div className="view-type-options">
            {viewTypes.map((item) => (
              <button
                key={item.type}
                className={view.type === item.type ? 'selected' : ''}
                onClick={() => onChange({ type: item.type })}
              >
                <item.icon size={22} />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
          <label className="field-label">
            打开页面的方式
            <AppSelect
              aria-label="打开页面的方式"
              value={view.openPagesIn || 'side'}
              onChange={(e) => onChange({ openPagesIn: e.target.value as DatabaseView['openPagesIn'] })}
            >
              <option value="side">侧边预览</option>
              <option value="center">居中预览</option>
              <option value="full">完整页面</option>
            </AppSelect>
          </label>
          {view.type === 'table' && (
            <label className="setting-checkbox">
              <input
                type="checkbox"
                checked={view.wrapCells || false}
                onChange={(e) => onChange({ wrapCells: e.target.checked })}
              />
              单元格自动换行
            </label>
          )}
          {['board', 'gallery'].includes(view.type) && (
            <>
              <label className="field-label">
                卡片尺寸
                <AppSelect
                  aria-label="卡片尺寸"
                  value={view.cardSize || 'medium'}
                  onChange={(e) => onChange({ cardSize: e.target.value as DatabaseView['cardSize'] })}
                >
                  <option value="small">小</option>
                  <option value="medium">中</option>
                  <option value="large">大</option>
                </AppSelect>
              </label>
              <label className="field-label">
                卡片预览
                <AppSelect
                  aria-label="卡片预览"
                  value={view.cardPreview || (view.type === 'gallery' ? 'content' : 'none')}
                  onChange={(e) => onChange({ cardPreview: e.target.value as DatabaseView['cardPreview'] })}
                >
                  <option value="none">无</option>
                  <option value="cover">页面封面</option>
                  <option value="content">页面内容</option>
                </AppSelect>
              </label>
            </>
          )}
          {view.type === 'calendar' && (
            <label className="field-label">
              日历布局
              <AppSelect
                aria-label="日历布局"
                value={view.calendarMode || 'month'}
                onChange={(e) => onChange({ calendarMode: e.target.value as 'month' | 'week' })}
              >
                <option value="month">月视图</option>
                <option value="week">周视图</option>
              </AppSelect>
            </label>
          )}
        </div>
      )}
      {section === 'properties' && (
        <div className="view-settings-body">
          <p className="view-settings-description">拖动调整属性顺序；点击眼睛切换显示。</p>
          {columns.map((column) => (
            <div
              className="property-visibility-row"
              key={column.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('application/x-mini-property', column.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('application/x-mini-property');
                const order = columns.map((c) => c.id).filter((c) => c !== id);
                order.splice(order.indexOf(column.id), 0, id);
                if (id) onChange({ propertyOrder: order });
              }}
            >
              <GripVertical size={13} />
              <PropertyIcon type={column.type} />
              <span>{column.name}</span>
              <IconButton
                label={`${view.hiddenProperties?.includes(column.id) ? '显示' : '隐藏'} ${column.name}`}
                onClick={() =>
                  onChange({
                    hiddenProperties: view.hiddenProperties?.includes(column.id)
                      ? view.hiddenProperties.filter((id) => id !== column.id)
                      : [...(view.hiddenProperties || []), column.id],
                  })
                }
              >
                {view.hiddenProperties?.includes(column.id) ? <EyeOff size={15} /> : <Eye size={15} />}
              </IconButton>
            </div>
          ))}
          <MenuItem icon={<Plus size={15} />} onClick={onAddProperty}>
            添加属性
          </MenuItem>
        </div>
      )}
      {section === 'filter' && (
        <>
          <FilterEditor
            database={database}
            group={view.filters || emptyFilters()}
            onChange={(filters) => onChange({ filters })}
          />
          {!!view.filters?.rules.length && (
            <MenuItem icon={<Trash2 size={14} />} onClick={() => onChange({ filters: emptyFilters() })}>
              清除所有筛选
            </MenuItem>
          )}
        </>
      )}
      {section === 'sort' && (
        <div className="view-settings-body">
          {view.sorts?.map((rule, index) => (
            <div
              className="sort-rule"
              key={rule.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('application/x-mini-sort', rule.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('application/x-mini-sort');
                const moved = view.sorts?.find((r) => r.id === id);
                if (!moved) return;
                const next = view.sorts!.filter((r) => r.id !== id);
                next.splice(index, 0, moved);
                onChange({ sorts: next });
              }}
            >
              <GripVertical size={13} />
              <AppSelect
                aria-label="排序属性"
                value={rule.property}
                onChange={(e) => sort(rule.id, { property: e.target.value })}
              >
                <option value="title">名称</option>
                {database.columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
                <option value="createdAt">创建时间</option>
                <option value="updatedAt">最后编辑时间</option>
              </AppSelect>
              <AppSelect
                aria-label="排序方向"
                value={rule.direction}
                onChange={(e) => sort(rule.id, { direction: e.target.value as 'asc' | 'desc' })}
              >
                <option value="asc">升序</option>
                <option value="desc">降序</option>
              </AppSelect>
              <IconButton
                label="移除排序"
                onClick={() => onChange({ sorts: view.sorts!.filter((r) => r.id !== rule.id) })}
              >
                <Trash2 size={14} />
              </IconButton>
            </div>
          ))}
          <MenuItem
            icon={<Plus size={15} />}
            onClick={() =>
              onChange({
                sorts: [
                  ...(view.sorts || []),
                  { id: crypto.randomUUID(), property: 'title', direction: 'asc' },
                ],
              })
            }
          >
            添加排序
          </MenuItem>
          <p className="view-settings-description">靠前的排序优先，拖动手柄可以调整优先级。</p>
        </div>
      )}
      {section === 'group' && (
        <div className="view-settings-body">
          {(
            ['groupBy', ...(view.type === 'board' ? ['subGroupBy'] : [])] as ('groupBy' | 'subGroupBy')[]
          ).map((field, index) => (
            <label className="field-label" key={field}>
              {index ? '子分组依据' : '分组依据'}
              <AppSelect
                aria-label={index ? '子分组依据' : '分组依据'}
                value={view[field] || ''}
                onChange={(e) => onChange({ [field]: e.target.value || undefined })}
              >
                <option value="">无</option>
                {database.columns
                  .filter((c) => !['url', 'rollup', 'files', 'button'].includes(c.type))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </AppSelect>
            </label>
          ))}
          <label className="setting-checkbox">
            <input
              type="checkbox"
              checked={view.hideEmptyGroups || false}
              onChange={(e) => onChange({ hideEmptyGroups: e.target.checked })}
            />
            隐藏空分组
          </label>
          {database.columns
            .find((c) => c.id === view.groupBy)
            ?.options?.map((group) => (
              <div className="property-visibility-row" key={group}>
                <span>{group}</span>
                <IconButton
                  label={`${view.hiddenGroups?.includes(group) ? '显示' : '隐藏'}分组 ${group}`}
                  onClick={() =>
                    onChange({
                      hiddenGroups: view.hiddenGroups?.includes(group)
                        ? view.hiddenGroups.filter((g) => g !== group)
                        : [...(view.hiddenGroups || []), group],
                    })
                  }
                >
                  {view.hiddenGroups?.includes(group) ? <EyeOff size={15} /> : <Eye size={15} />}
                </IconButton>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function CreateViewDialog({
  onCreate,
  onClose,
}: {
  onCreate: (view: DatabaseView) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<ViewType>('table');
  const [name, setName] = useState('');
  return (
    <Modal title="新建视图" onClose={onClose} className="create-view-modal">
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(newView(type, name.trim() || viewTypes.find((v) => v.type === type)!.name));
        }}
      >
        <input
          autoFocus
          className="full-input"
          aria-label="新视图名称"
          placeholder="视图名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="create-view-grid">
          {viewTypes.map((item) => (
            <button
              type="button"
              key={item.type}
              className={type === item.type ? 'selected' : ''}
              onClick={() => setType(item.type)}
            >
              <item.icon size={27} />
              <strong>{item.name}</strong>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="submit" className="primary-button">
            创建视图
          </button>
        </div>
      </form>
    </Modal>
  );
}
