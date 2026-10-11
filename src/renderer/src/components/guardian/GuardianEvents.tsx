import {useEffect,useMemo,useState} from 'react'
import type {GuardianEvent,GuardianEventFeed,GuardianEventStatus} from '../../../../shared/guardian-events'
import {api} from '../../api'
import {Icon} from '../Icon'
import {time} from './GuardianFormat'

type Employee={id:string;title:string;group:string;engine?:string;deleting?:boolean;initialization?:{status:string}}
type Props={feed:GuardianEventFeed|null;error:string;focusId:string|null;onFeed:(next:GuardianEventFeed)=>void;onProcess:(pid:number)=>void;onNetwork:(pid:number)=>void;onCreate:(title:string,summary:string)=>Promise<void>;onPlan?:()=>void}
const kindLabels:Record<GuardianEvent['kind'],string>={'network-change':'网络变化','cpu-rise':'资源变化','memory-pressure':'设备健康','security-change':'安全配置',manual:'人工发起'}
const stateLabels:Record<GuardianEventStatus,string>={open:'待核对',reviewed:'已核对',dismissed:'已忽略'}
function absoluteTime(at:number){return new Date(at).toLocaleString('zh-CN',{hour12:false})}
export function GuardianEvents({feed,error,focusId,onFeed,onProcess,onNetwork,onCreate,onPlan}:Props){
 const [status,setStatus]=useState<GuardianEventStatus|'all'>('open'),[query,setQuery]=useState(''),[selectedId,setSelectedId]=useState<string|null>(null)
 const [note,setNote]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[showDelegate,setShowDelegate]=useState(false)
 const [employees,setEmployees]=useState<Employee[]>([]),[employeeId,setEmployeeId]=useState(''),[teamError,setTeamError]=useState(''),[loadingTeam,setLoadingTeam]=useState(false)
 const [creating,setCreating]=useState(false),[title,setTitle]=useState(''),[summary,setSummary]=useState('')
 useEffect(()=>{if(focusId){setStatus('all');setSelectedId(focusId)}},[focusId])
 const all=feed?.events??[]
 const filtered=useMemo(()=>all.filter(event=>(status==='all'||event.status===status)&&(event.title+' '+event.summary+' '+event.subject.process).toLowerCase().includes(query.toLowerCase())),[all,status,query])
 const current=filtered.find(event=>event.id===selectedId)??filtered[0]
 const action=async(next:GuardianEventStatus)=>{
  if(!current)return
  setBusy(true);setMessage('')
  try{onFeed(await api.call<GuardianEventFeed>('guardian.event-change',{id:current.id,status:next,note:note.trim()||undefined}));setNote('');setMessage('人工核对状态已保存；尚未执行系统修复。')}
  catch(cause){setMessage((cause as Error).message)}finally{setBusy(false)}
 }
 const sample=async()=>{
  if(!current)return
  setBusy(true);setMessage('')
  try{onFeed(await api.call<GuardianEventFeed>('guardian.event-sample',{id:current.id}));setMessage('真实快照已保留；尚未形成自动整改结论。')}
  catch(cause){setMessage((cause as Error).message)}finally{setBusy(false)}
 }
 const addNote=async()=>{
  if(!current||!note.trim())return
  setBusy(true);setMessage('')
  try{onFeed(await api.call<GuardianEventFeed>('guardian.event-note',{id:current.id,note:note.trim()}));setNote('');setMessage('记录已保存。')}
  catch(cause){setMessage((cause as Error).message)}finally{setBusy(false)}
 }
 const chooseTeam=async()=>{
  setShowDelegate(true);setLoadingTeam(true);setTeamError('')
  try{
   const response=await api.call<{sessions:Employee[]}>('session.list',{summary:true})
   setEmployees(response.sessions.filter(s=>!s.deleting&&(!s.initialization||s.initialization.status==='ready')))
  }catch(cause){setTeamError((cause as Error).message)}finally{setLoadingTeam(false)}
 }
 const delegate=async()=>{
  if(!current||!employeeId)return
  setBusy(true);setTeamError('')
  const employee=employees.find(e=>e.id===employeeId)
  if(!employee){setBusy(false);return}
  const content='[Guardian 本机事件调查]\n'+current.title+'\n'+current.summary+'\n观测时间：'+absoluteTime(current.firstSeenAt)+' 至 '+absoluteTime(current.lastSeenAt)+'\n关联对象：'+[current.subject.process,current.subject.pid?'PID '+current.subject.pid:'',current.subject.remoteAddress].filter(Boolean).join('，')+'\n请使用已授权的只读数据调查，区分事实、推测和无法取得的证据。未获用户明确批准，不要停止程序、修改防火墙、删除文件或联系第三方服务。先输出调查依据和安全的下一步选项。'
  try{
   const sent=await api.call<{sent:boolean}>('session.send',{id:employee.id,text:content})
   if(!sent.sent)throw Error('员工未接收工作请求，请查看 Messages 的发送状态')
   setShowDelegate(false);setMessage('调查请求已发给 '+employee.title+'；尚未收到调查结论。')
   try{onFeed(await api.call<GuardianEventFeed>('guardian.event-note',{id:current.id,note:'人工委派给 '+employee.title+'（'+employee.id+'），等待 Messages 调查结果。'}))}
   catch{setMessage('请求已发送，但写入 Guardian 跟进记录失败；请在 Messages 中确认。')}
  }catch(cause){setTeamError((cause as Error).message)}finally{setBusy(false)}
 }
 const create=async()=>{
  if(!title.trim()||!summary.trim())return
  setBusy(true);setMessage('')
  try{await onCreate(title.trim(),summary.trim());setTitle('');setSummary('');setCreating(false);setStatus('all');setSelectedId(null);setMessage('已建立人工调查，不会自动执行处置。')}
  catch(cause){setMessage((cause as Error).message)}finally{setBusy(false)}
 }
 return <div className="g-domain g-events" data-testid="guardian-events-panel">
  <div className="g-section-intro"><div><span className="g-eyebrow">INCIDENT WORKROOM</span><h2>每一个变化，都能留下调查结论。</h2><p>本机保留最多 {feed?.retentionDays??7} 天、250 项观测记录。只有 Guardian 被请求采样时才记录变化；记录之外的时段无法回放。</p></div><button onClick={()=>setCreating(!creating)}><Icon name="plus"/>{creating?'取消新建':'发起人工调查'}</button></div>
  {creating&&<section className="g-card go-create"><label>调查主题<input maxLength={140} value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：检查昨晚持续运行的任务"/></label><label>现有线索<textarea maxLength={900} value={summary} onChange={e=>setSummary(e.target.value)} placeholder="填写实际观察到的情况，未知之处保持未知。"/></label><button className="g-primary" onClick={()=>void create()} disabled={busy||!title.trim()||!summary.trim()}>保存调查</button></section>}
  <div className="go-coverage"><Icon name="info"/><span>{feed?.coverage.lastSampledAt?'这次运行最近采样于 '+absoluteTime(feed.coverage.lastSampledAt)+' · 已取得 '+feed.coverage.sampleCount+' 次快照':'正在等待本机采样'}。离线、休眠和软件关闭期间无完整历史；当前不提供后台实时检测。</span></div>
  <div className="go-investigation">
   <section className="g-card go-inbox"><header><strong>事件收件箱</strong><span>{all.filter(item=>item.status==='open').length} 项待核对</span></header><div className="go-filters" role="group" aria-label="按处理状态筛选">{([{id:'open',label:'待核对'},{id:'reviewed',label:'已核对'},{id:'dismissed',label:'已忽略'},{id:'all',label:'全部'}] as const).map(item=><button key={item.id} aria-pressed={status===item.id} onClick={()=>{setStatus(item.id);setSelectedId(null)}}>{item.label}</button>)}</div><input className="go-inbox-search" aria-label="搜索 Guardian 事件" placeholder="搜索事件与进程" value={query} onChange={e=>setQuery(e.target.value)}/><div className="go-event-list">{filtered.map(event=><button key={event.id} className={current?.id===event.id?'active':''} aria-pressed={current?.id===event.id} onClick={()=>{setSelectedId(event.id);setNote('');setMessage('');setShowDelegate(false)}}><span className={'go-event-indicator '+event.importance}/><span><small>{kindLabels[event.kind]} · {absoluteTime(event.lastSeenAt)}</small><strong>{event.title}</strong><em>{event.summary}</em></span></button>)}{!filtered.length&&<div className="go-no-events">{error?'事件记录暂不可用':status==='open'?'当前没有待核对的变化记录':'没有匹配的事件'}<p>这不代表系统持续无风险。当前只覆盖成功采样的内容。</p></div>}</div></section>
   <section className="g-card go-investigation-detail">{current?<><header className="go-case-header"><span className="g-eyebrow">{kindLabels[current.kind]} / {stateLabels[current.status]}</span><h3>{current.title}</h3><p>首次记录 {absoluteTime(current.firstSeenAt)} · 最近关联 {absoluteTime(current.lastSeenAt)}</p><span className="g-tag">{current.count} 次关联观察</span></header><div className="go-case-body"><h4>已掌握的线索</h4><p className="go-case-fact">{current.summary}</p><dl><div><dt>进程</dt><dd>{current.subject.process??'未确认'}</dd></div><div><dt>进程 PID</dt><dd>{current.subject.pid??'未知'}</dd></div><div><dt>对端 IP</dt><dd>{current.subject.remoteAddress??'未提供'}</dd></div><div><dt>风险结论</dt><dd>仅记录观测变化，尚无恶意性判定</dd></div></dl><h4>调查时间线</h4><div className="go-timeline">{current.entries.map((entry,i)=><div key={entry.at+'-'+i} className={'go-timeline-entry '+entry.by}><span>{entry.by==='user'?'人工记录':'系统观测'}</span><time>{absoluteTime(entry.at)}</time><p>{entry.text}</p></div>)}</div></div></>:<div className="go-empty-case"><Icon name="shield"/><h3>没有选中的调查</h3><p>发生真实变化时可以在这里查看事实、做出判断或交给已有团队。</p></div>}</section>
   <section className="g-card go-decision"><header><span className="g-eyebrow">NEXT ACTION</span><h3>建议与控制</h3></header>{current?<><p className="go-action-context">先检查当前实际工作是否与观测变化相符。无法确认时可交给现有员工分析；所有改变系统的动作需另行批准。</p><div className="go-action-buttons">{current.subject.pid!=null&&<><button onClick={()=>onProcess(current.subject.pid!)}>查看关联 PID <Icon name="arrow-right"/></button><button onClick={()=>onNetwork(current.subject.pid!)}>关联 TCP 端点 <Icon name="globe"/></button></>}<button onClick={()=>void chooseTeam()} disabled={busy}>交给现有团队 <Icon name="arrow-right"/></button></div>{showDelegate&&<div className="go-delegation"><label>选择负责员工<select aria-label="选择调查员工" value={employeeId} onChange={e=>setEmployeeId(e.target.value)}><option value="">请选择</option>{employees.map(employee=><option key={employee.id} value={employee.id}>{employee.title} · {employee.group}</option>)}</select></label><p>确认发送后将向该员工发送事件内容（可能包含 IP），其模型可能产生费用或使用外部服务。当前不自动派发任务。</p><button className="g-primary" disabled={!employeeId||busy||loadingTeam} onClick={()=>void delegate()}>{loadingTeam?'正在读取团队':'确认发送调查请求'}</button>{teamError&&<p role="alert" className="g-error">{teamError}</p>}{!loadingTeam&&!employees.length&&!teamError&&<p>暂无可分配的就绪员工，请先在 Company 配置。</p>}</div>}<div className="go-verification"><h4>处理前后复核</h4><p>在采取行动前、后分别记录一次实际快照。只对照 CPU、内存压力与已关联 PID/对端；不同负载不能直接判断改善。</p><button disabled={busy} onClick={()=>void sample()}><Icon name="pulse"/> 记录当前状态</button>{(current.measurements??[]).slice(-2).map((measurement,index)=><div className="go-verification-row" key={measurement.at}><strong>{(current.measurements?.length??0)>1&&index===0?'先前采样':'采样'} · {absoluteTime(measurement.at)}</strong><span>整机 CPU {measurement.hostCpuPercent==null?'未知':measurement.hostCpuPercent.toFixed(1)+'%'} · 内存压力 {measurement.memoryPressure}</span><span>{measurement.processObserved===null?'关联进程未确认':measurement.processObserved?'关联 PID CPU '+(measurement.processCpuPercent?.toFixed(1)??'未知')+'% · RSS '+(measurement.processMemoryBytes==null?'未知':(measurement.processMemoryBytes/1048576).toFixed(1)+' MB'):'本次未见关联 PID'}</span>{measurement.tcpPeerObserved!==null&&<span>指定 TCP 对端：{measurement.tcpPeerObserved?'当前采样可见':'当前采样未见'}</span>}{measurement.securityStatus!==null&&<span>保护状态：{measurement.securityStatus}</span>}{measurement.issues.length>0&&<small>无法取得：{measurement.issues.join('、')}</small>}</div>)}{(current.measurements?.length??0)>1&&<p className="go-verify-caution">已有两次以上采样。变化可能来自任务停止、应用退出、使用负载不同或其他因素，请在备注中记录可比条件和处理措施。</p>}</div><hr/><h4>人工核对</h4><textarea aria-label="调查备注" maxLength={500} placeholder="记录判断依据、后续验证或说明" value={note} onChange={e=>setNote(e.target.value)}/><div className="go-action-buttons"><button disabled={busy||!note.trim()} onClick={()=>void addNote()}>添加记录</button>{current.status!=='reviewed'&&<button className="g-primary" disabled={busy} onClick={()=>void action('reviewed')}>标记已核对</button>}{current.status!=='dismissed'&&<button disabled={busy} onClick={()=>void action('dismissed')}>忽略变化</button>}{current.status!=='open'&&<button disabled={busy} onClick={()=>void action('open')}>重新调查</button>}</div><p className="g-caption">“已核对”仅代表人工确认；未实施修复，也未自动证明问题消失。</p>{onPlan&&<button className="go-plan-link" onClick={onPlan}>前往 Plan 安排后续维护 <Icon name="arrow-right"/></button>}{message&&<p role="status" className="go-action-message">{message}</p>}</>:<p>选择左侧事件后查看后续操作。</p>}</section>
  </div>
  {error&&<p role="alert" className="g-error">{error}</p>}
 </div>
}
