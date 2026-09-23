import { useEffect, useState } from 'react';
import { MoreHorizontal, MousePointer2, Play, Settings2 } from 'lucide-react';
import { useWorkspace } from '../store';
import { IconButton, Modal } from '../ui';
import type { ButtonConfig } from './types';
import { ActionEditor, ActionPreview } from './ActionEditor';
import { validateActions } from './engine';

export function ButtonControl({
  pageId,
  blockId,
  propertyId,
  config,
  disabled = false,
}: {
  pageId: string;
  blockId?: string;
  propertyId?: string;
  config: ButtonConfig;
  disabled?: boolean;
}) {
  const { setModal, api, command, retrySave, notify, navigate } = useWorkspace();
  const [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState<any>(null);
  const location = { pageId, blockId, propertyId };
  const configure = () => setModal({ type: 'button', ...location });
  const invoke = (method: string, params: any) =>
    window.native ? api(method, params) : Promise.resolve(command(method, params));
  const execute = async (confirm = false) => {
    setBusy(true);
    try {
      if (!(await retrySave())) return;
      const current = await invoke('button.get', location);
      if (!current.config.actions.length) {
        configure();
        return;
      }
      if (current.config.confirmation && !confirm) {
        setConfirmation(await invoke('button.preview', location));
        return;
      }
      const result = await invoke('button.run', {
        ...location,
        confirm,
        expectedConfig: confirmation?.config,
      });
      if (!window.native) for (const effect of result.effects || []) navigate(effect.pageId);
      setConfirmation(null);
      notify('按钮动作已完成');
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="note-action-button"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="button-main"
        disabled={disabled || busy}
        aria-label={config.label || '按钮'}
        onClick={() => void execute()}
      >
        <MousePointer2 size={14} />
        <span>{config.label || '按钮'}</span>
      </button>
      <IconButton label="配置按钮" disabled={disabled} onClick={configure}>
        <MoreHorizontal size={14} />
      </IconButton>
      {confirmation && (
        <Modal title="确认按钮动作" onClose={() => setConfirmation(null)}>
          <div className="modal-body">
            <p>{confirmation.config.confirmation}</p>
            <ActionPreview preview={confirmation} />
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setConfirmation(null)}>
                取消
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() => void execute(true)}
              >
                确认执行
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
export function ButtonEditor() {
  const { workspace, modal, setModal, api, command, retrySave, notify } = useWorkspace();
  const [pendingUploads, setPendingUploads] = useState(0);
  const [config, setConfig] = useState<ButtonConfig | null>(null),
    [ownerId, setOwnerId] = useState(''),
    [contextId, setContextId] = useState(modal?.pageId || ''),
    [preview, setPreview] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const location = { pageId: modal!.pageId!, propertyId: modal?.propertyId, blockId: modal?.blockId };
  const invoke = (method: string, params: any) =>
    window.native ? api(method, params) : Promise.resolve(command(method, params));
  useEffect(() => {
    void (async () => {
      try {
        if (!(await retrySave())) return;
        const result = await invoke('button.get', location);
        setConfig(result.config);
        setOwnerId(result.ownerId);
        if (location.propertyId && result.pageId === result.ownerId)
          setContextId(
            workspace!.pages.find(
              (page) => page.parentId === result.ownerId && !page.templateFor && !page.trashedAt,
            )?.id || '',
          );
      } catch (error) {
        setError(String(error));
      }
    })();
  }, []);
  const source = workspace!.pages.find((page) => page.id === contextId),
    owner = workspace!.pages.find((page) => page.id === ownerId);
  const databaseId = modal?.propertyId ? ownerId : source?.parentId || undefined;
  const validation = () => {
    try {
      if (config) validateActions(config.actions);
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  const save = async () => {
    if (!config) return;
    setBusy(true);
    try {
      await invoke('button.configure', { ...location, config });
      setModal(null);
      notify('按钮已保存');
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="配置按钮" onClose={() => setModal(null)} wide className="button-editor-dialog">
      <div className="modal-body">
        {config ? (
          <>
            <label className="field-label">
              按钮文字
              <input
                aria-label="按钮文字"
                value={config.label || ''}
                onChange={(event) => setConfig({ ...config, label: event.target.value })}
              />
            </label>
            <label className="schedule-checkbox">
              <input
                type="checkbox"
                aria-label="按钮执行前确认"
                checked={!!config.confirmation}
                onChange={(event) =>
                  setConfig({ ...config, confirmation: event.target.checked ? '确定执行这些动作？' : '' })
                }
              />
              执行前显示确认
            </label>
            {config.confirmation && (
              <input
                className="button-confirmation-input"
                aria-label="按钮确认文字"
                value={config.confirmation}
                onChange={(event) => setConfig({ ...config, confirmation: event.target.value })}
              />
            )}
            <ActionEditor
              onBusyChange={(busy) => setPendingUploads((count) => count + (busy ? 1 : -1))}
              steps={config.actions}
              onChange={(actions) => {
                setConfig({ ...config, actions });
                setPreview(null);
              }}
              pageId={contextId || location.pageId}
              databaseId={databaseId}
            />
            {location.propertyId && (
              <label className="field-label">
                预览使用的记录
                <select
                  aria-label="按钮预览记录"
                  value={contextId}
                  onChange={(event) => setContextId(event.target.value)}
                >
                  <option value="">选择记录…</option>
                  {workspace!.pages
                    .filter((page) => page.parentId === ownerId && !page.templateFor && !page.trashedAt)
                    .map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.title || '无标题'}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {(error || validation()) && (
              <p role="alert" className="action-error">
                {error || validation()}
              </p>
            )}
            {preview && <ActionPreview preview={preview} />}
            <div className="modal-actions">
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setModal({
                    type: 'action-history',
                    pageId: location.propertyId ? undefined : location.pageId,
                    ownerId,
                  })
                }
              >
                运行记录
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={
                  busy || pendingUploads > 0 || !!validation() || !config.actions.length || !contextId
                }
                onClick={async () => {
                  setBusy(true);
                  try {
                    setPreview(await invoke('button.preview', { ...location, pageId: contextId, config }));
                    setError('');
                  } catch (error) {
                    setError(String(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Play size={13} />
                预览动作
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={busy || pendingUploads > 0 || !!validation()}
                onClick={() => void save()}
              >
                保存按钮
              </button>
            </div>
          </>
        ) : (
          <p>{error || '正在读取按钮…'}</p>
        )}
      </div>
    </Modal>
  );
}
export function ActionHistory() {
  const { workspace, modal, setModal, navigate } = useWorkspace();
  const runs = (workspace!.actionRuns || [])
    .filter(
      (run) =>
        (!modal?.ownerId || run.ownerId === modal.ownerId) &&
        (!modal?.pageId || run.sourceId === modal.pageId),
    )
    .slice()
    .reverse();
  return (
    <Modal title="按钮与自动化记录" onClose={() => setModal(null)} wide>
      <div className="modal-body action-history">
        {runs.length ? (
          runs.map((run) => (
            <article key={run.id} className={`action-run ${run.status}`}>
              <Settings2 size={16} />
              <div>
                <strong>{run.name}</strong>
                <small>
                  {new Date(run.at).toLocaleString('zh-CN')} · {run.kind === 'button' ? '按钮' : '自动化'} ·{' '}
                  {run.status === 'success' ? '已完成' : '失败'}
                </small>
                {run.error && <p>{run.error}</p>}
                <small>{run.steps?.length || 0} 个动作</small>
              </div>
              <button
                className="text-button"
                disabled={!workspace!.pages.some((page) => page.id === run.sourceId && !page.trashedAt)}
                onClick={() => {
                  setModal(null);
                  navigate(run.sourceId);
                }}
              >
                打开页面
              </button>
            </article>
          ))
        ) : (
          <div className="schedule-empty">还没有运行记录</div>
        )}
      </div>
    </Modal>
  );
}
