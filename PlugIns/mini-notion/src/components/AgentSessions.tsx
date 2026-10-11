import { CircleAlert, CircleDot, LoaderCircle, X } from 'lucide-react';
import { useWorkspace } from '../store';
import { agentConversationId } from '../core/spaces';
import { IconButton } from '../ui';

export function AgentSessions({ pageId }: { pageId: string }) {
  const { workspace, api, notify } = useWorkspace();
  const agent = workspace!.spaces![pageId].agent;
  const current = agentConversationId(agent);
  const saved = agent.sessions || [];
  const sessions = saved.some((session) => (session.conversationId || session.id) === current)
    ? saved
    : [
        ...saved,
        {
          id: current,
          title: agent.messages.find((message) => message.role === 'user')?.text?.slice(0, 80) || '新会话',
          at: Date.now(),
        },
      ];
  const call = (method: string, params: Record<string, string>) =>
    void api(method, { pageId, ...params }).catch((error) => notify(String(error)));
  return (
    <nav className="agent-sessions" aria-label="Agent 会话标签">
      {sessions
        .filter((session) => !session.closed || (session.conversationId || session.id) === current)
        .map((session) => {
          const id = session.conversationId || session.id;
          const active = id === current;
          const state = active ? agent : session.state;
          const pending = state?.messages.some((message) => message.request && !message.request.answered);
          return (
            <div className={`agent-session-tab ${active ? 'active' : ''}`} key={id}>
              <button
                aria-current={active ? 'page' : undefined}
                title={session.title}
                onClick={() => call('agent.resume', { sessionId: id })}
              >
                {pending ? (
                  <CircleAlert size={13} aria-label="等待回复" />
                ) : state?.status === 'running' ? (
                  <LoaderCircle size={13} className="spin" aria-label="运行中" />
                ) : session.unread && !active ? (
                  <CircleDot size={12} aria-label="有未读消息" />
                ) : null}
                <span>{session.title}</span>
              </button>
              <IconButton
                label={`关闭会话：${session.title}`}
                onClick={() => call('agent.close', { conversationId: id })}
              >
                <X size={12} />
              </IconButton>
            </div>
          );
        })}
    </nav>
  );
}
