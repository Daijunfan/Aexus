import {useEffect,useRef,useState} from 'react'
import type {WorkflowView} from '../../../../../Contract/workflow'
import {api} from '../api'
import '../styles/research-task-manager.css'

const labels:Record<string,string>={running:'执行中',waiting:'等待确认',paused:'暂停中',completed:'已完成',failed:'需要处理',cancelled:'已停止'}
type Row=Pick<WorkflowView,'id'|'status'|'summary'|'revision'|'updatedAt'|'controlPending'|'error'>
export function ResearchTaskManager(){
 const [jobs,setJobs]=useState<Row[]>([]),[offset,setOffset]=useState(0),[hasMore,setHasMore]=useState(false),[total,setTotal]=useState(0),[pending,setPending]=useState<string|null>(null),[confirm,setConfirm]=useState<Row|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true)
 const alive=useRef(true),lock=useRef(false)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{let mounted=true
  const refresh=async()=>{try{const result=await api.call<{jobs:Row[];hasMore:boolean;total:number}>('workflow.list',{engineId:'deep-research',offset,limit:30});if(mounted){setJobs(result.jobs);setHasMore(result.hasMore);setTotal(result.total);setError('')}}catch(e){if(mounted)setError((e as Error).message)}finally{if(mounted)setLoading(false)}}
  setLoading(true);void refresh()
  const unsub=api.onEvent(event=>{if(event.channel==='workflow:changed'&&event.payload?.engineId==='deep-research')void refresh()})
  return()=>{mounted=false;unsub()}
 },[offset])
 useEffect(()=>{if(!confirm)return;const esc=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!lock.current){event.preventDefault();setConfirm(null)}};document.addEventListener('keydown',esc);return()=>document.removeEventListener('keydown',esc)},[confirm])
 const reload=async()=>{const result=await api.call<{jobs:Row[];hasMore:boolean;total:number}>('workflow.list',{engineId:'deep-research',offset,limit:30});if(alive.current){setJobs(result.jobs);setTotal(result.total);setHasMore(result.hasMore);if(offset>0&&!result.jobs.length)setOffset(v=>Math.max(0,v-30))}}
 const action=async(row:Row,name:'workflow.cancel'|'workflow.delete')=>{
  if(lock.current)return
  lock.current=true;setPending(row.id);setError('')
  try{
   const result=await api.call<Row&{deleted?:boolean}>(name,{id:row.id})
   if(result.controlPending)throw Error(result.error??'停止仍在核对 Agent 状态，请重试。')
   if(name==='workflow.delete')setConfirm(null)
   await reload()
  }catch(e){if(alive.current){setError((e as Error).message);await reload().catch(()=>{})}}
  finally{lock.current=false;if(alive.current)setPending(null)}
 }
 return <section className="research-manager" aria-label="历史研究任务管理">
  <header><div><span>RESEARCH ARCHIVE · INFRA</span><h2>历史研究任务</h2><p>研究引擎已保留为空壳。这里可停止旧任务并清理记录；仅中断原研究持有回执的 Agent 执行。</p></div><strong>{total} <small>RECORDS</small></strong></header>
  {error&&<div role="alert" className="research-manager-error">{error}<button type="button" onClick={()=>void reload().then(()=>setError('')).catch(e=>setError((e as Error).message))}>重试读取</button></div>}
  {loading&&<p className="research-manager-empty" role="status">正在读取历史研究…</p>}
  {!loading&&!jobs.length&&<p className="research-manager-empty">没有需要管理的历史研究记录。</p>}
  {!!jobs.length&&<div className="research-manager-list">{jobs.map(row=><article key={row.id} data-status={row.status} className="research-manager-item">
   <div className="research-manager-index">◎</div><div className="research-manager-info"><strong>{String(row.summary?.title??row.summary?.topic??'未命名研究').slice(0,120)}</strong><p>{new Date(row.updatedAt).toLocaleString()} <span>·</span> {row.id.slice(-12)}</p></div>
   <span className="research-manager-state">{row.controlPending?'停止待确认':labels[row.status]??row.status}</span>
   <div className="research-manager-actions"><button type="button" disabled={!!pending||row.status==='completed'||row.status==='cancelled'&&!row.controlPending} onClick={()=>void action(row,'workflow.cancel')} aria-label={'停止研究 '+row.id}>{pending===row.id?'正在核对…':'停止任务'}</button><button type="button" className="research-manager-delete" disabled={!!pending} onClick={()=>setConfirm(row)} aria-label={'删除研究 '+row.id}>删除</button></div>
  </article>)}</div>}
  {(offset>0||hasMore)&&<footer><button disabled={!!pending||offset===0} onClick={()=>setOffset(v=>Math.max(0,v-30))}>上一页</button><span>{offset+1}–{Math.min(offset+jobs.length,total)} / {total}</span><button disabled={!!pending||!hasMore} onClick={()=>setOffset(v=>v+30)}>下一页</button></footer>}
  {confirm&&<div className="research-manager-shade" onClick={()=>{if(!pending)setConfirm(null)}}>
   <section role="alertdialog" aria-modal="true" aria-labelledby="research-delete-title" aria-describedby="research-delete-description" className="research-manager-dialog" onClick={e=>e.stopPropagation()}>
    <small>PERMANENT FROM TASK LIST</small><h3 id="research-delete-title">删除这条研究任务？</h3><p id="research-delete-description">将先停止该研究的相关 Agent 执行，并确认它们退出。研究记录和报告会从任务列表移除，原始数据归档到本机备份目录；Agent 身份及无关会话保留。</p>
    <strong>{String(confirm.summary?.title??'未命名研究').slice(0,120)}</strong>
    <div><button disabled={!!pending} onClick={()=>setConfirm(null)}>返回</button><button className="research-manager-confirm" autoFocus disabled={!!pending} onClick={()=>void action(confirm,'workflow.delete')}>{pending?'正在停止并归档…':'确认停止并删除'}</button></div>
   </section>
  </div>}
 </section>
}
