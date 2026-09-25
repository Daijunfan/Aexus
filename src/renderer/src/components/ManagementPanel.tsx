import {useEffect,useState} from 'react'
import {api} from '../api'
import {AppSelect} from './AppSelect'
import type {StoredSession} from '../../../shared/types'
import type {ManagementRelation} from '../../../shared/management'
type Topology={nodes:{id:string;title:string;managementRole:string;globalManager:boolean}[];edges:ManagementRelation[];pending:ManagementRelation[]}
export function ManagementPanel({employee}:{employee:StoredSession}){
  const [data,setData]=useState<Topology>({nodes:[],edges:[],pending:[]}),[target,setTarget]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const load=()=>api.call<Topology>('management.topology',{team:employee.group}).then(setData)
  useEffect(()=>{void load().catch(cause=>setError(cause.message));return api.onEvent(event=>{if(event.channel==='store:changed')void load().catch(cause=>setError(cause.message))})},[employee.id,employee.group])
  const act=async(command:string,args:Record<string,unknown>)=>{setBusy(true);try{await api.call(command,args);await load();setError('')}catch(cause){setError((cause as Error).message)}finally{setBusy(false)}}
  const node=data.nodes.find(item=>item.id===employee.id),relations=[...data.edges,...data.pending].filter(edge=>edge.managerId===employee.id||edge.employeeId===employee.id),title=(id:string)=>data.nodes.find(item=>item.id===id)?.title??id
  return <section className="management-panel" aria-label="协同管理"><h3>协同管理</h3><div className="form-row"><label>团队角色<AppSelect aria-label="团队角色" value={node?.managementRole??'employee'} disabled={busy} onChange={event=>void act('card.management-role',{id:employee.id,role:event.target.value})}><option value="employee">Employee</option><option value="manager">Team Manager</option></AppSelect></label><label>执行信任<AppSelect aria-label="执行信任" value={employee.accessMode??'trusted'} disabled={busy} onChange={event=>void act('card.access-mode',{id:employee.id,mode:event.target.value})}><option value="trusted">Trusted · 用户信任环境</option><option value="isolated">Isolated · 系统隔离</option></AppSelect></label></div><p>管理关系只允许分配任务与读取会话。Trusted 进程拥有其系统账号权限；Isolated 在不支持的执行环境中会拒绝启动。</p>
    <label className="global-manager"><input type="checkbox" disabled={busy} checked={node?.globalManager??false} onChange={event=>void act('management.global',{id:employee.id,enabled:event.target.checked})}/> Agents Manager · 全局管理授权</label>
    {node?.managementRole==='manager'&&<div className="management-request"><AppSelect aria-label="选择被管理员工" value={target} onChange={event=>setTarget(event.target.value)}><option value="">选择本 Team 的 Employee</option>{data.nodes.filter(item=>item.id!==employee.id&&item.managementRole==='employee'&&!item.globalManager&&!relations.some(edge=>edge.managerId===employee.id&&edge.employeeId===item.id)).map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</AppSelect><button type="button" disabled={!target||busy} onClick={()=>void act('management.request',{manager:employee.id,employee:target})}>申请关系</button></div>}
    <div className="management-relations">{relations.map(edge=><div key={edge.id} data-management-relation={edge.id}><span>{title(edge.managerId)} → {title(edge.employeeId)}<small>{edge.state==='active'?'已生效':'待用户批准'}</small></span>{edge.state==='pending'&&<button type="button" disabled={busy} onClick={()=>void act('management.decide',{id:edge.id,decision:'approve'})}>批准</button>}<button type="button" disabled={busy} onClick={()=>void act(edge.state==='pending'?'management.decide':'management.unbind',edge.state==='pending'?{id:edge.id,decision:'deny'}:{id:edge.id})}>{edge.state==='pending'?'拒绝':'解除'}</button></div>)}</div>
    {!relations.length&&<p>尚未建立管理关系。</p>}{error&&<p role="alert" className="employee-form-error">{error}</p>}
  </section>
}
