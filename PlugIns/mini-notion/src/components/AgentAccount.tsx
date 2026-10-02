import { useEffect, useState } from 'react';
import { useWorkspace } from '../store';
import { agentConversationId } from '../core/spaces';

export function AgentAccount({
  pageId,
  active,
  onConfigure,
}: {
  pageId: string;
  active: boolean;
  onConfigure: () => void;
}) {
  const { workspace, api } = useWorkspace();
  const agent = workspace!.spaces![pageId].agent;
  const conversationId = agentConversationId(agent);
  const codex = agent.engine === 'codex';
  const [account, setAccount] = useState<any>();
  const [limits, setLimits] = useState<any>();
  const [login, setLogin] = useState<any>();
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [limitsError, setLimitsError] = useState('');
  const control = (method: string, params: any = {}) =>
    api('agent.control', { pageId, conversationId, method, params });
  const refresh = async () => {
    const result = await control(
      codex ? 'account/read' : 'accountInfo',
      codex ? { refreshToken: false } : {},
    );
    setAccount(codex ? result.account : result);
    setLimitsError('');
    try {
      setLimits(
        await control(
          codex ? 'account/rateLimits/read' : 'usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET',
          codex ? {} : { args: [{ skipBehaviors: true }] },
        ),
      );
    } catch (error) {
      setLimits(undefined);
      setLimitsError(String(error));
    }
  };
  const execute = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (active) void execute(refresh);
  }, [active, pageId, conversationId, agent.capabilities?.accountChangedAt]);
  const completion = [...agent.messages]
    .reverse()
    .find(
      (message) =>
        message.data?.method === 'account/login/completed' && message.data.params?.loginId === login?.loginId,
    );
  useEffect(() => {
    if (!completion) return;
    if (completion.data.params.success) {
      setLogin(undefined);
      void execute(refresh);
    } else setError(completion.data.params.error || '登录未完成');
  }, [completion?.id]);
  const signIn = (type: string) =>
    execute(async () => {
      const key = apiKey;
      setApiKey('');
      const result = await control('account/login/start', {
        type,
        ...(type === 'apiKey' ? { apiKey: key } : {}),
      });
      setLogin(result.loginId ? result : undefined);
      if (!result.loginId) await refresh();
    });
  const url = login?.authUrl || login?.verificationUrl;
  const fields = [
    ['账户', account?.email],
    ['组织', account?.organization],
    ['套餐', account?.planType || account?.subscriptionType],
    ['认证方式', account?.type || account?.tokenSource || account?.apiKeySource],
    ['服务', account?.apiProvider],
  ];
  const buckets = limits?.rateLimitsByLimitId || (limits?.rateLimits ? { codex: limits.rateLimits } : {});
  return (
    <section hidden={!active} className="agent-account" aria-label="Agent 账户与登录">
      <p>空间内会话共用认证。切换或退出账户会停止其他会话的执行，重新连接时使用新凭据。</p>
      {account === null && <p>尚未登录</p>}
      <dl>
        {fields
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      <button disabled={busy} onClick={() => void execute(refresh)}>
        刷新账户与额度
      </button>
      {codex ? (
        <>
          <div className="agent-control-shortcuts">
            <button disabled={busy} onClick={() => void signIn('chatgpt')}>
              登录 ChatGPT
            </button>
            <button disabled={busy} onClick={() => void signIn('chatgptDeviceCode')}>
              使用设备码
            </button>
            {account && (
              <button
                disabled={busy}
                onClick={() =>
                  void execute(async () => {
                    await control('account/logout');
                    setLogin(undefined);
                    await refresh();
                  })
                }
              >
                退出此 Workspace 的登录
              </button>
            )}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (apiKey.trim()) void signIn('apiKey');
            }}
          >
            <label>
              API Key
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
            <button disabled={busy || !apiKey.trim()} type="submit">
              使用 API Key
            </button>
          </form>
          {login && (
            <div role="status">
              <p>在浏览器中完成认证后，账户会自动更新。</p>
              {login.userCode && (
                <p>
                  设备码：<code>{login.userCode}</code>
                </p>
              )}
              {url && (
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
                  打开登录页面
                </a>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  void execute(async () => {
                    await control('account/login/cancel', { loginId: login.loginId });
                    setLogin(undefined);
                  })
                }
              >
                取消登录
              </button>
            </div>
          )}
        </>
      ) : (
        <button onClick={onConfigure}>管理 CLI 认证配置</button>
      )}
      {error && <p role="alert">{error}</p>}
      {Object.entries(buckets).map(([name, value]) => {
        const bucket = value as any;
        return (
          <div key={name}>
            <strong>{bucket.limitName || name}</strong>
            {['primary', 'secondary'].map((key) => {
              const window = bucket[key];
              return (
                window && (
                  <div key={key}>
                    <p>
                      {window.windowDurationMins ? `${window.windowDurationMins / 60} 小时窗口` : key} · 已用{' '}
                      {window.usedPercent}%
                    </p>
                    <progress max={100} value={window.usedPercent} aria-label={`${name} ${key} 已用额度`} />
                    {window.resetsAt && (
                      <small>重置于 {new Date(window.resetsAt * 1000).toLocaleString()}</small>
                    )}
                  </div>
                )
              );
            })}
            {bucket.credits && (
              <p>额度余额：{bucket.credits.unlimited ? '不限' : (bucket.credits.balance ?? '未提供')}</p>
            )}
          </div>
        );
      })}
      {limitsError && <p>额度暂不可用：{limitsError}</p>}
      {!codex && limits?.session && (
        <>
          <p>
            本次会话费用：${limits.session.total_cost_usd.toFixed(4)} · API 用时{' '}
            {(limits.session.total_api_duration_ms / 1000).toFixed(1)} 秒
          </p>
          <p>
            文件修改：+{limits.session.total_lines_added} / −{limits.session.total_lines_removed} 行
          </p>
          {limits.rate_limits_available === false && (
            <p>此认证方式不提供 Claude 订阅额度；会话用量仍可查看。</p>
          )}
          {Object.entries(limits.rate_limits || {})
            .flatMap(([name, value]) =>
              Array.isArray(value) ? value.map((item) => [item.display_name, item]) : [[name, value]],
            )
            .map(([name, value]) => {
              const window = value as any;
              if (window?.utilization == null) return null;
              const label =
                (
                  {
                    five_hour: '5 小时',
                    seven_day: '7 天',
                    seven_day_opus: 'Opus · 7 天',
                    seven_day_sonnet: 'Sonnet · 7 天',
                    seven_day_oauth_apps: 'OAuth 应用 · 7 天',
                  } as Record<string, string>
                )[String(name)] || String(name);
              return (
                <div key={String(name)}>
                  <p>
                    {label} · 已用 {window.utilization}%
                  </p>
                  <progress max={100} value={window.utilization} aria-label={`${label} 已用额度`} />
                  {window.resets_at && <small>重置于 {new Date(window.resets_at).toLocaleString()}</small>}
                </div>
              );
            })}
        </>
      )}
      {limits && (
        <details>
          <summary>完整额度详情</summary>
          <pre>{JSON.stringify(limits, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}
