import { useState } from 'react';
import { useWorkspace } from '../store';
import type { AgentConfig } from '../types';
import { agentConversationId } from '../core/spaces';

export function AgentMcpConfig({ pageId, onRefresh }: { pageId: string; onRefresh: () => void }) {
  const { workspace, api } = useWorkspace();
  const agent = workspace!.spaces![pageId].agent;
  const codex = agent.engine === 'codex';
  const managed = codex ? agent.options?.config?.mcp_servers || {} : agent.options?.sdk?.mcpServers || {};
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [config, setConfig] = useState('{}');
  const [base, setBase] = useState<NonNullable<AgentConfig['options']>>(structuredClone(agent.options || {}));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const save = async (remove?: string, toggle?: string) => {
    setBusy(true);
    setMessage('');
    try {
      const before = remove || toggle ? agent.options || {} : base;
      const servers = { ...(codex ? before.config?.mcp_servers : before.sdk?.mcpServers) };
      if (remove) delete servers[remove];
      else if (toggle) servers[toggle] = { ...servers[toggle], enabled: servers[toggle].enabled === false };
      else {
        const value = JSON.parse(config);
        if (!name.trim() || !value || typeof value !== 'object' || Array.isArray(value))
          throw new Error('请输入名称和配置对象');
        if (!value.command && !value.url && !(codex && value.enabled === false))
          throw new Error('服务需要 command 或 url');
        servers[name.trim()] = value;
      }
      const saved = await api('agent.configure', {
        pageId,
        conversationId: agentConversationId(agent),
        replace: true,
        before,
        options: {
          ...before,
          ...(codex
            ? { config: { ...before.config, mcp_servers: servers } }
            : { sdk: { ...before.sdk, mcpServers: servers } }),
        },
      });
      if (!remove && !toggle) {
        setBase(structuredClone(saved));
        setEditing(true);
        setName(name.trim());
        setConfig(
          JSON.stringify(
            (codex ? saved.config?.mcp_servers : saved.sdk?.mcpServers)?.[name.trim()] || {},
            null,
            2,
          ),
        );
      } else if (remove === name) {
        setName('');
        setEditing(false);
        setConfig('{}');
        setBase(structuredClone(saved));
      }
      setMessage(
        agent.status === 'running' ? '配置已保存，当前执行结束后重新连接。' : '配置已保存，正在刷新连接。',
      );
      if (agent.status !== 'running') onRefresh();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="agent-mcp-config">
      <summary>添加或编辑此会话的 MCP 配置</summary>
      {codex && (
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setMessage('');
            void api('agent.control', {
              pageId,
              conversationId: agentConversationId(agent),
              method: 'config/mcpServer/reload',
              params: null,
            })
              .then(() => {
                setMessage('MCP 配置已重新加载。');
                onRefresh();
              })
              .catch((error) => setMessage(String(error)))
              .finally(() => setBusy(false));
          }}
        >
          重新加载全部 MCP 配置
        </button>
      )}
      {Object.keys(managed).map((key) => (
        <div className="agent-control-shortcuts" key={key}>
          <button
            disabled={busy}
            onClick={() => {
              setBase(structuredClone(agent.options || {}));
              setName(key);
              setEditing(true);
              setConfig(JSON.stringify(managed[key], null, 2));
            }}
          >
            编辑 {key}
          </button>
          {codex && (
            <button disabled={busy} onClick={() => void save(undefined, key)}>
              {managed[key].enabled === false ? '启用' : '停用'} {key}
            </button>
          )}
          <button disabled={busy} onClick={() => void save(key)}>
            移除 {key}
          </button>
        </div>
      ))}
      <button
        onClick={() => {
          setBase(structuredClone(agent.options || {}));
          setName('');
          setEditing(false);
          setConfig(codex ? '{"command":"","args":[]}' : '{"type":"stdio","command":"","args":[]}');
        }}
      >
        新增服务
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label>
          服务名称
          <input
            required
            value={name}
            disabled={editing || busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          原生服务配置
          <textarea
            disabled={busy}
            value={config}
            onChange={(event) => setConfig(event.target.value)}
            spellCheck={false}
          />
        </label>
        <small>
          {codex
            ? '支持 command/args/env 或 url/http_headers 等 Codex 配置。'
            : '支持 stdio、http、sse；可设置 command/args/env 或 url/headers 等 SDK 配置。'}
        </small>
        <button disabled={busy || !name.trim()} type="submit">
          保存服务
        </button>
      </form>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
