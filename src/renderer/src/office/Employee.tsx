import {api} from '../api'
import {TeamOSIcon} from './TeamOSIcon'
import {memo} from 'react'
import {EMPLOYEE_SIZE} from '../../../shared/canvas'
import {rolePolicy} from '../../../shared/roles'
import {employeeInitializing,employeeReady} from '../../../shared/types'
import { usePetBehavior } from './usePetBehavior'
import type { StoredSession } from '../../../shared/types'
import type { RoomDesign } from '../../../shared/office'
import { Mascot } from './Mascot'
import { Desk, Laptop, Mug } from './Furniture'
import { EngineMark } from '../components/EngineMark'
import finderIcon from '../assets/os/local-computer.svg'

export const Employee=memo(function Employee({ employee, cloudWorkspace=false,working, disconnected=false, dragging = false, desk, onOpen, onStart }: {
  employee: StoredSession;cloudWorkspace?:boolean; working: boolean; disconnected?:boolean; dragging?: boolean; onStart?: (event:React.PointerEvent,id:string)=>void; desk: RoomDesign['desk']; onOpen: (card: StoredSession) => void
}) {
  const behavior=usePetBehavior(employee.id,working,dragging,employee.avatar==='panda'?'calm':employee.avatar==='fox'?'playful':'curious')
  const initializing=employeeInitializing(employee),blocked=!employeeReady(employee)
  const label=initializing?'正在初始化':blocked?'初始化失败':working?'工作中':disconnected?'连接／执行失败':'休息中'
  const native=employee.kind==='cloud-native-worker',unread=!!employee.lastReply&&!employee.lastReply.readAt
  return <button disabled={blocked} aria-busy={initializing} title={blocked?label:undefined} className={`employee with-official-pet ${native?'cloud-native-pet':''} ${working ? 'is-working' : disconnected?'is-disconnected':'is-sleeping'}`} style={{width:EMPLOYEE_SIZE.width,height:EMPLOYEE_SIZE.height}} data-frame="rectangle" data-management-role={employee.managementRole??'employee'} data-card-id={employee.id} data-unread={unread?'true':undefined} data-kind={native?'cloud-native-worker':'worker'} data-state={initializing?'initializing':blocked?'initialization-failed':working?'working':disconnected?'disconnected':'sleeping'}
    data-engine={employee.engine} data-group={employee.group} data-workspace-error={employee.workspaceError?'true':undefined} onPointerDown={blocked?undefined:e=>onStart?.(e,employee.id)} onPointerEnter={behavior.onPointerEnter} onPointerLeave={behavior.onPointerLeave} onClick={e => {if(!blocked&&(!onStart || e.detail===0))onOpen(employee)}}
    aria-label={`${blocked?'':'打开 '}${employee.title}${blocked?'':' 的会话'}，${label}`}>
    <div className="workstation-chair" aria-hidden="true" />
    <Mascot kind={employee.avatar ?? (employee.engine === 'codex' ? 'robot' : 'cat')} accessory={employee.accessory ?? 'headphones'} color={employee.color} working={working} pose={behavior.pose} />
    {native&&<span className="cloud-native-foot" aria-hidden="true"><svg viewBox="0 0 186 40"><path d="M22 37C11 37 3 33 3 25C3 17 10 12 20 13C24 4 38 2 47 10C54 3 65 2 75 5C88 0 102 5 107 15C117 8 132 11 137 20C146 14 161 18 164 26C175 23 183 28 183 33C183 37 171 38 159 38H22Z" fill="#edf7ff" stroke="#94bbdf" strokeWidth="1.5" strokeLinejoin="round"/><path d="M22 32C57 35 127 35 165 33" fill="none" stroke="#d2e6f7" strokeWidth="2" strokeLinecap="round"/></svg></span>}
    <Desk material={desk} />{!working&&<Laptop working={working} />}<Mug />
    <span className="employee-badge">
      {unread&&<i className="employee-unread unread-dot" aria-label="有未读回复"/>}
      <span className="badge-light"/><span className="employee-name">{employee.title}</span>
      <span className="badge-engine" title={employee.engine==='codex'?'Codex':'Claude Agent'}><EngineMark engine={employee.engine} size={24}/></span>
      <span className="employee-role">
        {[{label:'运行位置',cloud:native,className:'badge-location'},{label:'工作环境',cloud:cloudWorkspace,className:'badge-workspace'}].map(({label,cloud,className},index)=><span key={label} className={`badge-place ${className}`} data-location={index===0?(cloud?'cloud':'local'):undefined} data-workspace={index===1?(cloud?'cloud':'local'):undefined} title={`${label}：${cloud?'云端':'Core 本地'}`}>
          <small>{label}</small><span>{cloud?<svg viewBox="0 0 32 24" aria-hidden="true"><path d="M8 21h16a6 6 0 0 0 1-11.9A9.5 9.5 0 0 0 7.2 10 5.5 5.5 0 0 0 8 21Z" fill="currentColor"/></svg>:api.platform&&api.platform!=='macos'?<TeamOSIcon os={api.platform}/>:<img src={finderIcon} alt=""/>}<b>{cloud?'云端':'本地'}</b></span>
        </span>)}
      </span>
      <span className="employee-management" data-management-role={employee.managementRole??'employee'}>{rolePolicy(employee.managementRole).label}</span>
      <span className="employee-state">{initializing&&<span className="spinner"/>}{label}</span>
    </span>
  </button>
})

export function EmptyDesk({ material }: { material: RoomDesign['desk'] }) {
  return <div className="empty-workstation" aria-hidden="true"><div className="workstation-chair" /><Desk material={material} /><Laptop working={false} /><Mug /><span className="vacant-badge">A place for your next idea</span></div>
}
