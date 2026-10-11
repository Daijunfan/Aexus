import { useState } from 'react';
import { useWorkspace } from '../store';
import type { AgentMessage } from '../types';

export function AgentRewind({ pageId, message }: { pageId: string; message: AgentMessage }) {
  const { api, workspace } = useWorkspace();
  const files = workspace!.pages.find((page) => page.id === pageId)?.files || [];
  const [preview, setPreview] = useState<any>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const run = async (apply = false) => {
    setBusy(true);
    setError('');
    try {
      const result = await api('agent.rewind', {
        pageId,
        conversationId: message.conversationId,
        messageId: message.id,
        apply,
      });
      setPreview(apply ? { ...preview, ...result } : result);
      setApplied(apply && result.canRewind);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="agent-rewind">
      <button disabled={busy} onClick={() => void run()}>
        预览恢复到此消息前的文件
      </button>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <div>
          <p>
            {preview.canRewind
              ? applied
                ? preview.skippedLinks
                  ? '已恢复可恢复的文件，部分路径已跳过'
                  : '文件已恢复'
                : '将恢复以下文件'
              : preview.error || '此检查点无法恢复'}
          </p>
          {!!preview.filesChanged?.length && (
            <ul>
              {preview.filesChanged.map((file: string) => (
                <li key={file} title={file}>
                  {files.find(
                    (item) =>
                      item.url.startsWith('asset://local/') &&
                      file.endsWith(decodeURIComponent(new URL(item.url).pathname)),
                  )?.name || file}
                </li>
              ))}
            </ul>
          )}
          <p>
            预览变化：+{preview.insertions || 0} / −{preview.deletions || 0} 行
          </p>
          <small>这是 CLI 文件检查点；页面数据库修改请使用操作历史撤销。</small>
          {!!preview.skippedLinks && <p role="alert">{preview.skippedLinks} 个路径因链接变化未恢复。</p>}
          {preview.canRewind && !applied && (
            <button disabled={busy} onClick={() => void run(true)}>
              恢复这些文件
            </button>
          )}
          <button onClick={() => setPreview(undefined)}>关闭预览</button>
        </div>
      )}
    </div>
  );
}
