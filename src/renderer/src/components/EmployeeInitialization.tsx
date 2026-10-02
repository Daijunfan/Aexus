import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {useEffect,useState} from 'react'
import type {StoredSession} from '../../../shared/types'
import {api} from '../api'
import {useDialogFocus} from '../office/useDialogFocus'

export function EmployeeInitialization({employee,onClose}:{employee:StoredSession;onClose:()=>void}){
  useI18n()

  const [error,setError]=useState(''),[retrying,setRetrying]=useState(false)
  const status=employee.initialization?.status??'ready',failed=status==='failed'
  useDialogFocus('.initialization-dialog',true)
  useEffect(()=>{if(status==='ready')onClose()},[employee.id,status])
  return <div className="office-panel-wrap initialization-layer">
    <div className="panel-backdrop" onClick={onClose}/>
    <section className="office-panel initialization-dialog" role="dialog" aria-modal="true" aria-label={uiText("Employee initialization")} aria-busy={!failed}>
      <header className="panel-header"><h2>{failed?uiText("Initialization failed"):uiText("Initializing")}</h2><button className="panel-close" aria-label={uiText("Close initialization status")} onClick={onClose}>×</button></header>
      <div className="initialization-status" role="status">
        {!failed&&<span className="spinner" aria-hidden="true"/>}<strong>{employee.title}</strong>
        <p>{failed?uiText("Interaction is not available yet. Fix the connection or engine configuration, then retry initialization."):uiText("Confirming identity and reading the tool directory. You can send tasks when this finishes.")}</p>
        {status==='pending'&&<small>{uiText("Waiting for an initialization slot…")}</small>}
        {failed&&<p className="employee-form-error">{employee.initialization?.error}</p>}
        {error&&<p role="alert">{error}</p>}
      </div>
      <div className="form-footer"><button type="button" onClick={onClose}>{uiText("Back to team")}</button>{failed&&<button type="button" onClick={()=>void api.call('view.open',{kind:'employee',employee:employee.id})}>{uiText("Configure employee")}</button>}{failed&&<button className="btn primary" disabled={retrying} onClick={async()=>{setRetrying(true);setError('');try{await api.call('card.initialize',{id:employee.id})}catch(error){setError((error as Error).message)}finally{setRetrying(false)}}}>{retrying?uiText("Preparing to retry…"):uiText("Retry initialization")}</button>}</div>
    </section>
  </div>
}
