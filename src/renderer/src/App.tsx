import {Icon} from './components/Icon'
import {AgentApproval} from './components/AgentApproval'
import {EngineTools} from './components/EngineTools'
import {activeModel,modelEfforts,supportsFast,fastTier} from '../../shared/engine-commands'
import {FileWorkspace} from './components/FileWorkspace'
import {EmployeeTerminal} from './components/EmployeeTerminal'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EFFORT_LEVELS, PERMISSION_MODES,teamSettings,type Item,type Session, type Store, type StoredSession } from '../../shared/types'
import { api } from './api'
import { EngineMark } from './components/EngineMark'
import { HomeView } from './components/HomeView'
import { Dropdown } from './components/Dropdown'
import { Turn } from './chat/Chat'
import { useDialogFocus } from './office/useDialogFocus'
import {DEFAULT_PREFERENCES} from '../../shared/preferences'
import type { ViewState } from '../../shared/view'
import {SessionTitle} from './components/SessionTitle'
import type {CSSProperties} from 'react'
import { EmployeeForm } from './office/OfficeForms'

export default function App() {
  useEffect(()=>api.rendererReady(),[])
  const [store, setStore] = useState<Store>({ sessions: [], groups: [], rooms: {} })
  useEffect(()=>{document.documentElement.dataset.theme=store.preferences?.theme??DEFAULT_PREFERENCES.theme},[store.preferences?.theme])
  useEffect(()=>{document.documentElement.style.setProperty('--page-zoom',String(store.preferences?.pageZoom??1))},[store.preferences?.pageZoom])
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedCardId,setSelectedCardId]=useState<string|null>(null)
  const [opening,setOpening]=useState(false),[openError,setOpenError]=useState(''),[savedItems,setSavedItems]=useState<Item[]>([])
  const openSequence=useRef(0)
  const [input, setInput] = useState('')
  const [images,setImages]=useState<string[]>([])
  const imageDrafts=useRef<Record<string,string[]>>({})
  const drafts=useRef<Record<string,string>>({})
  const [sidebarDraft,setSidebarDraft]=useState<number|undefined>(undefined)
  const [error, setError] = useState('')
  const [view,setView]=useState<ViewState>({kind:'home',revision:0})
  const editingEmployee=!!view.details
  const setEditingEmployee=(enabled:boolean)=>void act('view.details',{enabled})
  const showView=(state:ViewState)=>setView(previous=>state.revision>=previous.revision?state:previous)
  const [menu, setMenu] = useState<'engine' | 'model' | 'perm' | 'effort' | null>(null)
  const [cmdIndex, setCmdIndex] = useState(0)
  const transcript = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const liveActive = sessions.find((s) => s.id === activeId)
  const employee=store.sessions.find(c=>c.id===(selectedCardId??liveActive?.cardId))
  const active:Session|undefined=liveActive??(employee?{id:employee.id,cardId:employee.id,engine:employee.engine,title:employee.title,group:employee.group,cwd:employee.remote?.directory??employee.cwd,createdAt:employee.createdAt,model:employee.model,effort:employee.effort,permissionMode:employee.permissionMode??'default',thinking:employee.thinking??false,thinkingSupported:employee.engine==='claude',busy:false,items:savedItems,commands:[],models:[]}:undefined)
  const closeConversation=()=>void act('view.close')
  useDialogFocus('.conversation-dialog', !!active&&!view.pluginId)
  const busyIds = useMemo(() => new Set(sessions.filter((s) => s.busy).map((s) => s.cardId ?? s.id)), [sessions])
  const disconnectedIds = useMemo(() => new Set(sessions.filter(s=>s.error&&store.sessions.some(card=>card.id===(s.cardId??s.id)&&card.kind==='cloud-native-worker')).map(s=>s.cardId??s.id)),[sessions,store.sessions])
  const viewedSession=useRef<string|null>(null)
  const refreshSequence=useRef(0)
  const refreshPending=useRef<Promise<void>|null>(null)
  const refresh = useCallback((configuration=true):Promise<void> => {
    const sequence=++refreshSequence.current
    const pending=Promise.all([configuration?api.call<Store>('session.list'):Promise.resolve(null), api.call<Session[]>('session.list', { live: true,summary:true })]).then(async ([saved,live])=>{
      const id=viewedSession.current;if(id&&live.some(item=>item.id===id)){const snapshot=await api.call<Session>('session.snapshot',{id});live=live.map(item=>item.id===id?snapshot:item)}
      // A save must wait for the snapshot actually published to React. Otherwise
      // a competing event refresh clears the drag preview onto stale positions.
      if(sequence!==refreshSequence.current){await refreshPending.current;return}
      if(saved)setStore(saved);setSessions(live)
    })
    refreshPending.current=pending
    return pending
  }, [])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let configuration=false
    const schedule = (full=false) => {
      configuration ||= full
      if (timer) return
      timer = setTimeout(() => { timer = undefined; const full=configuration;configuration=false;void refresh(full).catch((e) => setError(String(e))) }, 35)
    }
    const off = api.onEvent(event=>{if(event.channel==='view:changed')showView(event.payload);else if(!event.channel.startsWith('terminal:')&&!['plugin:windows','host:health'].includes(event.channel))schedule(event.channel==='store:changed'||event.channel==='hosts:changed')})
    void api.call<ViewState>('view.get').then(showView).catch(e=>setError(String(e)))
    void refresh().catch((e) => setError(String(e)))
    return () => { off(); clearTimeout(timer) }
  }, [refresh])
  const act = useCallback(async (cmd: string, args?: Record<string, unknown>) => {
    try { setError(''); const result = await api.call(cmd, args); await refresh(); return result }
    catch (e) { setError(String(e)); return undefined }
  }, [refresh])
  useEffect(()=>{
    let zoom=store.preferences?.pageZoom??1
    const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&['+','=','-','0'].includes(e.key)){
      e.preventDefault();e.stopPropagation()
      zoom=e.key==='0'?1:Math.max(.75,Math.min(1.5,Math.round((zoom+(e.key==='-'?-.1:.1))*100)/100))
      void act('settings.set',{pageZoom:zoom})
    }}
    window.addEventListener('keydown',key,true)
    return()=>window.removeEventListener('keydown',key,true)
  },[store.preferences?.pageZoom,act])
  const openCard = async (card: StoredSession) => {
    const sequence=++openSequence.current
    viewedSession.current=null;setSelectedCardId(card.id);setActiveId(null);setInput(drafts.current[card.id]??'');setImages(imageDrafts.current[card.id]??[]);setMenu(null);setSavedItems([]);setOpenError(card.workspaceError??'');setOpening(!card.workspaceError)
    void api.call<{items:Item[]}>('session.transcript',{id:card.id}).then(data=>{if(sequence===openSequence.current)setSavedItems(data.items)}).catch(()=>{})
    if(card.workspaceError)return
    try{const opened=await api.call('session.open',{cardId:card.id});if(sequence===openSequence.current)viewedSession.current=opened.sessionId;await refresh(false);if(sequence===openSequence.current)setActiveId(opened.sessionId)
    }
    catch(error){if(sequence===openSequence.current)setOpenError((error as Error).message)}
    finally{if(sequence===openSequence.current)setOpening(false)}
  }
  useEffect(()=>{
    if(view.kind==='conversation'&&view.employee){const card=store.sessions.find(c=>c.id===view.employee);if(card)void openCard(card)}
    else {openSequence.current++;viewedSession.current=null;setActiveId(null);setSelectedCardId(null);setOpenError('');setOpening(false);setMenu(null)}
  },[view.kind,view.employee,store.sessions.some(c=>c.id===view.employee)])
  const attachImage=(path:string)=>{if(employee){const next=[...new Set([...images,path])];setImages(next);imageDrafts.current[employee.id]=next}}
  const send = async (value=input) => {
    if (!liveActive || !active || (!value.trim()&&!images.length)) return
    const text=value.trim(),sequence=openSequence.current,attached=text.startsWith('/')?[]:images
    const sent=await act(active.busy?'session.enqueue':'session.send',{id:active.id,text,images:attached})
    if(sent&&sent.sent!==false){
      if(employee){delete drafts.current[employee.id];if(!text.startsWith('/'))delete imageDrafts.current[employee.id]}
      if(sequence===openSequence.current){setInput('');if(!text.startsWith('/'))setImages([]);if(text==='/model')setMenu('model');if(text==='/effort')setMenu('effort');if(['/permissions','/approvals'].includes(text))setMenu('perm')}
    }
    composer.current?.focus()
  }

  const stop = () => active && act('session.interrupt', { id: active.id,expectedMessageId:active.currentTask?.messageId })
  const configure = (cmd: string, args: Record<string, unknown>) => active && act(cmd, { id: active.id, ...args })
  useEffect(() => {
    const el = transcript.current
    if (el) el.scrollTop = el.scrollHeight
  }, [active?.items, active?.busy])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!e.defaultPrevented && e.key === 'Escape' && active && !(e.target as HTMLElement)?.closest('.xterm')) closeConversation()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [active?.id, active?.busy, act])
  const commands = useMemo(() => {
    if (!active || !input.startsWith('/') || /\s/.test(input)) return []
    const term = input.slice(1).toLowerCase()
    return active.commands.filter((c) => !active.terminalCommands?.includes(c.name))
      .filter((c) => c.name.includes(term) || c.aliases?.some(a=>a.includes(term)) || c.description.toLowerCase().includes(term))
  }, [active, input])
  useEffect(() => setCmdIndex(0), [input])
  const permissions = active?.engine === 'codex' ? [
    { value: 'default', label: 'Read only', hint: 'Inspect files; no file changes' },
    { value: 'acceptEdits', label: 'Workspace write', hint: 'Allow edits within this workspace' },
    { value: 'bypassPermissions', label: 'Full access', hint: 'Run without sandbox restrictions' }
  ] : PERMISSION_MODES
  const model=active?activeModel(active.models,active.model):undefined
  const efforts=active?modelEfforts(active.engine,model):[]
  const fastAvailable=active?supportsFast(active.engine,model):false
  const modelLabel = active?.models.find((m) => m.value === active.model)?.displayName ?? active?.model ?? 'Configured model'
  const work=!!employee&&teamSettings(store,employee.group).mode==='work'
  useEffect(()=>{document.querySelector('.commands [aria-selected="true"]')?.scrollIntoView({block:'nearest'})},[cmdIndex,input])
  return <div className={`app in-office ${view.pluginId?'in-plugin':''}`} data-resizing={sidebarDraft!==undefined} style={{'--shared-width':view.shared?'320px':'0px','--directory-width':`clamp(56px, ${sidebarDraft??store.preferences?.sidebarWidth??DEFAULT_PREFERENCES.sidebarWidth}px, 96px)`} as CSSProperties}>
    <HomeView store={store} view={view} activities={Object.fromEntries(sessions.filter(s=>s.activityPreview).map(s=>[s.cardId??s.id,s.activityPreview!]))} busyIds={busyIds} disconnectedIds={disconnectedIds} onResize={setSidebarDraft} onOpen={card=>void act('view.open',{kind:'conversation',employee:card.id})} act={act} />
    {error && <div className="app-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    {active && <div className="conversation-layer">
      <div className="conversation-backdrop" onClick={closeConversation} />
      <section className="conversation-dialog" role="dialog" aria-modal={!view.shared&&!view.pluginId} aria-label={`${active.title} 的会话`}>
      <main className="main session-main">
        <header className="toolbar">
          {editingEmployee&&<button className="inspector-back" onClick={()=>setEditingEmployee(false)}><Icon name="arrow-left"/> 返回会话</button>}
          <button className="back" title="收起会话，继续工作" aria-label="收起会话" onClick={closeConversation}><Icon name="close"/></button>
          <span className="session-heading"><EngineMark engine={active.engine} size={20} /><SessionTitle title={employee?.title??active.title}/><small className="execution-badge" title={employee?.remote?.host}>{employee?.kind==='cloud-native-worker'?'Cloud Native Worker':'Local Worker'}</small></span>
          <button className="employee-details" hidden={editingEmployee} onClick={() => setEditingEmployee(true)}>员工资料</button>
          <button className="engine-tools-open" disabled={!liveActive} onClick={()=>void act('view.tools',{section:'skills'})}>工具与额度</button>
          <button className="employee-clone" disabled={active.busy||!!active.approvals?.length||!!active.pendingMessages?.length} onClick={()=>void act('view.open',{kind:'clone',employee:employee?.id??active.cardId})}>克隆员工</button>
          <span className="session-state"><i className={active.busy?'working':employee?.kind==='cloud-native-worker'&&active.error?'disconnected':''} />{active.busy?'工作中':employee?.kind==='cloud-native-worker'&&active.error?'连接／执行失败':'休息中'}</span>
          <button className="close-session" disabled={!liveActive} onClick={async () => { const r = await act('session.close', { id: active.id }); if (r) closeConversation() }} title="Close session; keep history">结束会话</button>
        </header>
        {!!active.approvals?.length&&<div className="agent-requests">{active.approvals?.map(p=><AgentApproval key={p.id} approval={p} respond={async(decision,answers,form)=>{await api.call('approval.respond',{id:active.id,requestId:p.id,decision,answers,form});await refresh()}}/>)}</div>}
        {view.tools&&liveActive?<EngineTools id={active.id} section={view.tools} onSection={section=>void act('view.tools',{section})} onClose={()=>void act('view.tools',{section:null})}/>:editingEmployee && employee ? <div className="employee-inspector"><EmployeeForm employee={employee} groups={store.groups} roots={store.teamRoots ?? {}} settings={store.teamSettings} onSave={async (fields) => {
          const {teamRoot,...patch}=fields
          if(teamRoot&&teamRoot!==store.teamRoots?.[fields.group])await api.call('group.root',{name:fields.group,root:teamRoot,create:true})
          const updated=await api.call<Store>('card.update', { id: employee.id, patch })
          await refresh()
          const saved=updated.sessions.find(c=>c.id===employee.id)
          if(!saved)throw new Error('员工已被移除，请重新选择员工')
          setEditingEmployee(false);await openCard(saved);return true
        }} onBound={async saved=>{await refresh();setEditingEmployee(false);await openCard(saved)}} onRemove={async () => { await act('card.remove', { id: employee.id }) }} /></div> : <div className="employee-workbench"><FileWorkspace explorerWidth={store.preferences?.explorerWidth} onAttachImage={attachImage} key={'files-'+(employee?.id??active.id)} employee={employee?.id??active.cardId??active.id}>
        {openError&&<div className="conversation-repair" role="alert"><span>{openError}</span><button onClick={()=>setEditingEmployee(true)}>配置工作目录</button>{!employee?.workspaceError&&<button onClick={()=>employee&&void openCard(employee)}>重试连接</button>}</div>}
        {liveActive?<div className="session-settings controls">
          <Dropdown control="engine" open={menu==='engine'} onToggle={()=>setMenu(menu==='engine'?null:'engine')} onClose={()=>setMenu(null)} label={active.engine==='codex'?'Codex':'Claude Code'} width={200}>{(['codex','claude'] as const).map(engine=><button className={`menu-item ${engine===active.engine?'sel':''}`} key={engine} disabled={active.busy} onClick={async()=>{setMenu(null);const card=await act('config.engine',{id:employee?.id??active.id,engine});if(card)await openCard(card)}}>{engine==='codex'?'Codex':'Claude Code'}</button>)}</Dropdown>
          <Dropdown control="model" open={menu === 'model'} onToggle={() => setMenu(menu === 'model' ? null : 'model')} onClose={() => setMenu(null)} label={modelLabel} width={330}>
            {active.models.map((m) => <button className={`menu-item col ${m.value === active.model ? 'sel' : ''}`} key={m.value} disabled={active.busy} onClick={() => { setMenu(null); void configure('config.model', { model: m.value }) }}><span className="menu-name">{m.value === active.model ? '✓ ' : ''}{m.displayName}</span><span className="menu-desc">{m.description||m.value}</span></button>)}
            {!active.models.length && <div className="menu-item">Loading models…</div>}
          </Dropdown>
          {work||employee?.remote&&employee.kind!=='cloud-native-worker'?<span className="work-permission" title={active.cwd}>{employee?.remote?`SSH · ${employee.remote.host}`:'Work · 当前目录及子目录'}</span>:<Dropdown control="perm" open={menu === 'perm'} onToggle={() => setMenu(menu === 'perm' ? null : 'perm')} onClose={() => setMenu(null)} label={permissions.find((p) => p.value === active.permissionMode)?.label ?? active.permissionMode} width={310}>
            {permissions.map((p) => <button key={p.value} className={`menu-item col ${p.value === active.permissionMode ? 'sel' : ''}`} onClick={() => { setMenu(null); void configure('config.permission', { mode: p.value }) }}><span className="menu-name">{p.label}</span><span className="menu-desc">{p.hint}</span></button>)}
          </Dropdown>}
          <Dropdown control="effort" open={menu === 'effort'} onToggle={() => setMenu(menu === 'effort' ? null : 'effort')} onClose={() => setMenu(null)} label={`思考 · ${active.effort ?? 'Default'}`} width={190}>
            <button className="menu-item" onClick={() => { setMenu(null); void configure('config.effort', { effort: 'default' }) }}>Default</button>
            {efforts.map(value=><button key={value} className={`menu-item ${value===active.effort?'sel':''}`} onClick={()=>{setMenu(null);void configure('config.effort',{effort:value})}}>{value}</button>)}
          </Dropdown>
          {active.engine==='claude'&&<button className={`toggle ${active.thinking?'on':''}`} disabled={active.busy||!active.thinkingSupported} onClick={()=>void configure('config.thinking',{enabled:!active.thinking})}>Thinking {active.thinking?'on':'off'}</button>}
          <button className={`toggle ${active.planMode?'on':''}`} data-control="plan" aria-pressed={!!active.planMode} disabled={active.busy} onClick={()=>void configure('config.plan',{enabled:!active.planMode})}>{active.planMode?'计划模式':'执行模式'}</button>
          {employee?.remote&&employee.kind!=='cloud-native-worker'&&active.engine==='codex'&&<button className={`toggle ${active.remoteAdmin?'on':''}`} data-control="remote-admin" aria-pressed={!!active.remoteAdmin} disabled={active.busy} title="仅在远端使用 SSH 用户权限访问硬件和管理服务；不会授权本机执行" onClick={()=>void configure('config.remote-admin',{enabled:!active.remoteAdmin})}>{active.remoteAdmin?'远端主机管理：已授权':'远端主机管理：关闭'}</button>}
          {(fastAvailable||active.fastMode)&&<button className={`toggle ${active.fastMode?'on':''}`} data-control="fast" aria-label="Fast 模式" aria-pressed={!!active.fastMode} disabled={active.busy} onClick={()=>void configure('config.fast',{enabled:!active.fastMode})} title={active.fastModeDisabledReason?`Fast 状态：${active.fastModeDisabledReason}`:fastTier(model)?.description??'官方 Fast 模式，开启后用量增加'}>⚡ {active.fastMode?'Fast'+(fastTier(model)?.description.match(/(\d+(?:\.\d+)?)x/)?.[1]?' · '+fastTier(model)!.description.match(/(\d+(?:\.\d+)?)x/)![1]+'×':''):'Standard'}{active.fastModeState==='cooldown'?' · 冷却中':''}</button>}
          <span className="cwd" title={active.cwd}>{active.cwd}</span>
        </div>:<div className="session-opening">{opening?'正在连接员工…':'会话已打开，配置有效工作目录后即可开始。'}</div>}
        {active.busy&&active.currentTask&&<div className="task-provenance" data-message-id={active.currentTask.messageId}>任务 {active.currentTask.messageId.slice(-6)} · 来自 {active.currentTask.delegation.requestedBy.kind==='operator'?'用户':store.sessions.find(card=>active.currentTask!.delegation.requestedBy.kind==='agent'&&card.id===active.currentTask!.delegation.requestedBy.employeeId)?.title??'Agent'}{active.currentTask.runId?' · 定时任务':''}</div>}
        <div className="transcript" ref={transcript}>
          {!active.items.length && <div className="conversation-empty"><EngineMark engine={active.engine} size={48} /><div className="panel-eyebrow">YOUR NEXT IDEA STARTS HERE</div><h1>What are we building?</h1><p>{liveActive?`${active.title} 已就绪，说说接下来要做什么。`:opening?'正在连接工作环境…':'检查工作目录后，就可以开始对话。'}</p></div>}
          {active.items.map((item) => <Turn key={item.id} item={item} />)}
          {active.error && <div className="error">{active.error}</div>}
        </div>
        <div className="composer">
          {!!images.length&&<div className="attachment-chips" aria-label="图片附件">{images.map(path=><button key={path} onClick={()=>{const next=images.filter(p=>p!==path);setImages(next);if(employee)imageDrafts.current[employee.id]=next}} title="移除附件">🖼 {path} ×</button>)}</div>}
          {!!active.pendingMessages?.length&&<div className="pending-messages" aria-label="待发送消息">{active.pendingMessages.map(message=><div key={message.id}><span>{message.text||message.images?.join(', ')}</span><button aria-label="取消排队" onClick={()=>void act('session.dequeue',{id:active.id,messageId:message.id})}>×</button></div>)}</div>}
          {!!commands.length && <div className="menu commands" role="listbox" aria-label="斜杠命令"><div className="commands-heading"><span>斜杠命令</span><span>↑ ↓ 选择 · Enter 执行 · Tab 补全</span></div>{commands.map((c, i) => <button key={c.name} role="option" aria-selected={i===cmdIndex} className={`menu-item ${i === cmdIndex ? 'hover' : ''}`} onClick={()=>{if(['model','effort','permissions'].includes(c.name)||!c.argumentHint)void send('/'+c.name);else setInput('/'+c.name+' ');composer.current?.focus()}}><span className="menu-name">/{c.name}</span><span className="menu-desc">{c.description}</span></button>)}</div>}
          <div className="composer-box"><textarea ref={composer} disabled={!liveActive} value={input} rows={3} placeholder={liveActive?`Message ${active.title}…`:'连接工作目录后即可发送消息'} onChange={(e) => {setInput(e.target.value);if(employee)drafts.current[employee.id]=e.target.value}} onKeyDown={(e) => {
            if(e.nativeEvent.isComposing)return
            if(e.key==='Escape'&&commands.length){e.preventDefault();e.stopPropagation();setInput('');return}
            if (commands.length && ['ArrowDown', 'ArrowUp', 'Tab', 'Enter'].includes(e.key) && !e.shiftKey) {
              e.preventDefault()
              if (e.key === 'ArrowDown') setCmdIndex((i) => (i + 1) % commands.length)
              else if (e.key === 'ArrowUp') setCmdIndex((i) => (i + commands.length - 1) % commands.length)
              else { const c = commands[cmdIndex];if(e.key==='Enter'&&(input==='/'+c.name||c.aliases?.includes(input.slice(1))||!c.argumentHint))void send(input==='/'+c.name?input:'/'+c.name);else setInput('/'+c.name+(c.argumentHint?' ':'')) }
            } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
          }} />{active.busy ? <><button className="send-btn steer" disabled={!input.trim()||!!images.length} onClick={async()=>{const text=input;if(await act('session.steer',{id:active.id,text})){setInput('');if(employee)delete drafts.current[employee.id]}}}>追加</button><button className="send-btn enqueue" disabled={!input.trim()&&!images.length} onClick={()=>void send()}>排队</button><button className="send-btn stop" onClick={() => void stop()}>■ Stop</button></> : <button className="send-btn" disabled={!liveActive||(!input.trim()&&!images.length)} onClick={() => void send()} title="Send message">↑</button>}</div>
          <div className="composer-foot"><button className="slash-trigger" aria-label="打开斜杠命令" disabled={!liveActive} onClick={()=>{setInput('/');composer.current?.focus()}}>/ 命令</button><span>{active.busy ? <span className="status-line"><span className="spinner" />{active.approvals?.length ? 'Waiting for permission' : active.activity || 'Working…'}</span> : 'Enter to send · Shift Enter for a new line'}</span><span>{active.engine === 'codex' ? 'Codex' : 'Claude Code'} · {active.group || 'Independent workspace'}</span></div>
        </div>
        </FileWorkspace><EmployeeTerminal terminalHeight={store.preferences?.terminalHeight} key={'terminal-'+(employee?.id??active.id)} employee={employee?.id??active.cardId??active.id}/></div>}
      </main>
      </section>
    </div>}
  </div>
}
