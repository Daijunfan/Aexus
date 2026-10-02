import {AppSelect} from './AppSelect';
import { useState } from 'react';
import type { AgentMessage } from '../types';
import { useWorkspace } from '../store';

export function AgentElicitation({ pageId, message }: { pageId: string; message: AgentMessage }) {
  const { api } = useWorkspace();
  const request = message.request!;
  const params = request.params;
  const fields = Object.entries(params.requestedSchema?.properties || {}) as [string, any][];
  const typed =
    params.requestedSchema?.type === 'object' &&
    fields.every(
      ([, field]) =>
        ['string', 'number', 'integer', 'boolean'].includes(field.type) && !field.oneOf && !field.anyOf,
    );
  const [values, setValues] = useState<Record<string, any>>(() =>
    Object.fromEntries(
      fields
        .filter(([, field]) => field.default !== undefined || field.type === 'boolean')
        .map(([name, field]) => [name, field.default ?? false]),
    ),
  );
  const [raw, setRaw] = useState('{}');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const respond = async (action: 'accept' | 'decline' | 'cancel') => {
    setBusy(true);
    setError('');
    try {
      const content =
        action === 'accept' && params.mode !== 'url' ? (typed ? values : JSON.parse(raw)) : undefined;
      await api('agent.respond', {
        pageId,
        conversationId: message.conversationId,
        requestId: request.id,
        result: { action, ...(content !== undefined ? { content } : {}) },
      });
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="agent-request agent-elicitation"
      onSubmit={(event) => {
        event.preventDefault();
        void respond('accept');
      }}
    >
      <strong>{params.title || params.serverName || 'MCP 请求补充信息'}</strong>
      <p>{params.message}</p>
      {params.description && <p>{params.description}</p>}
      {params.mode === 'url' ? (
        <a
          href={params.url}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            if (window.native) {
              event.preventDefault();
              void window.native.openExternal(params.url);
            }
          }}
        >
          打开验证链接
        </a>
      ) : typed ? (
        fields.map(([name, field]) => (
          <label key={name}>
            {field.title || name}
            {params.requestedSchema?.required?.includes(name) ? ' *' : ''}
            {field.description && <small>{field.description}</small>}
            {field.type === 'boolean' ? (
              <input
                type="checkbox"
                checked={!!values[name]}
                onChange={(event) => setValues({ ...values, [name]: event.target.checked })}
              />
            ) : field.enum ? (
              <AppSelect
                required={params.requestedSchema?.required?.includes(name)}
                value={values[name] ?? ''}
                onChange={(event) =>
                  setValues({
                    ...values,
                    [name]:
                      event.target.value === ''
                        ? undefined
                        : field.type === 'string'
                          ? event.target.value
                          : Number(event.target.value),
                  })
                }
              >
                <option value="">请选择</option>
                {field.enum.map((value: any) => (
                  <option key={String(value)} value={value}>
                    {String(value)}
                  </option>
                ))}
              </AppSelect>
            ) : (
              <input
                required={params.requestedSchema?.required?.includes(name)}
                type={
                  ['number', 'integer'].includes(field.type)
                    ? 'number'
                    : field.format === 'date'
                      ? 'date'
                      : field.format === 'email'
                        ? 'email'
                        : 'text'
                }
                min={field.minimum}
                max={field.maximum}
                step={field.type === 'integer' ? 1 : 'any'}
                minLength={field.minLength}
                maxLength={field.maxLength}
                pattern={field.pattern}
                value={values[name] ?? ''}
                onChange={(event) =>
                  setValues({
                    ...values,
                    [name]:
                      event.target.value === '' && field.type !== 'string'
                        ? undefined
                        : ['number', 'integer'].includes(field.type)
                          ? Number(event.target.value)
                          : event.target.value,
                  })
                }
              />
            )}
          </label>
        ))
      ) : (
        <label>
          响应内容（JSON）
          <textarea value={raw} onChange={(event) => setRaw(event.target.value)} />
        </label>
      )}
      <details>
        <summary>完整请求格式</summary>
        <pre>{JSON.stringify(params, null, 2)}</pre>
      </details>
      {error && <p role="alert">{error}</p>}
      <div className="agent-control-shortcuts">
        <button disabled={busy} type="submit">
          {params.mode === 'url' ? '已完成验证，继续' : '提交回答'}
        </button>
        <button disabled={busy} type="button" onClick={() => void respond('decline')}>
          拒绝
        </button>
        <button disabled={busy} type="button" onClick={() => void respond('cancel')}>
          取消
        </button>
      </div>
    </form>
  );
}
