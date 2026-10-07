import { useState } from 'react';
import { Pencil, Play, X } from 'lucide-react';
import { useWorkspace } from '../store';
import { IconButton } from '../ui';
import { agentConversationId } from '../core/spaces';

export function AgentQueue({ pageId }: { pageId: string }) {
  const { workspace, api, notify } = useWorkspace();
  const agent = workspace!.spaces![pageId].agent;
  const files = workspace!.pages.find((page) => page.id === pageId)?.files || [];
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const queue = agent.queue || [];
  const execute = async (action: string, params: Record<string, any> = {}) => {
    try {
      await api('agent.queue', { pageId, conversationId: agentConversationId(agent), action, ...params });
      return true;
    } catch (error) {
      notify(String(error));
      return false;
    }
  };
  if (!queue.length) return null;
  return (
    <section className="agent-queue" aria-label="待发送消息">
      <header>
        <strong>
          {agent.queuePaused ? '队列已暂停' : '本轮结束后自动发送'} · {queue.length}
        </strong>
        {agent.status !== 'running' && (
          <button onClick={() => void execute('run')}>
            <Play size={12} />
            继续发送
          </button>
        )}
      </header>
      {queue.map((message) => (
        <div className="agent-queued-message" key={message.id}>
          {editing?.id === message.id ? (
            <div className="agent-queue-editor">
              <textarea
                aria-label="编辑待发送消息"
                value={editing.text}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
              />
              <button
                onClick={() =>
                  void execute('update', { messageId: message.id, text: editing.text }).then((ok) => {
                    if (ok) setEditing(null);
                  })
                }
              >
                保存
              </button>
              <button onClick={() => setEditing(null)}>取消</button>
            </div>
          ) : (
            <>
              <div>
                <p>{message.text || '附件或页面引用'}</p>
                {!!message.context?.length && (
                  <div className="agent-contexts">
                    {message.context.map((context, index) => (
                      <span className="agent-context-chip" key={`${context.pageId}:${index}`}>
                        {context.title || context.pageId}
                        <IconButton
                          label={`移除待发送引用 ${context.title || context.pageId}`}
                          onClick={() => {
                            const remaining = message.context!.filter((_, i) => i !== index);
                            void execute(
                              !remaining.length && !message.text.trim() && !message.fileIds.length
                                ? 'remove'
                                : 'update',
                              { messageId: message.id, text: message.text, context: remaining },
                            );
                          }}
                        >
                          <X size={11} />
                        </IconButton>
                      </span>
                    ))}
                  </div>
                )}
                {!!message.fileIds.length && (
                  <small>
                    {message.fileIds
                      .map((id) => files.find((file) => file.id === id)?.name || '附件已移除')
                      .join('、')}
                  </small>
                )}
              </div>
              <IconButton
                label="编辑待发送消息"
                onClick={() => setEditing({ id: message.id, text: message.text })}
              >
                <Pencil size={12} />
              </IconButton>
              <IconButton
                label="移除待发送消息"
                onClick={() => void execute('remove', { messageId: message.id })}
              >
                <X size={13} />
              </IconButton>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
