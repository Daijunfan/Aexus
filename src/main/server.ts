import {openExternalUrl} from './external'
import {managerCliRoot} from './exec'
import {inspectEngine,invokeSkill} from './engine-tools'
import {cloneEmployee} from './employees'
import {openPluginWindow,pluginWindows,placePluginWindow,modePluginWindow,dismissPluginWindow} from './plugins/windows'
import { scheduleRequest } from './scheduler/service'
import {remoteTarget} from '../shared/remote'
import {checkRemote,remoteFiles,closeRemote,resolveEmployeeWorkspace,teamConnectionId} from './tunnel'
import {openTerminal,listTerminals,readTerminal,inputTerminal,resizeTerminal,closeTerminal,closeEmployeeTerminals} from './terminals'
// A unix-socket server so the whole app can be driven from a terminal. Every
// command maps onto the same operations the GUI uses, which is what makes
// headless testing meaningful: the CLI and the window share one code path.

import { getView, setView } from './presentation'
import type { ViewState } from '../shared/view'
import { createServer, connect, type Server, type Socket } from 'node:net'
import { existsSync, unlinkSync, cpSync, renameSync, rmSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'
import { APP_HOME, SOCKET_PATH, type Request, type Response } from '../shared/protocol'
import {
  assertEmployeeControl,beginEmployeeRemoval,endEmployeeRemoval,beginTeamRemoval,endTeamRemoval,assertTeamAvailable,assertNotRemoving,
  closeSession,
  interrupt,
  listLive,
  sendMessage,
  sessionCommands,
  sessionInfo,
  setEffort,
  setFastMode,
  setPlanMode,steerMessage,backgroundProcesses,enqueueMessage,queuedMessages,removeQueuedMessage,
  setModel,
  setPermissionMode,
  setThinking,
  startSession,
  newSessionId,
  type StartArgs
} from './sessions'
import { sessionSnapshot } from './sessions'
import { answerApproval, approvalsFor } from './approvals'
import {
  getPreferences, setPreferences,
  addGroup,
  moveSession,
  patchSession,
  readStore,
  removeGroup,
  removeSession,
  setRoom,
  writeStore
} from './store'
import { renameGroup, designRoom, updateEmployee, employeeFields, setTeamRoot, bindTeamRoot, setBounds, placeEmployee, setViewport,configureTeam,validateTeamSettings } from './store'
import {teamSettings,nativeSessionRefs} from '../shared/types'
import {workspaceFiles} from './files'
import { employeeWorkspace, chooseEmployeeWorkspace, executionEmployee, cloudDirectory, cloudRelative, workspaceName, workspaceStatus, teamRoot, managedTeamRoot, chooseTeamRoot, legacyPluginWorkspace, inside } from './workspaces'
import { planOffice, DEFAULT_VIEW } from '../shared/canvas'
import { listPlugins, requirePlugin, installPlugin, pluginFile } from './plugins/registry'
import { callPlugin, openPluginView, closePluginView,releaseWorkspacePlugins } from './plugins/runtime'
import { provisionWorkspace, provisionEmployee } from './plugins/documents'
import { readFileSync } from 'node:fs'
import {deleteNativeSessions,nativeRefsForRemoval} from './native-sessions'
import { transcriptItems,deleteTranscript } from './transcripts'
import { renderTranscript } from '../shared/transcript'
import {isWebChat,openWebChat,webChatSnapshot,webChatInfo,listWebChats,sendWebChat,interruptWebChat,closeWebChat,webChatRequest,webChatView,attachWebChat} from './webchat'
import type { EffortLevel, PermissionMode } from '@anthropic-ai/claude-agent-sdk'

let beforeViewChange = async () => {}
export function setViewGuard(guard: () => Promise<void>) { beforeViewChange = guard }
let server: Server | null = null
let ownsSocket = false
let askRenderer: (op: string, args?: Record<string, unknown>) => Promise<unknown> = async () => { throw new Error('no window is open') }
export function setUiHandler(handler: typeof askRenderer): void { askRenderer = handler }

/** Every connected client, so events can be fanned out. */
const clients = new Set<Socket>()

/** Subscribers that asked to follow a session; socket -> sessionId. */
const following = new Map<Socket, string>()

/** Followers that want every engine event, not just the rendered transcript. */
const rawFollowers = new Set<Socket>()

/** Fan an event out to CLI clients. Wired from main's broadcast. */
export function publishEvent(channel: string, payload: unknown): void {
  for (const [sock, sessionId] of following) {
    if (!sock.writable) continue
    const p = payload as { sessionId?: string }
    if (p?.sessionId && p.sessionId !== sessionId) continue
    // A raw follower gets every event verbatim; a normal one gets only the
    // channels needed to render a conversation.
    if (!rawFollowers.has(sock) && !RENDERED_CHANNELS.has(channel)) continue
    sock.write(JSON.stringify({ type: 'event', channel, payload }) + '\n')
    if (['session:turn-end', 'session:end', 'session:error', 'session:closed'].includes(channel)) {
      sock.end(JSON.stringify({ type: 'done' }) + '\n')
      following.delete(sock)
      rawFollowers.delete(sock)
    }
  }
}

/** The channels that make up a rendered conversation. */
const RENDERED_CHANNELS = new Set([
  'session:message',
  'session:codex',
  'session:turn-start',
  'session:turn-end',
  'session:end',
  'session:closed',
  'session:error'
])

export async function handleRequest(req: Request): Promise<any> {
  const a = (req.args ?? {}) as Record<string, any>
  const s = (v: unknown) => String(v)

  if(req.cmd.startsWith('group.')&&!['group.list','group.remove'].includes(req.cmd))assertTeamAvailable(a.name)
  if(['card.update','card.move','card.remove','card.rename'].includes(req.cmd))assertTeamAvailable(readStore().sessions.find(c=>c.id===(a.id??a.cardId))?.group)
  if(['card.create','card.move','card.update','session.new'].includes(req.cmd))assertTeamAvailable(a.group??a.patch?.group)
  switch (req.cmd) {
    case 'schedule.schema': case 'schedule.status': case 'schedule.list': case 'schedule.get': case 'schedule.create':
    case 'schedule.update': case 'schedule.pause': case 'schedule.resume': case 'schedule.delete':
    case 'schedule.preview': case 'schedule.run': case 'schedule.history': case 'schedule.cancel':
      return scheduleRequest(req.cmd.slice('schedule.'.length), a)
    case 'settings.get': return getPreferences()
    case 'settings.set': return setPreferences(a) // Includes pageZoom and pane sizes; usable without a desktop.

    case 'view.get': return getView()
    case 'view.open': {
      const kind=a.kind as ViewState['kind'],store=readStore()
      if(!['home','team','employee','workspace','conversation','settings','plugin','clone'].includes(kind))throw new Error('Unknown view kind')
      if((kind==='workspace'||(kind==='team'&&a.name))&&!store.groups.includes(a.name))throw new Error('Unknown Team')
      if((kind==='conversation'||kind==='clone'||a.employee)&&!store.sessions.some(c=>c.id===a.employee))throw new Error('Unknown employee')
      const pluginId=a.pluginId??((kind==='conversation'||kind==='settings'||kind==='employee'||kind==='clone')?getView().pluginId:undefined)
      if(kind==='plugin'||pluginId)requirePlugin(s(pluginId))
      if(kind==='conversation'&&pluginId){const card=store.sessions.find(c=>c.id===a.employee)!;if(teamSettings(store,card.group).pluginId!==pluginId)throw new Error('员工不属于当前插件')}
      await beforeViewChange()
      if(kind==='plugin'){await openPluginWindow(s(pluginId),pluginWorkspace({id:pluginId}));return setView({kind:'home',pluginId})}
      return setView({kind,name:a.name,employee:a.employee,settings:a.settings,pluginId,details:!!a.details})
    }
    case 'view.close':
      await beforeViewChange()
      return setView({kind:'home',pluginId:getView().pluginId})
    case 'view.tools': {
      const view=getView();if(view.kind!=='conversation')throw new Error('Open a conversation first')
      if(a.section&&!['skills','mcp','account','usage','config','export','background'].includes(a.section))throw new Error('Unknown engine section')
      await beforeViewChange();return setView({...view,tools:a.section||undefined})
    }
    case 'view.details': {
      await beforeViewChange()
      const view=getView()
      if(view.kind!=='conversation')throw new Error('Open a conversation first')
      return setView({...view,details:!!a.enabled})
    }
    case 'workspace.suggest': {
      const store=readStore(),config=teamSettings(store,s(a.team))
      if(a.mode==='cloud'||(!a.mode&&config.mode==='cloud')){const remote=remoteTarget(a.remote??config.remote);if(!remote)throw new Error('请在云主机 Team 中填写远端工作目录');return {path:remote.directory}}
      return {path:!a.mode&&config.directoryMode==='bind'?store.teamRoots?.[a.team]:managedTeamRoot(s(a.team||'workspace'),a.mode?{mode:a.mode,pluginId:a.pluginId}:config)}
    }
    case 'workspace.choose':
      return askRenderer('choose-folder',{path:a.path})
    case 'remote.check': {
      const employee=a.employee?readStore().sessions.find(c=>c.id===a.employee):undefined
      if(a.employee&&!employee)throw new Error('Unknown employee')
      return checkRemote(employee?executionEmployee(readStore(),employee).remote:a.team?teamSettings(readStore(),a.team).remote:a.remote)
    }
    case 'terminal.open': {
      const store=readStore(),card=store.sessions.find(c=>c.id===a.employee)
      if(!card)throw new Error('Unknown employee')
      assertTeamAvailable(card.group);assertNotRemoving(card.id)
      employeeWorkspace(store,card.group,card.cwd,card.id)
      return openTerminal(executionEmployee(store,card),Number(a.cols??100),Number(a.rows??24))
    }
    case 'terminal.list': return listTerminals(a.employee)
    case 'terminal.read': return readTerminal(s(a.id),Number(a.cursor??0))
    case 'terminal.input': return inputTerminal(s(a.id),s(a.data??''))
    case 'terminal.resize': return resizeTerminal(s(a.id),Number(a.cols),Number(a.rows))
    case 'terminal.close': return closeTerminal(s(a.id))
    case 'workspace.image':case 'workspace.list':case 'workspace.read':case 'workspace.write':case 'workspace.mkdir':case 'workspace.move':case 'workspace.trash':case 'workspace.restore': {
      const store=readStore(),saved=a.employee?store.sessions.find(c=>c.id===a.employee):undefined,card=saved?executionEmployee(store,saved):undefined
      if(card?.remote){if(a.team&&a.team!==card.group)throw new Error('员工不属于这个 Team');return remoteFiles(card.id,card.remote,req.cmd==='workspace.image'?'read-image':req.cmd.split('.')[1],a)}
      if(!a.employee&&a.team&&teamSettings(store,a.team).mode==='cloud')return remoteFiles(teamConnectionId(a.team),teamSettings(store,a.team).remote!,req.cmd==='workspace.image'?'read-image':req.cmd.split('.')[1],a)
      return workspaceFiles(workspaceContext(a).root,req.cmd==='workspace.image'?'read-image':req.cmd.split('.')[1],a)
    }
    case 'plugin.list':
      return listPlugins()
    case 'plugin.describe': {
      const plugin=requirePlugin(s(a.id))
      return {...plugin,api:JSON.parse(readFileSync(pluginFile(plugin.directory,plugin.schema),'utf8')),documentation:readFileSync(pluginFile(plugin.directory,plugin.documentation),'utf8')}
    }
    case 'plugin.install': {
      const plugin=installPlugin(s(a.path))
      const store=readStore(),workspaces=Object.entries(store.teamRoots??{}).filter(([name])=>teamSettings(store,name).pluginId===plugin.id).map(([name,root])=>{try{provisionWorkspace(root,teamSettings(store,name));return {root,ok:true}}catch(error){return {root,ok:false,error:String(error)}}})
      writeStore(store);return {plugin,workspaces}
    }
    case 'workspace.docs':
      {const context=workspaceContext(a);return context.settings.mode==='cloud'?{mode:'cloud',workspace:context.root,documentation:'Modules/Tunnel/README.md'}:a.employee?provisionEmployee(context.root,context.teamRoot,context.settings):provisionWorkspace(context.root,context.settings,context.teamRoot)}
    case 'plugin.call':
      return callPlugin(s(a.id),pluginWorkspace(a),s(a.method),a.params??{})
    case 'plugin.open': {
      await beforeViewChange()
      const window=await openPluginWindow(s(a.id),pluginWorkspace(a))
      setView({kind:'home',pluginId:s(a.id)})
      return window
    }
    case 'plugin.windows': return pluginWindows()
    case 'plugin.place': return placePluginWindow(s(a.id),a.bounds??{})
    case 'plugin.mode': return modePluginWindow(s(a.id),a.mode)
    case 'plugin.dismiss': return dismissPluginWindow(s(a.id))
    case 'plugin.view':
      {const root=pluginWorkspace(a);if(a.team||a.employee||a.workspace){const context=workspaceContext(a);provisionWorkspace(root,context.settings,context.teamRoot)}return openPluginView(s(a.id),root)}
    case 'plugin.close':
      return pluginWindows().some(window=>window.id===a.viewId)?dismissPluginWindow(s(a.viewId)):closePluginView(s(a.viewId))
    case 'status':
      return {
        running: true,
        home: APP_HOME,
        teamRoots: readStore().teamRoots ?? {},
        live: listLive().length,
        stored: readStore().sessions.length
      }

    case 'session.list': {
      if(a.live) return [...listLive().map((s) => sessionSnapshot(s.id)),...listWebChats()]
      const store=readStore()
      return {...store,sessions:store.sessions.map(c=>workspaceStatus(store,c))}
    }

    case 'session.new': {
      if(a.kind==='chatter')throw new Error('Use card.create with a Team and chat provider to create a web chat employee')
      return startSession(a as StartArgs)
    }

    case 'session.open': {
      if(isWebChat(s(a.cardId)))return openWebChat(s(a.cardId))
      return startSession({ cardId: s(a.cardId) })
    }

    case 'session.activity': return isWebChat(s(a.id))?null:sessionSnapshot(s(a.id)).activityPreview??null
    case 'session.snapshot':
      return isWebChat(s(a.id))?webChatSnapshot(s(a.id)):sessionSnapshot(s(a.id))
    case 'approval.list':
      return approvalsFor(s(a.id))
    case 'approval.respond':
      if (!['allow', 'deny'].includes(a.decision)) throw new Error('Decision must be allow or deny')
      return { answered: answerApproval(s(a.id), s(a.requestId), a.decision === 'allow',a.answers,a.form) }
    case 'session.search': {
      const q = s(a.query ?? '').toLowerCase()
      return readStore().sessions.filter((card) =>
        [card.title, card.group, card.engine, card.cwd,card.remote?.directory,card.remote?.host].some((v) => v?.toLowerCase().includes(q)))
    }

    case 'external.open': return openExternalUrl(s(a.url))
    case 'engine.inspect': return inspectEngine(s(a.id),s(a.section??'capabilities'))
    case 'engine.skill': return {sent:await invokeSkill(s(a.id),s(a.name),s(a.prompt??''))}
    case 'session.steer': return {sent:await steerMessage(s(a.id),s(a.text))}
    case 'session.background': return backgroundProcesses(s(a.id))
    case 'session.background-stop': return backgroundProcesses(s(a.id),a.processId,true)
    case 'session.review': {
      const modes=[a.base,a.commit,a.instructions].filter(v=>v!==undefined);if(modes.length>1)throw new Error('Choose only one review target')
      if(sessionInfo(s(a.id))?.engine!=='codex')throw new Error('Claude 审查请使用其命令列表中的 code-review 或 review')
      const suffix=a.base?' --base '+s(a.base):a.commit?' --commit '+s(a.commit):a.instructions?' '+s(a.instructions):''
      return {sent:await sendMessage(s(a.id),'/review'+suffix)}
    }
    case 'session.enqueue': return enqueueMessage(s(a.id),s(a.text??''),a.images)
    case 'session.queue': return queuedMessages(s(a.id))
    case 'session.dequeue': return removeQueuedMessage(s(a.id),s(a.messageId))
    case 'session.export': {
      const id=s(a.id),card=readStore().sessions.find(c=>c.id===id)??readStore().sessions.find(c=>c.id===sessionSnapshot(id).cardId)!;const format=s(a.format??'markdown');if(!['markdown','json'].includes(format))throw new Error('Use markdown|json')
      const items=transcriptItems(id),content=format==='json'?JSON.stringify(items,null,2):renderTranscript(items)
      if(a.path){const employee=executionEmployee(readStore(),card);const args={path:s(a.path),content,create:true};return employee.remote?remoteFiles(card.id,employee.remote,'write',args):workspaceFiles(employeeWorkspace(readStore(),card.group,card.cwd,card.id),'write',args)}
      return {format,content}
    }
    case 'session.send':
      if(isWebChat(s(a.id))){if(a.images?.length)throw new Error('Web chat image attachments are not supported');return {sent:await sendWebChat(s(a.id),s(a.text??''))}}
      return { sent: await sendMessage(s(a.id), s(a.text??''),undefined,a.images) }

    case 'chatter.status': case 'chatter.login': case 'chatter.import': case 'chatter.migrate':
      return webChatRequest(s(a.id),req.cmd.slice('chatter.'.length) as 'status'|'login'|'import'|'migrate',a)
    case 'chatter.view': return webChatView(s(a.id))
    case 'chatter.attach': return attachWebChat(s(a.id),Number(a.webContentsId))
    case 'chatter.current': case 'chatter.bind': case 'chatter.inspect': case 'chatter.click': case 'chatter.fill': case 'chatter.press': case 'chatter.upload': case 'chatter.screenshot': case 'chatter.run': case 'chatter.sync':
      return webChatRequest(s(a.id),req.cmd.slice('chatter.'.length),a)

    case 'session.transcript': {
      const items = transcriptItems(s(a.id))
      // Thinking is hidden by default; `--thinking` includes it, matching
      // expanding the thinking block in the GUI.
      const shown = a.thinking
        ? items
        : items.map((it: any) =>
            it.role === 'assistant'
              ? { ...it, blocks: it.blocks.filter((b: any) => b.kind !== 'thinking') }
              : it
          )
      return { text: renderTranscript(shown), items, shown }
    }

    case 'session.info': {
      if(isWebChat(s(a.id)))return webChatInfo(s(a.id))
      const info = sessionInfo(s(a.id))
      if (!info) throw new Error(`unknown session ${s(a.id)}`)
      return info
    }

    case 'session.interrupt':
      return { interrupted: isWebChat(s(a.id))?await interruptWebChat(s(a.id)):await interrupt(s(a.id)) }

    case 'session.close': {
      const closed = isWebChat(s(a.id))?await closeWebChat(s(a.id)):await closeSession(s(a.id))
      return { closed }
    }

    case 'config.engine': {
      const store=readStore(),card=store.sessions.find(c=>c.id===a.id)??store.sessions.find(c=>c.id===sessionSnapshot(s(a.id)).cardId)
      if(!card)throw new Error('Unknown employee')
      if(card.kind==='chatter')throw new Error('Web chat employees do not have a coding engine')
      employeeFields({engine:a.engine},card)
      assertTeamAvailable(card.group);assertNotRemoving(card.id)
      if(card.engine!==a.engine)await closeForEngineChange(card.id)
      const next=updateEmployee(card.id,{engine:a.engine})
      return executionEmployee(next,next.sessions.find(c=>c.id===card.id)!)
    }
    case 'config.model':
      return { ok: await setModel(s(a.id), a.model ? s(a.model) : undefined) }
    case 'config.permission':
      return { ok: await setPermissionMode(s(a.id), a.mode as PermissionMode) }
    case 'config.plan':
      if(typeof a.enabled!=='boolean')throw new Error('enabled must be boolean')
      return {ok:await setPlanMode(s(a.id),a.enabled)}
    case 'config.fast':
      if(typeof a.enabled!=='boolean')throw new Error('enabled must be boolean')
      return {ok:await setFastMode(s(a.id),a.enabled)}
    case 'config.thinking':
      return { ok: await setThinking(s(a.id), a.enabled === true || a.enabled === 'on') }
    case 'config.effort':
      // 'default' (or omitting the value) clears the override, matching the
      // "Default" entry in the GUI's effort dropdown.
      return {
        ok: await setEffort(
          s(a.id),
          !a.effort || a.effort === 'default' ? null : (a.effort as EffortLevel)
        )
      }

    // ---- UI inspection: what is actually on screen ----
    case 'ui.view':
    case 'ui.dom':
    case 'ui.text':
      return askRenderer(req.cmd.split('.')[1], {
        selector: a.selector,
        timeout: a.timeout
      })

    case 'ui.style':
      return askRenderer('style', { selector: s(a.selector) })
    case 'ui.screenshot':
      return askRenderer('screenshot', { path: s(a.path) })
    case 'ui.drag':
      return askRenderer('drag',a)
    case 'ui.wheel':
      return askRenderer('wheel',a)

    case 'ui.click':
      await askRenderer('click', { selector: s(a.selector) })
      // Give React a beat to re-render before the caller reads the UI.
      await new Promise((r) => setTimeout(r, 400))
      return askRenderer('snapshot')

    case 'ui.type':
      await askRenderer('type', { selector: s(a.selector), value: s(a.value) })
      return askRenderer('snapshot')

    case 'ui.wait':
      return askRenderer('wait', { selector: s(a.selector), timeout: a.timeout ?? 5000 })

    case 'commands.run': {
      if(isWebChat(s(a.id)))throw new Error('Web chat employees do not expose agent slash commands')
      const text=s(a.text);if(!text.startsWith('/'))throw new Error('Command must start with /')
      return {sent:await sendMessage(s(a.id),text)}
    }
    case 'commands.list': {
      if(isWebChat(s(a.id)))return []
      const all = sessionCommands(s(a.id))
      const f = String(a.filter ?? '').toLowerCase()
      const hidden = new Set(sessionInfo(s(a.id))?.terminalCommands ?? [])
      return all
        .filter((c) => (a.all ? true : !hidden.has(c.name)))
        .filter(
          (c) =>
            !f ||
            c.name.toLowerCase().includes(f) ||
            (c.description ?? '').toLowerCase().includes(f)
        )
    }

    // What Tab/Enter would insert when the menu is open.
    case 'commands.complete': {
      const name = s(a.name).replace(/^\//, '')
      const all = sessionCommands(s(a.id))
      const hit = all.find((c) => c.name === name || c.aliases?.includes(name))
      if (!hit) throw new Error(`no such command '/${name}'`)
      const hint = hit.argumentHint ? ' ' : ''
      return { completion: `/${hit.name}${hint}`, command: hit }
    }

    case 'group.list':
      {const store=readStore();return a.details?store.groups.map(name=>({name,root:store.teamRoots?.[name],...teamSettings(store,name)})):store.groups}
    case 'group.add': {
      const name=s(a.name??'').trim();if(!name)throw new Error('Team 名称不能为空')
      const config=validateTeamSettings({mode:a.mode??'build',pluginId:a.pluginId,directoryMode:a.directoryMode,remote:a.remote})
      if(config.mode==='cloud')config.remote={...config.remote!,directory:(await remoteFiles(teamConnectionId(s(a.name)),config.remote!,'directory',{path:'.'})).path}
      assertTeamAvailable(a.name)
      return addGroup(name,config.mode==='cloud'?config.remote!.directory:a.root,config)
    }
    case 'group.configure': {
      const store=readStore();if(!store.groups.includes(a.name))throw new Error('Unknown Team')
      const previous=teamSettings(store,s(a.name)),config=validateTeamSettings({mode:a.mode,pluginId:a.pluginId,directoryMode:a.directoryMode,remote:a.mode==='cloud'?a.remote??previous.remote:a.remote})
      const members=store.sessions.filter(card=>card.group===a.name)
      if(members.length&&(config.mode!==previous.mode||config.pluginId!==previous.pluginId))throw new Error('已有员工的 Team 不能切换工作区类型；请创建新的 Team')
      if(config.mode==='cloud'&&JSON.stringify(config.remote)!==JSON.stringify(previous.remote)){
        config.remote={...config.remote!,directory:(await remoteFiles(teamConnectionId(a.name),config.remote!,'directory',{path:'.'})).path}
        for(const card of members)await remoteFiles(teamConnectionId(a.name),config.remote,'directory',{path:cloudRelative(previous,card.cwd)})
        for(const card of members)await closeForWorkspaceChange(card.id)
      }
      assertTeamAvailable(a.name)
      const next=configureTeam(s(a.name),config,a.root),root=next.teamRoots![a.name]
      if(previous.mode==='cloud'&&config.mode!=='cloud')closeRemote(teamConnectionId(a.name))
      if(config.mode!=='cloud')await releaseWorkspacePlugins(root)
      return next
    }
    case 'group.root': case 'group.migrate': {
      const store=readStore(),config=teamSettings(store,s(a.name))
      if(config.mode==='cloud')throw new Error('云主机目录请通过 group configure 更新，不会在本地迁移')
      if(config.mode==='work'&&req.cmd==='group.root')throw new Error('Work Team 使用插件固定工作目录，不能手动绑定 Team 文件夹')
      if(req.cmd==='group.root'&&a.directoryMode==='bind'){
        const root=chooseTeamRoot(s(a.name),{...config,directoryMode:'bind'},a.root)
        const next={...store,teamRoots:{...store.teamRoots,[a.name]:root}}
        for(const card of store.sessions.filter(c=>c.group===a.name))employeeWorkspace(next,card.group,card.cwd,card.id,'preview')
        if(config.mode==='work'&&store.teamRoots?.[a.name]!==root)for(const card of store.sessions.filter(c=>c.group===a.name))await closeForWorkspaceChange(card.id)
        assertTeamAvailable(a.name)
        return bindTeamRoot(s(a.name),root)
      }
      const root=managedTeamRoot(s(a.name),config,a.root)
      if(store.teamRoots?.[s(a.name)]!==root) for(const card of store.sessions.filter(c=>c.group===a.name)) await closeForWorkspaceChange(card.id)
      if(store.teamRoots?.[s(a.name)]!==root&&store.teamRoots?.[s(a.name)])await releaseWorkspacePlugins(store.teamRoots[s(a.name)])
      assertTeamAvailable(a.name)
      return setTeamRoot(s(a.name),root,!!a.create)
    }
    case 'group.rename':
      return renameGroup(s(a.name), s(a.nextName))
    case 'group.remove': {
      const name=s(a.name)
      if(!readStore().groups.includes(name))throw new Error('Unknown Team')
      await beforeViewChange()
      beginTeamRemoval(name)
      try {
        const ids=readStore().sessions.filter(card=>card.group===name).map(card=>card.id)
        await removeEmployees(ids)
        closeRemote(teamConnectionId(name))
        const store=removeGroup(name),view=getView()
        if(view.name===name)setView({kind:'home'})
        return store
      }finally{endTeamRemoval(name)}
    }

    // Room placement: the floor layout is state like any other, so the CLI can
    // set it and tests can assert on it.
    case 'room.place': {
      const layout = {
        col: Number(a.col ?? 0),
        row: Number(a.row ?? 0),
        w: Number(a.w ?? 1),
        h: Number(a.h ?? 1)
      }
      return setRoom(s(a.name), layout)
    }
    case 'room.design':
      return designRoom(s(a.name ?? ''), a.design ?? {})
    case 'room.bounds':
      return setBounds(s(a.name),a.bounds ?? {})
    case 'room.layout': {
      const room=planOffice(readStore()).find(r=>r.name===a.name)
      if(!room)throw new Error('Unknown Team')
      return room
    }
    case 'card.place':
      if(a.snap!==undefined&&typeof a.snap!=='boolean')throw new Error('snap must be boolean')
      if(a.zoom!==undefined&&(!Number.isFinite(a.zoom)||a.zoom<.08||a.zoom>3))throw new Error('Invalid canvas zoom')
      return placeEmployee(s(a.id),{x:Number(a.x),y:Number(a.y)},{snap:a.snap,zoom:a.zoom})
    case 'canvas.view':
      return readStore().viewport ?? DEFAULT_VIEW
    case 'canvas.set':
      return setViewport({x:Number(a.x),y:Number(a.y),zoom:Number(a.zoom)})
    case 'card.clone': return cloneEmployee(s(a.id),{title:s(a.title),cwd:a.cwd,directoryMode:a.directoryMode})
    case 'card.create': {
      const kind=a.kind??'worker'
      if(!['worker','chatter'].includes(kind))throw new Error('Employee kind must be worker or chatter')
      if(kind==='chatter'&&!['doubao','deepseek','chatgpt'].includes(a.chatProvider))throw new Error('Web chat provider must be doubao, deepseek or chatgpt')
      if(kind==='worker'&&a.chatProvider!==undefined)throw new Error('Only chatter employees have a web chat provider')
      const engine = a.engine ?? 'codex'
      if (!['claude', 'codex'].includes(engine)) throw new Error('Unknown engine')
      if (!String(a.title ?? '').trim()) throw new Error('Employee name is required')
      const appearance = employeeFields(a)
      const store=readStore(),config=teamSettings(store,s(a.group??''))
      if(kind==='chatter'&&!(config.mode==='build'||config.mode==='work'&&config.pluginId==='browser'))throw new Error('Web chat employees require a local Build Team or Browser Work Team')
      if(a.remote!==undefined)throw new Error('云主机连接由 Team 统一配置，请创建或选择 cloud Team')
      const cwd=await resolveEmployeeWorkspace(store,s(a.group??''),s(a.title),a.cwd,a.directoryMode)
      assertTeamAvailable(a.group)
      const latest=readStore();if(!latest.groups.includes(a.group)||JSON.stringify(teamSettings(latest,a.group))!==JSON.stringify(config))throw new Error('Team 已删除或配置已变更，请重新创建员工')
      provisionEmployee(cwd,store.teamRoots![a.group],config)
      const id = newSessionId()
      const saved = patchSession(id, { ...appearance, id, title: s(a.title).trim(), engine, kind,chatProvider:kind==='chatter'?a.chatProvider:undefined,cwd, group: a.group ?? '', createdAt: Date.now(),
        model: kind==='chatter'?undefined:a.model ?? (engine === 'codex' ? 'gpt-5.6-luna' : undefined),
        effort: a.effort ?? 'low', permissionMode: config.mode!=='build'||managerCliRoot(cwd)?'acceptEdits':'default' })
      return executionEmployee(saved,saved.sessions.find((c) => c.id === id)!)
    }
    case 'card.update': {
      const store=readStore(), card=store.sessions.find(c=>c.id===a.id)
      if(!card) throw new Error('Unknown employee')
      const patch={...a.patch}
      if(patch.kind!==undefined&&patch.kind!==(card.kind??'worker'))throw new Error('Employee kind is fixed after creation')
      if(patch.chatProvider!==undefined&&patch.chatProvider!==card.chatProvider)throw new Error('Web chat provider is fixed after creation')
      if(card.kind==='chatter'&&patch.engine!==undefined&&patch.engine!==card.engine)throw new Error('Web chat employees do not have a coding engine')
      if(card.kind==='chatter'){const target=teamSettings(store,patch.group??card.group);if(!(target.mode==='build'||target.mode==='work'&&target.pluginId==='browser'))throw new Error('Web chat employees require a local Build Team or Browser Work Team')}
      employeeFields(patch,card)
      if(patch.remote!==undefined)throw new Error('云主机连接由 Team 统一配置，员工不能覆盖主机')
      if(patch.engine!==undefined&&patch.engine!==card.engine)await closeForEngineChange(card.id)
      if(patch.group!==undefined || patch.cwd!==undefined || patch.directoryMode!==undefined) {
        const group=patch.group??card.group,input=patch.directoryMode==='default'?patch.cwd:patch.cwd??card.cwd
        const unchanged=group===card.group&&input===card.cwd&&patch.directoryMode!=='default'
        const cwd=unchanged?card.cwd:await resolveEmployeeWorkspace(store,group,patch.title??card.title,input,patch.directoryMode,card.id,true)
        if(cwd!==card.cwd||group!==card.group) await closeForWorkspaceChange(card.id)
        assertTeamAvailable(card.group);assertTeamAvailable(group)
        patch.cwd=unchanged?card.cwd:await resolveEmployeeWorkspace(readStore(),group,patch.title??card.title,input,patch.directoryMode,card.id)
      }
      const updated=updateEmployee(card.id,patch),next=updated.sessions.find(c=>c.id===card.id)!
      provisionEmployee(next.cwd,updated.teamRoots![next.group],teamSettings(updated,next.group))
      return updated
    }

    case 'session.rename': {
      const id=readStore().sessions.some(c=>c.id===a.id)?s(a.id):sessionSnapshot(s(a.id)).cardId
      if(!id)throw new Error('Unknown employee session')
      return updateEmployee(id,{title:s(a.title)})
    }
    case 'card.rename':
      return updateEmployee(s(a.cardId), {title:s(a.title)})
    case 'card.move': {
      const store=readStore(),card=store.sessions.find(c=>c.id===a.id)
      if(!card)throw new Error('Unknown employee')
      if(card.kind==='chatter'){const target=teamSettings(store,s(a.group));if(!(target.mode==='build'||target.mode==='work'&&target.pluginId==='browser'))throw new Error('Web chat employees require a local Build Team or Browser Work Team')}
      const input=a.cwd??(card.group===a.group?card.cwd:undefined)
      const cwd=await resolveEmployeeWorkspace(store,s(a.group),card.title,input,a.cwd?'bind':undefined,card.id,true)
      if(cwd!==card.cwd||a.group!==card.group) await closeForWorkspaceChange(card.id)
      assertTeamAvailable(card.group);assertTeamAvailable(a.group)
      await resolveEmployeeWorkspace(readStore(),s(a.group),card.title,input,a.cwd?'bind':undefined,card.id)
      return moveSession(card.id,s(a.group),a.before?s(a.before):undefined,cwd)
    }
    case 'card.remove':
      return removeEmployees([s(a.id)])

    default:
      throw new Error(`unknown command: ${req.cmd}`)
  }
}

/** Both employee and Team deletion share this one native-cleanup transaction. */
async function removeEmployees(ids:string[]) {
  const wanted=new Set(ids),locked:string[]=[]
  try {
    const current=readStore()
    for(const id of wanted){
      if(!current.sessions.some(card=>card.id===id))throw new Error('Unknown employee')
      if(!/^[a-z0-9_-]+$/i.test(id))throw new Error('无效的员工 ID，未移除员工')
      beginEmployeeRemoval(id);locked.push(id)
    }
    for(const id of wanted){await closeEmployeeTerminals(id);closeRemote(id)}
    for(const id of wanted)if(isWebChat(id))await closeWebChat(id)
    for(const live of listLive())if(wanted.has(sessionSnapshot(live.id).cardId!))await closeSession(live.id)
    const latest=readStore(),refs=latest.sessions.filter(card=>wanted.has(card.id)).flatMap(nativeRefsForRemoval)
    const others=latest.sessions.filter(card=>!wanted.has(card.id)).flatMap(nativeSessionRefs)
    if(refs.some(ref=>others.some(other=>other.engine===ref.engine&&other.id===ref.id)))throw new Error('原生会话仍被其他员工引用，未移除员工')
    await deleteNativeSessions(refs)
    for(const id of wanted)deleteTranscript(id)
    const store=removeSession([...wanted]),view=getView()
    if(view.employee&&wanted.has(view.employee))setView(view.pluginId?{kind:'plugin',pluginId:view.pluginId}:{kind:'home'})
    return store
  }finally{for(const id of locked)endEmployeeRemoval(id)}
}

function pluginWorkspace(args:Record<string,any>):string {
  if(!args.team&&!args.employee&&!args.workspace){
    const settings={mode:'work' as const,pluginId:String(args.id)},destination=managedTeamRoot('',settings),legacy=legacyPluginWorkspace(settings.pluginId)
    if(!existsSync(destination)&&existsSync(legacy)&&!inside(legacy,destination)){
      mkdirSync(dirname(destination),{recursive:true})
      const stage=destination+'.import-'+process.pid
      try{cpSync(legacy,stage,{recursive:true,filter:file=>!file.startsWith(legacy+'/.agents-company')});renameSync(stage,destination)}finally{rmSync(stage,{recursive:true,force:true})}
    }
    const root=teamRoot(destination,true,true)
    provisionWorkspace(root,settings);return root
  }
  const context=workspaceContext(args)
  if(context.settings.mode!=='work'||context.settings.pluginId!==args.id)throw new Error('请使用绑定了此插件的 Work Team')
  return context.root
}

function workspaceContext(args:Record<string,any>) {
  const store=readStore(),roots=store.teamRoots??{}
  const employee=args.employee?store.sessions.find(c=>c.id===args.employee):undefined
  if(args.employee&&!employee)throw new Error('Unknown employee')
  const name=employee?.group??args.team??Object.entries(roots).find(([,root])=>args.workspace&&root===teamRoot(String(args.workspace),false,true))?.[0]
  if(!name||!roots[name])throw new Error('Choose a registered --team or --employee')
  if(employee&&args.team&&employee.group!==args.team)throw new Error('员工不属于这个 Team')
  if(teamSettings(store,name).mode==='cloud')return {name,store,teamRoot:roots[name],root:employee?employee.cwd:roots[name],settings:teamSettings(store,name)}
  const root=teamRoot(roots[name],false,teamSettings(store,name).mode==='work')
  if(root!==roots[name])throw new Error('Team 根目录已被移动或替换，请重新绑定目录')
  return {name,store,teamRoot:root,root:employee?employeeWorkspace(store,name,employee.cwd,employee.id):root,settings:teamSettings(store,name)}
}

async function closeForEngineChange(cardId:string):Promise<void> {
  assertEmployeeControl(cardId)
  for(const live of listLive()){const snapshot=sessionSnapshot(live.id);if(snapshot.cardId===cardId){if(snapshot.busy)throw new Error('员工正在工作，请先停止任务再切换引擎或工作空间');await closeSession(live.id)}}
}

async function closeForWorkspaceChange(cardId: string): Promise<void> {
  assertEmployeeControl(cardId)
  if(isWebChat(cardId)){const chat=listWebChats().find(s=>s.id===cardId);if(chat?.busy)throw new Error('员工正在聊天，请先停止再更改工作空间');await closeWebChat(cardId)}
  for(const live of listLive()) {
    const state=sessionSnapshot(live.id)
    if(state.cardId!==cardId) continue
    if(state.busy) throw new Error('员工正在工作，请先停止任务再更改工作空间')
    await closeSession(live.id)
  }
  await closeEmployeeTerminals(cardId);closeRemote(cardId)
}

export function startServer(onListening: () => void = () => {}): void {
  mkdirSync(dirname(SOCKET_PATH), { recursive: true })

  server = createServer((sock) => {
    clients.add(sock)
    const drop = () => {
      clients.delete(sock)
      following.delete(sock)
      rawFollowers.delete(sock)
    }
    sock.on('close', drop)
    sock.on('error', drop)

    const rl = createInterface({ input: sock })
    rl.on('line', async (line) => {
      let req: Request
      try {
        req = JSON.parse(line)
      } catch {
        sock.write(JSON.stringify({ ok: false, error: 'malformed request' }) + '\n')
        return
      }

      // `follow` keeps the connection open and streams instead of replying.
      // `raw: true` forwards every engine event, not just the rendered text.
      if (req.cmd === 'session.follow') {
        const sessionId = String((req.args ?? {}).id)
        const info = isWebChat(sessionId)?webChatInfo(sessionId):sessionInfo(sessionId)
        if (!info) {
          sock.end(JSON.stringify({ ok: false, error: `unknown session ${sessionId}` }) + '\n')
          return
        }
        following.set(sock, sessionId)
        if ((req.args ?? {}).raw) rawFollowers.add(sock)
        sock.write(
          JSON.stringify({
            ok: true,
            data: { following: sessionId, transcript: transcriptItems(sessionId), text: renderTranscript(transcriptItems(sessionId)) }
          }) + '\n'
        )
        if (!info.busy) sock.end(JSON.stringify({ type: 'done' }) + '\n')
        return
      }

      let res: Response
      try {
        res = { ok: true, data: await handleRequest(req) }
      } catch (err) {
        res = { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
      if (sock.writable) sock.write(JSON.stringify(res) + '\n')
    })
  })

  const listen = () => server!.listen(SOCKET_PATH, () => { ownsSocket = true; onListening() })
  server.on('error', (err) => { console.error('[socket]', err.message); process.exitCode = 1 })
  if (!existsSync(SOCKET_PATH)) { listen(); return }
  // Probe before removing a stale socket; never detach another running service.
  const probe = connect(SOCKET_PATH)
  probe.once('connect', () => {
    probe.destroy()
    console.error(`Agents Company is already running at ${SOCKET_PATH}`)
    process.exit(1)
  })
  probe.once('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'ECONNREFUSED' && err.code !== 'ENOENT') {
      console.error(err.message); process.exit(1)
    }
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
    listen()
  })
}

export function stopServer(): void {
  try {
    server?.close()
    for (const client of clients) client.destroy()
    if (ownsSocket && existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
  } catch {
    // shutting down anyway
  }
  server = null
  ownsSocket = false
}
