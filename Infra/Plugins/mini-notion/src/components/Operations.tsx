import { useEffect, useState } from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { useWorkspace } from '../store';
import { Modal } from '../ui';

export function Operations() {
  const { workspace, modal, setModal, api, retrySave, notify } = useWorkspace();
  const [entries, setEntries] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async () => setEntries(await api('history.operations', { pageId: modal?.pageId }));
  useEffect(() => {
    void load().catch((error) => notify(error.message));
  }, []);
  const change = async (entry: any) => {
    setBusy(true);
    try {
      if (!(await retrySave())) throw new Error('请先保存当前修改');
      await api(entry.undoneAt ? 'history.redo' : 'history.undo', { id: entry.id });
      await load();
      notify(entry.undoneAt ? '已重做' : '已撤销');
    } catch (error) {
      notify(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="操作记录" wide onClose={() => setModal(null)}>
      <div className="modal-body">
        <p className="muted">
          最近 150 项图形端与命令行数据操作。连续输入会合并为一项；撤销时保留其他页面和字段的新修改。
        </p>
        <div className="operation-list">
          {entries.map((entry) => (
            <div className="operation-row" key={entry.id}>
              <div>
                <strong>
                  {entry.pageIds
                    .map(
                      (id: string) => workspace!.pages.find((page) => page.id === id)?.title || '已删除页面',
                    )
                    .join('、') || '工作空间设置'}
                </strong>
                <small>
                  {new Date(entry.at).toLocaleString()} ·{' '}
                  {entry.client?.startsWith('gui-') ? '图形端' : '命令行 / API'} · {entry.method}
                  {entry.undoneAt ? ' · 已撤销' : ''}
                </small>
              </div>
              <button
                className="secondary-button"
                disabled={busy || entry.reversible === false}
                title={entry.reversible === false ? '此操作不能通过页面历史撤销' : undefined}
                onClick={() => void change(entry)}
              >
                {entry.undoneAt ? <Redo2 size={14} /> : <Undo2 size={14} />}
                {entry.undoneAt ? '重做' : '撤销'}
              </button>
            </div>
          ))}
        </div>
        {!entries.length && <p>还没有操作记录。</p>}
      </div>
    </Modal>
  );
}
