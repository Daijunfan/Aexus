import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spaceFilePath } from '../files';
import { spaceInstructions } from './prompt';
import { agentEnvironment, type AgentEnvironment } from './environment';
import { CodexSession } from './codex';
import { ClaudeSession } from './claude';
import { allPages } from './pagination';
import type { EngineSession } from './session';
import type { DataService } from '../service';
import type { AgentConfig, AgentContext, AgentMessage, SpaceEngine, SpaceFileRecord } from '../../types';
import { agentConversationId, getAgent } from '../../core/spaces';
import { CommandError } from '../../core/errors';
import { isAgentTelemetry } from '../../core/agentTranscript';

type Connection = {
  conversationVersion: number;
  token: string;
  ready: Promise<EngineSession>;
  engine?: EngineSession;
  environment?: AgentEnvironment;
  sessionId?: string;
  running: boolean;
  stopping?: boolean;
  commands: Set<string>;
  messages: Map<string, AgentMessage>;
  messageId?: string;
  options?: AgentConfig['options'];
  capabilities?: AgentConfig['capabilities'];
  reconnect?: boolean;
  pending: Map<string, (answer: any) => void>;
  dirty: Set<string>;
  timer?: ReturnType<typeof setTimeout>;
};
const cancelInput = (message?: AgentMessage) =>
  message?.request?.method.toLowerCase().includes('elicitation')
    ? { action: 'cancel' }
    : { behavior: 'deny', decision: 'cancel', answers: {} };

/** Each conversation owns its engine, approvals, queue and gateway identity. */
export class AgentRuntime {
  private sessions = new Map<string, AgentSession>();
  constructor(private service: DataService) {}
  session(pageId: string, conversationId?: string) {
    const agent = getAgent(this.service.workspace!, pageId, conversationId);
    const id = agentConversationId(agent);
    const key = `${pageId}:${id}`;
    let session = this.sessions.get(key);
    if (!session) {
      session = new AgentSession(this.service, pageId, id);
      this.sessions.set(key, session);
    }
    return session;
  }
  scopeFor(token: string) {
    for (const session of this.sessions.values())
      if (session.hasToken(token))
        return { pageId: session.pageId, conversationId: session.conversationId, mode: session.mode };
    throw new CommandError('SPACE_ACCESS_DENIED', 'Agent 执行身份已失效');
  }
  stop(pageId: string) {
    for (const session of this.sessions.values()) if (session.pageId === pageId) session.finish(true);
  }
  hasWork(pageId: string) {
    return [...this.sessions.values()].some(
      (session) => session.pageId === pageId && (session.isRunning() || session.hasBackgroundWork()),
    );
  }
  mcpCredentialsChanged(pageId: string, sourceId: string, serverName: string) {
    for (const session of this.sessions.values())
      if (session.pageId === pageId && session.conversationId !== sourceId) session.reloadMcp(serverName);
  }
  authenticationChanged(pageId: string, sourceId: string, logout = false) {
    for (const session of this.sessions.values())
      if (session.pageId === pageId)
        session.authenticationChanged(logout || session.conversationId !== sourceId);
  }
  stopAll() {
    for (const session of this.sessions.values()) session.disconnect();
    this.sessions.clear();
  }
}

class AgentSession {
  private connection?: Connection;
  constructor(
    private service: DataService,
    readonly pageId: string,
    readonly conversationId: string,
  ) {}
  hasToken(token: string) {
    return this.connection?.token === token;
  }
  reloadMcp(serverName: string) {
    const connection = this.connection;
    if (!connection) return;
    const reload = connection.engine
      ? Promise.resolve(connection.engine.reloadMcp?.(serverName))
      : connection.ready.then((engine) =>
          this.connection === connection ? engine.reloadMcp?.(serverName) : undefined,
        );
    void reload.catch((error) => {
      if (this.connection === connection)
        this.record({
          id: randomUUID(),
          role: 'system',
          kind: 'text',
          text: `MCP 凭据已更新，但重新加载失败：${error}`,
          at: Date.now(),
        });
    });
  }
  get mode() {
    return this.connection?.environment?.mode || this.connection?.options?.mode || 'agent';
  }
  isRunning() {
    return !!this.connection?.running;
  }
  hasBackgroundWork() {
    if (this.connection?.pending.size) return true;
    return [...(this.connection?.messages.values() || [])].some(
      (message) => message.activity?.name === 'backgroundTask' && message.activity.status === 'running',
    );
  }
  private space() {
    const page = this.service.workspace?.pages.find((p) => p.id === this.pageId && p.space && !p.trashedAt);
    const metadata = this.service.workspace?.spaces?.[this.pageId];
    const space = metadata && {
      ...metadata,
      agent: getAgent(this.service.workspace!, this.pageId, this.conversationId),
    };
    if (!page || !space) throw new CommandError('NOT_A_SPACE', '此页面不是空间');
    return { page, space };
  }
  private apply(changes: Partial<AgentConfig>) {
    const conversationVersion = this.connection?.conversationVersion;
    void this.service.request(
      {
        jsonrpc: '2.0',
        id: randomUUID(),
        method: 'agent.state',
        client: 'agent',
        params: {
          pageId: this.pageId,
          conversationId: this.conversationId,
          changes: { ...changes, conversationId: this.conversationId },
          conversationVersion,
        },
      },
      true,
    );
  }
  private record(message: AgentMessage) {
    const connection = this.connection;
    if (!connection) return;
    message.sessionId ||= connection.sessionId;
    message.conversationId = this.conversationId;
    connection.messages.set(message.id, message);
    connection.dirty.add(message.id);
    if (!connection.timer) connection.timer = setTimeout(() => this.flush(), 100);
  }
  flush() {
    const connection = this.connection;
    if (!connection) return;
    clearTimeout(connection.timer);
    connection.timer = undefined;
    const messages = [...connection.dirty].map((id) => connection.messages.get(id)!);
    connection.dirty.clear();
    if (!messages.length) return;
    this.service.storage.appendAgentLog(this.pageId, messages, this.conversationId);
    const selected = this.service.workspace?.spaces?.[this.pageId]?.agent;
    if (selected && agentConversationId(selected) === this.conversationId)
      this.service.storage.appendAgentLog(this.pageId, messages);
    void this.service.request(
      {
        jsonrpc: '2.0',
        id: randomUUID(),
        method: 'agent.append',
        client: 'agent',
        params: {
          pageId: this.pageId,
          conversationId: this.conversationId,
          messages,
          conversationVersion: connection.conversationVersion,
        },
      },
      true,
    );
    for (const message of messages)
      this.service.broadcast({
        type: 'agent',
        pageId: this.pageId,
        conversationId: this.conversationId,
        event: { kind: 'message', message },
      });
  }
  connect() {
    let existing = this.connection;
    if (existing && !existing.running && this.space().space.agent.status === 'error') {
      this.disconnect();
      existing = undefined;
    }
    if (existing) return existing.ready;
    const { page, space } = this.space();
    fs.mkdirSync(this.service.storage.agentsDirectory, { recursive: true, mode: 0o700 });
    const connection: Connection = {
      token: randomUUID(),
      conversationVersion: space.agent.conversationVersion || 0,
      running: false,
      commands: new Set(),
      options: space.agent.options,
      capabilities: space.agent.capabilities,
      messages: new Map(
        this.service.storage
          .readAgentLog(this.pageId, Infinity, this.conversationId)
          .filter((message: AgentMessage) => !isAgentTelemetry(message.data))
          .slice(-10000)
          .map((message: AgentMessage) => [message.id, message]),
      ),
      pending: new Map(),
      dirty: new Set(),
      ready: undefined!,
    };
    this.connection = connection;
    connection.ready = agentEnvironment(
      this.service,
      this.pageId,
      connection.token,
      this.conversationId,
      space.agent.options?.mode,
    ).then((environment) => {
      if (this.connection !== connection) {
        environment.close();
        throw new Error('会话已取消');
      }
      connection.environment = environment;
      const host = {
        environment,
        options: space.agent.options || {},
        sessionId: space.agent.sessionId,
        forkSession: space.agent.forkSession,
        instructions: `${spaceInstructions(this.service.workspace!, page)}\nThe exact CLI is ${JSON.stringify(environment.launcher)}. Always invoke that absolute path. You may edit any file under ${JSON.stringify(environment.cwd)} directly. The .mininotion-runtime directory is private engine state.`,
        event: (data: any) => {
          if (this.connection === connection) this.onEvent(data);
        },
        request: (method: string, params: any, signal?: AbortSignal) =>
          this.connection === connection
            ? this.requestInput(method, params, signal)
            : Promise.reject(new Error('会话已关闭')),
      };
      connection.engine = space.engine === 'codex' ? new CodexSession(host) : new ClaudeSession(host);
      return connection.engine;
    });
    void connection.ready.catch((error) => {
      if (this.connection === connection) this.fail(String(error));
    });
    return connection.ready;
  }
  private input(prompt: string, attachments: SpaceFileRecord[], context: AgentContext[] = []) {
    const files = attachments.map((file) => ({
      ...file,
      path: spaceFilePath(this.service, this.pageId, file),
    }));
    return {
      text: [
        prompt,
        ...(context.length
          ? [
              'Referenced pages/blocks selected by the user (read these with the CLI before acting):',
              ...context.map((reference) => JSON.stringify(reference)),
            ]
          : []),
        ...(files.length
          ? [
              'Attachments saved in this Workspace:',
              ...files.map(({ id, name, path, mimeType }) => JSON.stringify({ id, name, path, mimeType })),
            ]
          : []),
      ].join('\n'),
      images: files
        .filter((file) =>
          ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.mimeType || ''),
        )
        .map((file) => file.path),
    };
  }
  start(
    prompt: string,
    engineOverride?: SpaceEngine,
    attachments: SpaceFileRecord[] = [],
    context: AgentContext[] = [],
  ) {
    const { space } = this.space();
    if (engineOverride && engineOverride !== space.engine)
      throw new CommandError('IMMUTABLE_ENGINE', 'Agent 引擎与空间绑定');
    if (!prompt.trim() && !attachments.length && !context.length)
      throw new CommandError('EMPTY_MESSAGE', '请输入文本或添加附件');
    if (this.isRunning()) throw new CommandError('AGENT_BUSY', 'Agent 正在运行，可以追加指令或停止');
    const input = this.input(prompt, attachments, context);
    const ready = this.connect();
    const connection = this.connection!;
    connection.running = true;
    this.apply({ status: 'running', startedAt: Date.now(), error: undefined, queuePaused: false });
    const userMessageId = randomUUID();
    this.record({
      id: userMessageId,
      ...(space.engine === 'claude' ? { engineId: userMessageId } : {}),
      role: 'user',
      kind: 'text',
      text: prompt,
      attachments,
      context,
      at: Date.now(),
    });
    void ready
      .then((engine) => {
        if (this.connection === connection && connection.running)
          return engine.send(input.text, input.images, userMessageId);
      })
      .catch((error) => {
        if (this.connection === connection) this.fail(String(error));
      });
    return { started: true, engine: space.engine };
  }
  async capabilities() {
    const engine = await this.connect();
    if (this.space().space.engine === 'claude') {
      const info = await engine.control('initializationResult', {});
      return { ...info, commands: this.connection?.capabilities?.commands || info.commands };
    }
    const [models, skills] = await Promise.all([
      allPages<any>((cursor) => engine.control('model/list', { limit: 100, cursor })),
      engine.control('skills/list', {
        cwds: [this.service.storage.spaceRoot(this.pageId)],
        forceReload: true,
      }),
    ]);
    return {
      models: models.data,
      commands: skills.data.flatMap((entry: any) => entry.skills || []),
      engine: 'codex',
    };
  }
  async review(target: Record<string, string>, delivery: 'inline' | 'detached') {
    if (this.isRunning()) throw new CommandError('AGENT_BUSY', '当前会话正在执行');
    const ready = this.connect();
    const connection = this.connection!;
    connection.running = true;
    this.apply({ status: 'running', startedAt: Date.now(), error: undefined });
    this.record({
      id: randomUUID(),
      role: 'user',
      kind: 'text',
      text:
        target.type === 'uncommittedChanges'
          ? '审查未提交的修改'
          : target.type === 'baseBranch'
            ? `审查与 ${target.branch} 的差异`
            : target.type === 'commit'
              ? `审查提交 ${target.sha}`
              : `代码审查：${target.instructions}`,
      data: { reviewTarget: target, delivery },
      at: Date.now(),
    });
    try {
      return await (await ready).control('review/start', { target, delivery });
    } catch (error) {
      if (this.connection === connection) this.fail(String(error));
      throw error;
    }
  }
  async control(method: string, params: any) {
    const result = await (await this.connect()).control(method, params);
    if (method === 'account/logout' || (method === 'account/login/start' && !result?.loginId))
      this.service.agents.authenticationChanged(
        this.pageId,
        this.conversationId,
        method === 'account/logout',
      );
    return result;
  }
  authenticationChanged(disconnect: boolean) {
    if (!this.connection) return;
    this.connection.capabilities = {
      models: [],
      commands: [],
      ...this.connection.capabilities,
      accountChangedAt: Date.now(),
    };
    this.apply({ capabilities: this.connection.capabilities });
    if (disconnect) this.finish(true);
  }
  async protocol() {
    return (await this.connect()).protocol();
  }
  async contextUsage() {
    if (this.space().space.engine === 'claude')
      return this.control('getContextUsage', { args: [{ detail: 'summary' }] });
    const usage = this.space().space.agent.usage;
    return {
      available: usage?.contextTokens !== undefined,
      totalTokens: usage?.contextTokens,
      maxTokens: usage?.contextWindow,
      percentage: usage?.contextWindow
        ? Math.round(((usage.contextTokens || 0) / usage.contextWindow) * 100)
        : null,
    };
  }
  async configure(options: NonNullable<AgentConfig['options']>) {
    const connection = this.connection;
    if (connection?.environment && (options.mode || 'agent') !== connection.environment.mode) {
      if (connection.running) {
        await (await connection.ready).interrupt();
        this.apply({ status: 'stopped' });
      }
      this.disconnect();
      return;
    }
    if (
      connection &&
      (JSON.stringify(options.config) !== JSON.stringify(connection.options?.config) ||
        JSON.stringify(options.sdk) !== JSON.stringify(connection.options?.sdk) ||
        options.command !== connection.options?.command ||
        options.thinking !== connection.options?.thinking)
    ) {
      if (connection.running) connection.reconnect = true;
      else this.disconnect();
      return;
    }
    if (connection) {
      await (await connection.ready).configure(options);
      connection.options = options;
    }
  }
  async steer(text: string, attachments: SpaceFileRecord[] = [], context: AgentContext[] = []) {
    if (!this.isRunning()) return this.start(text, undefined, attachments, context);
    const input = this.input(text, attachments, context);
    const engine = await this.connect();
    const userMessageId = randomUUID();
    if (this.space().space.engine === 'claude') await engine.send(input.text, input.images, userMessageId);
    else
      await engine.control('turn/steer', {
        input: [
          { type: 'text', text: input.text, text_elements: [] },
          ...input.images.map((path) => ({ type: 'localImage', path })),
        ],
      });
    this.record({
      id: userMessageId,
      ...(this.space().space.engine === 'claude' ? { engineId: userMessageId } : {}),
      role: 'user',
      kind: 'text',
      text,
      attachments,
      context,
      at: Date.now(),
    });
    return { sent: true };
  }
  private requestInput(method: string, params: any, signal?: AbortSignal): Promise<any> {
    const id = randomUUID();
    this.record({
      id,
      role: 'system',
      kind: 'activity',
      request: { id, method, params },
      activity: { name: method, status: 'running', summary: JSON.stringify(params, null, 2) },
      at: Date.now(),
    });
    this.flush();
    const connection = this.connection!;
    return new Promise((resolve) => {
      const abort = () => {
        if (this.connection === connection && connection.pending.has(id))
          this.respond(id, cancelInput(connection.messages.get(id)));
      };
      connection.pending.set(id, (answer) => {
        signal?.removeEventListener('abort', abort);
        resolve(answer);
      });
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
  }
  respond(requestId: string, result: any) {
    const connection = this.connection;
    const resolve = connection?.pending.get(requestId);
    if (!resolve) throw new CommandError('REQUEST_NOT_FOUND', '此会话中没有这个待回复请求');
    resolve(result);
    connection!.pending.delete(requestId);
    const message = connection!.messages.get(requestId)!;
    this.record({
      ...message,
      request: { ...message.request!, answered: true },
      activity: {
        ...message.activity!,
        status: result?.action === 'cancel' || result?.decision === 'cancel' ? 'stopped' : 'done',
        output: JSON.stringify(result),
      },
    });
    return { answered: true };
  }
  stop(afterStop?: () => void) {
    const connection = this.connection;
    if (!connection) return false;
    // A completed foreground turn may still own background tools.
    if (!connection.running) {
      this.finish();
      afterStop?.();
      return true;
    }
    connection.stopping = true;
    connection.environment?.stopChildren();
    for (const [id] of connection.pending) this.respond(id, cancelInput(connection.messages.get(id)));
    void connection.ready
      .then((engine) => engine.interrupt())
      .catch(() => {})
      .finally(() => {
        if (this.connection !== connection) return;
        this.finish();
        afterStop?.();
      });
    return true;
  }
  /** A removed Workspace must release every process and event source before its files are purged. */
  finish(pauseQueue = false) {
    if (!this.connection) return;
    this.apply({ status: 'stopped', endedAt: Date.now(), ...(pauseQueue ? { queuePaused: true } : {}) });
    this.disconnect(pauseQueue);
  }
  disconnect(force = false) {
    const connection = this.connection;
    if (!connection) return;
    for (const message of connection.messages.values()) {
      if (message.activity?.status !== 'running') continue;
      this.record({
        ...message,
        ...(message.request ? { request: { ...message.request, answered: true } } : {}),
        ...(message.activity.name === 'backgroundTask'
          ? { data: { ...message.data, status: 'stopped' } }
          : {}),
        activity: {
          ...message.activity,
          status: 'stopped',
          output: `${message.activity.output || ''}\n执行已结束，连接已关闭。`.trim(),
        },
      });
    }
    this.flush();
    for (const [id, resolve] of connection.pending) resolve(cancelInput(connection.messages.get(id)));
    connection.environment?.close(force);
    connection.engine?.close();
    this.connection = undefined;
  }

  private fail(message: string) {
    const connection = this.connection;
    if (!connection || connection.stopping) return;
    connection.running = false;
    this.record({ id: randomUUID(), role: 'system', kind: 'text', text: message, at: Date.now() });
    this.flush();
    this.apply({ status: 'error', error: message, endedAt: Date.now() });
    this.disconnect();
  }
  private onEvent(data: any) {
    const connection = this.connection;
    if (!connection) return;
    fs.appendFileSync(
      path.join(this.service.storage.agentsDirectory, `${this.pageId}.${this.conversationId}.events.jsonl`),
      JSON.stringify(data) + '\n',
      { mode: 0o600 },
    );
    const method = data.method || data.type;
    const params = data.params || data;
    if (method === 'mcpServer/oauthLogin/completed' && params.success)
      this.service.agents.mcpCredentialsChanged(this.pageId, this.conversationId, params.name);
    if (method === 'turn/started' && !connection.stopping) {
      connection.running = true;
      this.apply({ status: 'running' });
      return;
    }
    if (method === 'account/login/completed' && params.success)
      this.service.agents.authenticationChanged(this.pageId, this.conversationId);
    if (method === 'adapter_options') {
      const options = { ...this.space().space.agent.options, ...data.options };
      this.apply({ options });
      connection.options = options;
      if ((options.mode || 'agent') !== connection.environment?.mode) connection.reconnect = true;
      return;
    }
    if (data.type === 'system' && data.subtype === 'local_command_output') {
      this.record({
        id: data.uuid || randomUUID(),
        role: 'agent',
        kind: 'text',
        text: data.content,
        at: Date.now(),
      });
      return;
    }
    if (data.type === 'system' && data.subtype === 'commands_changed') {
      connection.capabilities = { models: [], ...connection.capabilities, commands: data.commands };
      this.apply({ capabilities: connection.capabilities });
      return;
    }
    if (data.type === 'system' && data.subtype === 'status' && data.permissionMode) {
      connection.capabilities = {
        models: [],
        commands: [],
        ...connection.capabilities,
        runtime: { ...connection.capabilities?.runtime, permissionMode: data.permissionMode },
      };
      this.apply({ capabilities: connection.capabilities });
    }
    if (isAgentTelemetry(data)) return;
    if (method === 'command_lifecycle') {
      if (data.state === 'queued' || data.state === 'started') connection.commands.add(data.command_uuid);
      if (data.state === 'completed') connection.commands.delete(data.command_uuid);
      if (data.state === 'started' && !connection.stopping) {
        connection.running = true;
        this.apply({ status: 'running' });
      }
      return;
    }
    if (method === 'adapter_error') {
      this.fail(data.message);
      return;
    }
    if (method === 'adapter_stderr') return;
    if (method === 'adapter_capabilities') {
      connection.capabilities = {
        ...connection.capabilities,
        ...data,
        ...(data.current_permission_mode
          ? {
              runtime: { ...connection.capabilities?.runtime, permissionMode: data.current_permission_mode },
            }
          : {}),
      };
      this.apply({
        capabilities: connection.capabilities,
        ...(!connection.running ? { status: 'idle', error: undefined } : {}),
      });
      return;
    }
    if (method === 'adapter_session' || (data.type === 'system' && data.subtype === 'init')) {
      connection.sessionId = data.id || data.session_id;
      connection.capabilities = { models: [], commands: [], ...connection.capabilities, runtime: data };
      if (Array.isArray(data.slash_commands)) {
        const previous = connection.capabilities.commands;
        connection.capabilities.commands = data.slash_commands.map(
          (name: string) =>
            previous.find((command) => command.name === name) || { name, description: '原生 CLI 命令' },
        );
      }
      this.apply({
        sessionId: connection.sessionId,
        forkSession: false,
        capabilities: connection.capabilities,
      });
      return;
    }
    const update = (id: string, changes: Partial<AgentMessage>) =>
      this.record({
        id,
        role: 'agent',
        kind: 'text',
        at: Date.now(),
        ...connection.messages.get(id),
        ...changes,
      });
    if (method === 'item/agentMessage/delta') {
      update(params.itemId, { text: (connection.messages.get(params.itemId)?.text || '') + params.delta });
      return;
    }
    if (method === 'item/reasoning/summaryTextDelta' || method === 'item/reasoning/textDelta') {
      const previous = connection.messages.get(params.itemId);
      update(params.itemId, {
        kind: 'activity',
        activity: {
          name: 'reasoning',
          status: 'running',
          summary: (previous?.activity?.summary || '') + params.delta,
        },
      });
      return;
    }
    if (method === 'item/started' || method === 'item/completed') {
      const item = params.item;
      if (item.type === 'userMessage') return;
      if (item.type === 'agentMessage') update(item.id, { text: item.text, data: item });
      else
        update(item.id, {
          kind: 'activity',
          data: { ...item, turnId: params.turnId },
          activity: {
            name: item.type,
            status:
              method === 'item/started'
                ? 'running'
                : ['failed', 'declined'].includes(item.status) ||
                    (item.exitCode != null && item.exitCode !== 0)
                  ? 'error'
                  : 'done',
            summary: item.command || item.text || item.summary?.join('\n') || item.tool || item.type,
            output:
              item.aggregatedOutput ??
              (item.changes
                ? item.changes.map((change: any) => `${change.path}\n${change.diff || ''}`).join('\n')
                : JSON.stringify(item, null, 2)),
          },
        });
      return;
    }
    if (method === 'item/commandExecution/outputDelta') {
      const previous = connection.messages.get(params.itemId);
      update(params.itemId, {
        kind: 'activity',
        activity: {
          name: 'commandExecution',
          status: 'running',
          ...previous?.activity,
          output: (previous?.activity?.output || '') + params.delta,
        },
      });
      return;
    }
    if (method === 'stream_event') {
      const event = data.event;
      if (event.type === 'message_start') connection.messageId = event.message.id;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const id = `${connection.messageId}:text`;
        update(id, { kind: 'text', text: (connection.messages.get(id)?.text || '') + event.delta.text });
      }
      return;
    }
    if (method === 'assistant') {
      const text = (data.message?.content || [])
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n\n');
      if (text) update(`${data.message.id}:text`, { kind: 'text', text });
      for (const [index, block] of (data.message?.content || []).entries()) {
        if (block.type === 'text' || (block.type === 'thinking' && !block.thinking)) continue;
        if (block.type === 'tool_use')
          update(block.id, {
            kind: 'activity',
            engineId: block.id,
            data: block,
            activity: { name: block.name, status: 'running', summary: JSON.stringify(block.input, null, 2) },
          });
        else
          update(`${data.message.id}:${index}`, {
            kind: 'activity',
            data: block,
            activity: {
              name: block.type,
              status: 'done',
              summary: block.thinking || block.text || block.type,
            },
          });
      }
      return;
    }
    if (method === 'user' && Array.isArray(data.message?.content)) {
      for (const block of data.message.content)
        if (block.type === 'tool_result') {
          const previous = connection.messages.get(block.tool_use_id);
          update(block.tool_use_id, {
            kind: 'activity',
            activity: {
              name: previous?.activity?.name || 'tool',
              ...previous?.activity,
              status: block.is_error ? 'error' : 'done',
              output:
                typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2),
            },
          });
        }
      return;
    }
    if (method === 'system' && /^task_(started|progress|updated|notification)$/.test(data.subtype)) {
      const id = `task:${data.task_id}`;
      const task = { ...connection.messages.get(id)?.data, ...data, ...data.patch };
      const status = task.status || 'running';
      update(id, {
        kind: 'activity',
        data: task,
        activity: {
          name: 'backgroundTask',
          status:
            status === 'failed'
              ? 'error'
              : ['killed', 'stopped'].includes(status)
                ? 'stopped'
                : status === 'completed'
                  ? 'done'
                  : 'running',
          summary: task.description || task.task_id,
          output: task.summary || task.error,
        },
      });
      return;
    }
    if (method === 'thread/tokenUsage/updated') {
      const usage = params.tokenUsage?.total;
      this.apply({
        usage: {
          input: usage?.inputTokens,
          output: usage?.outputTokens,
          contextTokens: params.tokenUsage?.last?.totalTokens,
          contextWindow: params.tokenUsage?.modelContextWindow,
        },
      });
      return;
    }
    if (method === 'result' || method === 'turn/completed') {
      connection.running =
        method === 'result' && (data.queued_turn_count ?? Math.max(0, connection.commands.size - 1)) > 0;
      this.flush();
      void this.service.request({
        jsonrpc: '2.0',
        id: randomUUID(),
        method: 'space.sync',
        params: { pageId: this.pageId },
      });
      const error = data.is_error || params.turn?.status === 'failed';
      this.apply({
        status: error
          ? 'error'
          : params.turn?.status === 'interrupted' || connection.stopping
            ? 'stopped'
            : connection.running
              ? 'running'
              : 'idle',
        endedAt: Date.now(),
        error: error ? data.result || JSON.stringify(params.turn?.error || data.errors) : undefined,
        ...(data.usage
          ? {
              usage: {
                input:
                  (data.usage.input_tokens || 0) +
                  (data.usage.cache_read_input_tokens || 0) +
                  (data.usage.cache_creation_input_tokens || 0),
                output: data.usage.output_tokens,
                costUsd: data.total_cost_usd,
                turns: data.num_turns,
              },
            }
          : {}),
      });
      if (connection.reconnect && !connection.running) this.disconnect();
      if (!error && !connection.running && !connection.stopping && params.turn?.status !== 'interrupted')
        void this.service.request(
          {
            jsonrpc: '2.0',
            id: randomUUID(),
            method: 'agent.queue',
            params: {
              pageId: this.pageId,
              conversationId: this.conversationId,
              action: 'run',
              automatic: true,
              conversationVersion: connection.conversationVersion,
            },
          },
          true,
        );
      return;
    }
    if (method === 'error' && !params.willRetry) {
      this.fail(params.error?.message || data.message || JSON.stringify(params));
      return;
    }
    if (!['turn/started', 'thread/started', 'thread/status/changed'].includes(method))
      update(data.uuid || randomUUID(), {
        kind: 'activity',
        data,
        activity: {
          name: data.subtype || method,
          status: 'done',
          summary: params.explanation || (typeof data.message === 'string' ? data.message : '') || method,
          output: JSON.stringify(params, null, 2),
        },
      });
  }
}
