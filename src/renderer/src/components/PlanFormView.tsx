import {translate as uiText,useI18n,interfaceLocale} from '../i18n'
import {useEffect,useRef,useState} from 'react'
import type {Store} from '../../../shared/types'
import type {ScheduledJob} from '../../../shared/scheduler'
import {PlanEditor} from './PlanEditor'
import {Icon} from './Icon'
import '../styles/plan-insights.css'

/** A real creation surface sharing the editor's validation, authority and retry key. */
export function PlanFormView({store,timezone,onOpen,onConversation}:{store:Store;timezone:string;onOpen:(id:string)=>void;onConversation:(id:string)=>void}){
  useI18n()
  const [revision,setRevision]=useState(0),[created,setCreated]=useState<ScheduledJob|null>(null),success=useRef<HTMLDivElement>(null)
  const employees=store.sessions.filter(card=>!card.deleting).length
  useEffect(()=>{const node=success.current;if(created&&node&&!node.closest('[hidden]')){node.focus({preventScroll:true});node.scrollIntoView({block:'nearest',behavior:'instant'})}},[created])
  return <section className="plan-form-view plan-insights" aria-label={uiText('Schedule intake form')}>
    <aside className="plan-form-intro"><span className="plan-form-symbol"><Icon name="calendar"/></span><h2>{uiText('New schedule')}</h2><p>{uiText('Choose the employee, write the exact prompt, and preview the schedule before submitting.')}</p><dl className="plan-form-context"><div><dt>{uiText('Available employees')}</dt><dd>{employees}</dd></div><div><dt>{uiText('Default time zone')}</dt><dd>{timezone}</dd></div></dl><p className="plan-form-guidance">{uiText('Automatic runs start only when enabled and due.')}</p>{!employees&&<p className="plan-form-no-employees" role="status"><Icon name="person"/>{uiText('Add an employee in Company to create a schedule.')}</p>}</aside>
    <div className="plan-form-content">{created&&<div className="plan-form-success" ref={success} tabIndex={-1} role="status"><Icon name="check"/><div><strong>{uiText('Schedule created:')} {created.name}</strong><p>{created.enabled?uiText('Automatic scheduling enabled'):uiText('Created paused')} · {created.nextAt?<time dateTime={created.nextAt}>{new Date(created.nextAt).toLocaleString(interfaceLocale(),{timeZone:timezone})}</time>:uiText(created.rule.kind==='event'&&created.enabled?'Waiting for event':'No future occurrence')}</p><details><summary>{uiText('Schedule details')}</summary><code>{created.id}</code></details><button onClick={()=>onOpen(created.id)}>{uiText('Open saved schedule')}<Icon name="arrow-right"/></button></div></div>}
      <PlanEditor key={revision} inline store={store} timezone={timezone} onClose={()=>{setRevision(value=>value+1);setCreated(null)}} onSaved={job=>{if(job){setCreated(job);setRevision(value=>value+1)}}} onConversation={onConversation}/>
    </div>
  </section>
}
