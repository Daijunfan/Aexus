import { useState } from 'react';
import { useWorkspace } from '../store';
import { agentConversationId } from '../core/spaces';

export function AgentReview({ pageId }: { pageId: string }) {
  const { api, workspace } = useWorkspace();
  const agent = workspace!.spaces![pageId].agent;
  const [type, setType] = useState('uncommittedChanges');
  const [detail, setDetail] = useState('');
  const [delivery, setDelivery] = useState('detached');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = async () => {
    setBusy(true);
    setError('');
    const field = ({ baseBranch: 'branch', commit: 'sha', custom: 'instructions' } as Record<string, string>)[
      type
    ];
    try {
      await api('agent.review', {
        pageId,
        conversationId: agentConversationId(agent),
        delivery,
        target: { type, ...(field ? { [field]: detail } : {}) },
      });
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="agent-review"
      onSubmit={(event) => {
        event.preventDefault();
        void start();
      }}
    >
      <label>
        审查目标
        <select
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            setDetail('');
          }}
        >
          <option value="uncommittedChanges">未提交的修改（含未跟踪文件）</option>
          <option value="baseBranch">与基准分支比较</option>
          <option value="commit">指定提交</option>
          <option value="custom">自定义范围</option>
        </select>
      </label>
      {type !== 'uncommittedChanges' && (
        <label>
          {type === 'baseBranch' ? '基准分支' : type === 'commit' ? '提交 SHA' : '审查要求'}
          <textarea required value={detail} onChange={(event) => setDetail(event.target.value)} />
        </label>
      )}
      <label>
        结果位置
        <select value={delivery} onChange={(event) => setDelivery(event.target.value)}>
          <option value="detached">新建独立审查会话</option>
          <option value="inline">当前会话</option>
        </select>
      </label>
      <button
        disabled={
          busy ||
          (delivery === 'inline' && agent.status === 'running') ||
          (type !== 'uncommittedChanges' && !detail.trim())
        }
        type="submit"
      >
        开始审查
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
