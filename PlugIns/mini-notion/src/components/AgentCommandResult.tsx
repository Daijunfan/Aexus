import { AgentDiff } from './AgentDiff';
import { AgentMcpConfig } from './AgentMcpConfig';
import { AgentMcpLogin } from './AgentMcpLogin';
import { useEffect, useState } from 'react';
import { useWorkspace } from '../store';

/** Common native command results get readable controls; the complete response stays inspectable. */
export function AgentCommandResult({
  pageId,
  command,
  result,
  onClose,
  onUse,
  onRefresh,
}: {
  pageId: string;
  command: string;
  result: any;
  onClose: () => void;
  onUse: (text: string) => void;
  onRefresh: () => void;
}) {
  const { workspace, api, notify } = useWorkspace();
  const [query, setQuery] = useState('');
  const engine = workspace!.spaces![pageId].engine;
  const agent = workspace!.spaces![pageId].agent;
  const mcpConfiguration = JSON.stringify(
    engine === 'codex' ? agent.options?.config?.mcp_servers : agent.options?.sdk?.mcpServers,
  );
  useEffect(() => {
    if (command === 'mcp' && agent.status === 'idle') onRefresh();
  }, [command, mcpConfiguration, agent.status]);
  const control = (method: string, args: unknown[]) =>
    void api('agent.control', { pageId, method, params: { args } })
      .then(onRefresh)
      .catch((error) => notify(String(error)));
  const commands = [
    ...new Map(
      [...(result?.clientCommands || []), ...(result?.commands || [])].map((item: any) => [item.name, item]),
    ).values(),
  ] as any[];
  const servers: any[] = command === 'mcp' ? (Array.isArray(result) ? result : result?.data || []) : [];
  useEffect(() => {
    if (agent.status === 'stopped' || agent.status === 'error') return;
    if (!servers.some((server) => ['pending', 'starting'].includes(server.status))) return;
    const timer = setTimeout(onRefresh, 1000);
    return () => clearTimeout(timer);
  }, [command, result, agent.status]);
  const plugins: any[] =
    command === 'plugins'
      ? result?.marketplaces?.flatMap((market: any) => market.plugins) || result?.plugins || []
      : [];
  const matches = (item: any) =>
    `${item.name} ${item.description || item.interface?.shortDescription || ''}`
      .toLowerCase()
      .includes(query.toLowerCase());
  const structured = ['help', 'skills', 'mcp', 'plugins', 'status', 'diff'].includes(command);
  return (
    <section className={`agent-command-result ${command === 'diff' ? 'agent-diff-result' : ''}`}>
      <div className="agent-settings-heading">
        <strong>/{command}</strong>
        <button onClick={onRefresh}>刷新</button>
        <button onClick={onClose}>关闭</button>
      </div>
      {structured && !['status', 'diff'].includes(command) && (
        <input
          aria-label={`搜索 ${command}`}
          placeholder="搜索…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      {['help', 'skills'].includes(command) && (
        <div className="agent-command-list">
          {commands.filter(matches).map((item) => (
            <button key={item.name} onClick={() => onUse(`/${item.name} `)}>
              <strong>/{item.name}</strong>
              <small>{item.description || '原生命令'}</small>
            </button>
          ))}
        </div>
      )}
      {command === 'diff' && <AgentDiff result={result} pageId={pageId} />}
      {command === 'mcp' && (
        <>
          <AgentMcpConfig pageId={pageId} onRefresh={onRefresh} />
          {!servers.length && <p>当前没有 MCP 服务。可在引擎配置中添加服务。</p>}
          {servers.filter(matches).map((server) => {
            const tools: any[] = Array.isArray(server.tools)
              ? server.tools
              : Object.values(server.tools || {});
            return (
              <div className="agent-resource" key={server.name}>
                <strong>{server.name}</strong>
                <small>
                  {(
                    {
                      connected: '已连接',
                      ready: '已连接',
                      pending: '连接中',
                      starting: '连接中',
                      failed: '连接失败',
                      disabled: '已停用',
                      cancelled: '已取消',
                      'needs-auth': '需要登录',
                    } as Record<string, string>
                  )[server.status] ||
                    server.status ||
                    '已发现'}{' '}
                  · {tools.length} 个工具
                </small>
                {server.error && <p>{server.error}</p>}
                {engine === 'codex' && ['notLoggedIn', 'oAuth'].includes(server.authStatus) && (
                  <AgentMcpLogin pageId={pageId} server={server} onRefresh={onRefresh} />
                )}
                {engine === 'claude' && (
                  <div className="agent-control-shortcuts">
                    <button onClick={() => control('reconnectMcpServer', [server.name])}>重新连接</button>
                    <button
                      onClick={() => control('toggleMcpServer', [server.name, server.status === 'disabled'])}
                    >
                      {server.status === 'disabled' ? '启用' : '停用'}
                    </button>
                  </div>
                )}
                <details>
                  <summary>工具与资源</summary>
                  {tools.map((tool) => (
                    <div key={tool.name}>
                      <strong>{tool.name}</strong>
                      <p>{tool.description}</p>
                      {tool.inputSchema && (
                        <details>
                          <summary>输入参数</summary>
                          <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                  ))}
                  <pre>
                    {JSON.stringify(
                      { resources: server.resources, resourceTemplates: server.resourceTemplates },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </div>
            );
          })}
        </>
      )}
      {command === 'plugins' && (
        <>
          {!plugins.length && <p>当前没有已加载的插件。</p>}
          {plugins.filter(matches).map((plugin) => (
            <div className="agent-resource" key={plugin.id || plugin.name}>
              <strong>{plugin.interface?.displayName || plugin.name}</strong>
              <small>
                {plugin.localVersion || plugin.version}
                {plugin.enabled === false ? ' · 已停用' : ''}
              </small>
              <p>{plugin.interface?.shortDescription}</p>
              <details>
                <summary>插件详情</summary>
                <pre>{JSON.stringify(plugin, null, 2)}</pre>
              </details>
            </div>
          ))}
        </>
      )}
      {command === 'status' && (
        <dl className="agent-status-details">
          {Object.entries({
            引擎: result.engine,
            模型: result.options?.model || result.runtime?.model || '默认',
            状态: result.status,
            会话: result.sessionId,
            工作目录: result.directory,
          }).map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{String(value || '—')}</dd>
            </div>
          ))}
        </dl>
      )}
      {structured ? (
        <details>
          <summary>完整原生响应</summary>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </details>
      ) : (
        <pre>{JSON.stringify(result, null, 2)}</pre>
      )}
    </section>
  );
}
