import {translate as uiText,useI18n} from '../i18n'
import {engineDefinition} from '../../../shared/engines'
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

export const Employee=memo(function Employee({ employee, cloudWorkspace=false,working, communicating=false, disconnected=false, dragging = false, desk, onOpen, onStart }: {
  employee: StoredSession;cloudWorkspace?:boolean; working: boolean;communicating?:boolean; disconnected?:boolean; dragging?: boolean; onStart?: (event:React.PointerEvent,id:string)=>void; desk: RoomDesign['desk']; onOpen: (card: StoredSession) => void
}) {
  useI18n()

  const behavior=usePetBehavior(employee.id,working||communicating,dragging,employee.avatar==='panda'?'calm':employee.avatar==='fox'?'playful':'curious')
  const initializing=employeeInitializing(employee),blocked=!employeeReady(employee)
  const label=uiText(initializing?'Initializing':blocked?'Initialization failed':working?'Working':communicating?'Collaborating':disconnected?'Connection or execution failed':'Resting')
  const native=employee.kind==='cloud-native-worker',unread=!!employee.lastReply&&!employee.lastReply.readAt,engineLabel=engineDefinition(employee.engine).label
  return <button disabled={blocked} aria-busy={initializing} title={blocked?label:undefined} className={`employee with-official-pet ${native?'cloud-native-pet':''} ${working ? 'is-working' : communicating?'is-communicating':disconnected?'is-disconnected':'is-sleeping'}`} style={{width:EMPLOYEE_SIZE.width,height:EMPLOYEE_SIZE.height}} data-frame="rectangle" data-management-role={employee.managementRole??'employee'} data-card-id={employee.id} data-unread={unread?'true':undefined} data-kind={native?'cloud-native-worker':'worker'} data-state={initializing?'initializing':blocked?'initialization-failed':working?'working':communicating?'communicating':disconnected?'disconnected':'sleeping'}
    data-engine={employee.engine} data-group={employee.group} data-workspace-error={employee.workspaceError?'true':undefined} onPointerDown={blocked?undefined:e=>onStart?.(e,employee.id)} onPointerEnter={behavior.onPointerEnter} onPointerLeave={behavior.onPointerLeave} onClick={e => {if(!blocked&&(!onStart || e.detail===0))onOpen(employee)}}
    aria-label={blocked?`${employee.title} · ${label}`:uiText('Open conversation with {0} · {1}',[employee.title,label])}>
    <div className="workstation-chair" aria-hidden="true" />
    <Mascot kind={employee.avatar ?? (employee.engine === 'codex' ? 'robot' : 'cat')} accessory={employee.accessory ?? 'headphones'} color={employee.color} working={working||communicating} pose={communicating&&!working?'wave':behavior.pose} />
    {native&&<span className="cloud-native-foot" aria-hidden="true"><svg viewBox="0 0 186 40"><path d="M22 37C11 37 3 33 3 25C3 17 10 12 20 13C24 4 38 2 47 10C54 3 65 2 75 5C88 0 102 5 107 15C117 8 132 11 137 20C146 14 161 18 164 26C175 23 183 28 183 33C183 37 171 38 159 38H22Z" fill="#edf7ff" stroke="#94bbdf" strokeWidth="1.5" strokeLinejoin="round"/><path d="M22 32C57 35 127 35 165 33" fill="none" stroke="#d2e6f7" strokeWidth="2" strokeLinecap="round"/></svg></span>}
    <Desk material={desk} />{!working&&<Laptop working={working} />}<Mug />
    <span className="employee-badge">
      <span className="employee-management" data-management-role={employee.managementRole??'employee'}>{uiText(rolePolicy(employee.managementRole).label)}</span>
      {unread&&<i className="employee-unread unread-dot" aria-label={uiText("Unread reply available")} title={uiText("Unread reply available; open the conversation to read it")}/>}
      <span className="badge-light"/><span className="employee-name">{employee.title}</span>
      <span className="badge-engine" title={uiText("Execution engine: {0}",[engineLabel])} aria-label={uiText("Execution engine: {0}",[engineLabel])}><EngineMark engine={employee.engine} size={24}/></span>
      <span className="employee-role">
        {[{label:'Execution location',cloud:native,className:'badge-location'},{label:'Work environment',cloud:cloudWorkspace,className:'badge-workspace'}].map(({label,cloud,className},index)=><span key={label} className={`badge-place ${className}`} data-location={index===0?(cloud?'cloud':'local'):undefined} data-workspace={index===1?(cloud?'cloud':'local'):undefined} title={uiText('{0}: {1}',[uiText(label),uiText(cloud?'Cloud':'Local (Core host)')])}>
          <small>{uiText(label)}</small><span>{cloud?<svg viewBox="0 0 32 24" aria-hidden="true"><path d="M8 21h16a6 6 0 0 0 1-11.9A9.5 9.5 0 0 0 7.2 10 5.5 5.5 0 0 0 8 21Z" fill="currentColor"/></svg>:api.platform&&api.platform!=='macos'?<TeamOSIcon os={api.platform}/>:<img src={finderIcon} alt=""/>}<b>{cloud?uiText("Cloud"):uiText("Local")}</b></span>
        </span>)}
      </span>
      <span className="employee-state">{initializing&&<span className="spinner"/>}{label}</span>
    </span>
  </button>
})

export function EmptyDesk({ material }: { material: RoomDesign['desk'] }) {
  useI18n()

  return <div className="empty-workstation" aria-hidden="true"><div className="workstation-chair" /><Desk material={material} /><Laptop working={false} /><Mug /><span className="vacant-badge">{uiText("A place for your next idea")}</span></div>
}
