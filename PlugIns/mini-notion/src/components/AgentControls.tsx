import {AppSelect} from './AppSelect';
import { useEffect, useState } from 'react';
import { Settings2, Plus, History, RefreshCw, Terminal, ChevronDown, Focus, UserRound } from 'lucide-react';
import { AgentRewind } from './AgentRewind';
import { AgentReview } from './AgentReview';
import { AgentElicitation } from './AgentElicitation';
import { AgentAccount } from './AgentAccount';
import { agentConversationId } from '../core/spaces';
import { useWorkspace } from '../store';
import { IconButton } from '../ui';
import type { AgentConfig, AgentMessage } from '../types';

export { agentCommands } from '../core/agentCommands';

export function AgentControls({
  pageId,
  onCommand,
  panel,
}: {
  pageId: string;
  onCommand: (text: string) => void;
  panel?: { tab: string; seq: number };
}) {
  const { workspace, api, notify } = useWorkspace();
  const agent = workspace!.spaces![pageId].agent;
  const [capabilities, setCapabilities] = useState<any>(agent.capabilities);
  const [tab, setTab] = useState('');
  const [config, setConfig] = useState('');
  const [configBase, setConfigBase] = useState<NonNullable<AgentConfig['options']>>({});
  const [configDirty, setConfigDirty] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [result, setResult] = useState<any>();
  const [method, setMethod] = useState('');
  const [params, setParams] = useState('{}');
  const [protocol, setProtocol] = useState<any>();
  const [contextUsage, setContextUsage] = useState<any>();
  const [loading, setLoading] = useState(false);
  const [sessionQuery, setSessionQuery] = useState('');
  const [checkpoints, setCheckpoints] = useState<AgentMessage[]>([]);
  useEffect(() => {
    if (tab !== 'checkpoints') return;
    let cancelled = false;
    void api('agent.history', { pageId, conversationId: agentConversationId(agent), limit: 10000 })
      .then((messages: AgentMessage[]) => {
        if (!cancelled)
          setCheckpoints(messages.filter((message) => message.role === 'user' && message.engineId));
      })
      .catch((error) => notify(String(error)));
    return () => {
      cancelled = true;
    };
  }, [tab, pageId, agent.conversationId]);
  const currentTitle =
    agent.sessions?.find((session) => (session.conversationId || session.id) === agentConversationId(agent))
      ?.title || '';
  const [sessionTitle, setSessionTitle] = useState(currentTitle);
  useEffect(() => {
    setSessionTitle(currentTitle);
    setSessionQuery('');
  }, [pageId, agent.sessionId, currentTitle]);
  useEffect(() => {
    if (panel) {
      setTab(panel.tab);
      setConfig(JSON.stringify(agent.options || {}, null, 2));
      setConfigBase(structuredClone(agent.options || {}));
      setConfigDirty(false);
    }
  }, [panel]);
  const optionsSignature = JSON.stringify(agent.options || {});
  useEffect(() => {
    if (configDirty || configSaving) return;
    setConfig(JSON.stringify(agent.options || {}, null, 2));
    setConfigBase(structuredClone(agent.options || {}));
  }, [pageId, optionsSignature, configDirty, configSaving]);
  const call = async (method: string, params: any) => {
    try {
      return await api(method, { pageId, conversationId: agentConversationId(agent), ...params });
    } catch (error) {
      notify(String(error));
      throw error;
    }
  };
  const refresh = async () => {
    setLoading(true);
    try {
      setCapabilities(await call('agent.capabilities', {}));
    } catch {
      /* shown inline by backend and toast */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setCapabilities(agent.capabilities);
    void refresh();
  }, [pageId]);
  useEffect(() => {
    if (tab === 'control') void call('agent.protocol', {}).then(setProtocol);
  }, [tab, pageId]);
  useEffect(() => {
    if (tab !== 'usage') return;
    let cancelled = false;
    setContextUsage(undefined);
    void call('agent.context-usage', {})
      .then((result) => {
        if (!cancelled) setContextUsage(result);
      })
      .catch((error) => {
        if (!cancelled) setContextUsage({ available: false, error: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [tab, pageId, agent.status, agent.usage?.input, agent.usage?.output]);
  const configure = (options: NonNullable<AgentConfig['options']>, replace = false) => {
    if (replace) setConfigSaving(true);
    void call('agent.configure', { options, replace, ...(replace ? { before: configBase } : {}) })
      .then((saved) => {
        if (replace) {
          setConfig(JSON.stringify(saved, null, 2));
          setConfigBase(saved);
          setConfigDirty(false);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (replace) setConfigSaving(false);
      });
  };
  const models = capabilities?.models || [];
  const model =
    models.find((m: any) => (m.model || m.value) === agent.options?.model) ||
    models.find((m: any) => m.isDefault) ||
    models[0];
  const efforts: string[] =
    model?.supportedReasoningEfforts?.map((e: any) => e.reasoningEffort) ||
    model?.supportedEffortLevels ||
    [];
  return (
    <>
      <div className="agent-toolbar">
        <AppSelect
          aria-label="Agent 模型"
          value={agent.options?.model || ''}
          onChange={(e) => configure({ model: e.target.value })}
        >
          <option value="">{loading ? '连接引擎…' : '默认模型'}</option>
          {models.map((m: any) => (
            <option key={m.model || m.value} value={m.model || m.value}>
              {m.displayName || m.model || m.value}
            </option>
          ))}
          {agent.options?.model &&
            !models.some((m: any) => (m.model || m.value) === agent.options?.model) && (
              <option>{agent.options.model}</option>
            )}
        </AppSelect>
        {!!efforts.length && (
          <AppSelect
            aria-label="思考强度"
            value={agent.options?.effort || ''}
            onChange={(e) => configure({ effort: e.target.value })}
          >
            <option value="">默认强度</option>
            {efforts.map((effort) => (
              <option key={effort}>{effort}</option>
            ))}
          </AppSelect>
        )}
        <AppSelect
          aria-label="Agent 模式"
          value={agent.options?.mode || 'agent'}
          onChange={(e) => configure({ mode: e.target.value as 'agent' | 'plan' })}
        >
          <option value="agent">Agent</option>
          <option value="plan">Plan · 只读</option>
        </AppSelect>
        {agent.engine === 'claude' && (
          <AppSelect
            aria-label="Thinking"
            value={agent.options?.thinking == null ? '' : String(agent.options.thinking)}
            onChange={(e) =>
              configure({ thinking: e.target.value === '' ? null : e.target.value === 'true' })
            }
          >
            <option value="">Thinking · 默认</option>
            <option value="true">Thinking · 开</option>
            <option value="false">Thinking · 关</option>
          </AppSelect>
        )}
        {!!model?.serviceTiers?.length && (
          <AppSelect
            aria-label="Agent 速度"
            value={agent.options?.serviceTier || ''}
            onChange={(e) => configure({ serviceTier: e.target.value })}
          >
            <option value="">标准速度</option>
            {model.serviceTiers.map((tier: any) => (
              <option key={tier.id} value={tier.id}>
                {tier.name}
              </option>
            ))}
          </AppSelect>
        )}
        <IconButton
          label="Agent 配置"
          onClick={() => {
            setTab(tab === 'config' ? '' : 'config');
            setConfig(JSON.stringify(agent.options || {}, null, 2));
            setConfigBase(structuredClone(agent.options || {}));
            setConfigDirty(false);
          }}
        >
          <Settings2 size={15} />
        </IconButton>
        <IconButton label="Agent 会话历史" onClick={() => setTab(tab === 'sessions' ? '' : 'sessions')}>
          <History size={15} />
        </IconButton>
        <IconButton label="Agent 账户与登录" onClick={() => setTab(tab === 'account' ? '' : 'account')}>
          <UserRound size={15} />
        </IconButton>
        <IconButton
          label={agent.options?.focusView !== false ? '展开逐项操作' : '折叠工具操作'}
          active={agent.options?.focusView !== false}
          onClick={() => configure({ focusView: agent.options?.focusView === false })}
        >
          <Focus size={15} />
        </IconButton>
        <IconButton
          label="新建 Agent 会话"
          onClick={() => {
            void call('agent.new', {});
          }}
        >
          <Plus size={16} />
        </IconButton>
        <IconButton label="Agent 高级控制" onClick={() => setTab(tab === 'control' ? '' : 'control')}>
          <Terminal size={15} />
        </IconButton>
      </div>
      <AgentAccount pageId={pageId} active={tab === 'account'} onConfigure={() => setTab('config')} />
      {tab && tab !== 'account' && (
        <div className="agent-settings">
          <div className="agent-settings-heading">
            <strong>
              {tab === 'review'
                ? '代码审查'
                : tab === 'checkpoints'
                  ? '文件检查点'
                  : tab === 'config'
                    ? '模型与引擎配置'
                    : tab === 'sessions'
                      ? '此空间的会话'
                      : tab === 'usage'
                        ? '上下文用量'
                        : '引擎控制'}
            </strong>
            <button onClick={() => setTab('')}>
              收起 <ChevronDown size={12} />
            </button>
          </div>
          {tab === 'review' && <AgentReview pageId={pageId} />}
          {tab === 'checkpoints' && (
            <div className="agent-checkpoints">
              {!checkpoints.length && <p>此会话尚无可用的文件检查点。</p>}
              {[...checkpoints].reverse().map((message) => (
                <div key={message.id}>
                  <p>{message.text?.slice(0, 180)}</p>
                  <small>{new Date(message.at).toLocaleString()}</small>
                  <AgentRewind pageId={pageId} message={message} />
                </div>
              ))}
            </div>
          )}
          {tab === 'config' && (
            <>
              {agent.capabilities?.runtime && (
                <small>
                  当前引擎 {agent.capabilities.runtime.claude_code_version || 'Codex'} ·{' '}
                  {agent.capabilities.runtime.model || ''}
                </small>
              )}
              <button
                onClick={() => {
                  setTab('control');
                  setMethod(agent.engine === 'codex' ? 'config/read' : 'get_settings');
                  setParams('{}');
                  void call('agent.control', {
                    method: agent.engine === 'codex' ? 'config/read' : 'get_settings',
                    params: {},
                  })
                    .then(setResult)
                    .catch(() => {});
                }}
              >
                读取原生生效配置
              </button>
              <label>
                CLI / Wrapper
                <input
                  aria-label="Agent CLI 可执行文件"
                  defaultValue={agent.options?.command || ''}
                  key={agent.options?.command || 'default'}
                  placeholder={
                    agent.engine === 'claude'
                      ? '默认：官方 SDK 配套 Claude Code；可填 claude 或其他路径'
                      : '默认：本机 codex'
                  }
                  onBlur={(e) => configure({ command: e.target.value })}
                />
              </label>
              <label>
                运行中的后续消息
                <AppSelect
                  aria-label="后续消息行为"
                  value={agent.options?.followUpQueueMode || 'queue'}
                  onChange={(e) =>
                    configure({ followUpQueueMode: e.target.value as 'queue' | 'steer' | 'interrupt' })
                  }
                >
                  <option value="queue">排队，当前任务结束后发送</option>
                  <option value="steer">追加到当前任务</option>
                  <option value="interrupt">中断当前任务后发送</option>
                </AppSelect>
              </label>
              <label>
                发送快捷键
                <AppSelect
                  aria-label="发送快捷键"
                  value={agent.options?.composerEnterBehavior || 'enter'}
                  onChange={(e) =>
                    configure({
                      composerEnterBehavior: e.target.value as 'enter' | 'cmdIfMultiline' | 'cmdAlways',
                    })
                  }
                >
                  <option value="enter">Enter 发送</option>
                  <option value="cmdIfMultiline">多行时用 ⌘/Ctrl Enter</option>
                  <option value="cmdAlways">总是用 ⌘/Ctrl Enter</option>
                </AppSelect>
              </label>
              <label>
                自定义模型
                <input
                  aria-label="自定义 Agent 模型"
                  defaultValue={agent.options?.model || ''}
                  key={agent.options?.model}
                  placeholder="使用引擎默认模型"
                  onBlur={(e) => configure({ model: e.target.value })}
                />
              </label>
              <label>
                空间默认审批模式
                <AppSelect
                  aria-label="Agent 审批模式"
                  value={agent.options?.approval || (agent.engine === 'codex' ? 'on-request' : 'acceptEdits')}
                  onChange={(e) => configure({ approval: e.target.value })}
                >
                  {(agent.engine === 'codex'
                    ? ['on-request', 'untrusted', 'never']
                    : ['acceptEdits', 'default', 'auto', 'dontAsk']
                  ).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </AppSelect>
                {agent.engine === 'claude' && agent.capabilities?.runtime?.permissionMode && (
                  <small>
                    当前会话审批：{agent.capabilities.runtime.permissionMode}
                    （会话内许可规则不会改写空间默认值）
                  </small>
                )}
              </label>
              <label>
                Workspace 覆盖配置（JSON）
                <textarea
                  aria-label="Agent 完整配置 JSON"
                  rows={10}
                  value={config}
                  disabled={configSaving}
                  onChange={(e) => {
                    setConfig(e.target.value);
                    setConfigDirty(true);
                  }}
                />
              </label>
              <small>
                config 填写原生配置
                {agent.engine === 'claude'
                  ? '；sdk 填写 SDK 运行参数，例如 mcpServers、tools、extraArgs'
                  : ''}
                。模型、权限与思考强度按空间保存。
              </small>
              <button
                className="primary-button"
                disabled={configSaving}
                onClick={() => {
                  try {
                    configure(JSON.parse(config), true);
                  } catch (error) {
                    notify(`配置 JSON 无效：${error}`);
                  }
                }}
              >
                保存配置
              </button>
            </>
          )}
          {tab === 'sessions' && (
            <>
              <label>
                当前会话名称
                <input
                  aria-label="当前 Agent 会话名称"
                  value={sessionTitle}
                  placeholder="为此会话命名"
                  onChange={(e) => setSessionTitle(e.target.value)}
                />
              </label>
              <div className="agent-control-shortcuts">
                <button
                  disabled={!sessionTitle.trim()}
                  onClick={() => void call('agent.rename', { title: sessionTitle }).catch(() => {})}
                >
                  保存名称
                </button>
                <button
                  disabled={!agent.sessionId || agent.status === 'running'}
                  onClick={() =>
                    void call('agent.fork', {})
                      .then(() => setTab(''))
                      .catch(() => {})
                  }
                >
                  从当前会话建立分支
                </button>
              </div>
              <small>当前：{agent.sessionId || '尚未开始'}</small>
              <input
                aria-label="搜索 Agent 会话"
                placeholder="搜索历史会话…"
                value={sessionQuery}
                onChange={(e) => setSessionQuery(e.target.value)}
              />
              {(agent.sessions || [])
                .filter(
                  (session) =>
                    (session.conversationId || session.id) !== agentConversationId(agent) &&
                    `${session.title} ${session.id}`.toLowerCase().includes(sessionQuery.toLowerCase()),
                )
                .slice()
                .sort((a, b) => b.at - a.at)
                .map((session) => (
                  <button
                    className="agent-session-row"
                    key={session.id}
                    onClick={() => {
                      void call('agent.resume', { sessionId: session.conversationId || session.id });
                      setTab('');
                    }}
                  >
                    <History size={14} />
                    <span>{session.title}</span>
                    <small>
                      {new Date(session.at).toLocaleDateString()}
                      {session.state?.queue?.length ? ` · ${session.state.queue.length} 条待发` : ''}
                    </small>
                  </button>
                ))}
              {!agent.sessions?.length && <p>新建会话后，当前会话会保留在这里。</p>}
            </>
          )}
          {tab === 'control' && (
            <>
              <div className="agent-control-shortcuts">
                {['status', 'mcp', 'skills', 'compact', 'help'].map((command) => (
                  <button key={command} onClick={() => onCommand(`/${command}`)}>
                    /{command}
                  </button>
                ))}
                <IconButton label="刷新引擎能力" onClick={() => void refresh()}>
                  <RefreshCw size={14} />
                </IconButton>
              </div>
              <label>
                {agent.engine === 'codex' ? 'App Server 方法' : 'SDK 方法'}
                <input
                  aria-label="原生引擎方法"
                  list="agent-native-methods"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  placeholder={agent.engine === 'codex' ? 'config/read' : 'mcpServerStatus'}
                />
              </label>
              <datalist id="agent-native-methods">
                {protocol?.methods?.map((item: any) => (
                  <option key={item.name} value={item.name}>
                    {item.description}
                  </option>
                ))}
              </datalist>
              {protocol && <small>{protocol.methods.length} 个原生方法可用</small>}
              {method && protocol && (
                <details>
                  <summary>查看此方法的参数定义</summary>
                  <pre>
                    {(() => {
                      const spec = protocol.methods.find((item: any) => item.name === method)?.params;
                      const value = spec?.$ref ? protocol.definitions?.[spec.$ref.split('/').at(-1)] : spec;
                      return value?.typescript || JSON.stringify(value, null, 2);
                    })()}
                  </pre>
                </details>
              )}
              <textarea
                aria-label="原生引擎参数"
                value={params}
                rows={4}
                onChange={(e) => setParams(e.target.value)}
              />
              <button
                onClick={() => {
                  try {
                    void call('agent.control', { method, params: JSON.parse(params) }).then(setResult);
                  } catch (error) {
                    notify(String(error));
                  }
                }}
              >
                执行
              </button>
              <button onClick={() => void call('agent.history', { raw: true, limit: 1000 }).then(setResult)}>
                完整事件记录
              </button>
              {result !== undefined && <pre>{JSON.stringify(result, null, 2)}</pre>}
            </>
          )}
          {tab === 'usage' &&
            (contextUsage === undefined ? (
              <p>读取引擎统计…</p>
            ) : contextUsage.available === false ? (
              <p>{contextUsage.error || '开始会话后显示上下文用量。'}</p>
            ) : (
              <div className="agent-context-usage">
                <strong>
                  {contextUsage.totalTokens?.toLocaleString()} /{' '}
                  {contextUsage.maxTokens?.toLocaleString() || '—'} tokens
                </strong>
                {!!contextUsage.maxTokens && (
                  <progress
                    aria-label="上下文已使用"
                    value={contextUsage.totalTokens}
                    max={contextUsage.maxTokens}
                  />
                )}
                {contextUsage.percentage != null && <p>已使用 {contextUsage.percentage}%</p>}
                {contextUsage.categories?.map((category: any) => (
                  <div key={category.name}>
                    <span>{category.name}</span>
                    <span>{category.tokens.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}
      {agent.usage && (
        <div className="agent-usage">
          输入 {agent.usage.input?.toLocaleString() || 0} · 输出 {agent.usage.output?.toLocaleString() || 0}
          {agent.usage.costUsd != null ? ` · $${agent.usage.costUsd.toFixed(4)}` : ''}
          <button onClick={() => setTab(tab === 'usage' ? '' : 'usage')}>上下文用量</button>
        </div>
      )}
    </>
  );
}

export function AgentRequest({ pageId, message }: { pageId: string; message: AgentMessage }) {
  const { api, notify } = useWorkspace();
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [raw, setRaw] = useState('{}');
  const request = message.request!;
  const permission = request.method.includes('permissions/requestApproval');
  const elicitation = request.method === 'elicitation' || request.method.includes('elicitation');
  const codexApproval = /(?:commandExecution|fileChange)\/requestApproval$/.test(request.method);
  const questions = request.params.questions || request.params.input?.questions || [];
  const respond = (result: any) =>
    void api('agent.respond', {
      pageId,
      conversationId: message.conversationId,
      requestId: request.id,
      result,
    }).catch((error) => notify(String(error)));
  if (request.answered)
    return (
      <div className="agent-request answered">
        {['error', 'stopped'].includes(message.activity?.status || '') ? '请求已取消' : '已回答'} ·{' '}
        {request.method}
      </div>
    );
  if (elicitation) return <AgentElicitation pageId={pageId} message={message} />;
  return (
    <div className="agent-request">
      <strong>{questions.length ? 'Agent 需要你的回答' : request.params.title || 'Agent 请求许可'}</strong>
      {questions.length ? (
        <>
          {questions.map((question: any) => {
            const key = question.id || question.question;
            return (
              <label key={key}>
                {question.question}
                <div className="agent-question-options">
                  {question.options?.map((option: any) => (
                    <button
                      key={option.label}
                      aria-label={`选择 ${option.label}`}
                      className={
                        (
                          Array.isArray(answers[key])
                            ? answers[key].includes(option.label)
                            : answers[key] === option.label
                        )
                          ? 'selected'
                          : ''
                      }
                      title={option.description}
                      onClick={() => {
                        const previous = Array.isArray(answers[key]) ? answers[key] : [];
                        setAnswers({
                          ...answers,
                          [key]: question.multiSelect
                            ? previous.includes(option.label)
                              ? previous.filter((value) => value !== option.label)
                              : [...previous, option.label]
                            : option.label,
                        });
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <input
                  type={question.isSecret ? 'password' : 'text'}
                  aria-label={question.question}
                  value={Array.isArray(answers[key]) ? answers[key].join(', ') : answers[key] || ''}
                  onChange={(e) => setAnswers({ ...answers, [key]: e.target.value })}
                  placeholder="输入回答"
                />
              </label>
            );
          })}
          <button
            className="primary-button"
            onClick={() =>
              respond(
                request.method === 'question'
                  ? {
                      behavior: 'allow',
                      updatedInput: {
                        ...request.params.input,
                        answers: Object.fromEntries(
                          Object.entries(answers).map(([id, value]) => [
                            id,
                            Array.isArray(value) ? value.join(', ') : value,
                          ]),
                        ),
                      },
                    }
                  : {
                      answers: Object.fromEntries(
                        Object.entries(answers).map(([id, value]) => [
                          id,
                          { answers: Array.isArray(value) ? value : [value] },
                        ]),
                      ),
                    },
              )
            }
          >
            提交回答
          </button>
        </>
      ) : (
        <>
          {request.params.decisionReason && <p>{request.params.decisionReason}</p>}
          <pre>
            {request.params.command || JSON.stringify(request.params.input || request.params, null, 2)}
          </pre>
          {request.params.url && (
            <a
              href={request.params.url}
              onClick={(e) => {
                if (window.native) {
                  e.preventDefault();
                  void window.native.openExternal(request.params.url);
                }
              }}
            >
              打开验证链接
            </a>
          )}
          {codexApproval ? (
            <div className="agent-control-shortcuts">
              {(request.params.availableDecisions || ['accept', 'acceptForSession', 'decline', 'cancel']).map(
                (decision: any, index: number) => (
                  <button key={index} onClick={() => respond({ decision })}>
                    {typeof decision === 'string'
                      ? (
                          {
                            accept: '允许一次',
                            acceptForSession: '此会话允许',
                            decline: '拒绝',
                            cancel: '拒绝并停止',
                          } as Record<string, string>
                        )[decision] || decision
                      : decision.acceptWithExecpolicyAmendment
                        ? '允许并记住命令规则'
                        : decision.applyNetworkPolicyAmendment
                          ? `${decision.applyNetworkPolicyAmendment.network_policy_amendment.action === 'allow' ? '允许' : '禁止'}连接 ${decision.applyNetworkPolicyAmendment.network_policy_amendment.host}`
                          : JSON.stringify(decision)}
                  </button>
                ),
              )}
            </div>
          ) : (
            <>
              <button
                className="primary-button"
                onClick={() =>
                  respond(
                    request.method === 'approval'
                      ? { behavior: 'allow' }
                      : permission
                        ? { permissions: request.params.permissions, scope: 'turn' }
                        : { decision: 'accept' },
                  )
                }
              >
                允许
              </button>
              {request.method === 'approval' && !!request.params.suggestions?.length && (
                <button
                  onClick={() =>
                    respond({ behavior: 'allow', updatedPermissions: request.params.suggestions })
                  }
                >
                  允许并记住建议规则
                </button>
              )}
              <button
                onClick={() =>
                  respond(
                    request.method === 'approval'
                      ? { behavior: 'deny', message: '用户拒绝' }
                      : permission
                        ? { permissions: {}, scope: 'turn' }
                        : { decision: 'decline' },
                  )
                }
              >
                拒绝
              </button>
            </>
          )}
          {!!request.params.suggestions?.length && (
            <details>
              <summary>建议的许可规则</summary>
              <pre>{JSON.stringify(request.params.suggestions, null, 2)}</pre>
            </details>
          )}
        </>
      )}
      <details>
        <summary>自定义响应</summary>
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} />
        <button
          onClick={() => {
            try {
              respond(JSON.parse(raw));
            } catch {
              notify('请输入有效 JSON');
            }
          }}
        >
          发送响应
        </button>
      </details>
    </div>
  );
}
