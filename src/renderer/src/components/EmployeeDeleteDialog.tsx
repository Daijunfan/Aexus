import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import type {StoredSession} from '../../../shared/types'
import {useDialogFocus} from '../office/useDialogFocus'

export function EmployeeDeleteDialog({employee,employees,teams,onRemove,onCancel}:{employee?:StoredSession;employees?:StoredSession[];teams?:string[];onRemove:(deleteWorkspace:boolean)=>Promise<void>;onCancel:()=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const cards=employees??(employee?[employee]:[]),batch=!employee
  const cancel=useRef<HTMLButtonElement>(null)
  useDialogFocus('.employee-delete-dialog',true)
  useEffect(()=>cancel.current?.focus(),[])
  const remove=async(files:boolean)=>{setBusy(true);setError('');try{await onRemove(files)}catch(cause){setError((cause as Error).message)}finally{setBusy(false)}}
  return createPortal(<div className="office-panel-wrap employee-delete-layer" onKeyDown={event=>{if(event.key==='Escape'&&!busy){event.stopPropagation();onCancel()}}}>
    <div className="panel-backdrop"/>
    <section className="office-panel employee-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="employee-delete-title" aria-describedby="employee-delete-description">
      <h2 id="employee-delete-title">{employee?`删除 ${employee.title} 的会话与员工`:teams?`删除 ${teams.length} 个团队及 ${cards.length} 名员工`:`删除 ${cards.length} 名员工`}</h2>
      <p id="employee-delete-description">{batch?'本次选择统一处理，只确认一次。':''}移除员工会清理关联会话。是否同时删除{batch?'所有选中员工的':''}工作文件夹及其中的全部文件和子文件夹？</p>
      {teams&&<p className="employee-delete-teams">{teams.join('、')}</p>}
      <div className="employee-delete-list">{cards.map(card=><div key={card.id}>
        {batch&&<strong>{card.group} / {card.title}</strong>}
        {card.remote&&<small>云主机：{card.remote.host}</small>}
        <code className="employee-delete-path">{card.remote?.directory??card.cwd}</code>
      </div>)}</div>
      <p className="employee-delete-help">{batch?'同时删除文件夹：清理上述目录 · 保留文件夹：只移除所选对象及会话':'both：一起删除文件夹 · only employee：保留文件夹 · cancel：取消'}</p>
      {error&&<p className="employee-form-error" role="alert">{error}</p>}
      {busy&&<p role="status">正在删除…</p>}
      <div className="form-footer">
        <button type="button" className="btn employee-delete-both" disabled={busy} onClick={()=>void remove(true)}>{batch?'同时删除文件夹':'both'}</button>
        <button type="button" className="btn" disabled={busy} onClick={()=>void remove(false)}>{batch?'保留文件夹':'only employee'}</button>
        <button ref={cancel} type="button" className="btn" disabled={busy} onClick={onCancel}>{batch?'取消':'cancel'}</button>
      </div>
    </section>
  </div>,document.body)
}
