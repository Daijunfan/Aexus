import {useEffect,useMemo,useState} from 'react'
import type {GuardianSnapshot} from '../../../../shared/guardian'
import type {GuardianEvent,GuardianEventSubject} from '../../../../shared/guardian-events'
import {Icon} from '../Icon'
import {GuardianTimeSeries} from './GuardianCharts'
import {bytes,palette,percent,time} from './GuardianFormat'

type Item={name:string;instances:GuardianSnapshot['processes'];cpu:number;memory:number;connections:number;publicPeers:number;addresses:string[]}
type Props={snapshot:GuardianSnapshot|null;events:GuardianEvent[];onProcess:(pid:number)=>void;onNetwork:(pid:number)=>void;onInvestigate:(title:string,summary:string,subject:GuardianEventSubject)=>Promise<void>;onEvent:(id:string)=>void}
export function GuardianApplications({snapshot,events,onProcess,onNetwork,onInvestigate,onEvent}:Props){
 const [search,setSearch]=useState(''),[sort,setSort]=useState<'network'|'cpu'|'memory'>('network'),[selected,setSelected]=useState(''),[starting,setStarting]=useState(false),[error,setError]=useState('')
 const [history,setHistory]=useState<Record<string,{at:number;values:{cpu:number;memory:number}}[]>>({})
 const apps=useMemo(()=>{
  const grouped=new Map<string,Item>()
  for(const process of snapshot?.processes??[]){
   const app=grouped.get(process.name)??{name:process.name,instances:[],cpu:0,memory:0,connections:0,publicPeers:0,addresses:[]}
   app.instances.push(process);app.cpu+=process.cpuPercent;app.memory+=process.memoryBytes;grouped.set(process.name,app)
  }
  const peers=new Map<string,Set<string>>()
  for(const connection of snapshot?.network.connections??[]){
   const app=grouped.get(connection.process);if(!app)continue
   app.connections++
   if(connection.scope==='public'&&connection.remoteAddress){
    const set=peers.get(connection.process)??new Set<string>()
    set.add(connection.remoteAddress);peers.set(connection.process,set)
   }
  }
  for(const [name,addresses] of peers){const app=grouped.get(name);if(app){app.publicPeers=addresses.size;app.addresses=[...addresses].slice(0,8)}}
  return [...grouped.values()]
 },[snapshot])
 useEffect(()=>{
  if(!snapshot||!apps.length)return
  setHistory(previous=>{
   let changed=false
   const next={...previous}
   for(const app of apps){
    const series=next[app.name]??[]
    if(series.at(-1)?.at===snapshot.sampledAt)continue
    next[app.name]=[...series,{at:snapshot.sampledAt,values:{cpu:app.cpu,memory:app.memory}}].slice(-100)
    changed=true
   }
   // Limit retained app histories while staying in this page; no false backfilled samples.
   const oldest=snapshot.sampledAt-15*60000
   for(const name in next)if((next[name].at(-1)?.at??Infinity)<oldest)delete next[name]
   return changed?next:previous
  })
 },[snapshot?.sampledAt])
 const rows=apps.filter(app=>app.name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==='network'?b.connections-a.connections:sort==='cpu'?b.cpu-a.cpu:b.memory-a.memory)
 const active=apps.find(app=>app.name===selected)??rows[0],pid=active?.instances[0]?.pid
 const related=events.filter(event=>event.subject.process===active?.name)
 const investigate=async()=>{
  if(!active||pid==null)return
  setStarting(true);setError('')
  try{await onInvestigate('核查 '+active.name+' 的近期活动','采样时间 '+new Date(snapshot!.sampledAt).toLocaleString('zh-CN')+'；同名进程 '+active.instances.length+' 个，CPU 单核口径合计 '+percent(active.cpu)+'，RSS 合计 '+bytes(active.memory)+'，TCP 端点 '+active.connections+' 个（其中公网对端 '+active.publicPeers+' 个）。请结合实际任务解释这些数据，无法确认的行为标为未知。',{process:active.name,pid})}
  catch(cause){setError((cause as Error).message)}finally{setStarting(false)}
 }
 return <div className="g-domain g-applications" data-testid="guardian-applications-panel">
  <div className="g-section-intro"><div><span className="g-eyebrow">APPLICATION OBSERVATIONS</span><h2>每个软件留下的资源与连接线索。</h2><p>目前按系统报告的进程名称分组。进程名称不能验证安装包身份、签名、权限或实际文件访问。</p></div><span className="g-tag">{apps.length} 组进程</span></div>
  <div className="go-app-layout">
   <section className="g-card go-app-browser"><header className="g-card-head"><div><h3>进程活动档案</h3><p>来自最新一次本机采样</p></div></header>
    <label className="g-search"><Icon name="search"/><input aria-label="搜索应用或进程" placeholder="搜索进程名称" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <div className="go-sort" role="group" aria-label="按指标排序"><button aria-pressed={sort==='network'} onClick={()=>setSort('network')}>连接</button><button aria-pressed={sort==='cpu'} onClick={()=>setSort('cpu')}>CPU</button><button aria-pressed={sort==='memory'} onClick={()=>setSort('memory')}>内存</button></div>
    <div className="go-app-list">{rows.slice(0,100).map(app=><button key={app.name} className={active?.name===app.name?'chosen':''} aria-pressed={active?.name===app.name} onClick={()=>setSelected(app.name)}><span className="go-app-icon">{app.name.slice(0,1).toUpperCase()}</span><span><strong>{app.name}</strong><small>{app.instances.length} 个进程 · {app.connections} 个 TCP 端点</small></span><b>{sort==='cpu'?percent(app.cpu):sort==='memory'?bytes(app.memory):String(app.publicPeers)+' 公网'}</b></button>)}</div>
    {!rows.length&&<p className="g-caption">{snapshot?'没有符合搜索条件的进程':'等待首次进程采样'}</p>}
    <p className="g-caption">最多展示 100 组；同名进程可能来自不同开发者或多个安装位置。</p>
   </section>
   <div className="go-app-details">{active?<><section className="g-card go-app-card"><header className="go-subject"><span className="go-app-icon large">{active.name.slice(0,1).toUpperCase()}</span><div><span className="g-eyebrow">OBSERVED PROCESS GROUP</span><h3>{active.name}</h3><p>{active.instances.length} 个同名进程 · 观测于 {snapshot?time(snapshot.sampledAt):'—'}</p></div></header><div className="go-stats"><div><span>CPU · 单核百分比之和</span><strong>{percent(active.cpu)}</strong></div><div><span>RSS · 可能重复计入共享内存</span><strong>{bytes(active.memory)}</strong></div><div><span>TCP 端点</span><strong>{active.connections}</strong></div><div><span>已观测公网对端</span><strong>{active.publicPeers}</strong></div></div><div className="go-actions"><button onClick={()=>pid&&onProcess(pid)}>查看首个 PID {pid} <Icon name="arrow-right"/></button><button onClick={()=>pid&&onNetwork(pid)}>查看该 PID 的连接 <Icon name="globe"/></button><button className="g-primary" onClick={()=>void investigate()} disabled={starting}>{starting?'提交中':'发起调查'} <Icon name="arrow-right"/></button></div>{error&&<p role="alert" className="g-error">{error}</p>}</section>
    <section className="g-card go-history"><header className="g-card-head"><div><h3>打开页面后的资源趋势</h3><p>同名进程聚合，只有此页采样过的时间点</p></div></header><GuardianTimeSeries points={history[active.name]??[]} series={[{key:'cpu',label:'CPU',color:palette[0]}]} valueFormat={percent} height={130} ariaLabel={'进程 '+active.name+' CPU 趋势'}/><GuardianTimeSeries points={history[active.name]??[]} series={[{key:'memory',label:'RSS',color:palette[1]}]} valueFormat={bytes} height={130} ariaLabel={'进程 '+active.name+' 内存趋势'}/></section>
    <section className="g-card go-app-connections"><header className="g-card-head"><div><h3>当前公网对端</h3><p>IP 只表示 TCP 表中的端点，无法证明传输内容。</p></div></header>{active.addresses.length?<div className="go-ip-list">{active.addresses.map(ip=><code key={ip}>{ip}</code>)}</div>:<p className="g-caption">当前没有可关联的公网 TCP 对端；不代表没有其他网络活动。</p>}</section>
    <section className="g-card go-app-connections"><header className="g-card-head"><div><h3>相关调查</h3><p>本机事件记录与此进程名称匹配</p></div></header>{related.slice(0,5).map(event=><button className="go-event-link" key={event.id} onClick={()=>onEvent(event.id)}>{event.title}<span>{event.status==='open'?'待核对':event.status==='reviewed'?'已核对':'已忽略'} →</span></button>)}{!related.length&&<p className="g-caption">暂无该进程的调查记录。</p>}</section></>:<section className="g-card g-empty">暂时没有可以识别的进程数据。</section>}</div>
  </div>
  <div className="g-section-note"><Icon name="info"/>权限授予与权限实际使用、安装包更新比较、签名校验和文件上传归因仍未接入。此页不会以连接或高负载给软件打危险分数。</div>
 </div>
}
