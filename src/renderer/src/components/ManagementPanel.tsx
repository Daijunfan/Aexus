import {useEffect,useState} from 'react'
import {api} from '../api'
import {AppSelect} from './AppSelect'
import type {StoredSession} from '../../../shared/types'
import {managementRoles,rolePolicy,type ManagementRole} from '../../../shared/roles'
type Topology={nodes:{id:string;managementRole:string;globalManager:boolean;globalByTeam?:boolean}[]}
export function ManagementPanel({employee,cloud=false}:{employee:StoredSession;cloud?:boolean}){
  const [data,setData]=useState<Topology>({nodes:[]}),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const load=()=>api.call<Topology>('management.topology',{team:employee.group}).then(setData)
  useEffect(()=>{void load().catch(cause=>setError(cause.message));return api.onEvent(event=>{if(event.channel==='store:changed')void load().catch(cause=>setError(cause.message))})},[employee.id,employee.group])
  const act=async(command:string,args:Record<string,unknown>)=>{setBusy(true);try{await api.call(command,args);await load();setError('')}catch(cause){setError((cause as Error).message)}finally{setBusy(false)}}
  const node=data.nodes.find(item=>item.id===employee.id)
  return <div className="form-section management-role-settings" aria-label="管理权限"><div className="form-row"><label>职位<AppSelect aria-label="员工职位" value={node?.managementRole??employee.managementRole??'employee'} disabled={busy} onChange={event=>void act('card.management-role',{id:employee.id,role:event.target.value})}>{managementRoles().map(role=><option key={role.value} value={role.value} disabled={role.requiresLocal&&(cloud||employee.kind==='cloud-native-worker')}>{role.label}</option>)}</AppSelect></label></div>
    <p className="workspace-note">{rolePolicy((node?.managementRole??employee.managementRole) as ManagementRole|undefined).description}</p>
    {error&&<p role="alert" className="employee-form-error">{error}</p>}
  </div>
}
