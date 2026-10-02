import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import type {StoredSession} from '../../../shared/types'
import {useDialogFocus} from '../office/useDialogFocus'

export function EmployeeDeleteDialog({employee,employees,teams,onRemove,onCancel}:{employee?:StoredSession;employees?:StoredSession[];teams?:string[];onRemove:(deleteWorkspace:boolean)=>Promise<void>;onCancel:()=>void}){
  useI18n()

  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const cards=employees??(employee?[employee]:[]),batch=!employee
  const cancel=useRef<HTMLButtonElement>(null)
  useDialogFocus('.employee-delete-dialog',true)
  useEffect(()=>cancel.current?.focus(),[])
  const remove=async(files:boolean)=>{setBusy(true);setError('');try{await onRemove(files)}catch(cause){setError((cause as Error).message)}finally{setBusy(false)}}
  return createPortal(<div className="office-panel-wrap employee-delete-layer" onKeyDown={event=>{if(event.key==='Escape'&&!busy){event.stopPropagation();onCancel()}}}>
    <div className="panel-backdrop"/>
    <section className="office-panel employee-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="employee-delete-title" aria-describedby="employee-delete-description">
      <h2 id="employee-delete-title">{employee?uiText("Delete {0} and their conversation",[employee.title]):teams?uiText("Delete {0} teams and {1} employees",[teams.length,cards.length]):uiText("Delete {0} employees",[cards.length])}</h2>
      <p id="employee-delete-description">{batch?uiText("The selection is handled together with a single confirmation."):''}{uiText("Removing employees also clears their associated conversations. Also delete")}{batch?uiText("all selected employees’"):''}{uiText("working folders and all files and subfolders inside?")}</p>
      {teams&&<p className="employee-delete-teams">{teams.join('、')}</p>}
      <div className="employee-delete-list">{cards.map(card=><div key={card.id}>
        {batch&&<strong>{card.group} / {card.title}</strong>}
        {card.remote&&<small>{uiText("Cloud host:")}{card.remote.host}</small>}
        <code className="employee-delete-path">{card.remote?.directory??card.cwd}</code>
      </div>)}</div>
      <p className="employee-delete-help">{batch?uiText("Delete folders: remove the directories above · Keep folders: remove only the selected employees and conversations"):uiText("both: also delete folders · only employee: keep folders · cancel: cancel")}</p>
      {error&&<p className="employee-form-error" role="alert">{error}</p>}
      {busy&&<p role="status">{uiText("Deleting…")}</p>}
      <div className="form-footer">
        <button type="button" className="btn employee-delete-both" disabled={busy} onClick={()=>void remove(true)}>{batch?uiText("Also delete folders"):'both'}</button>
        <button type="button" className="btn" disabled={busy} onClick={()=>void remove(false)}>{batch?uiText("Keep folders"):'only employee'}</button>
        <button ref={cancel} type="button" className="btn" disabled={busy} onClick={onCancel}>{batch?uiText("Cancel"):'cancel'}</button>
      </div>
    </section>
  </div>,document.body)
}
