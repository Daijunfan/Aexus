import { useEffect, useState } from 'react';
import { useWorkspace } from '../store';
import { Modal } from '../ui';
import { BlockPreview } from './BlockPreview';

export function Conflicts() {
  const { conflictId, resolveConflict, setModal, notify } = useWorkspace();
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>();
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const response = await window.native!.api('conflict.list');
    if (response.error) throw new Error(response.error.message);
    setItems(response.result);
  };
  useEffect(() => {
    void load().catch((error) => notify(error.message));
  }, []);
  const select = async (id: string) => {
    const response = await window.native!.api('conflict.get', { id });
    if (response.error) notify(response.error.message);
    else setSelected(response.result);
  };
  const resolve = async (strategy: 'local' | 'remote') => {
    setBusy(true);
    try {
      if (selected.id === conflictId) await resolveConflict(strategy);
      else {
        const response = await window.native!.api('conflict.resolve', { id: selected.id, strategy });
        if (response.error) throw new Error(response.error.message);
      }
      setSelected(undefined);
      await load();
      notify(strategy === 'local' ? '已应用保留的草稿' : '已保留当前版本');
    } catch (error) {
      notify(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="并发编辑草稿" wide onClose={() => setModal(null)}>
      <div className="modal-body">
        <p className="muted">
          当两端同时修改同一段内容时，两份内容都会保留。选择需要保留的版本后，继续编辑。
        </p>
        {!items.length && <p>没有待处理的冲突。</p>}
        <div className="conflict-list">
          {items.map((item) => (
            <button className="secondary-button" key={item.id} onClick={() => void select(item.id)}>
              {new Date(item.at).toLocaleString()} · {item.pageIds.length} 个页面
            </button>
          ))}
        </div>
        {selected && (
          <>
            <p>{selected.message}</p>
            {selected.patch.pages.map((change: any) => {
              const current = selected.current.pages.find((page: any) => page.id === change.id);
              return (
                <div className="conflict-comparison" key={change.id}>
                  <section>
                    <h3>保留的草稿 · {change.after?.title || '已删除页面'}</h3>
                    {change.after && <BlockPreview blocks={change.after.blocks} />}
                  </section>
                  <section>
                    <h3>发生冲突时的版本 · {current?.title || '已删除页面'}</h3>
                    {current && <BlockPreview blocks={current.blocks} />}
                  </section>
                </div>
              );
            })}
            <div className="modal-actions">
              <button className="secondary-button" disabled={busy} onClick={() => void resolve('remote')}>
                保留当前版本
              </button>
              <button className="primary-button" disabled={busy} onClick={() => void resolve('local')}>
                应用我的草稿
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
