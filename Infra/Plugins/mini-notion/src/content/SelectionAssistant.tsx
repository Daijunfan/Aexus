import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, LoaderCircle, Settings2, X, Send } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useWorkspace } from '../store';
import type { AgentContext, SelectionAISettings } from '../types';
import { ancestors } from '../model';

const defaultSettings: SelectionAISettings = { prompt: '请解释并总结下面的选中文字，直接回复，不修改页面或文件。', mode: 'send' };
type Employee = { id: string; title: string; engine: string; cwd: string; ready: boolean; busy: boolean };
type Chat = { context: AgentContext; text: string; x: number; y: number; sent?: string; reply: string; error?: string; busy: boolean };

export type SelectionAIRequest = { context: AgentContext; x: number; y: number; id: number };
export function SelectionAssistant({ request, pageId }: { request: SelectionAIRequest | null; pageId: string }) {
  const { workspace, api, setting, retrySave: flush } = useWorkspace();
  const options = workspace!.settings.selectionAI || defaultSettings;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeError, setEmployeeError] = useState('');
  const [chat, setChat] = useState<Chat | null>(null);
  const [configure, setConfigure] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const [employeeId, setEmployeeId] = useState(options.employeeId || '');
  useEffect(() => {
    if (!window.native?.folderMode) return;
    let active = true;
    Promise.all([api('assistant.list'), api('fs.path', { pageId })]).then(([list, location]) => {
      if (!active) return;
      setEmployeeError('');
      setEmployees(list);
      setEmployeeId(id => id ? (list.some((e: Employee) => e.id === id && e.ready) ? id : '') :
        list.find((e: Employee) => e.ready && (e.cwd === location.absoluteDirectory || location.absoluteDirectory?.startsWith(e.cwd + '/')))?.id || '');
    }).catch(error => { if (active) setEmployeeError(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [pageId, configure]);
  const close = () => { generation.current++; pending.current = false; setChat(null); };
  useEffect(() => {
    if (!chat) return;
    const outside = (event: globalThis.PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !(event.target as Element).closest('[data-selection-ai]')) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); };
  }, [!!chat]);
  useEffect(() => () => { generation.current++; }, []);
  const send = async (draft: Chat) => {
    if (pending.current || !draft.text.trim()) return;
    const run = ++generation.current;
    pending.current = true;
    setChat({ ...draft, sent: draft.text, reply: '', error: undefined, busy: true });
    const update = (changes: Partial<Chat>) => { if (generation.current === run) setChat(old => old && ({ ...old, ...changes })); };
    try {
      // Use the same persistence barrier as the normal Agent composer.
      if (!await flush()) throw new Error('页面更改尚未保存，请重试');
      if (window.native?.folderMode) {
        const result = await api('assistant.send', { employeeId, text: draft.text, clientMessageId: crypto.randomUUID() });
        if (!result.messageId) throw new Error('发送未获得消息编号，请在员工会话中核对');
        while (generation.current === run) {
          const response = await api('assistant.read', { employeeId, messageId: result.messageId });
          update({ reply: response.text, error: response.error || (response.done && !response.text ? '本轮已结束，未返回文字回复' : undefined), busy: !response.done });
          if (response.done) break;
          await new Promise(resolve => setTimeout(resolve, 650));
        }
      } else {
        const page = workspace!.pages.find(p => p.id === draft.context.pageId)!;
        const root = [page, ...ancestors(workspace!.pages, page.id)].find(p => p.space);
        const agent = root && workspace!.spaces?.[root.id]?.agent;
        if (!root || !agent) throw new Error('当前页面没有空间 Agent');
        const baseline = new Set(agent.messages.map(m => m.id));
        await api(agent.sessionId || agent.messages.length ? 'agent.send' : 'agent.start', {
          pageId: root.id, text: draft.text, prompt: draft.text, context: [draft.context], delivery: 'queue',
        });
        while (generation.current === run) {
          const status = await api('agent.status', { pageId: root.id });
          const messages = await api('agent.history', { pageId: root.id });
          update({ reply: messages.filter((m: any) => !baseline.has(m.id) && m.role === 'agent' && m.kind === 'text').map((m: any) => m.text).join('\n\n'), busy: status.status === 'running', error: status.error });
          if (status.status !== 'running') break;
          await new Promise(resolve => setTimeout(resolve, 650));
        }
      }
      update({ busy: false, text: '' });
    } catch (error) {
      update({ busy: false, error: error instanceof Error ? error.message : String(error) });
    } finally { if (generation.current === run) pending.current = false; }
  };
  useEffect(() => {
    if (!request || pending.current) return;
    const draft: Chat = { context: request.context, text: `${options.prompt.trim()}\n\n${request.context.quote || ''}`.trim(), x: request.x, y: request.y, reply: '', busy: false };
    generation.current++; setChat(draft); setConfigure(!employeeId && !!window.native?.folderMode);
    if (options.mode === 'send' && (!window.native?.folderMode || employeeId)) void send(draft);
  }, [request]);
  return <>
    {chat && createPortal(<div ref={panel} role="dialog" aria-label="选区 AI 聊天" className="selection-ai-chat" style={{ left: chat.x, top: chat.y, maxHeight: `calc(100vh - ${chat.y + 8}px)` }}>
      <header><Bot size={17} /><strong>选区 AI</strong><span>{employees.find(e => e.id === employeeId)?.title || (window.native?.folderMode ? '选择员工' : '空间 Agent')}</span>
        <button aria-label="AI 提示词与发送设置" onClick={() => setConfigure(!configure)}><Settings2 size={16} /></button>
        <button aria-label="关闭选区 AI" onClick={close}><X size={16} /></button></header>
      {configure && <div className="selection-ai-settings">
        {window.native?.folderMode && <label>AI 员工<select aria-label="AI 员工" disabled={chat.busy} value={employeeId} onChange={e => { setEmployeeId(e.target.value); setting({ selectionAI: { ...options, employeeId: e.target.value } }); }}>
          <option value="">选择员工</option>{employees.map(e => <option key={e.id} value={e.id} disabled={!e.ready}>{e.title} · {e.engine}{!e.ready ? '（未就绪）' : e.busy ? '（忙碌）' : ''}</option>)}</select></label>}
        {window.native?.folderMode && !employeeId && <p>{employeeError || '请选择已有的就绪员工；没有员工时，请先在 Agents Company 中创建。'}</p>}
        <label>前置提示词<textarea aria-label="前置提示词" rows={3} value={options.prompt} onChange={e => {
          const prompt = e.target.value; setting({ selectionAI: { ...options, prompt } });
          if (!chat.sent) setChat({ ...chat, text: `${prompt.trim()}\n\n${chat.context.quote || ''}`.trim() });
        }} /></label>
        <label>点击机器人后<select aria-label="AI 发送方式" value={options.mode} onChange={e => setting({ selectionAI: { ...options, mode: e.target.value as SelectionAISettings['mode'] } })}>
          <option value="send">直接发送</option><option value="edit">先编辑，再点击发送</option></select></label>
      </div>}
      <div className="selection-ai-messages" aria-live="polite">
        {chat.sent && <div className="selection-ai-user">{chat.sent}</div>}
        {chat.reply && <div className="selection-ai-reply"><Markdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} onClick={event => { event.preventDefault(); if (href) { if (window.native) void window.native.openExternal(href); else window.open(href, '_blank', 'noopener,noreferrer'); } }}>{children}</a> }}>{chat.reply}</Markdown></div>}
        {chat.busy && <p className="selection-ai-status"><LoaderCircle size={15} />正在等待回复…</p>}
        {chat.error && <p role="alert">{chat.error}</p>}
        {!chat.sent && <p className="selection-ai-status">可编辑消息后发送</p>}
      </div>
      <form onSubmit={event => { event.preventDefault(); void send(chat); }}>
        <textarea aria-label="AI 消息" placeholder="编辑消息或继续提问…" value={chat.text} disabled={chat.busy}
          onChange={e => setChat({ ...chat, text: e.target.value })} />
        <button aria-label="发送 AI 消息" type="submit" disabled={chat.busy || !chat.text.trim() || (!!window.native?.folderMode && !employeeId)}><Send size={17} /></button>
      </form>
    </div>, document.body)}
  </>;
}
