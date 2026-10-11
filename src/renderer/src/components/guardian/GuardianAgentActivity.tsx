import {useCallback,useEffect,useState} from 'react'
import {api} from '../../api'
import {Icon} from '../Icon'
import {time} from './GuardianFormat'

type Employee={id:string;title:string;group:string;engine?:string;deleting?:boolean;initialization?:{status:string}}
type LiveSession={
 id:string;cardId?:string;title?:string;group?:string;engine?:string;model?:string;cwd?:string
 busy?:boolean;currentTask?:{messageId?:string;startedAt?:number}
 approvals?:unknown[];activityPreview?:{kind:string;text:string;tool?:string;running?:boolean}
}
export function GuardianAgentActivity({onInvestigate,onOpenConversation}:{onInvestigate:(title:string,summary:string)=>Promise<void>;onOpenConversation:(employeeId:string)=>void}){
 const [people,setPeople]=useState<Employee[]>([]),[live,setLive]=useState<LiveSession[]>([]),[selected,setSelected]=useState<string|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[started,setStarted]=useState(false)
 const refresh=useCallback(async()=>{setLoading(true);setError('');try{
  const [stored,active]=await Promise.all([api.call<{sessions:Employee[]}>('session.list',{summary:true}),api.call<LiveSession[]>('session.list',{live:true,summary:true})])
  setPeople(stored.sessions.filter(item=>!item.deleting));setLive(active);setStarted(true)
 }catch(cause){setError((cause as Error).message)}finally{setLoading(false)}},[])
 useEffect(()=>{void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh()},6000);return()=>clearInterval(timer)},[refresh])
 const identity=people.find(p=>p.id===selected)??people[0]
 const sessions=live.filter(s=>s.cardId===identity?.id)
 const active=sessions.find(s=>s.busy)??sessions[0]
 const investigate=async()=>{
  if(!identity)return
  const text='员工 '+identity.title+'（'+identity.id+'）；当前会话 '+(active?.id??'未知')+'，任务状态 '+(active?.busy?'执行中':'没有正在运行的任务')+'；工作目录 '+(active?.cwd??'未提供')+'。当前界面仅显示 Core 会话元数据，尚无系统文件变更与外部费用审计。请核对这次任务的授权范围与执行结果。'
  try{await onInvestigate('复核 AI 员工 '+identity.title+' 的工作',text)}catch(cause){setError((cause as Error).message)}
 }
 return <div className="g-domain g-agent-audit" data-testid="guardian-ai-panel">
  <div className="g-section-intro"><div><span className="g-eyebrow">AI EXECUTION VISIBILITY</span><h2>每位 AI 员工，在做什么。</h2><p>基于现有 Aexus 会话元数据，查看正在运行的任务和最后可见的活动；不虚构文件修改、联网归属与费用。</p></div><button onClick={()=>void refresh()} disabled={loading}><Icon name="refresh"/>{loading?'读取中':'刷新状态'}</button></div>
  {error&&<p className="g-error" role="alert">{error}</p>}
  <div className="go-ai-layout"><section className="g-card go-ai-people"><header className="g-card-head"><div><h3>现有员工</h3><p>{started?people.length+' 个已配置身份':'读取中'}</p></div></header>{people.map(p=>{const running=live.some(s=>s.cardId===p.id&&s.busy);return <button key={p.id} className={identity?.id===p.id?'chosen':''} onClick={()=>setSelected(p.id)} aria-pressed={identity?.id===p.id}><span className="go-app-icon">{p.title.slice(0,1).toUpperCase()}</span><span><strong>{p.title}</strong><small>{p.group} · {p.engine??'引擎未知'}</small></span><em className={running?'busy':''}>{running?'执行中':live.some(s=>s.cardId===p.id)?'会话空闲':'无活跃会话'}</em></button>})}{started&&!people.length&&<p className="g-caption">当前没有员工。可从 Company 配置已有协作团队。</p>}</section>
   <div className="go-ai-detail">{identity?<><section className="g-card"><div className="go-ai-heading"><span className="g-eyebrow">AUTHORIZED AGENT SESSION</span><h3>{identity.title}</h3><p>角色：{identity.group} · 引擎：{identity.engine??'未知'}</p></div><div className="go-stats"><div><span>当前执行</span><strong>{active?.busy?'运行中':'未观测到执行'}</strong></div><div><span>待批准动作</span><strong>{active?.approvals?.length??0}</strong></div><div><span>关联会话</span><strong>{sessions.length}</strong></div></div><dl className="go-ai-facts"><div><dt>工作目录</dt><dd>{active?.cwd??'当前无活动会话，无法读取'}</dd></div><div><dt>当前任务开始</dt><dd>{active?.currentTask?.startedAt?time(active.currentTask.startedAt):'无可见正在执行的任务'}</dd></div><div><dt>实际模型</dt><dd>{active?.model??'未取得'}</dd></div></dl><div className="go-actions"><button className="g-primary" onClick={()=>onOpenConversation(identity.id)}>打开 Messages 查看详情 <Icon name="arrow-right"/></button><button onClick={()=>void investigate()}>发起 AI 工作复核</button></div></section><section className="g-card go-ai-preview"><header className="g-card-head"><div><h3>最近一次可见活动</h3><p>来自 Core 会话数据，不代表完整操作审计</p></div></header>{active?.activityPreview?<div className="go-ai-activity"><span>{active.activityPreview.kind==='tool'?'工具 / 任务':active.activityPreview.kind==='thinking'?'推理摘要':'会话进展'}{active.activityPreview.tool?' · '+active.activityPreview.tool:''}</span><p>{active.activityPreview.text}</p><small>{active.activityPreview.running?'正在执行':'可见活动'}</small></div>:<p className="g-caption">{active?.busy?'活动信息暂不可取得。':'当前没有正在执行的任务或未读活动记录。'}</p>}</section></>:<section className="g-card g-empty">请选择员工，查看现有执行会话与授权范围。</section>}</div></div>
  <div className="g-section-note"><Icon name="info"/>控制权限、审批与中止操作由现有 Messages／Company 入口执行。本页未接入 OS 文件变更、真实 API 成本、逐条工具审计或系统进程的 Agent 归属。</div>
 </div>
}
