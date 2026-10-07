import { useEffect, useMemo, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import {
  ArrowUp,
  AtSign,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  FileText,
  GripHorizontal,
  LoaderCircle,
  Paperclip,
  PanelRight,
  Square,
  Sparkles,
  X,
} from 'lucide-react';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useWorkspace } from '../store';
import { IconButton, linkify } from '../ui';
import { saveSpaceFile } from '../content/assets';
import type { AgentContext, AgentMessage, SpaceFileRecord } from '../types';
import { listAgentContext, type AgentContextItem } from '../core/agentContext';
import { AgentControls, AgentRequest, agentCommands } from './AgentControls';
import { agentConversationId } from '../core/spaces';
import { AgentSessions } from './AgentSessions';
import { AgentRewind } from './AgentRewind';
import { AgentQueue } from './AgentQueue';
import { AgentCommandResult } from './AgentCommandResult';
import { activityCaption, activityLabel, isAgentTelemetry } from '../core/agentTranscript';

type DraftFile = { id: string; file?: File; preview?: string; saved?: SpaceFileRecord };
const engineLabel = (engine: string) => (engine === 'codex' ? 'Codex' : 'Claude Code');

export function AgentPanel() {
  const {
    workspace,
    agentPanel,
    setAgentPanel,
    api: workspaceApi,
    notify,
    setting,
    navigate,
  } = useWorkspace();
  const pageId = agentPanel?.pageId || '';
  const page = workspace!.pages.find((value) => value.id === pageId && !value.trashedAt);
  const space = workspace!.spaces?.[pageId];
  const conversationId = space ? agentConversationId(space.agent) : 'default';
  const draftId = `${pageId}:${conversationId}`;
  const api = (method: string, params: any) =>
    workspaceApi(method, { ...params, ...(method.startsWith('agent.') ? { conversationId } : {}) });
  const [drafts, setDrafts] = useState<
    Record<string, { text: string; files: DraftFile[]; context: AgentContext[] }>
  >({});
  const draft = drafts[draftId] || { text: '', files: [], context: [] };
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [referenceQuery, setReferenceQuery] = useState('');
  const [referencesDismissed, setReferencesDismissed] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [controlPanel, setControlPanel] = useState<{ tab: string; seq: number }>();
  const [commandResult, setCommandResult] = useState<any>();
  const activePage = useRef(draftId);
  activePage.current = draftId;
  const [commandIndex, setCommandIndex] = useState(0);
  const [commandsDismissed, setCommandsDismissed] = useState(false);
  useEffect(() => {
    setControlPanel(agentPanel?.tab ? { tab: agentPanel.tab, seq: Date.now() } : undefined);
    setCommandResult(undefined);
    setReferenceOpen(false);
  }, [draftId, agentPanel?.tab]);
  const runCommand = async (text: string) => {
    try {
      const result = await api('agent.command', { pageId, text });
      if (activePage.current !== draftId) return;
      if (result?.panel) setControlPanel({ tab: result.panel, seq: Date.now() });
      else if (text.split(/\s/)[0] === '/focus') setCommandResult(undefined);
      else setCommandResult({ command: text.replace(/^\//, '').split(/\s/)[0], result });
      change({ text: '' });
    } catch (error) {
      notify(String(error));
    }
  };
  const [history, setHistory] = useState<{ draftId: string; messages: AgentMessage[] }>({
    draftId,
    messages: [],
  });
  const [position, setPosition] = useState(workspace!.settings.agentPanelPosition);
  const docked = workspace!.settings.agentPanelDocked !== false;
  const panel = useRef<HTMLElement>(null);
  const stream = useRef<HTMLDivElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const slashMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    slashMenu.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [commandIndex, draft.text]);
  const previews = useRef(new Set<string>());
  const follow = useRef(true);
  const status = space?.agent.status || 'idle';
  const running = status === 'running';
  const messages = useMemo(
    () => [
      ...new Map(
        [...(history.draftId === draftId ? history.messages : []), ...(space?.agent.messages || [])].map(
          (message) => [message.id, message],
        ),
      ).values(),
    ],
    [history, draftId, space?.agent.messages],
  );
  const change = (value: Partial<typeof draft>) =>
    setDrafts((all) => ({ ...all, [draftId]: { ...draft, ...value } }));
  useEffect(() => {
    if (agentPanel?.text === undefined) return;
    setDrafts((all) => ({
      ...all,
      [draftId]: { ...(all[draftId] || { files: [], context: [] }), text: agentPanel.text! },
    }));
  }, [pageId, agentPanel?.text]);
  useEffect(() => {
    const context = agentPanel?.context;
    if (!context) return;
    setDrafts((all) => {
      const draft = all[draftId] || { text: '', files: [], context: [] };
      return {
        ...all,
        [draftId]: {
          ...draft,
          context: [
            ...draft.context.filter(
              (item) => item.pageId !== context.pageId || item.blockId !== context.blockId,
            ),
            context,
          ],
        },
      };
    });
  }, [pageId, agentPanel?.context]);
  useEffect(() => {
    let cancelled = false;
    if (pageId && window.native)
      void api('agent.history', { pageId, limit: 10000 })
        .then((messages) => {
          if (!cancelled)
            setHistory(() => ({
              draftId,
              messages,
            }));
        })
        .catch((error) => {
          if (!cancelled) notify(error.message);
        });
    return () => {
      cancelled = true;
    };
  }, [
    draftId,
    space?.agent.conversationVersion,
    space?.agent.sessionId,
    running ? 'running' : space?.agent.messages.at(-1)?.id,
  ]);
  useEffect(() => {
    setHistory({ draftId, messages: [] });
  }, [draftId, space?.agent.conversationVersion]);
  useEffect(() => {
    follow.current = true;
  }, [draftId]);
  useEffect(() => {
    if (space?.agent.messages)
      setHistory((previous) => ({
        draftId,
        messages: [
          ...new Map(
            [...(previous.draftId === draftId ? previous.messages : []), ...space.agent.messages].map(
              (message) => [message.id, message],
            ),
          ).values(),
        ],
      }));
  }, [draftId, space?.agent.messages]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    setPosition(workspace!.settings.agentPanelPosition);
  }, [workspace!.settings.agentPanelPosition]);
  useEffect(() => {
    if (follow.current) stream.current?.scrollTo({ top: stream.current.scrollHeight });
  }, [messages, status]);
  useEffect(() => {
    const clamp = () =>
      setPosition(
        (value) =>
          value && {
            x: Math.max(8, Math.min(value.x, window.innerWidth - (panel.current?.offsetWidth || 420) - 8)),
            y: Math.max(48, Math.min(value.y, window.innerHeight - (panel.current?.offsetHeight || 600) - 8)),
          },
      );
    window.addEventListener('resize', clamp);
    clamp();
    return () => window.removeEventListener('resize', clamp);
  }, [workspace!.settings.agentPanelPosition]);
  if (!page || !space) return null;
  const mention = draft.text.slice(0, cursor).match(/(?:^|\s)@([^\s@]*)$/);
  const showReferences = !referencesDismissed && (referenceOpen || !!mention);
  const references = showReferences
    ? listAgentContext(workspace!, pageId, referenceOpen ? referenceQuery : mention![1])
    : [];
  const chooseReference = (item: AgentContextItem) => {
    const start = mention ? cursor - mention[1].length - 1 : cursor;
    const text = draft.text.slice(0, start) + `@${item.title} ` + draft.text.slice(cursor);
    if (item.kind === 'file')
      change({
        text,
        files: [
          ...draft.files.filter((file) => file.saved?.id !== item.file.id),
          {
            id: crypto.randomUUID(),
            saved: item.file,
            ...(item.file.mimeType?.startsWith('image/') ? { preview: item.file.url } : {}),
          },
        ],
      });
    else
      change({
        text,
        context: [
          ...draft.context.filter((value) => value.pageId !== item.id || value.blockId),
          { pageId: item.id, title: item.title },
        ],
      });
    setReferenceOpen(false);
    setReferenceQuery('');
    setCursor(start + item.title.length + 2);
    requestAnimationFrame(() => {
      composer.current?.focus();
      composer.current?.setSelectionRange(start + item.title.length + 2, start + item.title.length + 2);
    });
  };
  const referenceKey = (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (!showReferences) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      setReferenceOpen(false);
      setReferencesDismissed(true);
      return true;
    }
    if (!references.length) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setCommandIndex(
        (index) => (index + (event.key === 'ArrowDown' ? 1 : references.length - 1)) % references.length,
      );
      return true;
    }
    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
      event.preventDefault();
      chooseReference(references[commandIndex] || references[0]);
      return true;
    }
    return false;
  };
  const slashItems = [
    ...agentCommands,
    ...(space.agent.capabilities?.commands || []).filter(
      (command: any) => !agentCommands.some((item) => item.name === command.name),
    ),
  ].filter(
    (command: any) =>
      command.name?.toLowerCase().includes(draft.text.slice(1).toLowerCase()) &&
      (space.engine === 'claude' || command.name !== 'thinking'),
  );
  const showCommands =
    !showReferences && !commandsDismissed && draft.text.startsWith('/') && !/\s/.test(draft.text);
  const chooseCommand = (name: string) => {
    if (agentCommands.some((command) => command.name === name)) void runCommand(`/${name}`);
    else change({ text: `/${name} ` });
  };

  const addFiles = (files: FileList | File[]) => {
    if (busy) return;
    const added = Array.from(files).map((file) => {
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      if (preview) previews.current.add(preview);
      return { id: crypto.randomUUID(), file, preview };
    });
    change({ files: [...draft.files, ...added] });
  };
  const send = async (delivery?: 'queue' | 'steer' | 'interrupt') => {
    if ((!draft.text.trim() && !draft.files.length && !draft.context.length) || sending.current) return;
    if (draft.text.trim().startsWith('/') && !draft.files.length) {
      await runCommand(draft.text.trim());
      return;
    }
    if (!window.native) {
      notify('请使用桌面应用运行 Agent');
      return;
    }
    sending.current = true;
    setBusy(true);
    const files = [...draft.files];
    try {
      for (const item of files) {
        if (item.saved) continue;
        const saved = await saveSpaceFile(pageId, null, item.file!);
        if (!saved) throw new Error('请使用桌面应用发送附件');
        item.saved = saved as SpaceFileRecord;
      }
      change({ files });
      const first = !space.agent.sessionId && !space.agent.messages.length;
      await api(first ? 'agent.start' : 'agent.send', {
        pageId,
        ...(first ? { prompt: draft.text.trim() } : { text: draft.text.trim() }),
        fileIds: files.map((item) => item.saved!.id),
        context: draft.context,
        delivery: delivery || space.agent.options?.followUpQueueMode || 'queue',
      });
      change({ text: '', files: [], context: [] });
      for (const item of files)
        if (item.preview) {
          URL.revokeObjectURL(item.preview);
          previews.current.delete(item.preview);
        }
      follow.current = true;
    } catch (error) {
      change({ files });
      notify(error instanceof Error ? error.message : String(error));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const drag = (event: PointerEvent<HTMLElement>) => {
    if (docked) return;
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    const header = event.currentTarget;
    const rect = panel.current!.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    header.setPointerCapture(event.pointerId);
    let next = { x: rect.left, y: rect.top };
    const move = (move: globalThis.PointerEvent) => {
      next = {
        x: Math.max(8, Math.min(rect.left + move.clientX - start.x, window.innerWidth - rect.width - 8)),
        y: Math.max(48, Math.min(rect.top + move.clientY - start.y, window.innerHeight - rect.height - 8)),
      };
      setPosition(next);
    };
    const end = () => {
      header.removeEventListener('pointermove', move);
      header.removeEventListener('pointerup', end);
      header.removeEventListener('pointercancel', end);
      setting({ agentPanelPosition: next });
    };
    header.addEventListener('pointermove', move);
    header.addEventListener('pointerup', end);
    header.addEventListener('pointercancel', end);
  };
  return (
    <aside
      ref={panel}
      className={`agent-panel ${docked ? 'docked' : ''}`}
      aria-label="空间 Agent"
      aria-keyshortcuts="Control+Alt+F"
      onKeyDown={(event) => {
        if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'f') {
          event.preventDefault();
          event.stopPropagation();
          void api('agent.configure', {
            pageId,
            options: { focusView: space.agent.options?.focusView === false },
          }).catch((error) => notify(String(error)));
        }
      }}
      style={!docked && position ? { left: position.x, top: position.y, right: 'auto' } : undefined}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault();
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length) {
          event.preventDefault();
          event.stopPropagation();
          addFiles(event.dataTransfer.files);
        }
      }}
    >
      <header onPointerDown={drag}>
        <GripHorizontal size={15} className="muted" aria-label="拖动 Agent 面板" />
        <Bot size={17} />
        <strong>Agent</strong>
        <span className="agent-engine-badge">{engineLabel(space.engine)}</span>
        <IconButton
          label={docked ? '浮动 Agent 面板' : '停靠 Agent 面板'}
          onClick={() => setting({ agentPanelDocked: !docked })}
        >
          <PanelRight size={16} />
        </IconButton>
        <IconButton label="关闭 Agent 面板" onClick={() => setAgentPanel(null)}>
          <X size={17} />
        </IconButton>
      </header>
      <div className="space-hint">
        <span className={`agent-status-dot ${status}`} />
        {page.title || '无标题'} ·{' '}
        {status === 'running'
          ? '正在处理'
          : status === 'error'
            ? '运行失败'
            : status === 'stopped'
              ? '已停止'
              : '就绪'}
      </div>
      <AgentSessions pageId={pageId} />
      <AgentControls
        key={draftId}
        pageId={pageId}
        onCommand={(text) => void runCommand(text)}
        panel={controlPanel}
      />
      {commandResult !== undefined && (
        <AgentCommandResult
          key={`${draftId}:${commandResult.command}`}
          pageId={pageId}
          {...commandResult}
          onClose={() => setCommandResult(undefined)}
          onRefresh={() => void runCommand(`/${commandResult.command}`)}
          onUse={(text) => {
            change({ text });
            setCommandResult(undefined);
            composer.current?.focus();
          }}
        />
      )}
      <div
        className="agent-stream"
        ref={stream}
        role="log"
        aria-label="Agent 会话记录"
        onScroll={() => {
          const element = stream.current!;
          follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60;
        }}
      >
        {!messages.length && (
          <div className="agent-welcome">
            <Sparkles size={24} />
            <h3>一起把想法变成页面</h3>
            <p>
              整理资料、编辑页面，或创建项目和视图。
              <br />
              发送文字、图片或文件，即可开始。
            </p>
          </div>
        )}
        <AgentTranscript messages={messages} pageId={pageId} focusView={space.agent.options?.focusView !== false} />
        {running && (
          <div className="agent-working">
            <LoaderCircle size={14} className="spin" />
            Agent 正在处理…
          </div>
        )}
        {status === 'error' && space.agent.error && (
          <div className="agent-message system" role="alert">
            {space.agent.error}
          </div>
        )}
      </div>
      <AgentQueue key={draftId} pageId={pageId} />
      <form
        className="agent-compose"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        {showReferences && (
          <div
            className="agent-slash-menu agent-reference-menu"
            ref={slashMenu}
            role="listbox"
            aria-label="Agent 上下文引用"
          >
            {referenceOpen && (
              <input
                className="agent-reference-search"
                autoFocus
                aria-label="搜索可引用的页面和文件"
                value={referenceQuery}
                onChange={(e) => {
                  setReferenceQuery(e.target.value);
                  setCommandIndex(0);
                }}
                onKeyDown={referenceKey}
              />
            )}
            {references.map((item, index) => (
              <button
                type="button"
                key={`${item.kind}:${item.id}`}
                role="option"
                aria-selected={index === commandIndex}
                onClick={() => chooseReference(item)}
              >
                <FileText size={14} />
                <strong>{item.title}</strong>
                <span>
                  {item.kind === 'file' ? '文件' : '页面'} · {item.location}
                </span>
              </button>
            ))}
            {!references.length && <p className="muted">没有匹配的页面或文件</p>}
          </div>
        )}
        {showCommands && (
          <div className="agent-slash-menu" ref={slashMenu} role="listbox" aria-label="Agent 斜杠命令">
            {slashItems.map((command: any, index: number) => (
              <button
                type="button"
                key={command.name}
                role="option"
                aria-selected={index === commandIndex}
                onClick={() => chooseCommand(command.name)}
              >
                <strong>/{command.name}</strong>
                <span>{command.description}</span>
              </button>
            ))}
          </div>
        )}
        {!!draft.files.length && (
          <div className="agent-attachments draft">
            {draft.files.map((item) => (
              <div className="agent-attachment" key={item.id}>
                {item.preview ? (
                  <img src={item.preview} alt={item.file?.name || item.saved?.name} />
                ) : (
                  <FileText size={18} />
                )}
                <span title={item.file?.name || item.saved?.name}>{item.file?.name || item.saved?.name}</span>
                <IconButton
                  label={`移除 ${item.file?.name || item.saved?.name}`}
                  disabled={busy}
                  onClick={() => {
                    change({ files: draft.files.filter((file) => file.id !== item.id) });
                    if (item.preview) {
                      URL.revokeObjectURL(item.preview);
                      previews.current.delete(item.preview);
                    }
                  }}
                >
                  <X size={13} />
                </IconButton>
              </div>
            ))}
          </div>
        )}
        {!!draft.context.length && (
          <div className="agent-contexts">
            {draft.context.map((context, index) => (
              <div className="agent-context-chip" key={`${context.pageId}:${context.blockId || index}`}>
                <button
                  type="button"
                  onClick={() => navigate(context.pageId)}
                  title={context.quote || context.title}
                >
                  <FileText size={13} />
                  <span>
                    {context.title || '页面'}
                    {context.quote && <small>{context.quote.slice(0, 65)}</small>}
                  </span>
                </button>
                <IconButton
                  label={`移除页面引用 ${context.title || context.pageId}`}
                  onClick={() => change({ context: draft.context.filter((_, i) => i !== index) })}
                >
                  <X size={12} />
                </IconButton>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={composer}
          value={draft.text}
          aria-label="发送给 Agent 的消息"
          placeholder={
            running
              ? '追加指令，或停止当前任务…'
              : draft.files.length || draft.context.length
                ? '添加说明（可选）'
                : '描述任务，输入 / 使用命令…'
          }
          disabled={busy}
          rows={2}
          onChange={(event) => {
            change({ text: event.target.value });
            setCommandIndex(0);
            setCommandsDismissed(false);
            setReferencesDismissed(false);
            setCursor(event.target.selectionStart);
          }}
          onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
          onPaste={(event) => {
            if (event.clipboardData.files.length) {
              event.preventDefault();
              addFiles(event.clipboardData.files);
            }
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (referenceKey(event)) return;
            const modified = event.metaKey || event.ctrlKey;
            if (event.key === 'Enter' && modified && event.shiftKey && running) {
              event.preventDefault();
              void send((space.agent.options?.followUpQueueMode || 'queue') === 'queue' ? 'steer' : 'queue');
              return;
            }
            if (showCommands && slashItems.length) {
              if (event.key === 'Escape') {
                event.preventDefault();
                setCommandsDismissed(true);
                return;
              }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setCommandIndex(
                  (index) =>
                    (index + (event.key === 'ArrowDown' ? 1 : slashItems.length - 1)) % slashItems.length,
                );
                return;
              }
              if (event.key === 'Tab') {
                event.preventDefault();
                change({ text: `/${slashItems[commandIndex]?.name || slashItems[0].name} ` });
                return;
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                chooseCommand(slashItems[commandIndex]?.name || slashItems[0].name);
                return;
              }
            }
            const enter = space.agent.options?.composerEnterBehavior || 'enter';
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              (modified || enter === 'enter' || (enter === 'cmdIfMultiline' && !draft.text.includes('\n')))
            ) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="agent-compose-actions">
          <IconButton label="添加文件或图片" disabled={busy} onClick={() => upload.current?.click()}>
            <Paperclip size={17} />
          </IconButton>
          <IconButton
            label="引用 Workspace 页面或文件"
            disabled={busy}
            onClick={() => {
              setReferenceOpen(!referenceOpen);
              setReferencesDismissed(false);
              setReferenceQuery('');
              setCommandIndex(0);
            }}
          >
            <AtSign size={17} />
          </IconButton>
          <input
            ref={upload}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <span>
            {space.agent.options?.composerEnterBehavior === 'cmdAlways'
              ? '⌘/Ctrl Enter 发送'
              : 'Enter 发送 · Shift Enter 换行'}
          </span>
          {(running ||
            messages.some(
              (message) =>
                message.activity?.name === 'backgroundTask' && message.activity.status === 'running',
            )) && (
            <IconButton
              label="停止 Agent"
              onClick={() => void api('agent.stop', { pageId }).catch((error) => notify(error.message))}
            >
              <Square size={15} />
            </IconButton>
          )}
          {
            <button
              className="agent-send"
              aria-label={running ? '发送后续消息' : '发送消息'}
              type="submit"
              disabled={busy || (!draft.text.trim() && !draft.files.length && !draft.context.length)}
            >
              {busy ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={17} />}
            </button>
          }
        </div>
      </form>
    </aside>
  );
}

function visibleAgentMessage(message: AgentMessage) {
  if (message.request) return true;
  if (isAgentTelemetry(message.data)) return false;
  if (message.data?.method && !/^(item\/|turn\/(plan|diff)\/updated)/.test(message.data.method)) return false;
  if (message.data?.type === 'command_lifecycle' || message.data?.type === 'rate_limit_event') return false;
  if (
    message.data?.type === 'system' &&
    ['status', 'background_tasks_changed'].includes(message.data.subtype)
  )
    return false;
  if (message.data?.type === 'reasoning' && !message.data.summary?.length && !message.data.content?.length)
    return false;
  return !(
    message.activity?.name === 'backgroundTask' &&
    (message.data?.skip_transcript || message.data?.ambient)
  );
}

function AgentTranscript({
  messages,
  pageId,
  focusView,
}: {
  messages: AgentMessage[];
  pageId: string;
  focusView: boolean;
}) {
  const groups: AgentMessage[][] = [];
  let activities: AgentMessage[] | undefined;
  for (const message of messages.filter(visibleAgentMessage)) {
    if (focusView && message.kind === 'activity' && (!message.request || message.request.answered) &&
      message.activity?.name !== 'backgroundTask' &&
      !['turn/plan/updated', 'turn/diff/updated'].includes(message.data?.method)) {
      if (!activities) {
        activities = [];
        groups.push(activities);
      }
      activities.push(message);
    } else {
      activities = undefined;
      groups.push([message]);
    }
  }
  return groups.map((group) => {
    const first = group[0];
    if (!focusView || first.kind !== 'activity' || (first.request && !first.request.answered) ||
      first.activity?.name === 'backgroundTask' ||
      ['turn/plan/updated', 'turn/diff/updated'].includes(first.data?.method))
      return <AgentMessageRow key={first.id} message={first} pageId={pageId} />;
    const active = [...group].reverse().find((message) => message.activity?.status === 'running');
    const failures = group.filter((message) => message.activity?.status === 'error').length;
    const stopped = group.filter((message) => message.activity?.status === 'stopped').length;
    return (
      <details className="agent-focus-activity" key={first.id}>
        <summary>
          {active ? (
            <LoaderCircle size={13} className="spin" />
          ) : failures ? (
            <CircleAlert size={13} />
          ) : stopped ? (
            <Square size={13} />
          ) : (
            <Check size={13} />
          )}
          <span>
            {active
              ? `${activityLabel(active.activity?.name)}…`
              : `${group.length} 项操作${failures ? ` · ${failures} 项失败` : ''}${stopped ? ` · ${stopped} 项已停止` : ''}`}
          </span>
        </summary>
        <div>
          {group.map((message) => (
            <AgentMessageRow key={message.id} message={message} pageId={pageId} />
          ))}
        </div>
      </details>
    );
  });
}

function AgentMessageRow({ message, pageId }: { message: AgentMessage; pageId: string }) {
  const { navigate, setSpacePanel, api, notify, workspace } = useWorkspace();
  if (message.request) return <AgentRequest message={message} pageId={pageId} />;
  if (message.activity?.name === 'backgroundTask') {
    const task = message.data;
    const active = message.activity.status === 'running';
    const control = (method: string, args: unknown[]) =>
      void api('agent.control', {
        pageId,
        conversationId: message.conversationId,
        method,
        params: { args },
      }).catch((error) => notify(String(error)));
    return (
      <div className="agent-task" role="group" aria-label={`Agent 任务 ${task.description || task.task_id}`}>
        <strong>{task.description || task.task_id}</strong>
        <small>
          {active
            ? task.is_backgrounded
              ? '后台运行中'
              : '运行中'
            : task.status === 'completed'
              ? '已完成'
              : task.status === 'stopped' || task.status === 'killed'
                ? '已停止'
                : '执行失败'}
          {task.usage
            ? ` · ${Math.round(task.usage.duration_ms / 1000)} 秒 · ${task.usage.tool_uses} 次工具调用`
            : ''}
        </small>
        {task.summary && <p>{task.summary}</p>}
        {active && (
          <div className="agent-control-shortcuts">
            {!task.is_backgrounded && task.tool_use_id && (
              <button onClick={() => control('backgroundTasks', [task.tool_use_id])}>移到后台</button>
            )}
            <button onClick={() => control('stopTask', [task.task_id])}>停止任务</button>
          </div>
        )}
        <details>
          <summary>任务详情</summary>
          <pre>{JSON.stringify(task, null, 2)}</pre>
        </details>
      </div>
    );
  }
  if (message.data?.method === 'turn/plan/updated')
    return (
      <div className="agent-plan">
        <strong>任务计划</strong>
        {message.data.params.plan?.map((step: any, index: number) => (
          <div key={index}>
            {step.status === 'completed' ? (
              <Check size={14} />
            ) : step.status === 'inProgress' ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <Square size={14} />
            )}
            <span>{step.step}</span>
          </div>
        ))}
      </div>
    );
  if (message.kind === 'activity')
    return (
      <details className="agent-activity" data-status={message.activity?.status}>
        <summary>
          <ChevronRight size={13} className="agent-activity-chevron" />
          {message.activity?.status === 'running' ? (
            <LoaderCircle size={13} className="spin" />
          ) : message.activity?.status === 'error' ? (
            <CircleAlert size={13} />
          ) : message.activity?.status === 'stopped' ? (
            <Square size={13} />
          ) : (
            <Check size={13} />
          )}
          <span>{activityLabel(message.activity?.name)}</span>
          {activityCaption(message) && <span className="agent-activity-caption">{activityCaption(message)}</span>}
        </summary>
        <pre>{message.activity?.summary || '（无输入）'}</pre>
        {message.activity?.output !== undefined && (
          <pre className="agent-tool-output">
            {(message.data?.type === 'fileChange'
              ? message.activity.output
              : message.data?.method === 'turn/diff/updated'
                ? message.data.params.diff
                : message.activity.output || '（无输出）'
            )
              .split('\n')
              .map((line: string, index: number) => (
                <span
                  key={index}
                  className={line.startsWith('+') ? 'diff-added' : line.startsWith('-') ? 'diff-removed' : ''}
                >
                  {line}
                  {'\n'}
                </span>
              ))}
          </pre>
        )}
        {workspace!.spaces?.[pageId]?.engine === 'claude' &&
          message.activity?.name === 'Bash' &&
          message.activity.status === 'running' && (
            <button
              onClick={() =>
                void api('agent.control', {
                  pageId,
                  conversationId: message.conversationId,
                  method: 'backgroundTasks',
                  params: { args: [message.engineId] },
                }).catch((error) => notify(String(error)))
              }
            >
              移到后台
            </button>
          )}
      </details>
    );
  if (message.role === 'user')
    return (
      <div className="agent-message user">
        {message.text && <div>{linkify(message.text)}</div>}
        {message.engineId && workspace!.spaces?.[pageId]?.engine === 'claude' && (
          <AgentRewind pageId={pageId} message={message} />
        )}
        {!!message.context?.length && (
          <div className="agent-contexts">
            {message.context.map((context, index) => (
              <button
                className="agent-context-chip"
                key={`${context.pageId}:${index}`}
                onClick={() => navigate(context.pageId)}
                title={context.quote}
              >
                <FileText size={13} />
                {context.title || '引用页面'}
                {context.blockId ? ' · 选区' : ''}
              </button>
            ))}
          </div>
        )}
        {!!message.attachments?.length && (
          <div className="agent-attachments">
            {message.attachments.map((file) => (
              <button
                className="agent-attachment"
                key={file.id}
                onClick={() => setSpacePanel({ pageId, fileId: file.id })}
              >
                {file.mimeType?.startsWith('image/') ? (
                  <img src={file.url} alt={file.name} />
                ) : (
                  <FileText size={18} />
                )}
                <span>{file.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  if (message.role === 'system') {
    if ((message.text?.length || 0) > 300 || message.text?.includes('\n'))
      return (
        <details className="agent-notice">
          <summary>
            <CircleAlert size={14} />
            <span>{message.text?.split('\n')[0].slice(0, 100)}</span>
          </summary>
          <pre>{message.text}</pre>
        </details>
      );
    return <div className="agent-message system">{message.text}</div>;
  }
  return (
    <div className="agent-message agent">
      <Markdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) =>
          /^(mininotion:\/\/|asset:\/\/local\/|file:\/\/)/.test(url) ? url : defaultUrlTransform(url)
        }
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(event) => {
                if (!href) return;
                const file = href.match(/^mininotion:\/\/space\/([^/]+)\/file\/([^/]+)$/);
                const page = href.match(/^mininotion:\/\/page\/([^/]+)$/);
                if (file) {
                  event.preventDefault();
                  setSpacePanel({ pageId: file[1], fileId: file[2] });
                } else if (page) {
                  event.preventDefault();
                  navigate(page[1]);
                } else if (
                  !/^[a-z][a-z0-9+.-]*:/i.test(href) ||
                  href.startsWith('file://') ||
                  href.startsWith('asset://local/')
                ) {
                  event.preventDefault();
                  void api('file.resolve', { pageId, path: href })
                    .then(setSpacePanel)
                    .catch((error) => notify(String(error)));
                } else if (window.native) {
                  event.preventDefault();
                  void window.native.openExternal(href);
                }
              }}
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="agent-table">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {message.text || ''}
      </Markdown>
    </div>
  );
}
