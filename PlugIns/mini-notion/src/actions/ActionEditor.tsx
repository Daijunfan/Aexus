import { isSelectProperty, isReadOnlyProperty } from '../database/propertySchema';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, Sigma } from 'lucide-react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { AllSelection } from '@tiptap/pm/state';
import { schema, editorDictionary, saveAsset } from '../components/Editor';
import { EditorPageContext } from '../content/SyncedBlock';
import { useWorkspace } from '../store';
import { IconButton, Popover, MenuItem, PageIcon } from '../ui';
import { DateInput } from '../database/DateInput';
import { FilterEditor } from '../database/ViewSettings';
import { emptyFilters } from '../database/model';
import { flattenBlocks } from '../core/blocks';
import { dateText, isDateValue } from '../database/dateValue';
import { plainText, isInternalPage } from '../model';
import { actionTypes } from './engine';
import type { ActionStep } from './types';
import type { JsonBlock, Property } from '../types';
import { PeoplePicker } from '../database/PeoplePicker';
import { FilesPicker } from '../database/FilesPicker';

const initialValue = (column?: Property) =>
  column?.type === 'checkbox'
    ? false
    : column?.type === 'number'
      ? 0
      : ['multiSelect', 'relation', 'person', 'files'].includes(column?.type || '')
        ? []
        : '';
function RelationValue({
  column,
  value,
  onChange,
  label,
}: {
  column: Property;
  value: unknown;
  onChange: (value: string[]) => void;
  label: string;
}) {
  const { workspace } = useWorkspace();
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);
  const [query, setQuery] = useState('');
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const records = workspace!.pages.filter(
    (page) =>
      page.parentId === column.relationTo && !page.trashedAt && !isInternalPage(page, workspace!.pages),
  );
  return (
    <>
      <button
        className="action-relation-value"
        aria-label={label}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPicker({ x: rect.left, y: rect.bottom + 4 });
          setQuery('');
        }}
      >
        {selected.length
          ? selected.map((id) => records.find((page) => page.id === id)?.title || '已移除页面').join('、')
          : '选择关联页面…'}
      </button>
      {picker && (
        <Popover {...picker} width={310} onClose={() => setPicker(null)}>
          <input
            className="menu-search"
            placeholder="搜索关联页面…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {records
            .filter((page) => page.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
            .map((page) => (
              <MenuItem
                key={page.id}
                checked={selected.includes(page.id)}
                icon={<PageIcon icon={page.icon} size={15} />}
                onClick={() =>
                  onChange(
                    selected.includes(page.id)
                      ? selected.filter((id) => id !== page.id)
                      : column.system === 'parentItem'
                        ? [page.id]
                        : [...selected, page.id],
                  )
                }
              >
                {page.title || '无标题'}
              </MenuItem>
            ))}
          <div className="menu-divider" />
          <MenuItem
            onClick={() => {
              onChange([]);
              setPicker(null);
            }}
          >
            清空关联
          </MenuItem>
        </Popover>
      )}
    </>
  );
}
function ValueEditor({
  value,
  onChange,
  column,
  label,
  onBusyChange,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  column?: Property;
  label: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const formula = !!value && typeof value === 'object' && !Array.isArray(value) && 'formula' in value;
  return (
    <div className="action-value">
      <IconButton
        label={`切换${label}的公式`}
        active={formula}
        onClick={() => onChange(formula ? initialValue(column) : { formula: '' })}
      >
        <Sigma size={14} />
      </IconButton>
      {formula ? (
        <textarea
          aria-label={`${label}公式`}
          rows={2}
          placeholder='例如 prop("次数") + 1'
          value={String((value as any).formula)}
          onChange={(event) => onChange({ formula: event.target.value })}
        />
      ) : column?.type === 'date' ? (
        <DateInput label={label} value={value} onChange={onChange} />
      ) : column?.type === 'person' ? (
        <PeoplePicker label={label} value={value} onChange={onChange} single={column.personLimit === 1} />
      ) : column?.type === 'files' ? (
        <FilesPicker label={label} value={value} onChange={onChange} onBusyChange={onBusyChange} />
      ) : column?.type === 'relation' ? (
        <RelationValue column={column} value={value} onChange={onChange} label={label} />
      ) : column?.type === 'checkbox' ? (
        <input
          aria-label={label}
          type="checkbox"
          checked={!!value}
          onChange={(event) => onChange(event.target.checked)}
        />
      ) : column && isSelectProperty(column) ? (
        <select
          aria-label={label}
          value={String(value || '')}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">空</option>
          {column.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label={label}
          type={column?.type === 'number' ? 'number' : 'text'}
          value={
            Array.isArray(value)
              ? value.join(', ')
              : typeof value === 'object' && value !== null
                ? JSON.stringify(value)
                : String(value ?? '')
          }
          placeholder={column?.type === 'multiSelect' ? '选项，用逗号分隔' : '输入内容'}
          onChange={(event) =>
            onChange(
              column?.type === 'number'
                ? event.target.value === ''
                  ? ''
                  : Number(event.target.value)
                : column?.type === 'multiSelect'
                  ? event.target.value
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean)
                  : event.target.value,
            )
          }
        />
      )}
    </div>
  );
}
function DraftBlocks({
  blocks,
  onChange,
  theme,
}: {
  blocks: JsonBlock[];
  onChange: (blocks: JsonBlock[]) => void;
  theme: 'light' | 'dark';
}) {
  const editor = useCreateBlockNote({
    schema,
    dictionary: editorDictionary,
    initialContent: blocks.length ? (blocks as any) : undefined,
    uploadFile: saveAsset,
  });
  useEffect(() => {
    const select = () => {
      if (document.activeElement?.closest('.bn-editor') === editor.prosemirrorView.dom) {
        editor.transact((tr) => tr.setSelection(new AllSelection(tr.doc)));
        editor.focus();
      }
    };
    window.addEventListener('mini:select-all', select);
    return () => window.removeEventListener('mini:select-all', select);
  }, [editor]);
  return (
    <EditorPageContext.Provider value={{ pageId: 'action-draft', theme, readOnly: true }}>
      <div className="action-draft-editor">
        <BlockNoteView
          editor={editor}
          theme={theme}
          onChange={() => onChange(editor.document as JsonBlock[])}
        />
      </div>
    </EditorPageContext.Provider>
  );
}
function Assignments({
  step,
  columns,
  onChange,
  onBusyChange,
}: {
  step: ActionStep;
  columns: Property[];
  onChange: (step: ActionStep) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const keys = [
    ...(step.title === undefined ? [] : ['title']),
    ...new Set([...Object.keys(step.values || {}), ...Object.keys(step.operations || {})]),
  ];
  const remove = (id: string) => {
    const next = { ...step, values: { ...step.values }, operations: { ...step.operations } };
    if (id === 'title') delete next.title;
    else {
      delete next.values![id];
      delete next.operations![id];
    }
    onChange(next);
  };
  return (
    <div className="action-assignments">
      {keys.map((id) => {
        const column = columns.find((column) => column.id === id),
          operation = step.operations?.[id] || 'set';
        return (
          <div className="action-assignment" key={id}>
            <div>
              <strong>{id === 'title' ? '名称' : column?.name || `已移除：${id}`}</strong>
              {id !== 'title' && step.type !== 'create' && (
                <select
                  aria-label="属性动作"
                  value={operation}
                  onChange={(event) =>
                    onChange({ ...step, operations: { ...step.operations, [id]: event.target.value as any } })
                  }
                >
                  <option value="set">设为</option>
                  <option value="clear">清空</option>
                  {column?.type === 'checkbox' && <option value="toggle">切换</option>}
                  {['relation', 'multiSelect', 'person', 'files'].includes(column?.type || '') && (
                    <>
                      <option value="add">追加</option>
                      <option value="remove">移除</option>
                    </>
                  )}
                </select>
              )}
              <IconButton label="移除此属性动作" onClick={() => remove(id)}>
                <Trash2 size={13} />
              </IconButton>
            </div>
            {!['clear', 'toggle'].includes(operation) && (
              <ValueEditor
                onBusyChange={onBusyChange}
                column={column}
                label={`${id === 'title' ? '名称' : column?.name || id}动作值`}
                value={id === 'title' ? step.title : step.values?.[id]}
                onChange={(value) =>
                  onChange(
                    id === 'title'
                      ? { ...step, title: value }
                      : { ...step, values: { ...step.values, [id]: value } },
                  )
                }
              />
            )}
          </div>
        );
      })}
      <select
        className="action-add-property"
        aria-label="添加属性动作"
        value=""
        onChange={(event) => {
          const id = event.target.value;
          if (id)
            onChange(
              id === 'title'
                ? { ...step, title: '' }
                : {
                    ...step,
                    values: {
                      ...step.values,
                      [id]: initialValue(columns.find((column) => column.id === id)),
                    },
                  },
            );
        }}
      >
        <option value="">＋ 选择要设置的属性</option>
        {!keys.includes('title') && <option value="title">名称</option>}
        {columns
          .filter((column) => !keys.includes(column.id) && !isReadOnlyProperty(column))
          .map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
            </option>
          ))}
      </select>
    </div>
  );
}
export function ActionEditor({
  steps,
  onChange,
  pageId,
  databaseId,
  automatic = false,
  onBusyChange,
}: {
  steps: ActionStep[];
  onChange: (steps: ActionStep[]) => void;
  pageId: string;
  databaseId?: string;
  automatic?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { workspace } = useWorkspace();
  const pages = workspace!.pages.filter((page) => !page.trashedAt),
    source = pages.find((page) => page.id === pageId);
  const [jsonId, setJsonId] = useState<string | null>(null),
    [json, setJson] = useState(''),
    [jsonError, setJsonError] = useState('');
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const databases = pages.filter((page) => page.database && !isInternalPage(page, workspace!.pages));
  const update = (id: string, next: ActionStep) =>
    onChange(steps.map((step) => (step.id === id ? next : step)));
  return (
    <div className="action-editor">
      {steps.map((step, index) => {
        const previousCreate = steps
          .slice(0, index)
          .filter((step) => step.type === 'create')
          .at(-1);
        const targetPage =
          step.target && step.target !== 'current' && step.target !== 'created'
            ? pages.find((page) => page.id === step.target)
            : source;
        const ownerId = ['create', 'edit'].includes(step.type)
          ? step.databaseId
          : step.target === 'created'
            ? previousCreate?.databaseId
            : targetPage?.parentId || databaseId;
        const owner = pages.find((page) => page.id === ownerId),
          columns = owner?.database?.columns || [];
        const targetPicker = ['set', 'insert', 'reminder', 'open', 'trash'].includes(step.type);
        return (
          <section className="action-step" key={step.id} data-action-id={step.id}>
            <header>
              <span>{index + 1}</span>
              <select
                aria-label="动作类型"
                value={step.type}
                onChange={(event) =>
                  update(step.id, {
                    id: step.id,
                    type: event.target.value as ActionStep['type'],
                    ...(['create', 'edit'].includes(event.target.value)
                      ? { databaseId: databaseId || databases[0]?.id }
                      : {}),
                    ...(event.target.value === 'insert'
                      ? { blocks: [{ type: 'paragraph', content: '' }], position: 'end' }
                      : {}),
                  })
                }
              >
                {Object.entries(actionTypes)
                  .filter(([type]) => !automatic || type !== 'open')
                  .map(([type, name]) => (
                    <option key={type} value={type}>
                      {name}
                    </option>
                  ))}
              </select>
              <IconButton
                label="上移动作"
                disabled={!index}
                onClick={() => {
                  const next = [...steps];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  onChange(next);
                }}
              >
                <ArrowUp size={13} />
              </IconButton>
              <IconButton
                label="下移动作"
                disabled={index === steps.length - 1}
                onClick={() => {
                  const next = [...steps];
                  [next[index + 1], next[index]] = [next[index], next[index + 1]];
                  onChange(next);
                }}
              >
                <ArrowDown size={13} />
              </IconButton>
              <IconButton
                label="删除动作"
                onClick={() => onChange(steps.filter((value) => value.id !== step.id))}
              >
                <Trash2 size={13} />
              </IconButton>
            </header>
            {targetPicker && (
              <label className="action-field">
                目标页面
                <select
                  aria-label="动作目标页面"
                  value={step.target || 'current'}
                  onChange={(event) => update(step.id, { ...step, target: event.target.value })}
                >
                  <option value="current">当前页面 / 触发页面</option>
                  {previousCreate && <option value="created">此前新建的页面</option>}
                  {pages
                    .filter((page) => !isInternalPage(page, workspace!.pages))
                    .map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.title || '无标题'}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {['create', 'edit'].includes(step.type) && (
              <label className="action-field">
                目标数据库
                <select
                  aria-label="动作目标数据库"
                  value={step.databaseId || ''}
                  onChange={(event) =>
                    update(step.id, { ...step, databaseId: event.target.value, values: {}, operations: {} })
                  }
                >
                  <option value="">选择数据库…</option>
                  {databases.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.title || '无标题'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {step.type === 'create' && (
              <label className="action-field">
                页面模板
                <select
                  aria-label="动作页面模板"
                  value={step.templateId || ''}
                  onChange={(event) =>
                    update(step.id, { ...step, templateId: event.target.value || undefined })
                  }
                >
                  <option value="">使用数据库默认模板</option>
                  <option value="none">空白页面</option>
                  {pages
                    .filter((page) => page.templateFor === step.databaseId)
                    .map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.title || '无标题模板'}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {step.type === 'edit' && owner?.database && (
              <details className="action-filter">
                <summary>筛选要修改的页面</summary>
                <FilterEditor
                  database={owner.database}
                  group={step.filters || emptyFilters()}
                  onChange={(filters) => update(step.id, { ...step, filters })}
                />
                <label className="action-field">
                  可选公式条件
                  <input
                    aria-label="动作筛选公式"
                    placeholder='current.prop("项目") == trigger.prop("项目")'
                    value={step.filterFormula || ''}
                    onChange={(event) => update(step.id, { ...step, filterFormula: event.target.value })}
                  />
                </label>
              </details>
            )}
            {['set', 'create', 'edit'].includes(step.type) && (
              <Assignments
                step={step}
                columns={columns}
                onChange={(next) => update(step.id, next)}
                onBusyChange={onBusyChange}
              />
            )}
            {step.type === 'variable' && (
              <>
                <label className="action-field">
                  变量名
                  <input
                    aria-label="动作变量名"
                    value={step.name || ''}
                    onChange={(event) => update(step.id, { ...step, name: event.target.value })}
                  />
                </label>
                <ValueEditor
                  label="变量值"
                  value={step.value}
                  onChange={(value) => update(step.id, { ...step, value })}
                />
              </>
            )}
            {(step.type === 'notify' || step.type === 'reminder') && (
              <>
                <label className="action-field">内容</label>
                <ValueEditor
                  label="通知内容"
                  value={step.text}
                  onChange={(text) => update(step.id, { ...step, text })}
                />
              </>
            )}
            {step.type === 'reminder' && (
              <>
                <label className="action-field">提醒时刻（ISO 时间或公式）</label>
                <ValueEditor
                  label="提醒时刻"
                  value={step.at}
                  onChange={(at) => update(step.id, { ...step, at })}
                />
              </>
            )}
            {step.type === 'open' && (
              <label className="action-field">
                打开方式
                <select
                  aria-label="动作打开方式"
                  value={step.mode || 'full'}
                  onChange={(event) => update(step.id, { ...step, mode: event.target.value as any })}
                >
                  <option value="full">完整页面</option>
                  <option value="side">侧边预览</option>
                  <option value="center">居中预览</option>
                </select>
              </label>
            )}
            {step.type === 'insert' && (
              <>
                <div className="action-insert-controls">
                  <select
                    aria-label="插入内容位置"
                    value={step.position || 'end'}
                    onChange={(event) => update(step.id, { ...step, position: event.target.value as any })}
                  >
                    <option value="end">页面底部</option>
                    <option value="start">页面顶部</option>
                    <option value="beforeButton">按钮之前</option>
                    <option value="afterButton">按钮之后</option>
                  </select>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      if (jsonId === step.id) {
                        try {
                          const blocks = JSON.parse(json);
                          if (!Array.isArray(blocks)) throw Error('需要块数组');
                          update(step.id, { ...step, blocks });
                          setJsonId(null);
                          setJsonError('');
                        } catch (error) {
                          setJsonError(String(error));
                        }
                      } else {
                        setJsonId(step.id);
                        setJson(JSON.stringify(step.blocks || [], null, 2));
                      }
                    }}
                  >
                    {jsonId === step.id ? '应用 JSON' : '编辑 JSON'}
                  </button>
                </div>
                {jsonId === step.id ? (
                  <textarea
                    className="action-json"
                    aria-label="插入块 JSON"
                    rows={7}
                    value={json}
                    onChange={(event) => setJson(event.target.value)}
                  />
                ) : (
                  <DraftBlocks
                    key={`${step.id}-content`}
                    theme={theme}
                    blocks={step.blocks || []}
                    onChange={(blocks) => update(step.id, { ...step, blocks })}
                  />
                )}{' '}
                {jsonError && <p className="action-error">{jsonError}</p>}
              </>
            )}
          </section>
        );
      })}
      <button
        type="button"
        className="action-add secondary-button"
        onClick={() => onChange([...steps, { id: crypto.randomUUID(), type: 'set', values: {} }])}
      >
        <Plus size={15} />
        添加动作
      </button>
      <p className="action-hint">
        公式可使用 prop("属性")、trigger、current、created、triggerTime，以及前面定义的变量。
      </p>
    </div>
  );
}
export function ActionPreview({ preview }: { preview: any }) {
  const { workspace } = useWorkspace();
  const format = (value: any) =>
    isDateValue(value)
      ? dateText(value)
      : Array.isArray(value)
        ? value.join('、')
        : value === undefined || value === null || value === ''
          ? '空'
          : typeof value === 'boolean'
            ? value
              ? '已勾选'
              : '未勾选'
            : String(value);
  const messages = (preview.changes?.meta?.after?.inbox || []).filter(
    (item: any) => !(preview.changes?.meta?.before?.inbox || []).some((old: any) => old.id === item.id),
  );
  return (
    <div className="action-preview">
      <strong>将影响 {preview.changes?.pages?.length || 0} 个页面</strong>
      {preview.changes?.pages?.map((change: any) => {
        const page = change.after || change.before,
          columns = workspace!.pages.find((owner) => owner.id === page.parentId)?.database?.columns || [];
        const before = new Map(
          flattenBlocks(change.before?.blocks || []).map((item) => [item.block.id, item.block]),
        );
        const changedBlocks = flattenBlocks(change.after?.blocks || []).filter(
          (item) => JSON.stringify(before.get(item.block.id)) !== JSON.stringify(item.block),
        );
        return (
          <div key={change.id}>
            <span>
              {!change.before
                ? '新建'
                : !change.after || (change.after.trashedAt && !change.before?.trashedAt)
                  ? '移除'
                  : '修改'}
            </span>
            <b>{page.title || '无标题'}</b>
            {Object.entries(change.after?.values || {})
              .filter(([id, value]) => JSON.stringify(value) !== JSON.stringify(change.before?.values?.[id]))
              .map(([id, value]) => (
                <small key={id}>
                  {columns.find((column) => column.id === id)?.name || id}：
                  {format(change.before?.values?.[id])} → {format(value)}
                </small>
              ))}
            {changedBlocks.length > 0 && (
              <small className="action-preview-content">
                {plainText(changedBlocks.map((item) => item.block)).slice(0, 600)}
              </small>
            )}
          </div>
        );
      })}
      {messages.map((item: any) => (
        <p key={item.id}>通知：{item.text}</p>
      ))}
      {preview.effects?.map((effect: any, index: number) => (
        <p key={index}>
          打开：
          {preview.changes?.pages?.find((change: any) => change.id === effect.pageId)?.after?.title ||
            workspace!.pages.find((page) => page.id === effect.pageId)?.title ||
            effect.pageId}
        </p>
      ))}
    </div>
  );
}
