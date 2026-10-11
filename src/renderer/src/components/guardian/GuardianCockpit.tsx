import {useState,type CSSProperties} from 'react'
import type {GuardianSnapshot} from '../../../../shared/guardian'
import type {GuardianEventFeed} from '../../../../shared/guardian-events'
import {Icon} from '../Icon'
import {bytes,percent,pressureLabel,rate} from './GuardianFormat'
import '../../styles/guardian-cockpit.css'

type Destination='cpu'|'memory'|'storage'|'network'|'processes'|'security'|'applications'|'ai'|'events'|'report'
type Props={snapshot:GuardianSnapshot|null;feed:GuardianEventFeed|null;paused:boolean;onOpen:(dest:Destination)=>void;onEvent:(id:string)=>void}
type Focus='cpu'|'network'|'processes'|'memory'|'storage'|'security'
const wires: {domain:Focus;path:string;end:[number,number]}[]=[
 {domain:'cpu',path:'M 480 277 C 420 225 415 99 265 99',end:[265,99]},
 {domain:'network',path:'M 463 307 H 265',end:[265,307]},
 {domain:'processes',path:'M 481 342 C 422 404 415 494 265 494',end:[265,494]},
 {domain:'memory',path:'M 720 277 C 781 225 785 99 935 99',end:[935,99]},
 {domain:'storage',path:'M 736 307 H 935',end:[935,307]},
 {domain:'security',path:'M 720 343 C 782 408 789 494 935 494',end:[935,494]}
]
const theme={cpu:'#48aca0',network:'#7198d9',processes:'#9b8cc7',memory:'#8095cd',storage:'#cfaa69',security:'#4eac97'}
const highlight=(value:number|null|undefined)=>value==null?'—':percent(value)
type TracePoint={at:number;value:number|null}
function MiniTrace({points,ceiling,color}:{points:TracePoint[];ceiling:number;color:string}){
 const first=points[0]?.at??0,span=Math.max(1,(points.at(-1)?.at??first)-first)
 const known=points.filter(point=>point.value!==null&&Number.isFinite(point.value))
 let previous:number|null=null
 const coords=points.flatMap(point=>{
  if(point.value===null||!Number.isFinite(point.value)){previous=null;return []}
  const x=3+(point.at-first)/span*110,y=32-Math.max(0,Math.min(1,point.value/ceiling))*26
  const command=previous!==null&&point.at-previous<=15000?'L':'M'
  previous=point.at
  return [command+x.toFixed(1)+' '+y.toFixed(1)]
 })
 const last=known.at(-1)
 const lastX=last?3+(last.at-first)/span*110:0,lastY=last?32-Math.max(0,Math.min(1,last.value!/ceiling))*26:0
 return <svg viewBox="0 0 116 36" aria-hidden="true" data-samples={known.length}>
  <path d="M3 32H113" className="gc-mini-baseline"/>
  {known.length>1&&<path d={coords.join(' ')} stroke={color} className="gc-mini-line"/>}
  {last&&<circle cx={lastX} cy={lastY} r="2.6" fill={color} className="gc-mini-point"/>}
 </svg>
}

export function GuardianCockpit({snapshot,feed,paused,onOpen,onEvent}:Props){
 const [focus,setFocus]=useState<Focus|null>(null)
 const cores=snapshot?.cpu.cores??[]
 const cpu=highlight(snapshot?.cpu.usagePercent)
 const memory=snapshot?.memory
 const connections=snapshot?.network
 const disk=snapshot?.disk
 const security=snapshot?.security??[]
 const enabled=security.filter(item=>item.status==='enabled').length
 const unknown=security.filter(item=>item.status==='unknown').length
 const outstanding=feed?.events.filter(event=>event.status==='open')??[]
 const top=[...(snapshot?.processes??[])].sort((a,b)=>b.cpuPercent-a.cpuPercent).slice(0,2)
 const samples=(snapshot?.history??[]).slice(-24)
 const peak=Math.max(1,...samples.map(item=>(item.rxBytesPerSecond??0)+(item.txBytesPerSecond??0)))
 const bandwidthPeak=Math.max(1,...samples.flatMap(item=>[item.rxBytesPerSecond??0,item.txBytesPerSecond??0]))
 const telemetry=[
  {key:'cpu',domain:'cpu',name:'CPU 使用率',value:cpu,color:theme.cpu,ceiling:100,points:samples.map(point=>({at:point.at,value:point.cpuPercent}))},
  {key:'rx',domain:'network',name:'接收吞吐',value:rate(connections?.rxBytesPerSecond),color:'#568dce',ceiling:bandwidthPeak,points:samples.map(point=>({at:point.at,value:point.rxBytesPerSecond}))},
  {key:'tx',domain:'network',name:'发送吞吐',value:rate(connections?.txBytesPerSecond),color:'#6eaea0',ceiling:bandwidthPeak,points:samples.map(point=>({at:point.at,value:point.txBytesPerSecond}))}
 ] as const
 const online=!!snapshot&&Date.now()-snapshot.sampledAt<12000&&!paused
 const traceNow=Date.now(),traceWindow=86400000,traceStep=7200000
 const traceEvents=[...(feed?.events??[])].filter(event=>event.lastSeenAt>=traceNow-traceWindow&&event.lastSeenAt<=traceNow).sort((a,b)=>a.lastSeenAt-b.lastSeenAt)
 const traceSlots=Array.from({length:12},(_,index)=>traceEvents.filter(event=>Math.min(11,Math.floor((event.lastSeenAt-traceNow+traceWindow)/traceStep))===index))
 const tracePeak=Math.max(1,...traceSlots.map(items=>items.length))
 const nav=(domain:Destination)=>()=>onOpen(domain)
 const signals:Record<Focus,{name:string;value:string;description:string;chip:string}>={
  cpu:{name:'处理器',value:cpu,description:cores.length?cores.length+' 核 · 最近采样':'等待核心采样',chip:'CPU'},
  network:{name:'全球连接',value:String(connections?.publicConnections??'—'),description:'可见公网 TCP · 非流量推断',chip:'NET'},
  processes:{name:'进程活动',value:String(snapshot?.processes.length??'—'),description:'采样可见的进程数量',chip:'PROC'},
  memory:{name:'内存压力',value:memory?pressureLabel[memory.pressure]:'—',description:bytes(memory?.availableBytes)+' 可用',chip:'RAM'},
  storage:{name:'磁盘空间',value:highlight(disk?.usedPercent),description:'数据卷已用 · '+bytes(disk?.availableBytes)+' 可用',chip:'DISK'},
  security:{name:'系统保护',value:snapshot?enabled+'/'+security.length:'—',description:unknown?unknown+' 项状态未知':'读取到的保护配置',chip:'SEC'}
 }
 return <div className="gc-page" data-testid="guardian-overview-panel">
  <div className="gc-intro">
   <div><div className="gc-kicker"><span className="gc-kicker-mark"/>GUARDIAN / INTERACTIVE OBSERVATORY <span className="gc-kicker-no">01 — 06</span></div>
    <h2>你的数字世界，<span>正在呼吸。</span></h2>
    <p>一台设备，六个观测领域。点击机舱周围的实时模块，进入对应监控和调查。</p>
   </div>
   <div className="gc-live-meta"><span className={online?'gc-signal-dot active':'gc-signal-dot'}/><div><strong>{paused?'页面采样暂停':online?'观测在线':snapshot?'最近一次观测':'等待首次采样'}</strong><small>{snapshot?new Date(snapshot.sampledAt).toLocaleTimeString('zh-CN',{hour12:false})+' · 本机采样':'无可展示数据'}</small></div></div>
  </div>
  <section className="gc-stage" data-focus={focus??'none'} aria-label="可点击的设备观测机舱" data-testid="guardian-cockpit-stage">
   <div className="gc-orbit gc-orbit-outer"/><div className="gc-orbit gc-orbit-inner"/>
   <svg aria-hidden="true" className="gc-wiring" viewBox="0 0 1200 600" preserveAspectRatio="none">
    <defs><linearGradient id="gc-wiring-grad"><stop stopColor="#8aafcf" stopOpacity=".26"/><stop offset=".5" stopColor="#3f9d95" stopOpacity=".6"/><stop offset="1" stopColor="#8aafcf" stopOpacity=".26"/></linearGradient></defs>
    {wires.map(wire=><g key={wire.domain} data-signal={wire.domain} className={focus===wire.domain?'is-focused':''}><path d={wire.path}/><path className="gc-wire-active" d={wire.path}/><circle cx={wire.end[0]} cy={wire.end[1]} r="4.5"/></g>)}
   </svg>
   <button className="gc-machine" data-testid="guardian-device-core" style={{'--gc-focus-color':theme[focus??'cpu']} as CSSProperties} onClick={nav(focus??'cpu')} aria-label={focus?'打开'+signals[focus].name+'监控':'打开芯片机舱，查看 CPU 核心监控'}>
    <div className="gc-machine-halo"/><div className="gc-machine-ring"/>
    <div className="gc-mainboard"><div className="gc-mainboard-grid"/><div className="gc-mainboard-core"><span>{focus?signals[focus].chip:'AX'}</span><i/><b>{focus?'SIGNAL FOCUS':'LOCAL CORE'}</b></div><span className="gc-board-port p1"/><span className="gc-board-port p2"/><span className="gc-board-port p3"/><span className="gc-board-port p4"/></div>
    <div className="gc-machine-shadow"/>
   </button>
   <div className="gc-device-identity" aria-live="off"><small>{focus?'SIGNAL FOCUS / 点击中心进入':'CONNECTED DEVICE / CORE HOST'}</small><strong>{focus?signals[focus].name+' · '+signals[focus].value:snapshot?.host.hostname??'等待设备采样'}</strong><span>{focus?signals[focus].description:(snapshot?.host.arch??'—')+' · '+(snapshot?.host.cpuCount??'—')+' 核 · '+bytes(memory?.totalBytes)+' RAM · 点击芯片探索'}</span></div>
   <button data-domain="cpu" className={focus==='cpu'?'gc-node gc-node-cpu is-focused':'gc-node gc-node-cpu'} style={{'--gc-accent':theme.cpu} as CSSProperties} onPointerEnter={()=>setFocus('cpu')} onFocus={()=>setFocus('cpu')} onClick={nav('cpu')} aria-label={'查看处理器监控 '+cpu}>
    <span className="gc-node-top"><span className="gc-node-icon"><Icon name="chip"/></span><span className="gc-node-code">01 / COMPUTE</span><Icon name="arrow-up-right"/></span>
    <strong>处理器<span>CPU</span></strong><div className="gc-node-reading"><b>{cpu}</b><small>{cores.length?cores.length+' 核实时负载':'等待核心采样'}</small></div>
    <div className="gc-core-samples" aria-hidden="true">{cores.length?cores.slice(0,16).map((value,index)=><i key={index} style={{opacity:.16+Math.max(0,value)/100*.84}}/>):Array.from({length:12},(_,index)=><i key={index} style={{opacity:.16}}/>)}</div>
   </button>
   <button data-domain="network" className={focus==='network'?'gc-node gc-node-network is-focused':'gc-node gc-node-network'} style={{'--gc-accent':theme.network} as CSSProperties} onPointerEnter={()=>setFocus('network')} onFocus={()=>setFocus('network')} onClick={nav('network')} aria-label={'查看全球网络连接 '+(connections?.publicConnections??'未知')}>
    <span className="gc-node-top"><span className="gc-node-icon"><Icon name="globe"/></span><span className="gc-node-code">02 / WORLD</span><Icon name="arrow-up-right"/></span>
    <strong>全球连接<span>NETWORK</span></strong><div className="gc-node-reading"><b>{connections?.publicConnections??'—'}</b><small>可见公网 TCP</small></div>
    <div className="gc-flow-samples" aria-label="最近吞吐量相对变化">{samples.length>1?samples.map((sample,index)=><i key={sample.at} style={{height:Math.max(5,((sample.rxBytesPerSecond??0)+(sample.txBytesPerSecond??0))/peak*100)+'%'}}/>):<span>等待吞吐采样</span>}</div>
   </button>
   <button data-domain="processes" className={focus==='processes'?'gc-node gc-node-processes is-focused':'gc-node gc-node-processes'} style={{'--gc-accent':theme.processes} as CSSProperties} onPointerEnter={()=>setFocus('processes')} onFocus={()=>setFocus('processes')} onClick={nav('processes')} aria-label={'查看进程资源 '+(snapshot?.processes.length??'未知')}>
    <span className="gc-node-top"><span className="gc-node-icon"><Icon name="pulse"/></span><span className="gc-node-code">03 / ACTIVITY</span><Icon name="arrow-up-right"/></span>
    <strong>进程活动<span>PROCESSES</span></strong><div className="gc-node-reading"><b>{snapshot?.processes.length??'—'}</b><small>可见进程</small></div>
    <div className="gc-process-samples">{top.length?top.map((item,index)=><span key={item.pid}><i>{String(index+1).padStart(2,'0')}</i><em>{item.name}</em><b>{percent(item.cpuPercent)}</b></span>):<small>等待进程采样</small>}</div>
   </button>
   <button data-domain="memory" className={focus==='memory'?'gc-node gc-node-memory is-focused':'gc-node gc-node-memory'} style={{'--gc-accent':theme.memory} as CSSProperties} onPointerEnter={()=>setFocus('memory')} onFocus={()=>setFocus('memory')} onClick={nav('memory')} aria-label={'查看内存压力 '+(memory?pressureLabel[memory.pressure]:'未知')}>
    <span className="gc-node-top"><span className="gc-node-icon"><Icon name="server"/></span><span className="gc-node-code">04 / MEMORY</span><Icon name="arrow-up-right"/></span>
    <strong>内存压力<span>MEMORY</span></strong><div className="gc-node-reading"><b>{memory?pressureLabel[memory.pressure]:'—'}</b><small>{bytes(memory?.totalBytes)} 总量</small></div>
    <div className="gc-memory-samples"><div><i style={{width:memory?Math.min(100,memory.usedBytes/memory.totalBytes*100)+'%':'0%'}}/></div><span>可回收后可用 {bytes(memory?.availableBytes)}</span></div>
   </button>
   <button data-domain="storage" className={focus==='storage'?'gc-node gc-node-storage is-focused':'gc-node gc-node-storage'} style={{'--gc-accent':theme.storage} as CSSProperties} onPointerEnter={()=>setFocus('storage')} onFocus={()=>setFocus('storage')} onClick={nav('storage')} aria-label={'查看磁盘空间 '+highlight(disk?.usedPercent)}>
    <span className="gc-node-top"><span className="gc-node-icon"><Icon name="database"/></span><span className="gc-node-code">05 / STORAGE</span><Icon name="arrow-up-right"/></span>
    <strong>磁盘空间<span>STORAGE</span></strong><div className="gc-node-reading"><b>{highlight(disk?.usedPercent)}</b><small>数据卷已用</small></div>
    <div className="gc-storage-samples"><span className="gc-storage-ring" style={{background:`conic-gradient(var(--gc-accent) ${disk?.usedPercent??0}%, #e8edf4 0)`}}/><span>{bytes(disk?.availableBytes)} 可用</span></div>
   </button>
   <button data-domain="security" className={focus==='security'?'gc-node gc-node-security is-focused':'gc-node gc-node-security'} style={{'--gc-accent':theme.security} as CSSProperties} onPointerEnter={()=>setFocus('security')} onFocus={()=>setFocus('security')} onClick={nav('security')} aria-label={'查看系统保护检查 '+enabled+' 项启用'}>
    <span className="gc-node-top"><span className="gc-node-icon"><Icon name="shield"/></span><span className="gc-node-code">06 / PROTECTION</span><Icon name="arrow-up-right"/></span>
    <strong>系统保护<span>SECURITY</span></strong><div className="gc-node-reading"><b>{snapshot?enabled+'/3':'—'}</b><small>{unknown?'含 '+unknown+' 项未知':'保护配置已读取'}</small></div>
    <div className="gc-security-samples">{security.length?security.map(item=><span key={item.id} className={item.status}><i/>{item.label}</span>):<small>等待系统配置采样</small>}</div>
   </button>
   <div className="gc-operations">
    <button data-domain="ai" onClick={nav('ai')}><Icon name="hubot"/><span><strong>AI 运营团队</strong><small>查看工作与授权</small></span><Icon name="arrow-right"/></button>
    <button data-domain="events" onClick={nav('events')}><Icon name="shield"/><span><strong>事件调查室</strong><small>{feed?outstanding.length+' 项待核对':'等待记录'}</small></span><Icon name="arrow-right"/></button>
   </div>
   <div className="gc-stage-note"><i/> 本机真实观测 · 视觉结构为交互示意，不代表设备实际内部布线或流量路径</div>
  </section>
  <div className="gc-pulse-strip" data-testid="guardian-telemetry-strip">
   <header><span><i/>{paused?'页面采样暂停':snapshot?'LOCAL TELEMETRY':'AWAITING TELEMETRY'}</span><small>{samples.length?'最近 '+samples.length+' 次真实采样':'尚无历史采样'}</small></header>
   <div className="gc-pulse-grid">
    {telemetry.map(item=>{const count=item.points.filter(point=>point.value!==null&&Number.isFinite(point.value)).length;return <button key={item.key} type="button" data-metric={item.key} className="gc-pulse-metric" onClick={nav(item.domain)} aria-label={item.name+' '+item.value+'，'+count+' 次有效采样；打开'+(item.domain==='cpu'?'处理器':'网络')+'监控'}>
     <span className="gc-pulse-metric-label"><i style={{background:item.color}}/>{item.name}<Icon name="arrow-up-right"/></span>
     <strong>{item.value}</strong>
     <MiniTrace points={item.points} ceiling={item.ceiling} color={item.color}/>
     <small>{count>=2?'按实际时间排序 · 点击查看详情':count===1?'只有 1 次真实采样':'等待有效采样'}</small>
    </button>})}
    <button type="button" className="gc-pulse-metric gc-pulse-coverage" onClick={nav('events')} aria-label={'打开事件调查室；'+(feed?.coverage.sampleCount??'尚未取得')+' 次当前进程快照'}>
     <span className="gc-pulse-metric-label"><i/>事件采样<Icon name="arrow-up-right"/></span>
     <strong>{feed?feed.coverage.sampleCount:'—'}<em>{feed?' 次':' '}</em></strong>
     <span className="gc-pulse-coverage-status">{feed?(feed.coverage.mode==='background'?'已授权后台观测':'按页面请求观测'):'等待 Core 记录'}</span>
     <small>仅覆盖已取得的快照</small>
    </button>
   </div>
   <footer><button data-domain="applications" onClick={nav('applications')}>应用行为 <Icon name="arrow-right"/></button><button data-domain="report" onClick={nav('report')}>七日回看 <Icon name="arrow-right"/></button></footer>
  </div>
  <section className="gc-watchlist"><header><div><span className="gc-kicker">SIGNALS / NEED YOUR ATTENTION</span><h3>此刻值得关注</h3></div><button data-domain="events" onClick={nav('events')}>进入调查室 <Icon name="arrow-right"/></button></header>
   <div className="gc-event-rhythm" data-testid="guardian-event-rhythm">
    <div className="gc-rhythm-heading"><span>24H / EVENT PULSE</span><strong>事件脉冲</strong><small>每格 2 小时 · 点击有记录的时段直达调查</small><div><i/>需要关注 <i/>一般记录</div></div>
    <div className="gc-rhythm-chart"><div className="gc-rhythm-bars" role="group" aria-label="过去 24 小时每 2 小时的事件记录">
     {traceSlots.map((items,index)=>{const attention=items.filter(event=>event.importance==='attention').length;return <button type="button" key={index} disabled={!items.length} data-testid="guardian-event-rhythm-bin" data-count={items.length} aria-label={`${24-index*2} 至 ${22-index*2} 小时前，${items.length} 条事件记录，其中 ${attention} 条需要关注${items.length?'；查看最新事件':''}`} onClick={()=>onEvent(items[items.length-1].id)}><span className="gc-rhythm-track"><i className="gc-rhythm-attention" style={{height:attention/tracePeak*100+'%'}}/><i className="gc-rhythm-notice" style={{height:(items.length-attention)/tracePeak*100+'%'}}/></span><span className="gc-rhythm-count">{items.length||'·'}</span></button>})}
    </div><div className="gc-rhythm-axis"><span>24 小时前</span><small>{feed?traceEvents.length+' 条记录 · 按最后观测时间统计；无记录不代表安全':'等待事件记录 · 未观测时段状态未知'}</small><span>现在</span></div></div>
   </div>
   <div className="gc-watchlist-rows">{outstanding.length?outstanding.slice(0,3).map(event=><button key={event.id} onClick={()=>onEvent(event.id)}><span className="gc-watchlist-light"/><div><strong>{event.title}</strong><small>{new Date(event.lastSeenAt).toLocaleString('zh-CN')} · {event.kind==='manual'?'人工登记':'系统观测'}</small></div><span>查看事件 <Icon name="arrow-up-right"/></span></button>):<div className="gc-watchlist-idle"><Icon name="check"/><span><strong>{feed?'当前没有待核对记录':'正在读取事件记录'}</strong><small>已观测范围有限，未采样时段不能判定正常。</small></span><button onClick={nav('applications')}>探索应用 <Icon name="arrow-right"/></button></div>}</div>
  </section>
 </div>
}
