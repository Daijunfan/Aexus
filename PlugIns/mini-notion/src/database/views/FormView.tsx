import { isSelectProperty, isReadOnlyProperty } from '../propertySchema';
import { useState } from 'react';
import { Check, ClipboardList, Settings2 } from 'lucide-react';
import { useWorkspace } from '../../store';
import type { Page } from '../../types';
import type { ViewProps } from './types';
import { DateInput } from '../DateInput';
import { defaultTemplateId } from '../templatesModel';
import { PeoplePicker } from '../PeoplePicker';
import { FilesPicker } from '../FilesPicker';

export function FormView({ page, view, columns, updateView }: ViewProps) {
  const { create } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [sent, setSent] = useState(false);
  const [title, setTitle] = useState('');
  const [values, setValues] = useState<Page['values']>({});
  const [pendingUploads, setPendingUploads] = useState(0);
  const fields = columns.filter((c) => !isReadOnlyProperty(c) && c.type !== 'relation');
  const change = (id: string, value: Page['values'][string]) =>
    setValues((values) => ({ ...values, [id]: value }));
  return (
    <div className="form-view">
      <div className="form-toolbar">
        <span>
          <ClipboardList size={16} />
          本地表单 · 提交后创建数据库记录
        </span>
        <button className="secondary-button" onClick={() => setEditing(!editing)}>
          <Settings2 size={14} />
          {editing ? '预览表单' : '编辑表单'}
        </button>
      </div>
      {editing ? (
        <div className="form-designer">
          <label className="field-label">
            表单说明
            <textarea
              value={view.formDescription || ''}
              onChange={(e) => updateView({ formDescription: e.target.value })}
              placeholder="向填写者介绍这份表单…"
            />
          </label>
          <h4>问题设置</h4>
          <div className="form-question-setting">
            <strong>名称</strong>
            <span>必填</span>
          </div>
          {fields.map((column) => (
            <div className="form-question-setting" key={column.id}>
              <strong>{column.name}</strong>
              <label>
                <input
                  type="checkbox"
                  checked={view.formRequired?.includes(column.id) || false}
                  onChange={(e) =>
                    updateView({
                      formRequired: e.target.checked
                        ? [...(view.formRequired || []), column.id]
                        : view.formRequired?.filter((id) => id !== column.id),
                    })
                  }
                />
                必填
              </label>
            </div>
          ))}
          <p className="muted">在视图设置的「属性」中调整问题顺序及显示。</p>
          <label className="field-label">
            提交按钮文字
            <input
              value={view.formSubmitLabel || '提交'}
              onChange={(e) => updateView({ formSubmitLabel: e.target.value })}
            />
          </label>
        </div>
      ) : sent ? (
        <div className="form-success">
          <div>
            <Check size={34} />
          </div>
          <h2>已收到你的提交</h2>
          <p>记录已保存在「{page.title}」数据库中。</p>
          <button
            className="secondary-button"
            onClick={() => {
              setSent(false);
              setTitle('');
              setValues({});
            }}
          >
            再提交一条
          </button>
        </div>
      ) : (
        <form
          className="database-form"
          onSubmit={(e) => {
            e.preventDefault();
            create(
              { parentId: page.id, title: title.trim(), values },
              false,
              defaultTemplateId(page.database!, view),
            );
            setSent(true);
          }}
        >
          <span className="form-icon">{page.icon || '📋'}</span>
          <h1>{view.name === '表单' ? page.title : view.name}</h1>
          {view.formDescription && <p>{view.formDescription}</p>}
          <label className="form-field">
            <span>
              名称 <i>*</i>
            </span>
            <input
              aria-label="名称"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入名称"
            />
          </label>
          {fields.map((column) => (
            <label className="form-field" key={column.id}>
              <span>
                {column.name}
                {view.formRequired?.includes(column.id) && <i> *</i>}
              </span>
              {column.type === 'person' ? (
                <PeoplePicker
                  label={column.name}
                  value={values[column.id]}
                  onChange={(value) => change(column.id, value)}
                  single={column.personLimit === 1}
                />
              ) : column.type === 'files' ? (
                <FilesPicker
                  label={column.name}
                  value={values[column.id]}
                  onChange={(value) => change(column.id, value)}
                  onBusyChange={(busy) => setPendingUploads((count) => count + (busy ? 1 : -1))}
                />
              ) : isSelectProperty(column) ? (
                <select
                  aria-label={column.name}
                  required={view.formRequired?.includes(column.id)}
                  value={String(values[column.id] || '')}
                  onChange={(e) => change(column.id, e.target.value)}
                >
                  <option value="">选择一个选项</option>
                  {column.options?.map((value) => (
                    <option value={value} key={value}>
                      {value}
                    </option>
                  ))}
                </select>
              ) : column.type === 'multiSelect' ? (
                <div className="form-multiselect">
                  {column.options?.map((value) => (
                    <label key={value}>
                      <input
                        type="checkbox"
                        checked={
                          Array.isArray(values[column.id]) && (values[column.id] as string[]).includes(value)
                        }
                        onChange={(e) => {
                          const selected = Array.isArray(values[column.id])
                            ? (values[column.id] as string[])
                            : [];
                          change(
                            column.id,
                            e.target.checked
                              ? [...selected, value]
                              : selected.filter((item) => item !== value),
                          );
                        }}
                      />
                      {value}
                    </label>
                  ))}
                </div>
              ) : column.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  required={view.formRequired?.includes(column.id)}
                  checked={!!values[column.id]}
                  onChange={(e) => change(column.id, e.target.checked)}
                />
              ) : column.type === 'date' ? (
                <DateInput
                  label={column.name}
                  value={values[column.id]}
                  onChange={(value) => change(column.id, value)}
                  required={view.formRequired?.includes(column.id)}
                />
              ) : (
                <input
                  aria-label={column.name}
                  required={view.formRequired?.includes(column.id)}
                  type={
                    column.type === 'number'
                      ? 'number'
                      : column.type === 'url'
                        ? 'url'
                        : column.type === 'email'
                          ? 'email'
                          : column.type === 'phone'
                            ? 'tel'
                            : 'text'
                  }
                  value={String(values[column.id] ?? '')}
                  onChange={(e) =>
                    change(
                      column.id,
                      column.type === 'number' && e.target.value !== ''
                        ? Number(e.target.value)
                        : e.target.value,
                    )
                  }
                />
              )}
            </label>
          ))}
          <button
            className="primary-button"
            type="submit"
            disabled={
              page.locked ||
              pendingUploads > 0 ||
              fields.some(
                (column) =>
                  ['multiSelect', 'person', 'files'].includes(column.type) &&
                  view.formRequired?.includes(column.id) &&
                  !(values[column.id] as string[] | undefined)?.length,
              )
            }
          >
            {view.formSubmitLabel || '提交'}
          </button>
          <div className="form-local-note">数据仅保存在这台 Mac 上</div>
        </form>
      )}
    </div>
  );
}
