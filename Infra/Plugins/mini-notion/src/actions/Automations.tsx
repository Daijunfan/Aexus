import {AppSelect} from '../components/AppSelect';
import { useState } from 'react';
import { ArrowLeft, Zap, Pause, Play, Plus, Settings2, Trash2 } from 'lucide-react';
import { useWorkspace } from '../store';
import { IconButton, Modal } from '../ui';
import { emptyFilters, getViews } from '../database/model';
import { FilterEditor } from '../database/ViewSettings';
import { defaultRule } from '../scheduling/commands';
import { ScheduleFields } from '../scheduling/ScheduleFields';
import { repeatLabel } from '../scheduling/recurrence';
import { isTemplatePage } from '../model';
import { validateAutomation } from './commands';
import { ActionEditor, ActionPreview } from './ActionEditor';
import { isReadOnlyProperty } from '../database/propertySchema';
import type { DatabaseAutomation } from './types';

export function Automations() {
  const { workspace, modal, setModal, api, command, retrySave, notify } = useWorkspace();
  const owner = workspace!.pages.find((page) => page.id === modal?.pageId)!;
  const [pendingUploads, setPendingUploads] = useState(0);
  const [draft, setDraft] = useState<DatabaseAutomation | null>(null),
    [contextId, setContextId] = useState(''),
    [preview, setPreview] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  if (!owner?.database) return null;
  const rows = workspace!.pages.filter(
      (page) => page.parentId === owner.id && !page.trashedAt && !isTemplatePage(page, workspace!.pages),
    ),
    rules = owner.database.automations || [];
  const invoke = (method: string, params: any) =>
    window.native ? api(method, params) : Promise.resolve(command(method, params));
  const edit = (rule: DatabaseAutomation) => {
    setDraft(structuredClone(rule));
    setContextId(rows[0]?.id || '');
    setPreview(null);
    setError('');
  };
  const change = (changes: Partial<DatabaseAutomation>) => {
    setDraft({ ...draft!, ...changes });
    setPreview(null);
  };
  const validation = () => {
    try {
      if (draft) validateAutomation(draft);
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  const act = async (method: string, rule: DatabaseAutomation) => {
    setBusy(true);
    try {
      await retrySave();
      await invoke(method, {
        databaseId: owner.id,
        automationId: rule.id,
        pageId: rule.schedule ? owner.id : contextId || rows[0]?.id,
      });
    } catch (error) {
      notify(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="数据库自动化" onClose={() => setModal(null)} wide className="automation-dialog">
      <div className="modal-body">
        {!draft ? (
          <>
            <div className="automation-heading">
              <div>
                <strong>{owner.title || '无标题数据库'}</strong>
                <p>满足触发条件时，自动执行一组动作。</p>
              </div>
              <button
                className="primary-button"
                disabled={owner.locked}
                onClick={() =>
                  edit({
                    id: crypto.randomUUID(),
                    name: '新自动化',
                    enabled: true,
                    triggers: [{ id: crypto.randomUUID(), type: 'created' }],
                    triggerMode: 'any',
                    actions: [{ id: crypto.randomUUID(), type: 'set', values: {} }],
                  })
                }
              >
                <Plus size={14} />
                新建自动化
              </button>
            </div>
            <div className="automation-list">
              {rules.length ? (
                rules.map((rule) => (
                  <article key={rule.id} className="automation-row">
                    <Zap size={17} />
                    <button onClick={() => edit(rule)}>
                      <strong>{rule.name}</strong>
                      <small>
                        {rule.schedule
                          ? repeatLabel(rule.schedule)
                          : rule.triggers
                              .map((trigger) =>
                                trigger.type === 'created'
                                  ? '记录新增'
                                  : `${trigger.propertyId === 'title' ? '名称' : owner.database!.columns.find((column) => column.id === trigger.propertyId)?.name || '已移除属性'}变化`,
                              )
                              .join(rule.triggerMode === 'all' ? ' 且 ' : ' 或 ')}{' '}
                        · {rule.actions.length} 个动作 · {rule.enabled ? '已启用' : '已暂停'}
                      </small>
                      {rule.disabledReason && <small className="action-error">{rule.disabledReason}</small>}
                      {workspace!.automationClocks?.[rule.id]?.error && (
                        <small className="action-error">{workspace!.automationClocks[rule.id].error}</small>
                      )}
                    </button>
                    <IconButton
                      label={rule.enabled ? '暂停自动化' : '恢复自动化'}
                      disabled={busy}
                      onClick={() => void act(rule.enabled ? 'automation.pause' : 'automation.resume', rule)}
                    >
                      {rule.enabled ? <Pause size={15} /> : <Play size={15} />}
                    </IconButton>
                    <IconButton label="编辑自动化" disabled={owner.locked} onClick={() => edit(rule)}>
                      <Settings2 size={15} />
                    </IconButton>
                    <IconButton
                      label="删除自动化"
                      disabled={owner.locked || busy}
                      onClick={() => void act('automation.delete', rule)}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </article>
                ))
              ) : (
                <div className="schedule-empty">
                  <Zap size={30} />
                  <p>例如：标记完成时，记录完成时间并创建后续任务。</p>
                </div>
              )}
            </div>
            <button
              className="text-button"
              onClick={() => setModal({ type: 'action-history', ownerId: owner.id })}
            >
              查看执行记录
            </button>
          </>
        ) : (
          <>
            <div className="automation-edit-heading">
              <IconButton label="返回自动化列表" onClick={() => setDraft(null)}>
                <ArrowLeft size={16} />
              </IconButton>
              <input
                aria-label="自动化名称"
                value={draft.name}
                onChange={(event) => change({ name: event.target.value })}
              />
              <label>
                <input
                  type="checkbox"
                  aria-label="启用自动化"
                  checked={draft.enabled}
                  onChange={(event) => change({ enabled: event.target.checked })}
                />
                启用
              </label>
            </div>
            <h4>当</h4>
            <AppSelect
              aria-label="自动化触发方式"
              value={draft.schedule ? 'schedule' : 'change'}
              onChange={(event) =>
                change(
                  event.target.value === 'schedule'
                    ? { schedule: defaultRule(), triggers: [] }
                    : { schedule: undefined, triggers: [{ id: crypto.randomUUID(), type: 'created' }] },
                )
              }
            >
              <option value="change">数据变化时</option>
              <option value="schedule">按时间重复</option>
            </AppSelect>
            {draft.schedule ? (
              <div className="automation-schedule">
                <ScheduleFields
                  rule={draft.schedule}
                  onChange={(value) => change({ schedule: { ...draft.schedule!, ...value } })}
                />
              </div>
            ) : (
              <>
                <div className="automation-triggers">
                  <AppSelect
                    aria-label="触发组合"
                    value={draft.triggerMode || 'any'}
                    onChange={(event) => change({ triggerMode: event.target.value as any })}
                  >
                    <option value="any">任一条件发生</option>
                    <option value="all">全部条件发生</option>
                  </AppSelect>
                  {draft.triggers.map((trigger) => (
                    <div className="automation-trigger" key={trigger.id}>
                      <AppSelect
                        aria-label="自动化触发条件"
                        value={trigger.type === 'created' ? 'created' : trigger.propertyId || 'title'}
                        onChange={(event) =>
                          change({
                            triggers: draft.triggers.map((value) =>
                              value.id === trigger.id
                                ? {
                                    ...value,
                                    type: event.target.value === 'created' ? 'created' : 'property',
                                    propertyId:
                                      event.target.value === 'created' ? undefined : event.target.value,
                                  }
                                : value,
                            ),
                          })
                        }
                      >
                        <option value="created">记录新增</option>
                        <option value="title">名称变化</option>
                        {owner
                          .database!.columns.filter((column) => !isReadOnlyProperty(column))
                          .map((column) => (
                            <option key={column.id} value={column.id}>
                              {column.name}变化
                            </option>
                          ))}
                      </AppSelect>
                      <IconButton
                        label="删除触发条件"
                        onClick={() =>
                          change({ triggers: draft.triggers.filter((value) => value.id !== trigger.id) })
                        }
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </div>
                  ))}
                  <button
                    className="text-button"
                    onClick={() =>
                      change({
                        triggers: [
                          ...draft.triggers,
                          { id: crypto.randomUUID(), type: 'property', propertyId: 'title' },
                        ],
                      })
                    }
                  >
                    <Plus size={13} />
                    添加触发条件
                  </button>
                  {draft.triggerMode === 'all' && <p className="action-hint">各条件需在约 3 秒内发生。</p>}
                </div>
                <details className="action-filter">
                  <summary>只对满足条件的记录执行</summary>
                  <FilterEditor
                    database={owner.database!}
                    group={draft.filters || emptyFilters()}
                    onChange={(filters) => change({ filters })}
                  />
                  <label className="action-field">
                    限定视图
                    <AppSelect
                      aria-label="自动化限定视图"
                      value={draft.viewId || ''}
                      onChange={(event) => change({ viewId: event.target.value || undefined })}
                    >
                      <option value="">整个数据库</option>
                      {getViews(owner.database!).map((view) => (
                        <option key={view.id} value={view.id}>
                          {view.name}
                        </option>
                      ))}
                    </AppSelect>
                  </label>
                </details>
              </>
            )}
            <h4>执行</h4>
            <ActionEditor
              onBusyChange={(busy) => setPendingUploads((count) => count + (busy ? 1 : -1))}
              steps={draft.actions}
              onChange={(actions) => change({ actions })}
              pageId={draft.schedule ? owner.id : contextId || owner.id}
              databaseId={owner.id}
              automatic
            />
            {!draft.schedule && (
              <label className="action-field">
                预览使用的记录
                <AppSelect
                  aria-label="自动化预览记录"
                  value={contextId}
                  onChange={(event) => setContextId(event.target.value)}
                >
                  <option value="">选择记录…</option>
                  {rows.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.title || '无标题'}
                    </option>
                  ))}
                </AppSelect>
              </label>
            )}
            {(error || validation()) && (
              <p className="action-error" role="alert">
                {error || validation()}
              </p>
            )}
            {preview && <ActionPreview preview={preview} />}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy || pendingUploads > 0 || !!validation() || (!draft.schedule && !contextId)}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await retrySave();
                    setPreview(
                      await invoke('automation.preview', {
                        databaseId: owner.id,
                        automationId: draft.id,
                        pageId: draft.schedule ? owner.id : contextId,
                        rule: draft,
                      }),
                    );
                    setError('');
                  } catch (error) {
                    setError(String(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                预览动作
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy || pendingUploads > 0 || !!validation() || owner.locked}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await retrySave();
                    await invoke(
                      rules.some((rule) => rule.id === draft.id) ? 'automation.update' : 'automation.create',
                      { databaseId: owner.id, automationId: draft.id, rule: draft },
                    );
                    setDraft(null);
                    notify('自动化已保存');
                  } catch (error) {
                    setError(String(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                保存自动化
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
