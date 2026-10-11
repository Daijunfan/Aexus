import {useCallback,useEffect,useRef,useState} from 'react'
import type {GuardianConnection,GuardianSecurityCheck,GuardianSettings,GuardianSnapshot} from '../../../shared/guardian'
import type {GuardianEventFeed,GuardianEventSubject} from '../../../shared/guardian-events'
import {api} from '../api'
import {Icon} from './Icon'
import {GuardianLocationSettings} from './guardian/GuardianLocationSettings'
import {GuardianCpu,GuardianMemory,GuardianProcesses,GuardianProcessInspector} from './guardian/GuardianResources'
import {GuardianStorage} from './guardian/GuardianStorage'
import {GuardianNetwork,type ConnectionFilter} from './guardian/GuardianNetwork'
import {GuardianSecurity} from './guardian/GuardianSecurity'
import {GuardianApplications} from './guardian/GuardianApplications'
import {GuardianEvents} from './guardian/GuardianEvents'
import {GuardianAgentActivity} from './guardian/GuardianAgentActivity'
import {GuardianReport} from './guardian/GuardianReport'
import {GuardianCockpit} from './guardian/GuardianCockpit'
import '../styles/guardian-operations.css'
import {bytes,percent,pressureLabel,time} from './guardian/GuardianFormat'

const DOMAINS=[{id:'overview',name:'总览',icon:'dashboard',caption:'整机一览'},{id:'cpu',name:'处理器',icon:'chip',caption:'核心与负载'},{id:'memory',name:'内存',icon:'server',caption:'组成与驻留'},{id:'storage',name:'磁盘',icon:'database',caption:'空间与目录'},{id:'network',name:'网络',icon:'globe',caption:'连接与流量'},{id:'processes',name:'进程',icon:'pulse',caption:'资源与活动'},{id:'security',name:'安全',icon:'shield',caption:'保护层与依据'},{id:'applications',name:'应用',icon:'search',caption:'资源与联网档案'},{id:'events',name:'事件',icon:'info',caption:'变化与人工核对'},{id:'ai',name:'AI 行为',icon:'chip',caption:'执行范围与状态'},{id:'report',name:'周报',icon:'graph',caption:'记录与处理回顾'}] as const
type Domain=typeof DOMAINS[number]['id']
export default function GuardianView(){
 const [snapshot,setSnapshot]=useState<GuardianSnapshot|null>(null),[error,setError]=useState(''),[refreshing,setRefreshing]=useState(false),[paused,setPaused]=useState(false),[domain,setDomain]=useState<Domain>('overview'),[minutes,setMinutes]=useState<1|5|15>(5),[settings,setSettings]=useState(false),[menuOpen,setMenuOpen]=useState(false)
 const [process,setProcess]=useState<GuardianSnapshot['processes'][number]|null>(null),[network,setNetwork]=useState<{filter:ConnectionFilter;pid:number|null}>({filter:'all',pid:null}),[security,setSecurity]=useState<GuardianSecurityCheck['id']>('firewall')
 const [feed,setFeed]=useState<GuardianEventFeed|null>(null),[eventError,setEventError]=useState(''),[focusEventId,setFocusEventId]=useState<string|null>(null),[settingsValue,setSettingsValue]=useState<GuardianSettings|null>(null)
 const inFlight=useRef(false),alive=useRef(false),scroll=useRef<HTMLDivElement>(null)
 const refresh=useCallback(async()=>{if(inFlight.current)return;inFlight.current=true;setRefreshing(true);try{const value=await api.call<GuardianSnapshot>('guardian.snapshot');if(alive.current){setSnapshot(value);setError('')}try{const changes=await api.call<GuardianEventFeed>('guardian.event-list');if(alive.current){setFeed(changes);setEventError('')}}catch(cause){if(alive.current)setEventError((cause as Error).message)}}catch(e){if(alive.current)setError((e as Error).message)}finally{inFlight.current=false;if(alive.current)setRefreshing(false)}},[])
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false}},[refresh])
 useEffect(()=>{if(paused)return;const timer=setInterval(()=>{if(!document.hidden)void refresh()},3000);return()=>clearInterval(timer)},[paused,refresh])
 useEffect(()=>{scroll.current?.scrollTo({top:0})},[domain])
 const showSettings=()=>{void api.call<GuardianSettings>('guardian.settings-get').then(value=>{if(alive.current){setSettingsValue(value);setSettings(true)}}).catch(cause=>{if(alive.current)setError((cause as Error).message)})}
 const openDomain=(next:Domain)=>{if(next==='network')setNetwork({filter:'all',pid:null});setDomain(next);setMenuOpen(false)}
 const openNetwork=(filter:ConnectionFilter='all',pid:number|null=null)=>{setNetwork({filter,pid});setDomain('network');setProcess(null)}
 const openProcess=(pid:number)=>{const selected=snapshot?.processes.find(p=>p.pid===pid);if(selected)setProcess(selected);else {setError('该进程已退出或不在当前采样中。');void refresh()}}
 const openSecurity=(id:GuardianSecurityCheck['id'])=>{setSecurity(id);setDomain('security')}
 const openEvent=(id:string)=>{setFocusEventId(id);setDomain('events');setProcess(null)}
 const createInvestigation=async(title:string,summary:string,subject?:GuardianEventSubject)=>{const next=await api.call<GuardianEventFeed>('guardian.event-create',{title,summary,...(subject?{subject}:{})});setFeed(next);setFocusEventId(next.events[0]?.id??null);setDomain('events');setProcess(null)}
 const investigateProcess=(pid:number)=>{const selected=snapshot?.processes.find(p=>p.pid===pid);if(!selected)return;void createInvestigation('调查 '+selected.name+' 的资源活动','在 '+new Date(snapshot!.sampledAt).toLocaleString('zh-CN')+' 采样中，进程 '+selected.name+'（PID '+pid+'）CPU 为 '+percent(selected.cpuPercent)+'，驻留内存 '+bytes(selected.memoryBytes)+'。这些数据只能说明当前负载，尚不能确认异常原因。',{process:selected.name,pid}).catch(e=>setError((e as Error).message))}
 const investigateConnection=(connection:GuardianConnection)=>{void createInvestigation('调查 '+connection.process+' 的 TCP 连接','本机采样观测到 '+connection.process+'（PID '+(connection.pid??'未知')+'）连接端点 '+(connection.remoteAddress??connection.localAddress)+':'+(connection.remotePort??connection.localPort)+'，状态 '+connection.state+'。方向及内容无法仅凭 TCP 快照确认。',{process:connection.process,pid:connection.pid??undefined,remoteAddress:connection.remoteAddress??undefined,remotePort:connection.remotePort??undefined}).catch(e=>setError((e as Error).message))}
 const memory=snapshot?.memory
 const observationLabel=paused?(snapshot?.settings.backgroundSamplingEnabled?'页面暂停 · 后台采样中':'采样已暂停'):error?'页面采样异常':snapshot?(snapshot.settings.backgroundSamplingEnabled?'页面实时 · 后台已开启':'正在实时采样'):'连接本机中'
 const domainValue=(id:Domain)=>id==='cpu'?percent(snapshot?.cpu.usagePercent):id==='memory'?(memory?pressureLabel[memory.pressure]:'—'):id==='storage'?percent(snapshot?.disk?.usedPercent):id==='network'?String(snapshot?.network.connections.length??'—'):id==='processes'?String(snapshot?.processes.length??'—'):id==='security'?`${snapshot?.security.filter(c=>c.status==='enabled').length??'—'}/3`:id==='applications'?String(new Set(snapshot?.processes.map(p=>p.name)??[]).size):id==='events'?String(feed?.events.filter(item=>item.status==='open').length??'—'):id==='ai'?'会话':id==='report'?'7 天':undefined
 return <main className="guardian-view guardian-workbench" data-testid="guardian-view">
  <header className="g-app-header"><div className="g-brand"><span className="g-brand-symbol"><Icon name="shield"/></span><div><h1>Guardian <span>电脑卫士</span></h1><p>{snapshot?.host.hostname??'本机系统'}<i/>macOS · {snapshot?.host.cpuCount??'—'} 核心 · {bytes(memory?.totalBytes)} 内存</p></div></div><div className="g-app-actions"><span className={`g-live ${paused?'paused':error?'error':''}`}><i/>{observationLabel}</span><button aria-label={paused?'恢复实时采样':'暂停实时采样'} aria-pressed={paused} onClick={()=>setPaused(!paused)}><Icon name={paused?'play':'debug-pause'}/>{paused?'恢复':'暂停'}</button><button aria-label="立即刷新 Guardian" disabled={refreshing} onClick={()=>void refresh()}><Icon name="refresh"/></button><button data-testid="guardian-location-settings" onClick={showSettings}><Icon name="settings-gear"/><span>位置与隐私</span></button></div></header>
  <div className="g-workspace">
  <div className="g-main"><div className="g-workspace-toolbar"><div className="g-trail"><button data-testid="guardian-home" data-domain="overview" aria-label="返回 Guardian 总控" onClick={()=>openDomain('overview')}><Icon name="home"/> 总控</button><span className="g-trail-separator">/</span><strong>{DOMAINS.find(d=>d.id===domain)?.name}</strong><span className="g-sample-clock">{paused?'页面采样已暂停':'页面每 3 秒采样'}{snapshot?.settings.backgroundSamplingEnabled?' · 后台每 60 秒':''} · {snapshot?`更新于 ${time(snapshot.sampledAt)}`:'正在读取系统'}</span></div><div className="g-toolbar-actions"><div className="g-time-range" aria-label="历史时间范围">{([1,5,15] as const).map(value=><button key={value} aria-label={`最近 ${value} 分钟`} aria-pressed={minutes===value} onClick={()=>setMinutes(value)}>{value} 分钟</button>)}</div><button data-testid="guardian-open-modules" aria-expanded={menuOpen} aria-controls="guardian-module-menu" onClick={()=>setMenuOpen(!menuOpen)}><Icon name="symbol-color"/> 监控模块 <Icon name="chevron-down"/></button></div>
   {menuOpen&&<div className="g-modules-menu" id="guardian-module-menu" data-testid="guardian-modules-menu"><header><div><span className="g-eyebrow">OBSERVATORY NAVIGATION</span><h3>选择一个监控领域</h3></div><button aria-label="关闭模块菜单" onClick={()=>setMenuOpen(false)}><Icon name="close"/></button></header><nav aria-label="Guardian 功能导航">{DOMAINS.map(item=><button key={item.id} data-domain={item.id} aria-current={domain===item.id?'page':undefined} onClick={()=>openDomain(item.id)}><span className="g-module-icon"><Icon name={item.icon}/></span><span><strong>{item.name}</strong><small>{item.caption}</small></span><b>{domainValue(item.id)}</b><Icon name="arrow-right"/></button>)}</nav></div>}
   </div>
   {error&&<div className="g-error-banner" role="alert"><Icon name="warning"/><span>{error} {snapshot&&'当前保留最后一次成功采样。'}</span><button onClick={()=>void refresh()}>重试</button></div>}
   <div className="g-content" ref={scroll}>
    {domain==='overview'&&<GuardianCockpit snapshot={snapshot} feed={feed} paused={paused} onOpen={openDomain} onEvent={openEvent}/>}
    {domain==='cpu'&&<GuardianCpu snapshot={snapshot} minutes={minutes} onProcess={openProcess}/>}
    {domain==='memory'&&<GuardianMemory snapshot={snapshot} minutes={minutes} onProcess={openProcess}/>}
    {domain==='storage'&&<GuardianStorage snapshot={snapshot}/>}
    {domain==='network'&&<GuardianNetwork snapshot={snapshot} minutes={minutes} initialFilter={network.filter} initialPid={network.pid} onProcess={openProcess} onLocationSettings={showSettings} onInvestigate={investigateConnection}/>}
    {domain==='processes'&&<GuardianProcesses snapshot={snapshot} onProcess={openProcess}/>}
    {domain==='security'&&<GuardianSecurity key={security} snapshot={snapshot} initial={security} onNetwork={()=>openNetwork('inbound')}/>}
    {domain==='applications'&&<GuardianApplications snapshot={snapshot} events={feed?.events??[]} onProcess={openProcess} onNetwork={pid=>openNetwork('all',pid)} onInvestigate={createInvestigation} onEvent={openEvent}/>}
    {domain==='events'&&<GuardianEvents feed={feed} error={eventError} focusId={focusEventId} onFeed={setFeed} onProcess={openProcess} onNetwork={pid=>openNetwork('all',pid)} onCreate={createInvestigation} onPlan={()=>void api.call('view.select',{id:'plan'})}/>}
    {domain==='ai'&&<GuardianAgentActivity onInvestigate={createInvestigation} onOpenConversation={id=>void api.call('view.open',{kind:'conversation',employee:id})}/>}
    {domain==='report'&&<GuardianReport feed={feed} error={eventError} onEvent={openEvent} onEvents={()=>setDomain('events')} onPlan={()=>void api.call('view.select',{id:'plan'})}/>}
    {!!snapshot?.issues.length&&<details className="g-issues"><summary><Icon name="info"/>{snapshot.issues.length} 项观测暂不可用 · 查看原因</summary>{snapshot.issues.map((issue,i)=><p key={i}>{issue}</p>)}</details>}
   </div>
  </div></div>
  {settings&&settingsValue&&<GuardianLocationSettings value={settingsValue} onClose={()=>setSettings(false)} onSaved={()=>void refresh()}/>}
  {process&&<GuardianProcessInspector key={process.pid} process={process} snapshot={snapshot} onClose={()=>setProcess(null)} onConnections={pid=>openNetwork('all',pid)} onInvestigate={investigateProcess}/>}
 </main>
}
export {GuardianView}
