import {useEffect,useState} from 'react'
import type {StoredSession} from '../../../shared/types'
import {api} from '../api'
import {useDialogFocus} from '../office/useDialogFocus'

export function EmployeeInitialization({employee,onClose}:{employee:StoredSession;onClose:()=>void}){
  const [error,setError]=useState(''),[retrying,setRetrying]=useState(false)
  const status=employee.initialization?.status??'ready',failed=status==='failed'
  useDialogFocus('.initialization-dialog',true)
  useEffect(()=>{if(status==='ready')onClose()},[employee.id,status])
  return <div className="office-panel-wrap initialization-layer">
    <div className="panel-backdrop" onClick={onClose}/>
    <section className="office-panel initialization-dialog" role="dialog" aria-modal="true" aria-label="员工初始化" aria-busy={!failed}>
      <header className="panel-header"><h2>{failed?'初始化失败':'正在初始化'}</h2><button className="panel-close" aria-label="关闭初始化状态" onClick={onClose}>×</button></header>
      <div className="initialization-status" role="status">
        {!failed&&<span className="spinner" aria-hidden="true"/>}<strong>{employee.title}</strong>
        <p>{failed?'尚未开放交互。修复连接或引擎配置后，可以重试初始化。':'正在阅读权限和工具说明。完成前暂时不能打开员工或发送任务。'}</p>
        {status==='pending'&&<small>正在等待初始化工作位…</small>}
        {failed&&<p className="employee-form-error">{employee.initialization?.error}</p>}
        {error&&<p role="alert">{error}</p>}
      </div>
      <div className="form-footer"><button type="button" onClick={onClose}>返回团队</button>{failed&&<button type="button" onClick={()=>void api.call('view.open',{kind:'employee',employee:employee.id})}>配置员工</button>}{failed&&<button className="btn primary" disabled={retrying} onClick={async()=>{setRetrying(true);setError('');try{await api.call('card.initialize',{id:employee.id})}catch(error){setError((error as Error).message)}finally{setRetrying(false)}}}>{retrying?'准备重试…':'重试初始化'}</button>}</div>
    </section>
  </div>
}
