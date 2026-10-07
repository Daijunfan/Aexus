import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { engineOf } from './engine';
import { allPages } from './pagination';
import type { EngineHost, EngineSession } from './session';

/** Official app-server JSON-RPC, also used by the Codex IDE extension. */
export class CodexSession implements EngineSession {
  private child: ChildProcess;
  private nextId = 0;
  private pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
  private ready: Promise<void>;
  private threadId = '';
  private resolvedModel = '';
  private threadReady?: Promise<void>;
  private turnId = '';
  private closed = false;
  private failure?: Error;
  private mcpStatus = new Map<string, any>();
  private mcpReload?: Promise<any>;
  private stderr = '';
  constructor(private host: EngineHost) {
    const command = engineOf('codex').command(host.options.command);
    this.child = host.environment.spawn(command.binary, [
      ...command.prefix,
      '-c',
      'mcp_oauth_credentials_store="file"',
      'app-server',
      '--stdio',
    ]);
    this.child.stdin!.on('error', (error) => this.fail(error));
    this.child.stderr!.on('data', (data) => {
      this.stderr = (this.stderr + data).slice(-8000);
    });
    createInterface({ input: this.child.stdout! }).on('line', (line) => {
      let data: any;
      try {
        data = JSON.parse(line);
      } catch {
        return;
      }
      if (data.id !== undefined && !data.method) {
        const call = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) call?.reject(new Error(data.error.message));
        else call?.resolve(data.result);
      } else if (data.id !== undefined) {
        void this.host.request(data.method, data.params).then(
          (result) => this.write({ id: data.id, result }),
          (error) => this.write({ id: data.id, error: { code: -32000, message: String(error) } }),
        );
      } else {
        if (data.method === 'mcpServer/oauthLogin/completed' && data.params.success) {
          this.reloadMcp(data.params.name);
        }
        if (data.method === 'mcpServer/startupStatus/updated')
          this.mcpStatus.set(`${data.params.threadId || ''}:${data.params.name}`, data.params);
        if (data.method === 'turn/started') this.turnId = data.params.turn.id;
        if (data.method === 'turn/completed') this.turnId = '';
        this.host.event(data);
      }
    });
    this.child.on('error', (error) => this.fail(error));
    this.child.on('close', (code) => {
      if (!this.closed) this.fail(new Error(`Codex 已退出 (${code}) ${this.stderr}`));
    });
    this.ready = this.initialize();
    void this.ready.catch((error) => this.fail(error));
  }
  private fail(error: Error) {
    if (this.failure) return;
    this.failure = error;
    for (const call of this.pending.values()) call.reject(error);
    this.pending.clear();
    if (!this.closed) this.host.event({ type: 'adapter_error', message: error.message });
  }
  private write(data: any) {
    if (!this.closed) this.child.stdin!.write(JSON.stringify(data) + '\n');
  }
  private rpc(method: string, params: any = {}): Promise<any> {
    if (this.closed || this.failure) return Promise.reject(this.failure || new Error('Codex 连接已关闭'));
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      this.write({ id, method, params });
    });
  }
  private async initialize() {
    const initialization = await this.rpc('initialize', {
      clientInfo: { name: 'mini_notion', title: 'Mini Notion', version: '1.11.0' },
      capabilities: { experimentalApi: true },
    });
    this.write({ method: 'initialized' });
    const models = await allPages<any>((cursor) =>
      this.rpc('model/list', { includeHidden: false, limit: 100, cursor }),
    );
    const skills = await this.rpc('skills/list', { cwds: [this.host.environment.cwd] });
    this.host.event({
      type: 'adapter_capabilities',
      models: models.data,
      commands: (skills.data || []).flatMap((entry: any) => entry.skills || []),
      engine: 'codex',
      initialization,
    });
  }
  private ensureThread() {
    return (this.threadReady ||= this.openThread());
  }
  private async openThread() {
    await this.ready;
    const options = this.host.options;
    const config = {
      ...options.config,
      mcp_oauth_credentials_store: 'file',
      allow_login_shell: false,
      'sandbox_workspace_write.network_access': true,
    };
    const result = await this.rpc(
      this.host.forkSession ? 'thread/fork' : this.host.sessionId ? 'thread/resume' : 'thread/start',
      {
        ...(this.host.sessionId ? { threadId: this.host.sessionId } : {}),
        cwd: this.host.environment.cwd,
        model: options.model || null,
        approvalPolicy: options.approval || 'on-request',
        sandbox: 'danger-full-access',
        config,
        developerInstructions: this.host.instructions,
      },
    );
    this.threadId = result.thread.id;
    this.resolvedModel = result.model;
    this.host.event({
      type: 'adapter_session',
      id: this.threadId,
      model: result.model,
      modelProvider: result.modelProvider,
    });
  }
  async send(text: string, images: string[] = []) {
    await this.ensureThread();
    await this.mcpReload;
    const { options, environment } = this.host;
    const result = await this.rpc('turn/start', {
      threadId: this.threadId,
      cwd: environment.cwd,
      input: [
        { type: 'text', text, text_elements: [] },
        ...images.map((file) => ({ type: 'localImage', path: file })),
      ],
      model: options.model || null,
      effort: options.effort || null,
      serviceTier: options.serviceTier || null,
      collaborationMode: {
        mode: options.mode === 'plan' ? 'plan' : 'default',
        settings: {
          model: options.model || this.resolvedModel,
          reasoning_effort: options.effort || null,
          developer_instructions: null,
        },
      },
      approvalPolicy: options.approval || 'on-request',
      sandboxPolicy: { type: 'externalSandbox', networkAccess: 'enabled' },
    });
    this.turnId = result.turn.id;
  }
  async interrupt() {
    await this.ready;
    if (this.turnId) await this.rpc('turn/interrupt', { threadId: this.threadId, turnId: this.turnId });
  }
  async configure(options: EngineHost['options']) {
    this.host.options = options;
  }
  async protocol() {
    const directory = path.join(this.host.environment.runtime, 'protocol');
    const command = engineOf('codex').command(this.host.options.command);
    await new Promise<void>((resolve, reject) => {
      const process = this.host.environment.spawn(command.binary, [
        ...command.prefix,
        'app-server',
        'generate-json-schema',
        '--experimental',
        '--out',
        directory,
      ]);
      let error = '';
      process.stderr!.on('data', (data) => {
        error += data;
      });
      process.once('error', reject);
      process.once('close', (code) =>
        code === 0 ? resolve() : reject(new Error(error || `Schema 导出失败 (${code})`)),
      );
    });
    const schema = JSON.parse(fs.readFileSync(path.join(directory, 'ClientRequest.json'), 'utf8'));
    return {
      engine: 'codex',
      methods: schema.oneOf.map((item: any) => ({
        name: item.properties.method.enum[0],
        description: item.description || '',
        params: item.properties.params,
      })),
      definitions: schema.definitions,
    };
  }
  async control(method: string, params: any = {}) {
    if (method === 'config/mcpServer/reload') return this.reloadMcp();
    await this.ready;
    if (method === 'mcpServerStatus/list' || /^(turn\/(start|steer)|review\/start)$/.test(method))
      await this.mcpReload;
    // The outer OS sandbox remains authoritative even for native control operations.
    let input = params;
    if (
      /^(thread|turn|review)\//.test(method) ||
      ['mcpServerStatus/list', 'mcpServer/oauth/login'].includes(method)
    ) {
      await this.ensureThread();
      input = { ...params, threadId: this.threadId };
    }
    if (method === 'turn/steer') input.expectedTurnId = this.turnId;
    if (method === 'config/read') input = { ...params, cwd: this.host.environment.cwd };
    const result = await this.rpc(method, input);
    if (method === 'mcpServerStatus/list') {
      const servers = new Map<string, any>(
        (result.data || []).map((server: any) => [
          server.name,
          { ...(server.serverInfo ? { status: 'ready' } : {}), ...server },
        ]),
      );
      for (const state of this.mcpStatus.values()) {
        if (state.threadId && state.threadId !== this.threadId) continue;
        if (!servers.has(state.name)) continue;
        servers.set(state.name, {
          tools: {},
          ...servers.get(state.name),
          name: state.name,
          status: state.status,
          error: state.error,
          failureReason: state.failureReason,
        });
      }
      for (const [name, server] of servers)
        if (this.host.options.config?.mcp_servers?.[name]?.enabled === false)
          servers.set(name, { ...server, status: 'disabled' });
      return { ...result, data: [...servers.values()] };
    }
    if (method === 'review/start') {
      this.turnId = result.turn.id;
      this.threadId = result.reviewThreadId;
      this.host.event({
        type: 'adapter_session',
        id: this.threadId,
        model: this.host.options.model || this.resolvedModel,
      });
    }
    return result;
  }
  close() {
    this.closed = true;
    for (const call of this.pending.values()) call.reject(new Error('会话已关闭'));
    this.pending.clear();
    this.child.stdin?.end();
    this.child.kill('SIGTERM');
  }
  reloadMcp(serverName?: string) {
    if (serverName)
      for (const [key, state] of this.mcpStatus) if (state.name === serverName) this.mcpStatus.delete(key);
    this.mcpReload = this.ready.then(() => this.rpc('config/mcpServer/reload', null));
    void this.mcpReload.catch(() => {}); // Awaited by inventory and turn requests.
    return this.mcpReload;
  }
}
