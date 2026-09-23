import { useEffect, useState } from 'react';
import { useWorkspace } from '../store';
import { agentConversationId } from '../core/spaces';

export function AgentMcpLogin({
  pageId,
  server,
  onRefresh,
}: {
  pageId: string;
  server: { name: string; authStatus?: string };
  onRefresh: () => void;
}) {
  const { workspace, api } = useWorkspace();
  const agent = workspace!.spaces![pageId].agent;
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const completion = [...agent.messages]
    .reverse()
    .find(
      (message) =>
        message.data?.method === 'mcpServer/oauthLogin/completed' &&
        message.data.params?.name === server.name,
    );
  useEffect(() => {
    if (!completion) return;
    setUrl('');
    setError(completion.data.params.success ? '' : completion.data.params.error || '登录未完成');
    onRefresh();
  }, [completion?.id]);
  useEffect(() => {
    if (agent.status === 'stopped') setUrl('');
  }, [agent.status]);
  const login = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api('agent.control', {
        pageId,
        conversationId: agentConversationId(agent),
        method: 'mcpServer/oauth/login',
        params: { name: server.name, timeoutSecs: 180 },
      });
      setUrl(result.authorizationUrl);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="agent-mcp-login">
      {server.authStatus === 'oAuth' && <small>OAuth 已授权</small>}
      <button disabled={busy || !!url} onClick={() => void login()}>
        {server.authStatus === 'oAuth' ? '重新授权' : '登录此 MCP 服务'}
      </button>
      {url && (
        <div role="status">
          <p>等待完成验证，最长 3 分钟。</p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              if (window.native) {
                event.preventDefault();
                void window.native.openExternal(url);
              }
            }}
          >
            打开授权页面
          </a>
          <button
            onClick={() =>
              void api('agent.stop', { pageId, conversationId: agentConversationId(agent) })
                .then(() => setUrl(''))
                .catch((error) => setError(String(error)))
            }
          >
            停止会话并取消等待
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
