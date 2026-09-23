import { usePetBehavior } from './usePetBehavior'
import type { StoredSession } from '../../../shared/types'
import type { RoomDesign } from '../../../shared/office'
import { Mascot } from './Mascot'
import { Desk, Laptop, Mug } from './Furniture'

export function Employee({ employee, working, dragging = false, desk, onOpen, onStart }: {
  employee: StoredSession; working: boolean; dragging?: boolean; onStart?: (event:React.PointerEvent)=>void; desk: RoomDesign['desk']; onOpen: (card: StoredSession) => void
}) {
  const behavior=usePetBehavior(employee.id,working,dragging,employee.avatar==='panda'?'calm':employee.avatar==='fox'?'playful':'curious')
  return <button className={`employee with-official-pet ${working ? 'is-working' : 'is-sleeping'}`} data-card-id={employee.id} data-state={working ? 'working' : 'sleeping'}
    data-engine={employee.engine} data-group={employee.group} data-workspace-error={employee.workspaceError?'true':undefined} onPointerDown={onStart} onPointerMove={behavior.onPointerMove} onPointerEnter={behavior.onPointerEnter} onPointerLeave={behavior.onPointerLeave} onClick={e => {if(!onStart || e.detail===0)onOpen(employee)}}
    aria-label={`打开 ${employee.title} 的会话，${working ? '工作中' : '休息中'}`}>
    <div className="workstation-chair" aria-hidden="true" />
    <Mascot kind={employee.avatar ?? (employee.engine === 'codex' ? 'robot' : 'cat')} accessory={employee.accessory ?? 'headphones'} color={employee.color} working={working} pose={behavior.pose} gaze={behavior.gaze} />
    <Desk material={desk} />{!working&&<Laptop working={working} />}<Mug />
    <span className="employee-badge"><span className="badge-light" /><span className="employee-name">{employee.title}</span><span className="employee-role">{employee.role || (employee.engine === 'codex' ? 'Codex Developer' : 'Claude Teammate')}</span><span className="employee-state">{working ? '工作中' : '休息中'}</span></span>
  </button>
}

export function EmptyDesk({ material }: { material: RoomDesign['desk'] }) {
  return <div className="empty-workstation" aria-hidden="true"><div className="workstation-chair" /><Desk material={material} /><Laptop working={false} /><Mug /><span className="vacant-badge">A place for your next idea</span></div>
}
