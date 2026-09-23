import { FolderWorkspace, withinFolder } from './folder';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { Storage, atomicWrite, validateWorkspace,assetPath } from '../../electron/storage.cjs';
import { executeWorkspaceCommand, requirePage } from '../core/commands';
import { commands } from '../core/catalog';
import { agentCommands } from '../core/agentCommands';
import { resolveAgentContext } from '../core/agentContext';
import { normalizeWorkspace } from '../core/normalize';
import { isAgentTelemetry } from '../core/agentTranscript';
import { parseDay, dateKey } from '../database/dates';
import { validateDomain } from '../core/validate';
import { CommandError, requiredString } from '../core/errors';
import type { ApiRequest, ApiResponse, ServiceEvent } from '../core/protocol';
import type { Workspace } from '../types';
import { runFileCommand } from './files';
import { Changes } from './changes';
import { socketPath } from './paths';
import packageInfo from '../../package.json';
import { evaluateSchedules } from '../scheduling/engine';
import { parseScheduleTime } from '../scheduling/commands';
import { applyAutomations, appendRun, type TriggerMemory } from '../actions/engine';
import { findButton } from '../actions/commands';
import { runScheduledAutomations } from '../actions/scheduled';
import { diffWorkspace, mergeChanges } from '../core/patch';
import { applyDependencyShifts } from '../database/dependencies';
import { finalizeProperties } from '../database/propertyData';
import { descendants } from '../model';
import { executeScoped } from './agent/scope';
import { AgentRuntime } from './agent/runtime';
import { conversations, conversationLog, selectConversation, closeConversation } from './agent/conversations';
import { projectAgentDiff, filterAgentDiff } from '../core/agentDiff';
import { allPages } from './agent/pagination';
import { reversePatch } from './agent/revert';
import { appendAgentMessages, setAgentState, getAgent, agentConversationId } from '../core/spaces';
import type { AgentConfig, AgentMessage, SpaceFileRecord } from '../types';

export class DataService {
  readonly storage: Storage;
  readonly folder?: FolderWorkspace;
  readonly changes: Changes;
  readonly agents: AgentRuntime;
  workspace: Workspace | null;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(event: ServiceEvent) => void>();
  readonly guiClients = new Set<string>();
  readonly desktopClients = new Set<string>();
  private resolvedPatches = new Set<string>();
  private schedulerTimer?: ReturnType<typeof setInterval>;
  private ticking = false;
  private schedulerError = '';
  private automationSignals: TriggerMemory = {};
  private lastSchedulerCheck = 0;
  startScheduler() {
    const tick = async () => {
      if (this.ticking || !this.workspace) return;
      this.ticking = true;
      try {
        const result = await this.request({
          jsonrpc: '2.0',
          id: randomUUID(),
          method: 'scheduler.run',
          client: 'scheduler',
        });
        this.schedulerError = result.error?.message || '';
        this.lastSchedulerCheck = Date.now();
      } finally {
        this.ticking = false;
      }
    };
    this.schedulerTimer = setInterval(() => void tick(), 1000);
    this.schedulerTimer.unref();
    void tick();
  }
  stopScheduler() {
    clearInterval(this.schedulerTimer);
  }

  constructor(directory: string, folderRoot?: string) {
    this.storage = new Storage(directory);
    if(folderRoot){this.folder=new FolderWorkspace(folderRoot);this.storage.assetPath=(url:string)=>assetPath(directory,url,this.folder!.root);}
    this.changes = new Changes(directory);
    this.agents = new AgentRuntime(this);
    const loaded = this.storage.load();
    this.workspace = loaded ? normalizeWorkspace(loaded, true) : null;
    for (const space of Object.values(this.workspace?.spaces || {}))
      for (const agent of [
        space.agent,
        ...(space.agent.sessions || []).flatMap((session) => (session.state ? [session.state] : [])),
      ])
        if (agent.status === 'running') {
          agent.status = 'error';
          agent.error = '服务重启，会话已中断';
        }
    const migratedAssets = new Map<string, string>();
    // Upgrade the old flat asset URLs without moving or overwriting existing bytes.
    for (const page of this.workspace?.pages || []) {
      if (!page.space) continue;
      fs.mkdirSync(this.storage.spaceRoot(page.id), { recursive: true, mode: 0o700 });
      for (const file of page.files || []) {
        if (!/^asset:\/\/local\/[^/]+$/.test(file.url) || fs.existsSync(this.storage.assetPath(file.url)))
          continue;
        const name = path.basename(this.storage.assetPath(file.url));
        const candidates = [null, ...(page.folders || []).map((folder) => folder.id)];
        const source = candidates
          .map((id) => path.join(this.storage.spaceDirectory(page.id, id), name))
          .find((source) => fs.existsSync(source));
        if (source) {
          const url = `asset://local/${path.relative(this.storage.directory, source).split(path.sep).join('/')}`;
          migratedAssets.set(file.url, url);
          file.url = url;
        }
      }
    }
    if (migratedAssets.size)
      this.workspace = JSON.parse(
        JSON.stringify(this.workspace, (_key, value) =>
          typeof value === 'string' ? migratedAssets.get(value) || value : value,
        ),
      );
    if (loaded && JSON.stringify(loaded) !== JSON.stringify(this.workspace))
      this.storage.save(this.workspace!);
    for (const name of fs.readdirSync(this.conflictDirectory()).filter((name) => name.endsWith('.json'))) {
      const item = JSON.parse(fs.readFileSync(path.join(this.conflictDirectory(), name), 'utf8'));
      if (item.resolvedAt && item.patch?.id) this.resolvedPatches.add(item.patch.id);
    }
  }
  get revision() {
    return this.workspace?.revision || 0;
  }
  subscribe(listener: (event: ServiceEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  broadcast(event: ServiceEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
  state(): ServiceEvent {
    return { type: 'state', workspace: this.workspace, revision: this.revision };
  }
  request(request: ApiRequest, internal = false): Promise<ApiResponse> {
    // Interactive engine calls must not hold the data queue while waiting for tool approval.
    if (
      !request.agentToken &&
      [
        'agent.capabilities',
        'agent.control',
        'agent.steer',
        'agent.command',
        'agent.protocol',
        'agent.context-usage',
        'agent.rename',
      ].includes(request.method)
    )
      return this.execute(request, internal);
    const operation = this.queue.then(() => this.execute(request, internal));
    this.queue = operation.catch(() => {});
    return operation;
  }
  async idle() {
    await this.queue;
  }
  private prepareAction = (before: Workspace, after: Workspace) => {
    after = finalizeProperties(before, after, 'action');
    validateWorkspace(after);
    validateDomain(after);
    const result = applyDependencyShifts(before, after);
    validateDomain(result);
    return result;
  };
  private sendEffects(effects: any[] = []) {
    if (this.guiClients.size)
      for (const effect of effects)
        if (
          effect.type === 'open' &&
          this.workspace?.pages.some((page) => page.id === effect.pageId && !page.trashedAt)
        )
          this.broadcast({
            type: 'ui',
            command: 'open-page',
            params: { pageId: effect.pageId, mode: effect.mode },
          });
  }
  private commit(workspace: Workspace, request: ApiRequest) {
    // A duplicated main Page gets independent file bytes and a fresh Agent session.
    for (const page of workspace.pages) {
      if (page.space) fs.mkdirSync(this.storage.spaceRoot(page.id), { recursive: true, mode: 0o700 });
      if (!page.space || this.workspace?.spaces?.[page.id] || !page.files?.length) continue;
      const replacements = new Map<string, string>();
      const files = page.files.map((file) => {
        if (
          !file.url.startsWith('asset://local/spaces/') ||
          file.url.startsWith(`asset://local/spaces/${page.id}/`)
        )
          return file;
        const saved = this.storage.saveSpaceFile(
          page.id,
          file.folderId,
          file.name,
          fs.readFileSync(this.storage.assetPath(file.url)),
        );
        const id = randomUUID();
        replacements.set(file.url, saved.url);
        replacements.set(file.id, id);
        return { ...file, id, url: saved.url };
      });
      if (replacements.size) {
        const ids = descendants(workspace.pages, page.id);
        workspace = {
          ...workspace,
          pages: workspace.pages.map((value) => {
            if (!ids.has(value.id)) return value;
            return JSON.parse(
              JSON.stringify(value.id === page.id ? { ...value, files } : value, (_key, entry) => {
                if (typeof entry !== 'string') return entry;
                for (const [before, after] of replacements) entry = entry.replaceAll(before, after);
                return entry;
              }),
            );
          }),
        };
      }
    }
    workspace = normalizeWorkspace(finalizeProperties(this.workspace, workspace, request.method));
    validateWorkspace(workspace);
    validateDomain(workspace);
    if (
      this.workspace &&
      ![
        'workspace.replace',
        'backup.restore',
        'file.import',
        'page.duplicate',
        'template.duplicate',
        'history.restore',
        'history.undo',
        'history.redo',
      ].includes(request.method)
    )
      workspace = applyDependencyShifts(this.workspace, workspace);
    const quiet = [
      'workspace.replace',
      'backup.restore',
      'file.import',
      'history.restore',
      'history.undo',
      'history.redo',
      'page.restore',
      'scheduler.run',
      'repeat.run',
      'automation.run',
      'action.failure',
      'person.update',
    ].includes(request.method);
    let signals = [
      'workspace.replace',
      'backup.restore',
      'history.undo',
      'history.redo',
      'history.restore',
    ].includes(request.method)
      ? {}
      : this.automationSignals;
    if (this.workspace && !quiet) {
      const automated = applyAutomations(
        this.workspace,
        workspace,
        executeWorkspaceCommand,
        Date.now(),
        this.prepareAction,
        this.automationSignals,
      );
      workspace = automated.workspace;
      signals = automated.signals;
    }
    workspace = finalizeProperties(this.workspace, workspace, request.method);
    validateWorkspace(workspace);
    validateDomain(workspace);
    const next = { ...workspace, revision: this.revision + 1 };
    const previous = this.workspace;
    this.folder?.beforeSave(next, previous);
    this.storage.save(next);
    this.workspace = next;
    for (const id of Object.keys(previous?.spaces || {})) {
      if (!next.pages.some((page) => page.id === id && !page.trashedAt)) this.agents.stop(id);
      if (!next.pages.some((page) => page.id === id)) {
        this.storage.removeSpace(id);
        this.storage.removeAgentLog(id);
      }
    }
    this.automationSignals = signals;
    if (previous) this.changes.record(previous, next, request);
    this.broadcast({
      type: 'state',
      workspace: next,
      revision: next.revision,
      requestId: String(request.id),
      method: request.method,
    });
    if (
      ![
        'workspace.replace',
        'backup.restore',
        'file.import',
        'history.restore',
        'history.undo',
        'history.redo',
      ].includes(request.method)
    ) {
      const existing = new Set(previous?.inbox?.map((item) => item.id));
      for (const item of next.inbox || [])
        if (!existing.has(item.id)) this.broadcast({ type: 'notification', item });
    }
  }
  private conflictDirectory() {
    const directory = path.join(this.storage.directory, 'conflicts');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    return directory;
  }
  private conflictFile(id: string) {
    if (!/^[0-9a-f-]+$/i.test(id)) throw new CommandError('INVALID_ARGUMENT', '冲突 ID 无效');
    return path.join(this.conflictDirectory(), id + '.json');
  }
  private async execute(request: ApiRequest, internal = false): Promise<ApiResponse> {
    const params = request.params || {};
    const response = (result: unknown, changed = false): ApiResponse => ({
      jsonrpc: '2.0',
      id: request.id,
      result: result === undefined ? null : result,
      revision: this.revision,
      ...(changed && !request.agentToken ? { workspace: this.workspace } : {}),
    });
    try {
      if(request.method.startsWith('fs.')&&!this.folder)throw new CommandError('WORKSPACE_REQUIRED','此接口需要 --workspace 工作文件夹');
      if(this.folder) {
        const folder=this.folder;
        if(request.method.startsWith('agent.'))throw new CommandError('HOST_MANAGED_AGENT','文件夹模式由宿主提供 Agent；此服务只处理文档和文件');
        if(['workspace.replace','backup.restore','backup.export'].includes(request.method))throw new CommandError('FOLDER_OPERATION_UNSUPPORTED','文件夹模式请通过文件和页面 API 修改数据；备份或迁移请复制整个 Workspace');
        if(request.method==='file.export'&&params.type==='pdf')throw new CommandError('FOLDER_OPERATION_UNSUPPORTED','文件夹模式支持 Markdown、HTML、JSON 和 CSV 导出');
        if(request.method==='fs.asset-upload')return response(this.storage.saveAsset(params.name||path.basename(params.path||'asset'),params.path?fs.readFileSync(withinFolder(folder.root,params.path)):Buffer.from(String(params.contentBase64||''),'base64')));
        if(['fs.draft-read','fs.draft-write'].includes(request.method)){
          const file=params.key?path.join(folder.directory,'drafts',createHash('sha256').update(String(params.key)).digest('hex')+'.json'):path.join(folder.directory,'hosted-draft.json');
          if(request.method==='fs.draft-read')return response(fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[]);
          if(params.draft===null)fs.rmSync(file,{force:true});else atomicWrite(file,params.draft||[]);
          return response({saved:true});
        }
        if(request.method==='fs.info')return response({root:folder.root,dataDirectory:folder.directory,files:folder.index.files,errors:folder.errors});
        if(request.method==='fs.list')return response(folder.list(params.path||''));
        if(request.method==='fs.read')return response(folder.read(requiredString(params.path,'path')));
        if(request.method==='fs.mkdir'){const target=withinFolder(folder.root,requiredString(params.path,'path'),true);fs.mkdirSync(target,{recursive:true});return response({path:params.path})}
        if(request.method==='fs.write')folder.write(requiredString(params.path,'path'),String(params.content??''),params.hash);
        if(request.method==='fs.restore')folder.restore(requiredString(params.path,'path'));
        if(request.method==='fs.remove')folder.remove(requiredString(params.path,'path'));
        if(['file.import','asset.add','space.upload'].includes(request.method)&&params.path)params.path=withinFolder(folder.root,requiredString(params.path,'path'));
        if(request.method==='asset.get'&&params.output)params.output=withinFolder(folder.root,params.output,true);
        if(['file.export','file.write','backup.export'].includes(request.method)) {
          const key=request.method==='backup.export'?'path':'output';
          params[key]=withinFolder(folder.root,params[key]||`Exports/${params.pageId||'export'}.${params.type||'json'}`,true);
        }
        if(request.client!=='scheduler') {
          const scanned=folder.scan(this.workspace);
          if(scanned){folder.importing=true;try{this.commit(scanned,{...request,method:'fs.sync'})}finally{folder.importing=false}}
        }
        if(request.method==='fs.sync')return response({files:Object.keys(folder.index.files).length,errors:folder.errors},true);
        if(request.method==='fs.write')return response(folder.read(params.path),true);
        if(request.method==='fs.restore')return response({restored:params.path},true);
        if(request.method==='fs.remove')return response({removed:params.path},true);
      }
      if (['agent.append', 'agent.state', 'agent.update-activity'].includes(request.method) && !internal)
        throw new CommandError('METHOD_NOT_FOUND', '此方法仅供 Agent 运行时使用');
      if (request.agentToken) {
        const identity = this.agents.scopeFor(request.agentToken);
        const rootId = identity.pageId;
        params.conversationId = identity.conversationId;
        if (
          identity.mode === 'plan' &&
          commands.find((command) => command.method === request.method)?.mutates
        )
          throw new CommandError('READ_ONLY', 'Plan 模式只能读取 Workspace');
        const diskMethods = [
          'file.read',
          'file.resolve',
          'file.create',
          'file.write-content',
          'agent.status',
          'agent.history',
          'space.remove-file',
          'space.reveal',
          'space.sync',
        ];
        if (diskMethods.includes(request.method)) {
          if (params.pageId !== rootId) throw new CommandError('SPACE_ACCESS_DENIED', '文件不属于绑定空间');
        } else {
          const result = executeScoped(this.workspace!, rootId, request.method, params);
          if (result.changed && result.workspace) this.commit(result.workspace, request);
          return response(result.result);
        }
      }
      if (request.method === 'workspace.patch' && this.resolvedPatches.has(params.patch?.id))
        return response({ applied: params.patch.id, previouslyResolved: true }, true);
      if (request.method === 'status')
        return response({
          apiVersion: 1,
          workspaceRoot: this.folder?.root,
          version: packageInfo.version,
          pid: process.pid,
          dataDirectory: this.storage.directory,
          socket: socketPath(this.storage.directory),
          revision: this.revision,
          initialized: !!this.workspace,
          guiClients: this.guiClients.size,
          desktopClients: this.desktopClients.size,
          pages: this.workspace?.pages.filter((page) => !page.trashedAt).length || 0,
        });
      if (request.method === 'ui.register') {
        if (request.client?.startsWith('gui-')) {
          if (params.ready === false) this.guiClients.delete(request.client);
          else this.guiClients.add(request.client);
        }
        return response({ connected: true });
      }
      if (request.method === 'page.open' || request.method === 'ui.command') {
        if (!this.workspace) throw new CommandError('NOT_INITIALIZED', '请先初始化工作空间');
        const uiParams = request.method === 'page.open' ? params : params.params || {};
        const command = request.method === 'page.open' ? 'open-page' : String(params.command);
        if (
          !this.guiClients.size &&
          !(this.desktopClients.size && ['quit', 'window-show', 'window-close'].includes(command))
        )
          throw new CommandError('GUI_NOT_RUNNING', '图形端未打开，请先运行 ui launch');
        const controls = [
          'open-page',
          'new-page',
          'search',
          'comments',
          'button',
          'automations',
          'action-history',
          'inbox',
          'scheduler',
          'reminder',
          'repeat',
          'settings',
          'import',
          'export',
          'help',
          'find',
          'select-all',
          'comment-selection',
          'sidebar',
          'theme',
          'back',
          'forward',
          'home',
          'save',
          'trash',
          'templates',
          'history',
          'conflicts',
          'operations',
          'space',
          'agent',
          'calendar-day',
          'appearance',
          'view-settings',
          'close-dialog',
          'window-show',
          'window-hide',
          'window-minimize',
          'window-close',
          'quit',
          'window-fullscreen',
          'zoom',
        ];
        if (!controls.includes(command))
          throw new CommandError('INVALID_UI_COMMAND', `未知 GUI 命令 ${command}`, { commands: controls });
        if (command === 'agent' && uiParams.visible !== false && uiParams.pageId) {
          const root = requirePage(this.workspace, uiParams.pageId);
          if (!root.space) throw new CommandError('NOT_A_SPACE', 'Agent 面板必须绑定 Workspace 主页面');
          if (uiParams.context)
            uiParams.context = resolveAgentContext(this.workspace, root.id, [uiParams.context])[0];
        }
        if (command === 'calendar-day') {
          const page = requirePage(this.workspace, uiParams.pageId);
          if (!page.database) throw new CommandError('NOT_A_DATABASE', '目标必须是数据库');
          if (uiParams.visible !== false) {
            const date = parseDay(uiParams.date);
            if (!date) throw new CommandError('INVALID_DATE', 'date 必须是有效日期');
            uiParams.date = dateKey(date);
          }
        }
        if (command === 'appearance') requirePage(this.workspace, uiParams.pageId);
        if (command === 'open-page') {
          requirePage(this.workspace, uiParams.pageId);
          if (uiParams.viewId) {
            const selected = executeWorkspaceCommand(this.workspace, 'view.select', {
              databaseId: uiParams.pageId,
              viewId: uiParams.viewId,
            });
            this.commit(selected.workspace!, request);
          }
        }
        this.broadcast({ type: 'ui', command, params: uiParams, requestId: String(request.id) });
        return response({ sent: true });
      }
      if (request.method === 'service.stop') {
        this.broadcast({ type: 'shutdown' });
        return response({ stopping: true });
      }
      if (request.method === 'scheduler.status')
        return response({
          ...executeWorkspaceCommand(this.workspace, 'scheduler.status').result,
          backgroundError: this.schedulerError || null,
          lastCheckedAt: this.lastSchedulerCheck,
        });
      if (request.method === 'scheduler.run') {
        if (!this.workspace) return response({ runs: [], notifications: [], automations: [] });
        const now = params.at !== undefined ? parseScheduleTime(params.at) : Date.now();
        const operation = evaluateSchedules(this.workspace, now);
        const automated = runScheduledAutomations(
          operation.workspace,
          now,
          executeWorkspaceCommand,
          this.prepareAction,
        );
        if (operation.changed || automated.changed) this.commit(automated.workspace, request);
        return response(
          {
            runs: operation.runs,
            notifications: operation.notifications,
            pendingTemplates: operation.pendingTemplates,
            automations: automated.runs,
          },
          operation.changed || automated.changed,
        );
      }
      if (
        request.method.startsWith('agent.') &&
        !['agent.new', 'agent.resume', 'agent.fork', 'agent.sessions'].includes(request.method)
      ) {
        if (!this.workspace) throw new CommandError('NOT_INITIALIZED', '请先初始化工作空间');
        const agent = getAgent(this.workspace!, params.pageId, params.conversationId);
        params.conversationId = agentConversationId(agent);
        conversationLog(this, params.pageId, params.conversationId);
      }
      const selectedSpace = (pageId: string) => {
        const space = this.workspace?.spaces?.[pageId];
        return space && { ...space, agent: getAgent(this.workspace!, pageId, params.conversationId) };
      };
      const agentState = (pageId: string, changes: Partial<AgentConfig>) =>
        setAgentState(this.workspace!, pageId, changes, params.conversationId);
      if (request.method === 'agent.append') {
        if (!this.workspace) throw new CommandError('NOT_INITIALIZED', '请先初始化工作空间');
        if (
          params.conversationVersion !== undefined &&
          params.conversationVersion !== (selectedSpace(params.pageId)?.agent.conversationVersion || 0)
        )
          return response({ ignored: true });
        const messages = Array.isArray(params.messages) ? params.messages : [];
        const next = appendAgentMessages(
          this.workspace,
          String(params.pageId),
          messages,
          params.status,
          params.conversationId,
        );
        if (next !== this.workspace) this.commit(next, request);
        return response({ appended: messages.length }, next !== this.workspace);
      }
      if (request.method === 'agent.update-activity') {
        if (!this.workspace) throw new CommandError('NOT_INITIALIZED', '请先初始化工作空间');
        const message = params.message;
        const space = selectedSpace(params.pageId);
        if (!space || !message) return response({ updated: false });
        const messages = space.agent.messages.map((value) =>
          value.engineId && value.engineId === message.engineId && value.kind === 'activity'
            ? { ...value, activity: message.activity, at: message.at }
            : value,
        );
        this.commit(agentState(params.pageId, { messages }), request);
        return response({ updated: true }, true);
      }
      if (request.method === 'agent.state') {
        if (!this.workspace) throw new CommandError('NOT_INITIALIZED', '请先初始化工作空间');
        if (
          params.conversationVersion !== undefined &&
          params.conversationVersion !== (selectedSpace(params.pageId)?.agent.conversationVersion || 0)
        )
          return response({ ignored: true });
        const next = agentState(String(params.pageId), (params.changes || {}) as Partial<AgentConfig>);
        if (next !== this.workspace) this.commit(next, request);
        return response({ updated: next !== this.workspace }, next !== this.workspace);
      }
      if (request.method === 'agent.capabilities')
        return response(
          await this.agents.session(String(params.pageId), params.conversationId).capabilities(),
        );
      if (request.method === 'agent.protocol')
        return response(await this.agents.session(String(params.pageId), params.conversationId).protocol());
      if (request.method === 'agent.context-usage')
        return response(
          await this.agents.session(String(params.pageId), params.conversationId).contextUsage(),
        );
      if (request.method === 'agent.command') {
        const pageId = String(params.pageId);
        const space = selectedSpace(pageId);
        if (!space) throw new CommandError('NOT_A_SPACE', '此页面不是空间');
        const text = requiredString(params.text, 'text');
        const [, command, argument = ''] = (text.replace(/^\/\s*/, '') || 'help').match(
          /^(\S+)(?:\s+([\s\S]*))?$/,
        )!;
        const invoke = (method: string, extra: any = {}) =>
          this.request({
            ...request,
            method,
            params: { pageId, conversationId: params.conversationId, ...extra },
          });
        if (['new', 'clear', 'reset'].includes(command)) return invoke('agent.new');
        if (command === 'branch' || (command === 'fork' && space.engine === 'codex'))
          return invoke('agent.fork');
        if (command === 'resume')
          return argument
            ? invoke('agent.resume', { sessionId: argument })
            : response({ panel: 'sessions', sessions: space.agent.sessions || [] });
        if (command === 'rename')
          return argument ? invoke('agent.rename', { title: argument }) : response({ panel: 'sessions' });
        if (command === 'model' && argument)
          return invoke('agent.configure', { options: { model: argument } });
        if (command === 'effort' && argument)
          return invoke('agent.configure', { options: { effort: argument } });
        if (command === 'thinking' && ['on', 'off'].includes(argument))
          return invoke('agent.configure', { options: { thinking: argument === 'on' } });
        if (command === 'focus') {
          if (argument && !['on', 'off'].includes(argument))
            throw new CommandError('INVALID_ARGUMENT', '使用 /focus on 或 /focus off');
          return invoke('agent.configure', {
            options: { focusView: argument ? argument === 'on' : space.agent.options?.focusView === false },
          });
        }
        if (['config', 'settings'].includes(command) && argument) {
          if (space.engine === 'claude' && !argument.startsWith('{')) return invoke('agent.send', { text });
          let config: Record<string, any>;
          if (argument.startsWith('{')) config = JSON.parse(argument);
          else {
            const match = argument.match(/^([\w.-]+)=(.+)$/s);
            if (!match) throw new CommandError('INVALID_ARGUMENT', '配置需要 key=value 或 JSON 对象');
            let value: any = match[2];
            try {
              value = JSON.parse(value);
            } catch {
              /* native string setting */
            }
            config = { [match[1]]: value };
          }
          const options: any = { config: { ...space.agent.options?.config, ...config } };
          for (const [key, target] of [
            ['model', 'model'],
            ['model_reasoning_effort', 'effort'],
            ['effortLevel', 'effort'],
            ['approval_policy', 'approval'],
            ['alwaysThinkingEnabled', 'thinking'],
          ])
            if (key in config) options[target] = config[key];
          return invoke('agent.configure', { options });
        }
        if (command === 'plan' || command === 'agent')
          return invoke('agent.configure', { options: { mode: command } });
        if (['model', 'config', 'settings', 'permissions', 'effort', 'thinking'].includes(command))
          return response({ panel: 'config', options: space.agent.options || {} });
        if (command === 'help' || command === 'skills')
          return response({
            ...(await this.agents.session(pageId, params.conversationId).capabilities()),
            clientCommands: agentCommands,
          });
        if (command === 'status') return invoke('agent.status');
        if (command === 'rewind' && space.engine === 'claude')
          return argument
            ? invoke('agent.rewind', { messageId: argument })
            : response({ panel: 'checkpoints' });
        if (command === 'account' || (command === 'login' && space.engine === 'codex'))
          return response({ panel: 'account' });
        if (command === 'context')
          return response(await this.agents.session(pageId, params.conversationId).contextUsage());
        if (['usage', 'cost'].includes(command))
          return response(
            await this.agents
              .session(pageId, params.conversationId)
              .control(
                space.engine === 'codex'
                  ? 'account/rateLimits/read'
                  : 'usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET',
                { args: [{ skipBehaviors: true }] },
              ),
          );
        if (command === 'plugins')
          return response(
            await this.agents
              .session(pageId, params.conversationId)
              .control(space.engine === 'codex' ? 'plugin/installed' : 'initializationResult', {}),
          );
        if (command === 'diff') return invoke('agent.diff');
        if (command === 'mcp')
          return response(
            space.engine === 'codex'
              ? await allPages<any>((cursor) =>
                  this.agents
                    .session(pageId, params.conversationId)
                    .control('mcpServerStatus/list', { limit: 100, cursor }),
                )
              : await this.agents.session(pageId, params.conversationId).control('mcpServerStatus', {}),
          );
        if (command === 'compact' && space.engine === 'codex')
          return response(
            await this.agents.session(pageId, params.conversationId).control('thread/compact/start', {}),
          );
        if (space.engine === 'codex' && command === 'review')
          return argument
            ? invoke('agent.review', { target: { type: 'custom', instructions: argument } })
            : response({ panel: 'review' });
        if (space.engine === 'codex' && command === 'goal')
          return response(
            await this.agents
              .session(pageId, params.conversationId)
              .control(
                argument ? 'thread/goal/set' : 'thread/goal/get',
                argument ? { objective: argument } : {},
              ),
          );
        if (space.engine === 'codex') {
          const info = await this.agents.session(pageId, params.conversationId).capabilities();
          if (!info.commands.some((item: any) => item.name === command))
            throw new CommandError(
              'UNKNOWN_AGENT_COMMAND',
              `没有命令 /${command}；使用 /help 或原生控制面板查看可用功能`,
            );
        }
        return invoke('agent.send', { text: space.engine === 'codex' ? `$${command} ${argument}` : text });
      }
      if (request.method === 'agent.control' && params.method === 'review/start') {
        if (!params.params?.target) throw new CommandError('INVALID_ARGUMENT', 'review/start 需要 target');
        return this.request({
          ...request,
          method: 'agent.review',
          params: {
            pageId: params.pageId,
            conversationId: params.conversationId,
            target: params.params.target,
            delivery: params.params.delivery,
          },
        });
      }
      if (request.method === 'agent.control')
        return response(
          await this.agents
            .session(String(params.pageId), params.conversationId)
            .control(
              requiredString(params.method, 'method'),
              params.params === undefined ? {} : params.params,
            ),
        );
      if (request.method === 'agent.steer')
        return this.request({ ...request, method: 'agent.send', params: { ...params, delivery: 'steer' } });
      if (request.method === 'agent.queue') {
        const pageId = requiredString(params.pageId, 'pageId');
        const space = selectedSpace(pageId);
        if (!space) throw new CommandError('NOT_A_SPACE', '此页面不是空间');
        let queue = [...(space.agent.queue || [])];
        const action = params.action || 'list';
        if (action === 'list') return response({ messages: queue, paused: !!space.agent.queuePaused });
        if (action === 'run') {
          if (
            params.automatic &&
            (params.conversationVersion !== (space.agent.conversationVersion || 0) || space.agent.queuePaused)
          )
            return response({ skipped: true });
          if (this.agents.session(pageId, params.conversationId).isRunning())
            return response({ running: true });
          const next = queue[0];
          if (!next) return response({ empty: true });
          const page = requirePage(this.workspace!, pageId);
          const attachments = next.fileIds.map((id) => {
            const file = page.files?.find((file) => file.id === id);
            if (!file) throw new CommandError('FILE_NOT_FOUND', '待发送附件已不存在，请编辑或移除此消息');
            return file;
          });
          const result = this.agents
            .session(pageId, params.conversationId)
            .start(
              next.text,
              undefined,
              attachments,
              resolveAgentContext(this.workspace!, pageId, next.context),
            );
          this.commit(agentState(pageId, { queue: queue.slice(1), queuePaused: false }), request);
          return response(result, true);
        }
        const index = queue.findIndex((message) => message.id === params.messageId);
        if (index < 0) throw new CommandError('MESSAGE_NOT_FOUND', '找不到待发送消息');
        if (action === 'remove') queue.splice(index, 1);
        else if (action === 'update') {
          const text = String(params.text ?? '');
          const context =
            params.context === undefined
              ? queue[index].context || []
              : resolveAgentContext(this.workspace!, pageId, params.context);
          if (!text.trim() && !queue[index].fileIds.length && !context.length)
            throw new CommandError('EMPTY_MESSAGE', '请输入正文或保留附件/引用');
          queue[index] = { ...queue[index], text, context };
        } else throw new CommandError('INVALID_ARGUMENT', '队列操作必须是 list/update/remove/run');
        this.commit(agentState(pageId, { queue }), request);
        return response({ messages: queue }, true);
      }
      if (request.method === 'agent.respond')
        return response(
          this.agents
            .session(String(params.pageId), params.conversationId)
            .respond(String(params.requestId), params.result),
        );
      if (request.method === 'agent.configure') {
        const space = selectedSpace(params.pageId);
        if (!space) throw new CommandError('NOT_A_SPACE', '此页面不是空间');
        if (!params.options || typeof params.options !== 'object' || Array.isArray(params.options))
          throw new CommandError('INVALID_ARGUMENT', 'options 必须是配置对象');
        if (params.options.focusView !== undefined && typeof params.options.focusView !== 'boolean')
          throw new CommandError('INVALID_ARGUMENT', 'focusView 必须是布尔值');
        if (params.options.mode && !['agent', 'plan'].includes(params.options.mode))
          throw new CommandError('INVALID_ARGUMENT', 'mode 必须是 agent 或 plan');
        if (
          params.options.followUpQueueMode &&
          !['queue', 'steer', 'interrupt'].includes(params.options.followUpQueueMode)
        )
          throw new CommandError('INVALID_ARGUMENT', 'followUpQueueMode 必须是 queue/steer/interrupt');
        if (
          params.options.composerEnterBehavior &&
          !['enter', 'cmdIfMultiline', 'cmdAlways'].includes(params.options.composerEnterBehavior)
        )
          throw new CommandError(
            'INVALID_ARGUMENT',
            'composerEnterBehavior 必须是 enter/cmdIfMultiline/cmdAlways',
          );
        const options = params.replace
          ? params.before === undefined
            ? { ...params.options }
            : (mergeChanges(
                params.before,
                params.options,
                space.agent.options || {},
                'agent.options',
              ) as NonNullable<AgentConfig['options']>)
          : { ...space.agent.options, ...params.options };
        this.commit(agentState(params.pageId, { options }), request);
        void this.agents
          .session(params.pageId, params.conversationId)
          .configure(options)
          .catch((error) => {
            void this.request(
              {
                jsonrpc: '2.0',
                id: randomUUID(),
                method: 'agent.state',
                params: {
                  pageId: params.pageId,
                  conversationId: params.conversationId,
                  conversationVersion: space.agent.conversationVersion || 0,
                  changes: { error: String(error), status: 'error' },
                },
              },
              true,
            );
          });
        return response(options, true);
      }
      if (request.method === 'agent.sessions') {
        const space = selectedSpace(params.pageId);
        if (!space) throw new CommandError('NOT_A_SPACE', '此页面不是空间');
        return response({
          current: space.agent.sessionId || null,
          conversationId: agentConversationId(getAgent(this.workspace!, params.pageId)),
          sessions: conversations(this, params.pageId),
        });
      }
      if (request.method === 'agent.rename') {
        const pageId = requiredString(params.pageId, 'pageId');
        const title = requiredString(params.title, 'title').trim();
        if (!title) throw new CommandError('INVALID_ARGUMENT', '会话名称不能为空');
        const agent = getAgent(this.workspace!, pageId, params.conversationId);
        const id = agentConversationId(agent);
        if (agent.sessionId)
          await this.agents
            .session(pageId, id)
            .control(
              agent.engine === 'codex' ? 'thread/name/set' : 'rename_session',
              agent.engine === 'codex'
                ? { name: title }
                : { title, source: 'host', session_id: agent.sessionId },
            );
        const sessions = conversations(this, pageId).map((session) =>
          (session.conversationId || session.id) === id ? { ...session, title } : session,
        );
        this.commit(setAgentState(this.workspace!, pageId, { sessions }), request);
        return response({ conversationId: id, sessionId: agent.sessionId || null, title }, true);
      }
      if (['agent.new', 'agent.resume', 'agent.fork'].includes(request.method)) {
        const pageId = requiredString(params.pageId, 'pageId');
        requirePage(this.workspace!, pageId);
        this.commit(selectConversation(this, pageId, request.method, params.sessionId), request);
        const agent = getAgent(this.workspace!, pageId);
        return response(
          {
            conversationId: agentConversationId(agent),
            sessionId: agent.sessionId || null,
            sessions: conversations(this, pageId),
          },
          true,
        );
      }
      if (request.method === 'agent.close') {
        const pageId = requiredString(params.pageId, 'pageId');
        const id = agentConversationId(getAgent(this.workspace!, pageId, params.conversationId));
        if (id === agentConversationId(getAgent(this.workspace!, pageId))) {
          const next = conversations(this, pageId).find(
            (item) => !item.closed && (item.conversationId || item.id) !== id,
          );
          this.commit(
            selectConversation(
              this,
              pageId,
              next ? 'agent.resume' : 'agent.new',
              next?.conversationId || next?.id,
            ),
            request,
          );
        }
        this.commit(closeConversation(this, pageId, id), request);
        return response({ closed: id }, true);
      }
      if (request.method === 'agent.start' || request.method === 'agent.send') {
        if (!this.workspace) throw new CommandError('NOT_INITIALIZED', '请先初始化工作空间');
        const page = requirePage(this.workspace, params.pageId);
        if (!page.space) throw new CommandError('NOT_A_SPACE', '此页面不是空间');
        const delivery =
          params.delivery ||
          getAgent(this.workspace, page.id, params.conversationId).options?.followUpQueueMode ||
          'queue';
        if (!['queue', 'steer', 'interrupt'].includes(delivery))
          throw new CommandError('INVALID_ARGUMENT', 'delivery 必须是 queue、steer 或 interrupt');
        if (params.engine && params.engine !== this.workspace.spaces?.[page.id]?.engine)
          throw new CommandError('IMMUTABLE_ENGINE', 'Agent 引擎固定绑定');
        const text = (request.method === 'agent.start' ? params.prompt : params.text) ?? '';
        if (typeof text !== 'string') throw new CommandError('INVALID_ARGUMENT', '消息需要文本');
        const context = resolveAgentContext(this.workspace, page.id, params.context);
        for (const key of ['files', 'fileIds'])
          if (
            params[key] !== undefined &&
            (!Array.isArray(params[key]) || params[key].some((value: unknown) => typeof value !== 'string'))
          )
            throw new CommandError('INVALID_ARGUMENT', `${key} 需要字符串数组`);
        const attachments: SpaceFileRecord[] = (params.fileIds || []).map((id: string) => {
          const file = page.files?.find((file) => file.id === id);
          if (!file) throw new CommandError('FILE_NOT_FOUND', '附件不属于此空间');
          return file;
        });
        // Validate the whole local upload list before writing any bytes.
        for (const source of params.files || [])
          if (!fs.statSync(source).isFile()) throw new CommandError('INVALID_ARGUMENT', '附件必须是文件');
        for (const source of params.files || []) {
          const uploaded = (await runFileCommand(this, 'space.upload', { pageId: page.id, path: source }))!;
          this.commit(uploaded.workspace!, request);
          attachments.push(uploaded.result);
        }
        if (!text.trim() && !attachments.length && !context.length)
          throw new CommandError('EMPTY_MESSAGE', '请输入正文或添加附件/引用');
        const session = this.agents.session(page.id, params.conversationId);
        if (session.isRunning() || (delivery === 'interrupt' && session.hasBackgroundWork())) {
          if (delivery === 'steer') {
            const conversationVersion =
              getAgent(this.workspace, page.id, params.conversationId).conversationVersion || 0;
            void this.agents
              .session(page.id, params.conversationId)
              .steer(text, attachments, context)
              .catch((error) => {
                void this.request(
                  {
                    jsonrpc: '2.0',
                    id: randomUUID(),
                    method: 'agent.append',
                    params: {
                      pageId: page.id,
                      conversationId: params.conversationId,
                      conversationVersion,
                      messages: [
                        {
                          id: randomUUID(),
                          role: 'system',
                          kind: 'text',
                          text: `追加消息未发送：${error}\n${text}`,
                          at: Date.now(),
                        },
                      ],
                    },
                  },
                  true,
                );
              });
            return response({ steering: true });
          }
          const queued = {
            id: randomUUID(),
            text,
            fileIds: attachments.map((file) => file.id),
            context,
            at: Date.now(),
          };
          const existing = getAgent(this.workspace, page.id, params.conversationId).queue || [];
          const queue = delivery === 'interrupt' ? [queued, ...existing] : [...existing, queued];
          this.commit(
            agentState(page.id, {
              queue,
              queuePaused: false,
            }),
            request,
          );
          const conversationVersion =
            getAgent(this.workspace, page.id, params.conversationId).conversationVersion || 0;
          if (delivery === 'interrupt')
            this.agents.session(page.id, params.conversationId).stop(() => {
              void this.request(
                {
                  jsonrpc: '2.0',
                  id: randomUUID(),
                  method: 'agent.queue',
                  params: {
                    pageId: page.id,
                    conversationId: params.conversationId,
                    action: 'run',
                    automatic: true,
                    conversationVersion,
                  },
                },
                true,
              );
            });
          return response(
            {
              queued: true,
              message: queued,
              position: queue.findIndex((message) => message.id === queued.id) + 1,
            },
            true,
          );
        }
        return response(
          this.agents
            .session(page.id, params.conversationId)
            .start(text, params.engine, attachments, context),
        );
      }
      if (request.method === 'agent.review') {
        const pageId = requiredString(params.pageId, 'pageId');
        const source = getAgent(this.workspace!, pageId, params.conversationId);
        if (source.engine !== 'codex')
          throw new CommandError('UNSUPPORTED_ENGINE', '此原生审查接口由 Codex 提供');
        const target = params.target || { type: 'uncommittedChanges' };
        if (
          !target ||
          typeof target !== 'object' ||
          Array.isArray(target) ||
          !['uncommittedChanges', 'baseBranch', 'commit', 'custom'].includes(target.type)
        )
          throw new CommandError(
            'INVALID_ARGUMENT',
            '审查目标需要 uncommittedChanges/baseBranch/commit/custom',
          );
        const field = (
          { baseBranch: 'branch', commit: 'sha', custom: 'instructions' } as Record<string, string>
        )[target.type];
        if (field && !requiredString(target[field], field).trim())
          throw new CommandError('INVALID_ARGUMENT', `${field} 不能为空`);
        const delivery = params.delivery || 'inline';
        if (!['inline', 'detached'].includes(delivery))
          throw new CommandError('INVALID_ARGUMENT', 'delivery 必须是 inline 或 detached');
        let conversationId = agentConversationId(source);
        if (delivery === 'detached') {
          // The native reviewer runs in a dedicated connection; its events cannot enter the source chat.
          this.commit(selectConversation(this, pageId, 'agent.new'), request);
          conversationId = agentConversationId(getAgent(this.workspace!, pageId));
          this.commit(setAgentState(this.workspace!, pageId, { options: source.options }), request);
        }
        const result = await this.agents.session(pageId, conversationId).review(target, delivery);
        return response({ ...result, conversationId }, true);
      }
      if (request.method === 'agent.diff') {
        const agent = getAgent(this.workspace!, params.pageId, params.conversationId);
        const diff = projectAgentDiff(
          this.storage.readAgentLog(params.pageId, Number.MAX_SAFE_INTEGER, agentConversationId(agent)),
        );
        if (params.query) {
          diff.operations = filterAgentDiff(diff.operations, String(params.query));
          diff.summaries = diff.summaries.map((turn) => ({
            ...turn,
            files: filterAgentDiff(turn.files, String(params.query)),
          }));
        }
        return response(diff);
      }
      if (request.method === 'agent.rewind') {
        if (params.apply !== undefined && typeof params.apply !== 'boolean')
          throw new CommandError('INVALID_ARGUMENT', 'apply 必须是布尔值');
        const pageId = requiredString(params.pageId, 'pageId');
        const agent = getAgent(this.workspace!, pageId, params.conversationId);
        if (agent.engine !== 'claude')
          throw new CommandError('UNSUPPORTED_ENGINE', '此文件检查点接口由 Claude 提供');
        const session = this.agents.session(pageId, params.conversationId);
        if (this.agents.hasWork(pageId))
          throw new CommandError('AGENT_BUSY', '请先停止此 Workspace 中的执行再恢复文件');
        if (params.apply && agent.options?.mode === 'plan')
          throw new CommandError('READ_ONLY', 'Plan 模式只能预览文件恢复');
        const message = this.storage
          .readAgentLog(pageId, 10000, agentConversationId(agent))
          .find((item) => item.id === params.messageId && item.role === 'user');
        if (!message?.engineId)
          throw new CommandError('CHECKPOINT_NOT_FOUND', '此会话消息没有可用的原生文件检查点');
        const result = await session.control('rewindFiles', {
          args: [message.engineId, { dryRun: !params.apply }],
        });
        if (params.apply && result.canRewind) {
          const synced = await runFileCommand(this, 'space.sync', { pageId });
          if (synced?.workspace) this.commit(synced.workspace, request);
        }
        return response(result, !!params.apply && result.canRewind);
      }
      if (request.method === 'agent.revert') {
        const pageId = requiredString(params.pageId, 'pageId');
        requirePage(this.workspace!, pageId);
        const agent = getAgent(this.workspace!, pageId, params.conversationId);
        if (agent.engine !== 'codex')
          throw new CommandError(
            'UNSUPPORTED_ENGINE',
            '此差异撤销接口用于 Codex；Claude 请使用 agent.rewind',
          );
        if (params.apply !== undefined && typeof params.apply !== 'boolean')
          throw new CommandError('INVALID_ARGUMENT', 'apply 必须是布尔值');
        if (this.agents.hasWork(pageId))
          throw new CommandError('AGENT_BUSY', '请先停止此 Workspace 中的执行');
        if (params.apply && agent.options?.mode === 'plan')
          throw new CommandError('READ_ONLY', 'Plan 模式只能预览撤销');
        const diff = projectAgentDiff(
          this.storage.readAgentLog(pageId, Number.MAX_SAFE_INTEGER, agentConversationId(agent)),
        );
        const turn = diff.summaries.find((turn) => turn.turnId === params.turnId);
        if (!turn) throw new CommandError('TURN_NOT_FOUND', '此会话没有该回合的差异');
        const root = this.storage.spaceRoot(pageId);
        const selectedFile = params.file === undefined ? undefined : requiredString(params.file, 'file');
        const files = selectedFile
          ? turn.files.filter((file) => path.resolve(root, file.path) === path.resolve(root, selectedFile))
          : turn.files;
        if (!files.length) throw new CommandError('FILE_NOT_FOUND', '此回合没有选定文件的差异');
        const result = await reversePatch(
          this,
          pageId,
          files.map((file) => file.patch).join(''),
          !!params.apply,
        );
        if (result.code === 0 && params.apply) {
          const synced = await runFileCommand(this, 'space.sync', { pageId });
          if (synced?.workspace) this.commit(synced.workspace, request);
        }
        return response(
          {
            canRevert: result.code === 0,
            applied: result.code === 0 && !!params.apply,
            files: files.map((file) => file.path),
            output: result.output,
          },
          result.code === 0 && !!params.apply,
        );
      }
      if (request.method === 'agent.stop') {
        const stopped = this.agents.session(String(params.pageId), params.conversationId).stop();
        if (selectedSpace(params.pageId))
          this.commit(agentState(params.pageId, { queuePaused: true }), request);
        return response({ stopped }, true);
      }
      if (request.method === 'agent.status') {
        const space = selectedSpace(params.pageId);
        if (!space) throw new CommandError('NOT_A_SPACE', '此页面不是空间');
        return response({
          pageId: params.pageId,
          conversationId: agentConversationId(space.agent),
          engine: space.agent.engine,
          status: this.agents.session(String(params.pageId), params.conversationId).isRunning()
            ? 'running'
            : space.agent.status,
          sessionId: space.agent.sessionId || null,
          usage: space.agent.usage || null,
          options: request.agentToken
            ? {
                model: space.agent.options?.model,
                effort: space.agent.options?.effort,
                mode: space.agent.options?.mode,
              }
            : space.agent.options || {},
          runtime: space.agent.capabilities?.runtime || null,
          queue: request.agentToken ? [] : space.agent.queue || [],
          queuePaused: !!space.agent.queuePaused,
          directory: this.storage.spaceRoot(String(params.pageId)),
          error: space.agent.error || null,
          messages: space.agent.messages.length,
        });
      }
      if (request.method === 'agent.history') {
        const space = selectedSpace(params.pageId);
        if (!space) throw new CommandError('NOT_A_SPACE', '此页面不是空间');
        const limit = Number(params.limit) || 200;
        if (!Number.isInteger(limit) || limit < 1)
          throw new CommandError('INVALID_ARGUMENT', 'limit 必须是正整数');
        if (params.raw) {
          const file = path.join(
            this.storage.agentsDirectory,
            `${params.pageId}.${agentConversationId(space.agent)}.events.jsonl`,
          );
          return response(
            fs.existsSync(file)
              ? fs
                  .readFileSync(file, 'utf8')
                  .trim()
                  .split('\n')
                  .slice(-limit)
                  .map((line) => {
                    try {
                      return JSON.parse(line);
                    } catch {
                      return { raw: line };
                    }
                  })
              : [],
          );
        }
        conversationLog(this, params.pageId, params.conversationId);
        const logged = this.storage.readAgentLog(
          String(params.pageId),
          Infinity,
          agentConversationId(space.agent),
        ).filter((message: AgentMessage) => !isAgentTelemetry(message.data));
        return response(logged.length ? logged.slice(-limit) : space.agent.messages.slice(-limit));
      }
      if (request.method === 'history.operations') return response(this.changes.list(params.pageId));
      if (request.method === 'history.undo' || request.method === 'history.redo') {
        if (!this.workspace) throw new CommandError('NOT_INITIALIZED', '请先初始化工作空间');
        const operation = this.changes.apply(this.workspace, request.method === 'history.redo', params);
        this.commit(operation.workspace, request);
        operation.committed();
        return response({ id: operation.id, undone: request.method === 'history.undo' }, true);
      }
      if (request.method === 'conflict.list')
        return response(
          fs
            .readdirSync(this.conflictDirectory())
            .filter((name) => name.endsWith('.json'))
            .map((name) => JSON.parse(fs.readFileSync(path.join(this.conflictDirectory(), name), 'utf8')))
            .filter((item) => !item.resolvedAt)
            .map(({ id, at, message, requestId, patch }) => ({
              id,
              at,
              message,
              requestId,
              pageIds: patch?.pages?.map((page: any) => page.id) || [],
            })),
        );
      if (request.method === 'conflict.get')
        return response(JSON.parse(fs.readFileSync(this.conflictFile(params.id), 'utf8')));
      if (request.method === 'conflict.resolve') {
        const file = this.conflictFile(params.id);
        const item = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (item.resolvedAt)
          return response({ resolved: params.id, alreadyResolved: true, strategy: item.strategy }, true);
        if (params.strategy === 'local') {
          const applied = executeWorkspaceCommand(this.workspace, 'workspace.patch', {
            patch: item.patch,
            force: true,
          });
          this.commit(applied.workspace!, request);
        } else if (params.strategy !== 'remote')
          throw new CommandError('INVALID_ARGUMENT', 'strategy 必须是 local 或 remote');
        atomicWrite(file, { ...item, resolvedAt: Date.now(), strategy: params.strategy });
        this.resolvedPatches.add(item.patch.id);
        this.broadcast({
          type: 'state',
          workspace: this.workspace,
          revision: this.revision,
          resolution: { id: params.id, patchId: item.patch.id, strategy: params.strategy },
        });
        return response({ resolved: params.id, strategy: params.strategy }, true);
      }
      if (request.method === 'batch') {
        if (!Array.isArray(params.operations))
          throw new CommandError('INVALID_ARGUMENT', 'operations 必须是数组');
        let candidate = this.workspace;
        const results: any[] = [];
        for (const operation of params.operations) {
          const result = executeWorkspaceCommand(candidate, operation.method, operation.params || {});
          candidate = result.workspace;
          results.push(result.result);
        }
        if (candidate) this.commit(candidate, request);
        params.operations.forEach((operation: any, index: number) => {
          if (operation.method === 'button.run') this.sendEffects(results[index]?.effects);
        });
        return response(results, true);
      }
      const fileResult = await runFileCommand(this, request.method, params);
      if (fileResult) {
        if (fileResult.workspace) this.commit(fileResult.workspace, request);
        return response(fileResult.result, !!fileResult.workspace);
      }
      const operation = executeWorkspaceCommand(this.workspace, request.method, params);
      if (
        ['button.preview', 'automation.preview'].includes(request.method) &&
        this.workspace &&
        operation.workspace
      ) {
        let preview = this.prepareAction(this.workspace, operation.workspace);
        if (request.method === 'button.preview')
          preview = applyAutomations(
            this.workspace,
            preview,
            executeWorkspaceCommand,
            Date.now(),
            this.prepareAction,
            this.automationSignals,
          ).workspace;
        return response({ ...operation.result, changes: diffWorkspace(this.workspace, preview) });
      }
      if (operation.changed && operation.workspace) this.commit(operation.workspace, request);
      if (operation.changed && request.method === 'button.run') this.sendEffects(operation.result.effects);
      if (operation.changed && operation.result?.id && Array.isArray(operation.result?.blocks))
        operation.result =
          this.workspace!.pages.find((page) => page.id === operation.result.id) || operation.result;
      return response(operation.result, operation.changed);
    } catch (error) {
      const commandError =
        error instanceof CommandError
          ? error
          : new CommandError('OPERATION_FAILED', error instanceof Error ? error.message : String(error));
      if (
        this.workspace &&
        !request.agentToken &&
        ['button.run', 'automation.run'].includes(request.method) &&
        !['CONFIRMATION_REQUIRED', 'BUTTON_CHANGED'].includes(commandError.code)
      ) {
        try {
          const button = request.method === 'button.run' ? findButton(this.workspace, params) : null;
          const rule = this.workspace.pages
            .find((page) => page.id === params.databaseId)
            ?.database?.automations?.find((rule) => rule.id === params.automationId);
          this.commit(
            appendRun(this.workspace, {
              id: randomUUID(),
              at: Date.now(),
              kind: button ? 'button' : 'automation',
              name: button?.config.label || rule?.name || '动作',
              ownerId: button?.owner.id || params.databaseId,
              sourceId: params.pageId || params.databaseId,
              status: 'error',
              error: commandError.message,
            }),
            { ...request, method: 'action.failure' },
          );
        } catch {
          /* The original failure remains the useful response if even logging cannot be saved. */
        }
      }
      if (commandError.code === 'CONFLICT' && params.patch) {
        const id = randomUUID();
        atomicWrite(this.conflictFile(id), {
          id,
          at: Date.now(),
          message: commandError.message,
          requestId: request.id,
          patch: params.patch,
          current: this.workspace,
        });
        commandError.details = { ...(commandError.details as object), conflictId: id };
      }
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: { code: commandError.code, message: commandError.message, details: commandError.details },
        revision: this.revision,
        ...(!request.agentToken ? { workspace: this.workspace } : {}),
      };
    }
  }
}
