import {AppSelect} from '../components/AppSelect';
import { ButtonControl } from '../actions/Buttons';
import { MousePointer2 } from 'lucide-react';
import { useState } from 'react';
import {
  Type,
  Hash,
  Circle,
  Calendar,
  CheckSquare,
  Link,
  Tags,
  Trash2,
  X,
  ArrowUpRight,
  Plus,
  CircleDashed,
  Users,
  Paperclip,
  Mail,
  Phone,
  Clock,
  UserRound,
} from 'lucide-react';
import type { Page, Property, PropertyType, StatusGroup } from '../types';
import { useWorkspace } from '../store';
import { MenuItem, Modal, PageIcon, Popover } from '../ui';
import { readProperty, isTemplatePage } from '../model';
import { relationIds } from './relations';
import { computeProperty } from './propertiesModel';
import { DateInput } from './DateInput';
import { FormulaEditor, FormulaResult } from './FormulaEditor';
import {
  isSelectProperty,
  isSystemProperty,
  statusGroup,
  propertyColors,
  statusGroupNames,
  statusGroupOrder,
  normalizeProperty,
} from './propertySchema';
import { PeoplePicker, PersonBadge } from './PeoplePicker';
import { FilesPicker } from './FilesPicker';

export const propertyTypes: { type: PropertyType; label: string; icon: typeof Type }[] = [
  { type: 'text', label: '文本', icon: Type },
  { type: 'number', label: '数字', icon: Hash },
  { type: 'select', label: '单选', icon: Circle },
  { type: 'status', label: '状态', icon: CircleDashed },
  { type: 'multiSelect', label: '多选', icon: Tags },
  { type: 'date', label: '日期', icon: Calendar },
  { type: 'checkbox', label: '复选框', icon: CheckSquare },
  { type: 'url', label: '链接', icon: Link },
  { type: 'email', label: '邮箱', icon: Mail },
  { type: 'phone', label: '电话', icon: Phone },
  { type: 'person', label: '人员', icon: Users },
  { type: 'files', label: '文件与媒体', icon: Paperclip },
  { type: 'createdTime', label: '创建时间', icon: Clock },
  { type: 'editedTime', label: '最后编辑时间', icon: Clock },
  { type: 'createdBy', label: '创建者', icon: UserRound },
  { type: 'editedBy', label: '最后编辑者', icon: UserRound },
  { type: 'uniqueId', label: '唯一编号', icon: Hash },
  { type: 'relation', label: '关联', icon: ArrowUpRight },
  { type: 'rollup', label: '汇总', icon: Hash },
  { type: 'button', label: '按钮', icon: MousePointer2 },
  { type: 'formula', label: '公式', icon: Hash },
];
export function PropertyIcon({ type }: { type: PropertyType }) {
  const Icon = propertyTypes.find((p) => p.type === type)?.icon || Type;
  return <Icon size={15} />;
}
export function tagTone(value: string, index = 0) {
  if (['已完成', '完成', 'Done', '低'].includes(value)) return 'green';
  if (['进行中', 'In progress', '工作'].includes(value)) return 'blue';
  if (['高', '紧急'].includes(value)) return 'red';
  if (['未开始', 'Not started'].includes(value)) return 'gray';
  if (value === '中') return 'yellow';
  return ['purple', 'orange', 'pink', 'blue', 'green', 'yellow'][index % 6];
}
export function Tag({
  value,
  options = [],
  column,
}: {
  value: string;
  options?: string[];
  column?: Property;
}) {
  const group = column?.type === 'status' ? statusGroup(column, value) : undefined;
  const color =
    column?.optionColors?.[value] ||
    (group
      ? { todo: 'gray', doing: 'blue', done: 'green' }[group]
      : tagTone(value, Math.max(0, options.indexOf(value))));
  return (
    <span className={`tag tag-${color} ${group ? 'status-tag' : ''}`}>
      {group && <i className={`status-dot status-${group}`} />} {value}
    </span>
  );
}

export function PropertyValue({
  column,
  page,
  disabled = false,
  onOptionsChange,
}: {
  column: Property;
  page: Page;
  disabled?: boolean;
  onOptionsChange?: (options: string[]) => void;
}) {
  const { patch, workspace, navigate, create, command, notify } = useWorkspace();
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const [query, setQuery] = useState('');
  const value = page.values[column.id];
  const change = (next: Page['values'][string]) => {
    if (column.system && !page.templateFor) {
      try {
        command('relation.set', {
          pageId: page.id,
          propertyId: column.id,
          ids: Array.isArray(next) ? next : next ? [String(next)] : [],
        });
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error));
      }
    } else patch(page.id, { values: { ...page.values, [column.id]: next } });
  };
  if (column.type === 'person')
    return (
      <PeoplePicker
        value={value}
        onChange={change}
        label={column.name}
        single={column.personLimit === 1}
        disabled={disabled}
      />
    );
  if (column.type === 'files')
    return <FilesPicker value={value} onChange={change} label={column.name} disabled={disabled} />;
  if (isSystemProperty(column)) {
    const person =
      column.type === 'createdBy' ? page.createdBy : column.type === 'editedBy' ? page.editedBy : undefined;
    return (
      <span className="property-computed" aria-label={column.name} title="由系统自动填写">
        {person ? (
          <PersonBadge person={person} />
        ) : column.type === 'createdTime' || column.type === 'editedTime' ? (
          new Date(column.type === 'createdTime' ? page.createdAt : page.updatedAt).toLocaleString('zh-CN')
        ) : (
          String(readProperty(page, column, workspace!.pages) || '空')
        )}
      </span>
    );
  }
  if (column.type === 'button')
    return (
      <ButtonControl
        pageId={page.id}
        propertyId={column.id}
        config={column.button || { label: column.name, actions: [] }}
        disabled={disabled}
      />
    );
  if (column.type === 'date')
    return (
      <DateInput
        label={column.name}
        value={value}
        onChange={change}
        disabled={disabled}
        pageId={page.id}
        propertyId={column.id}
      />
    );
  if (column.type === 'formula') {
    const result = computeProperty(page, column, workspace!.pages);
    return (
      <span
        className={`property-computed ${result.ok ? '' : 'formula-error'}`}
        title={!result.ok ? result.error : undefined}
      >
        {result.ok ? <FormulaResult value={result.value} /> : `⚠ ${result.error}`}
      </span>
    );
  }
  if (column.type === 'rollup') {
    const result = readProperty(page, column, workspace!.pages);
    return (
      <span className="property-computed">
        {Array.isArray(result) ? result.join('、') || '空' : String(result)}
      </span>
    );
  }
  if (column.type === 'relation') {
    const ids = relationIds(page, column, workspace!.pages);
    const related = workspace!.pages.filter((p) => ids.includes(p.id) && !p.trashedAt);
    const choices = workspace!.pages.filter(
      (p) =>
        p.parentId === column.relationTo &&
        !p.trashedAt &&
        !p.templateFor &&
        (isTemplatePage(page, workspace!.pages) || !isTemplatePage(p, workspace!.pages)) &&
        (!column.system || p.id !== page.id) &&
        p.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    );
    const select = (id: string) =>
      change(
        ids.includes(id)
          ? ids.filter((value) => value !== id)
          : column.system === 'parentItem'
            ? [id]
            : [...ids, id],
      );
    return (
      <div className="relation-property">
        {related.map((p) => (
          <button className="relation-link" key={p.id} onClick={() => navigate(p.id)}>
            <PageIcon icon={p.icon} size={13} />
            {p.title || '无标题'}
          </button>
        ))}
        <button
          className="relation-add"
          aria-label={column.name}
          disabled={disabled}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setPicker({ x: rect.left, y: rect.bottom + 4 });
            setQuery('');
          }}
        >
          {related.length ? <Plus size={13} /> : '空'}
        </button>
        {picker && (
          <Popover {...picker} onClose={() => setPicker(null)} width={310}>
            <div className="picker-heading">
              关联到 {workspace!.pages.find((p) => p.id === column.relationTo)?.title || '数据库'}
            </div>
            <input
              className="menu-search"
              placeholder="搜索关联页面…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {choices.map((p) => (
              <MenuItem
                key={p.id}
                checked={ids.includes(p.id)}
                icon={<PageIcon icon={p.icon} size={15} />}
                onClick={() => select(p.id)}
              >
                {p.title || '无标题'}
              </MenuItem>
            ))}
            {query.trim() && column.relationTo && (
              <MenuItem
                icon={<Plus size={14} />}
                onClick={() => {
                  const record = create({ parentId: column.relationTo, title: query.trim() }, false);
                  select(record.id);
                  setQuery('');
                }}
              >
                新建「{query.trim()}」
              </MenuItem>
            )}
            <div className="menu-divider" />
            <MenuItem
              onClick={() => {
                change([]);
                setPicker(null);
              }}
            >
              清空关联
            </MenuItem>
          </Popover>
        )}
      </div>
    );
  }
  if (column.type === 'checkbox')
    return (
      <input
        aria-label={column.name}
        className="property-checkbox"
        type="checkbox"
        disabled={disabled}
        checked={!!value}
        onChange={(e) => change(e.target.checked)}
      />
    );
  if (isSelectProperty(column) || column.type === 'multiSelect') {
    const selected = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : value
        ? [String(value)]
        : [];
    const choose = (option: string) => {
      if (column.type === 'multiSelect')
        change(selected.includes(option) ? selected.filter((v) => v !== option) : [...selected, option]);
      else {
        change(option);
        setPicker(null);
      }
    };
    return (
      <>
        <button
          className="property-select"
          aria-label={column.name}
          disabled={disabled}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setPicker({ x: rect.left, y: rect.bottom + 4 });
            setQuery('');
          }}
        >
          {selected.length ? (
            selected.map((option) => (
              <Tag key={option} value={option} options={column.options} column={column} />
            ))
          ) : (
            <span className="property-empty">空</span>
          )}
        </button>
        {picker && (
          <Popover {...picker} onClose={() => setPicker(null)}>
            <input
              className="menu-search"
              placeholder="选择或创建选项…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {(column.type === 'status' ? statusGroupOrder : [undefined]).map((group) => (
              <div key={group || 'options'}>
                {group && <div className="picker-heading">{statusGroupNames[group]}</div>}
                {(group ? column.statusGroups?.[group] || [] : column.options || [])
                  .filter((o) => o.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
                  .map((option) => (
                    <MenuItem key={option} checked={selected.includes(option)} onClick={() => choose(option)}>
                      <Tag value={option} options={column.options} column={column} />
                    </MenuItem>
                  ))}
              </div>
            ))}
            {column.type !== 'status' &&
              query.trim() &&
              !column.options?.includes(query.trim()) &&
              onOptionsChange && (
                <MenuItem
                  icon={<Plus size={14} />}
                  onClick={() => {
                    onOptionsChange([...(column.options || []), query.trim()]);
                    choose(query.trim());
                    setQuery('');
                  }}
                >
                  创建「{query.trim()}」
                </MenuItem>
              )}
            <div className="menu-divider" />
            {column.type !== 'status' && (
              <MenuItem
                icon={<X size={14} />}
                onClick={() => {
                  change(column.type === 'multiSelect' ? [] : '');
                  setPicker(null);
                }}
              >
                清空
              </MenuItem>
            )}
          </Popover>
        )}
      </>
    );
  }
  if (['url', 'email', 'phone'].includes(column.type))
    return (
      <div className="property-contact">
        <input
          className="property-input"
          aria-label={column.name}
          placeholder="空"
          disabled={disabled}
          type={column.type === 'email' ? 'email' : column.type === 'phone' ? 'tel' : 'text'}
          value={String(value || '')}
          onChange={(event) => change(event.target.value)}
        />
        {value && (
          <button
            aria-label={`打开${column.name}`}
            type="button"
            onClick={() => {
              const url =
                column.type === 'email'
                  ? `mailto:${value}`
                  : column.type === 'phone'
                    ? `tel:${value}`
                    : String(value);
              if (window.native) void window.native.openExternal(url);
              else window.open(url, '_blank', 'noopener,noreferrer');
            }}
          >
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>
    );
  return (
    <input
      className="property-input"
      aria-label={column.name}
      type={column.type === 'number' ? 'number' : 'text'}
      placeholder="空"
      disabled={disabled}
      value={typeof value === 'string' || typeof value === 'number' ? value : ''}
      onChange={(e) =>
        change(column.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)
      }
    />
  );
}

export function PropertyEditor({
  column,
  page,
  onSave,
  onDelete,
  onClose,
}: {
  column: Property;
  page: Page;
  onSave: (p: Property, renames?: Record<string, string>) => void | boolean;
  onDelete?: () => void | boolean;
  onClose: () => void;
}) {
  const { workspace, setModal } = useWorkspace();
  const [formula, setFormula] = useState(column.formula || '');
  const [editingFormula, setEditingFormula] = useState(false);
  const [name, setName] = useState(column.name);
  const [type, setType] = useState(column.type);
  const optionDrafts = (property: Property) =>
    (property.options || []).map((name, index) => ({
      id: String(index),
      original: name,
      name,
      group: statusGroup(property, name),
      color:
        property.optionColors?.[name] ||
        (property.type === 'status'
          ? { todo: 'gray', doing: 'blue', done: 'green' }[statusGroup(property, name)]
          : tagTone(name, index)),
    }));
  const [optionRows, setOptionRows] = useState(optionDrafts(column));
  const [initialStatus, setInitialStatus] = useState(column.defaultStatus || '');
  const [idPrefix, setIdPrefix] = useState(
    column.idPrefix ??
      page.title
        .replace(/[^\p{L}\p{N}_-]/gu, '')
        .slice(0, 10)
        .toUpperCase(),
  );
  const [singlePerson, setSinglePerson] = useState(column.personLimit === 1);
  const [relationTo, setRelationTo] = useState(column.relationTo || page.id);
  const [relationProperty, setRelationProperty] = useState(
    column.relationProperty || page.database!.columns.find((c) => c.type === 'relation')?.id || '',
  );
  const [targetProperty, setTargetProperty] = useState(column.targetProperty || 'title');
  const [calculation, setCalculation] = useState<Property['calculation']>(column.calculation || 'count');
  const targetId = page.database!.columns.find((c) => c.id === relationProperty)?.relationTo;
  const target = workspace!.pages.find((p) => p.id === targetId);
  return (
    <>
      <Modal title="编辑属性" onClose={onClose} className="property-modal">
        <form
          className="modal-body"
          onSubmit={(e) => {
            e.preventDefault();
            const renames = Object.fromEntries(
              optionRows
                .filter((row) => row.original && row.original !== row.name.trim())
                .map((row) => [row.original, row.name.trim()]),
            );
            const names = optionRows.map((row) => row.name.trim()).filter(Boolean);
            const saved = onSave(
              {
                ...column,
                name: name.trim() || '属性',
                type,
                options: names,
                optionColors: Object.fromEntries(optionRows.map((row) => [row.name.trim(), row.color])),
                statusGroups:
                  type === 'status'
                    ? (Object.fromEntries(
                        statusGroupOrder.map((group) => [
                          group,
                          optionRows
                            .filter((row) => row.group === group)
                            .map((row) => row.name.trim())
                            .filter(Boolean),
                        ]),
                      ) as Record<StatusGroup, string[]>)
                    : undefined,
                defaultStatus: renames[initialStatus] || initialStatus,
                idPrefix,
                personLimit: singlePerson ? 1 : undefined,
                relationTo,
                relationProperty,
                targetProperty,
                calculation,
                formula,
              },
              renames,
            );
            if (saved !== false) {
              onClose();
              if (type === 'button') setModal({ type: 'button', pageId: page.id, propertyId: column.id });
            }
          }}
        >
          <label className="field-label">
            属性名称
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="属性名称" />
          </label>
          <label className="field-label">
            属性类型
            <AppSelect
              aria-label="属性类型"
              disabled={!!column.system}
              value={type}
              onChange={(e) => {
                const next = e.target.value as PropertyType;
                setType(next);
                if (next === 'status') {
                  const normalized = normalizeProperty({
                    ...column,
                    type: next,
                    options: optionRows.map((row) => row.name),
                    statusGroups: undefined,
                  });
                  setOptionRows(optionDrafts(normalized));
                  setInitialStatus(normalized.defaultStatus || '');
                }
              }}
            >
              {propertyTypes.map((p) => (
                <option key={p.type} value={p.type}>
                  {p.label}
                </option>
              ))}
            </AppSelect>
          </label>
          {['select', 'multiSelect', 'status'].includes(type) && (
            <div className="option-settings">
              <label className="field-label">{type === 'status' ? '状态选项与分组' : '选项与颜色'}</label>
              {optionRows.map((row, index) => (
                <div className="option-setting-row" key={row.id}>
                  <input
                    aria-label={`选项名称 ${index + 1}`}
                    value={row.name}
                    placeholder="选项名称"
                    onChange={(event) =>
                      setOptionRows(
                        optionRows.map((value) =>
                          value.id === row.id ? { ...value, name: event.target.value } : value,
                        ),
                      )
                    }
                  />
                  {type === 'status' && (
                    <AppSelect
                      aria-label={`状态分组 ${index + 1}`}
                      value={row.group}
                      onChange={(event) =>
                        setOptionRows(
                          optionRows.map((value) =>
                            value.id === row.id
                              ? { ...value, group: event.target.value as StatusGroup }
                              : value,
                          ),
                        )
                      }
                    >
                      {statusGroupOrder.map((group) => (
                        <option key={group} value={group}>
                          {statusGroupNames[group]}
                        </option>
                      ))}
                    </AppSelect>
                  )}
                  <AppSelect
                    aria-label={`选项颜色 ${index + 1}`}
                    value={row.color}
                    onChange={(event) =>
                      setOptionRows(
                        optionRows.map((value) =>
                          value.id === row.id ? { ...value, color: event.target.value } : value,
                        ),
                      )
                    }
                  >
                    {propertyColors.map((color) => (
                      <option key={color} value={color}>
                        {
                          (
                            {
                              gray: '灰',
                              brown: '棕',
                              orange: '橙',
                              yellow: '黄',
                              green: '绿',
                              blue: '蓝',
                              purple: '紫',
                              pink: '粉',
                              red: '红',
                            } as Record<string, string>
                          )[color]
                        }
                      </option>
                    ))}
                  </AppSelect>
                  <button
                    type="button"
                    aria-label="上移选项"
                    disabled={!index}
                    onClick={() => {
                      const next = [...optionRows];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      setOptionRows(next);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="下移选项"
                    disabled={index === optionRows.length - 1}
                    onClick={() => {
                      const next = [...optionRows];
                      [next[index + 1], next[index]] = [next[index], next[index + 1]];
                      setOptionRows(next);
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label="删除选项"
                    onClick={() => setOptionRows(optionRows.filter((value) => value.id !== row.id))}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setOptionRows([
                    ...optionRows,
                    { id: crypto.randomUUID(), original: '', name: '', group: 'todo', color: 'gray' },
                  ])
                }
              >
                <Plus size={13} />
                添加选项
              </button>
              {type === 'status' && (
                <label className="field-label">
                  默认状态
                  <AppSelect
                    aria-label="默认状态"
                    value={initialStatus}
                    onChange={(event) => setInitialStatus(event.target.value)}
                  >
                    {optionRows.map((row) => (
                      <option key={row.id} value={row.name}>
                        {row.name}
                      </option>
                    ))}
                  </AppSelect>
                </label>
              )}
            </div>
          )}
          {type === 'uniqueId' && (
            <label className="field-label">
              编号前缀
              <input
                aria-label="编号前缀"
                value={idPrefix}
                onChange={(event) => setIdPrefix(event.target.value)}
              />
              <small>自动从 1 编号；删除记录后不复用编号。</small>
            </label>
          )}
          {type === 'person' && (
            <label className="setting-checkbox">
              <input
                type="checkbox"
                checked={singlePerson}
                onChange={(event) => setSinglePerson(event.target.checked)}
              />
              只允许选择一人
            </label>
          )}
          {['createdTime', 'editedTime', 'createdBy', 'editedBy'].includes(type) && (
            <p className="muted">此属性由系统自动填写，记录中不可手动修改。</p>
          )}
          {type === 'formula' && (
            <div className="property-formula-summary">
              <code>{formula || '尚未设置公式'}</code>
              <button type="button" className="secondary-button" onClick={() => setEditingFormula(true)}>
                编辑公式
              </button>
            </div>
          )}
          {type === 'relation' && (
            <label className="field-label">
              关联的数据库
              <AppSelect
                aria-label="关联的数据库"
                disabled={!!column.system}
                value={relationTo}
                onChange={(e) => setRelationTo(e.target.value)}
              >
                {workspace!.pages
                  .filter((p) => p.database && !p.trashedAt)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title || '无标题'}
                    </option>
                  ))}
              </AppSelect>
            </label>
          )}
          {type === 'rollup' && (
            <>
              <label className="field-label">
                关联属性
                <AppSelect
                  aria-label="关联属性"
                  value={relationProperty}
                  onChange={(e) => setRelationProperty(e.target.value)}
                >
                  <option value="">选择一个关联属性</option>
                  {page
                    .database!.columns.filter((c) => c.type === 'relation')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </AppSelect>
              </label>
              <label className="field-label">
                目标属性
                <AppSelect
                  aria-label="目标属性"
                  value={targetProperty}
                  onChange={(e) => setTargetProperty(e.target.value)}
                >
                  <option value="title">名称</option>
                  {target?.database?.columns
                    .filter((c) => !['rollup', 'relation'].includes(c.type))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </AppSelect>
              </label>
              <label className="field-label">
                计算方式
                <AppSelect
                  aria-label="计算方式"
                  value={calculation}
                  onChange={(e) => setCalculation(e.target.value as Property['calculation'])}
                >
                  {[
                    ['count', '计数'],
                    ['show', '显示原始值'],
                    ['sum', '求和'],
                    ['average', '平均值'],
                    ['min', '最小值'],
                    ['max', '最大值'],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </AppSelect>
              </label>
            </>
          )}
          <div className="modal-actions">
            {onDelete && (
              <button
                type="button"
                className="text-button danger"
                onClick={() => {
                  if (onDelete() !== false) onClose();
                }}
              >
                <Trash2 size={14} />
                删除属性
              </button>
            )}
            <button
              type="submit"
              className="primary-button"
              disabled={type === 'rollup' && !relationProperty}
            >
              完成
            </button>
          </div>
        </form>
      </Modal>
      {editingFormula && (
        <FormulaEditor
          page={page}
          column={{ ...column, name, type: 'formula', formula }}
          onSave={setFormula}
          onClose={() => setEditingFormula(false)}
        />
      )}
    </>
  );
}
