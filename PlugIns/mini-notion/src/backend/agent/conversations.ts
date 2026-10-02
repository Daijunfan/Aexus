import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { DataService } from '../service';
import type { AgentConfig, AgentSessionRecord } from '../../types';
import { agentConversationId, getAgent, setAgentState } from '../../core/spaces';
import { CommandError } from '../../core/errors';

export function conversations(service: DataService, pageId: string): AgentSessionRecord[] {
  const { sessions = [], ...state } = getAgent(service.workspace!, pageId);
  const conversationId = agentConversationId(state);
  const previous = sessions.find((item) => (item.conversationId || item.id) === conversationId);
  const current: AgentSessionRecord = {
    ...previous,
    id: state.sessionId || conversationId,
    conversationId,
    state,
    title:
      previous?.title ||
      service.storage
        .readAgentLog(pageId, Infinity, conversationId)
        .find((message) => message.role === 'user')
        ?.text?.slice(0, 80) ||
      '新会话',
    at: previous?.at || state.startedAt || Date.now(),
    queue: state.queue,
    closed: false,
    unread: false,
  };
  return previous ? sessions.map((item) => (item === previous ? current : item)) : [...sessions, current];
}

/** Migrate the former current log once. Existing archived native-session logs already use this path. */
export function conversationLog(service: DataService, pageId: string, conversationId?: string) {
  const agent = getAgent(service.workspace!, pageId, conversationId);
  const id = agentConversationId(agent);
  const file = service.storage.agentLogFile(pageId, id);
  const legacy = service.storage.agentLogFile(pageId);
  if (
    !fs.existsSync(file) &&
    id === agentConversationId(getAgent(service.workspace!, pageId)) &&
    fs.existsSync(legacy)
  ) {
    fs.copyFileSync(legacy, file);
    const events = legacy.replace(/\.jsonl$/, '.events.jsonl');
    const target = file.replace(/\.jsonl$/, '.events.jsonl');
    if (fs.statSync(legacy).size && fs.existsSync(events) && !fs.existsSync(target))
      fs.copyFileSync(events, target);
  }
  return file;
}

export function selectConversation(service: DataService, pageId: string, method: string, sessionId?: string) {
  service.agents.session(pageId).flush();
  const current = getAgent(service.workspace!, pageId);
  const currentId = agentConversationId(current);
  conversationLog(service, pageId);
  const sessions = conversations(service, pageId);
  const fork = method === 'agent.fork';
  if (fork && (!current.sessionId || service.agents.session(pageId).isRunning()))
    throw new CommandError('AGENT_BUSY', '请在当前会话执行完成后建立分支');
  const selected =
    method === 'agent.resume' &&
    sessionId &&
    sessions.find((item) => item.id === sessionId || item.conversationId === sessionId);
  if (method === 'agent.resume' && !selected) throw new CommandError('SESSION_NOT_FOUND', '会话不属于此空间');
  const next: AgentConfig = selected
    ? { ...getAgent(service.workspace!, pageId, selected.conversationId || selected.id) }
    : {
        engine: current.engine,
        conversationId: randomUUID(),
        options: current.options,
        status: 'idle',
        messages: [],
        queue: [],
        ...(fork ? { sessionId: current.sessionId, forkSession: true } : {}),
      };
  const id = agentConversationId(next);
  const log = service.storage.agentLogFile(pageId, id);
  if (fork) {
    conversationLog(service, pageId, currentId);
    const messages = service.storage
      .readAgentLog(pageId, 10000, currentId)
      .map((message) => ({ ...message, conversationId: id }));
    service.storage.appendAgentLog(pageId, messages, id);
  }
  next.messages = service.storage.readAgentLog(pageId, 50, id);
  fs.mkdirSync(service.storage.agentsDirectory, { recursive: true, mode: 0o700 });
  if (fs.existsSync(log)) fs.copyFileSync(log, service.storage.agentLogFile(pageId));
  else fs.writeFileSync(service.storage.agentLogFile(pageId), '', { mode: 0o600 });
  // Explicitly replace conversation state so errors, capabilities and native IDs cannot leak across tabs.
  const agent = {
    ...next,
    sessions: sessions.map((item) =>
      (item.conversationId || item.id) === id ? { ...item, closed: false, unread: false } : item,
    ),
  };
  return {
    ...service.workspace!,
    spaces: { ...service.workspace!.spaces, [pageId]: { ...service.workspace!.spaces![pageId], agent } },
  };
}

export function closeConversation(service: DataService, pageId: string, conversationId?: string) {
  const id = agentConversationId(getAgent(service.workspace!, pageId, conversationId));
  service.agents.session(pageId, id).stop();
  const sessions = conversations(service, pageId).map((session) =>
    (session.conversationId || session.id) === id ? { ...session, closed: true } : session,
  );
  return setAgentState(
    setAgentState(service.workspace!, pageId, { sessions }),
    pageId,
    { queuePaused: true },
    id,
  );
}
