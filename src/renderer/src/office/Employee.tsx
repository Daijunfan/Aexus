import {employeeInitializing,employeeReady} from '../../../shared/types'
import { usePetBehavior } from './usePetBehavior'
import type { StoredSession } from '../../../shared/types'
import type { RoomDesign } from '../../../shared/office'
import { Mascot } from './Mascot'
import { Desk, Laptop, Mug } from './Furniture'

export function Employee({ employee, globalManager=false,working, disconnected=false, dragging = false, desk, onOpen, onStart }: {
  employee: StoredSession;globalManager?:boolean; working: boolean; disconnected?:boolean; dragging?: boolean; onStart?: (event:React.PointerEvent)=>void; desk: RoomDesign['desk']; onOpen: (card: StoredSession) => void
}) {
  const behavior=usePetBehavior(employee.id,working,dragging,employee.avatar==='panda'?'calm':employee.avatar==='fox'?'playful':'curious')
  const initializing=employeeInitializing(employee),blocked=!employeeReady(employee)
  const label=initializing?'正在初始化':blocked?'初始化失败':working?'工作中':disconnected?'连接／执行失败':'休息中'
  const native=employee.kind==='cloud-native-worker',unread=!!employee.lastReply&&!employee.lastReply.readAt
  return <button disabled={blocked} aria-busy={initializing} title={blocked?label:undefined} className={`employee with-official-pet ${native?'cloud-native-pet':''} ${working ? 'is-working' : disconnected?'is-disconnected':'is-sleeping'}`} data-card-id={employee.id} data-unread={unread?'true':undefined} data-kind={native?'cloud-native-worker':'worker'} data-state={initializing?'initializing':blocked?'initialization-failed':working?'working':disconnected?'disconnected':'sleeping'}
    data-engine={employee.engine} data-group={employee.group} data-workspace-error={employee.workspaceError?'true':undefined} onPointerDown={blocked?undefined:onStart} onPointerMove={behavior.onPointerMove} onPointerEnter={behavior.onPointerEnter} onPointerLeave={behavior.onPointerLeave} onClick={e => {if(!blocked&&(!onStart || e.detail===0))onOpen(employee)}}
    aria-label={`${blocked?'':'打开 '}${employee.title}${blocked?'':' 的会话'}，${label}`}>
    <div className="workstation-chair" aria-hidden="true" />
    <Mascot kind={employee.avatar ?? (employee.engine === 'codex' ? 'robot' : 'cat')} accessory={employee.accessory ?? 'headphones'} color={employee.color} working={working} pose={behavior.pose} gaze={behavior.gaze} />
    {native&&<span className="cloud-native-foot" aria-hidden="true"><svg viewBox="0 0 96 32" preserveAspectRatio="none"><path d="M18 27C8 27 5 18 10 12c4-5 10-5 14-3C28 1 40-1 47 5c4 3 5 6 5 9 6-5 17-2 19 5 8-4 18 2 18 10H18Z" fill="#edf7ff" stroke="#94bbdf" strokeWidth="2"/></svg></span>}
    <Desk material={desk} />{!working&&<Laptop working={working} />}<Mug />
    <span className="employee-badge">{unread&&<i className="employee-unread unread-dot" aria-label="有未读回复"/>}<span className="badge-light" /><span className="employee-name">{employee.title}</span><span className="employee-role" title={native?employee.remote?.host:undefined}>{native?'Cloud Native Worker':'Local Worker'} · {employee.engine==='codex'?'Codex':'Claude Code'}</span><span className="employee-management" data-management-role={globalManager?'global':employee.managementRole??'employee'}>{globalManager?'Agents Manager':employee.managementRole==='manager'?'Team Manager':'Employee'}</span><span className="employee-state">{initializing&&<span className="spinner"/>}{label}</span></span>
  </button>
}

export function EmptyDesk({ material }: { material: RoomDesign['desk'] }) {
  return <div className="empty-workstation" aria-hidden="true"><div className="workstation-chair" /><Desk material={material} /><Laptop working={false} /><Mug /><span className="vacant-badge">A place for your next idea</span></div>
}
