import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { engineOf } from './engine';
import type { EngineHost, EngineSession } from './session';
import { ClaudeControl } from './claudeControl';

export const claudeControls = [
  'initializationResult',
  'supportedCommands',
  'supportedModels',
  'supportedAgents',
  'mcpServerStatus',
  'accountInfo',
  'getContextUsage',
  'reloadPlugins',
  'reloadSkills',
  'reloadOutputStyles',
  'rewindFiles',
  'seedReadState',
  'reconnectMcpServer',
  'toggleMcpServer',
  'setMcpServers',
  'stopTask',
  'backgroundTasks',
  'setModel',
  'setPermissionMode',
  'setMcpPermissionModeOverride',
  'setMaxThinkingTokens',
  'applyFlagSettings',
  'updateSettings',
  'readFile',
  'reinitialize',
  'usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET',
];

/** The official SDK owns the agent loop, control protocol and CLI process. */
export class ClaudeSession implements EngineSession {
  private native = new ClaudeControl();
  private query!: Query;
  private ready: Promise<void>;
  private queue: SDKUserMessage[] = [];
  private wake?: () => void;
  private closed = false;
  private stderr = '';
  private currentInput?: string;
  private configInputs = new Map<string, { text: string; before: any }>();
  constructor(private host: EngineHost) {
    this.ready = this.initialize();
    void this.ready.catch((error) => host.event({ type: 'adapter_error', message: error.message }));
  }
  private async *input(): AsyncGenerator<SDKUserMessage> {
    while (!this.closed) {
      if (this.queue.length) yield this.queue.shift()!;
      else
        await new Promise<void>((resolve) => {
          this.wake = resolve;
        });
    }
  }
  private async initialize() {
    const sdk = process.env.AGENTS_COMPANY_CLAUDE_SDK;
    const { query } = await (sdk ? import(pathToFileURL(sdk).href) : import('@anthropic-ai/claude-agent-sdk'));
    const { options, environment } = this.host;
    const command =
      options.command || process.env.MINI_NOTION_AGENT_CLAUDE || process.env.AGENTS_COMPANY_CLAUDE_BIN
        ? engineOf('claude').command(options.command || process.env.MINI_NOTION_AGENT_CLAUDE || process.env.AGENTS_COMPANY_CLAUDE_BIN)
        : undefined;
    this.query = query({
      prompt: this.input(),
      options: {
        ...options.sdk,
        cwd: environment.cwd,
        env: environment.env,
        resume: this.host.sessionId,
        forkSession: this.host.forkSession,
        model: options.model || undefined,
        effort: options.effort as any,
        ...(options.thinking == null
          ? {}
          : { thinking: options.thinking ? { type: 'adaptive' as const } : { type: 'disabled' as const } }),
        settings: options.config as any,
        settingSources: options.sdk?.settingSources || ['user', 'project', 'local'],
        permissionMode: options.mode === 'plan' ? 'plan' : ((options.approval || 'acceptEdits') as any),
        systemPrompt: { type: 'preset', preset: 'claude_code', append: this.host.instructions },
        includePartialMessages: true,
        enableFileCheckpointing: true,
        debugFile: path.join(environment.runtime, 'claude-debug.log'),
        sandbox: { enabled: false }, // The entire CLI process already runs in the Workspace OS sandbox.
        ...(command ? { pathToClaudeCodeExecutable: command.binary } : {}),
        spawnClaudeCodeProcess: (spawnOptions) => {
          const binary =
            command?.binary ||
            spawnOptions.command.replace(
              `${path.sep}app.asar${path.sep}`,
              `${path.sep}app.asar.unpacked${path.sep}`,
            );
          const child = environment.spawn(binary, [...(command?.prefix || []), ...spawnOptions.args], {
            signal: spawnOptions.signal,
            env: spawnOptions.env,
          });
          child.stderr!.setEncoding('utf8');
          child.stderr!.on('data', (text) => {
            this.stderr = (this.stderr + text).slice(-8000);
            this.host.event({ type: 'adapter_stderr', text });
          });
          return this.native.attach(child);
        },
        canUseTool: async (tool, input, context) => {
          const result = await this.host.request(tool === 'AskUserQuestion' ? 'question' : 'approval', {
            tool,
            input,
            toolUseId: context.toolUseID,
            title: context.title,
            displayName: context.displayName,
            decisionReason: context.decisionReason,
            suggestions: context.suggestions,
            blockedPath: context.blockedPath,
          });
          return result?.behavior === 'allow'
            ? { ...result, behavior: 'allow', updatedInput: result.updatedInput || input }
            : { ...result, behavior: 'deny', message: result?.message || '未获得有效许可' };
        },
        onElicitation: (request, { signal }) => this.host.request('elicitation', request, signal),
        stderr: (text) => this.host.event({ type: 'adapter_stderr', text }),
      },
    });
    void this.consume();
    const info = await this.query.initializationResult();
    // The IDE uses this control to apply its Thinking switch to resumed CLI sessions too.
    if (options.thinking === false) await this.query.setMaxThinkingTokens(0);
    this.host.event({
      type: 'adapter_capabilities',
      ...info,
      models: info.models || [],
      commands: info.commands || [],
      controls: claudeControls,
    });
  }
  private async consume() {
    try {
      for await (const message of this.query) {
        const data = message as any;
        if (data.type === 'command_lifecycle' && data.state === 'started')
          this.currentInput = data.command_uuid;
        if (data.type === 'result') {
          const id = data.user_message_uuid || this.currentInput;
          const input = id && this.configInputs.get(id);
          if (input) {
            this.configInputs.delete(id);
            try {
              if (input.before) await this.syncConfig(input.before, input.text);
            } catch (error) {
              this.host.event({ type: 'adapter_warning', message: `无法刷新配置：${error}` });
            }
          }
        }
        if (message.type === 'system' && message.subtype === 'init') this.host.sessionId = message.session_id;
        this.host.event(message);
      }
      if (!this.closed) this.host.event({ type: 'adapter_error', message: `Claude 连接已结束${this.stderr ? ': ' + this.stderr.trim() : ''}` });
    } catch (error) {
      if (!this.closed) this.host.event({ type: 'adapter_error', message: `${error}${this.stderr ? '\n' + this.stderr.trim() : ''}` });
    }
  }
  async send(text: string, images: string[] = [], uuid = randomUUID()) {
    await this.ready;
    if (/^\/(config|settings)(\s|$)/.test(text))
      this.configInputs.set(uuid, {
        text,
        before: await this.native.request({ subtype: 'get_settings' }).catch(() => null),
      });
    const content: any[] = [{ type: 'text', text }];
    for (const file of images)
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: /\.png$/i.test(file)
            ? 'image/png'
            : /\.webp$/i.test(file)
              ? 'image/webp'
              : /\.gif$/i.test(file)
                ? 'image/gif'
                : 'image/jpeg',
          data: fs.readFileSync(file).toString('base64'),
        },
      });
    this.queue.push({
      type: 'user',
      message: { role: 'user', content },
      parent_tool_use_id: null,
      session_id: this.host.sessionId || '',
      uuid,
    });
    this.wake?.();
  }
  async interrupt() {
    await this.ready;
    await this.query.interrupt();
  }
  private async syncConfig(before: any, text: string) {
    const after = await this.native.request({ subtype: 'get_settings' });
    const changes: EngineHost['options'] = {};
    if (before.applied?.model !== after.applied?.model) changes.model = after.applied?.model || '';
    if (before.applied?.effort !== after.applied?.effort) changes.effort = after.applied?.effort || '';
    if (before.effective?.alwaysThinkingEnabled !== after.effective?.alwaysThinkingEnabled)
      changes.thinking = after.effective?.alwaysThinkingEnabled ?? null;
    if (/\bpermissionMode=/.test(text)) {
      const info = (await this.query.reinitialize()) as any;
      const mode = info.current_permission_mode;
      if (mode) {
        changes.mode = mode === 'plan' ? 'plan' : 'agent';
        if (mode !== 'plan') changes.approval = mode;
      }
    }
    if (Object.keys(changes).length) {
      this.host.options = { ...this.host.options, ...changes };
      this.host.event({ type: 'adapter_options', options: changes });
    }
  }
  async configure(options: EngineHost['options']) {
    await this.ready;
    if (options.model !== this.host.options.model) await this.query.setModel(options.model || undefined);
    if (options.mode !== this.host.options.mode || options.approval !== this.host.options.approval)
      await this.query.setPermissionMode(
        options.mode === 'plan' ? 'plan' : ((options.approval || 'acceptEdits') as any),
      );
    if (options.effort !== this.host.options.effort)
      await this.query.applyFlagSettings({ effortLevel: options.effort ? (options.effort as any) : null });
    this.host.options = options;
  }
  async control(method: string, params: any = {}) {
    await this.ready;
    if (claudeControls.includes(method)) return (this.query as any)[method](...(params?.args || []));
    return this.native.request({ ...params, subtype: method });
  }
  async protocol() {
    return {
      engine: 'claude',
      methods: [
        ...claudeControls.map((name) => ({
          name,
          description: '官方 Agent SDK；参数按调用顺序放入 args 数组',
          params: { type: 'object', properties: { args: { type: 'array' } } },
        })),
        ...JSON.parse(fs.readFileSync(path.join(__dirname, 'claude-protocol.json'), 'utf8')),
      ],
    };
  }
  close() {
    this.closed = true;
    this.native.close();
    this.configInputs.clear();
    this.wake?.();
    this.query?.close();
  }
}
