import { useState } from 'react';
import { useWorkspace } from '../store';
import { agentConversationId } from '../core/spaces';

export function AgentRevert({ pageId, turnId, file }: { pageId: string; turnId: string; file: string }) {
  const { api, workspace } = useWorkspace();
  const conversationId = agentConversationId(workspace!.spaces![pageId].agent);
  const [result, setResult] = useState<any>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const revert = async (apply = false) => {
    setBusy(true);
    setError('');
    try {
      setResult(await api('agent.revert', { pageId, conversationId, turnId, file, apply }));
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="agent-revert">
      <button disabled={busy} onClick={() => void revert()}>
        预览撤销此文件差异
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p>
            {result.applied
              ? '文件差异已撤销'
              : result.canRevert
                ? '当前文件可撤销这次差异。'
                : '当前内容无法直接撤销这次差异。'}
          </p>
          {result.output && <pre>{result.output}</pre>}
          <small>仅撤销文件差异，会话与页面历史保留。</small>
          {result.canRevert && !result.applied && (
            <button disabled={busy} onClick={() => void revert(true)}>
              撤销此文件差异
            </button>
          )}
          <button onClick={() => setResult(undefined)}>关闭预览</button>
        </>
      )}
    </div>
  );
}
