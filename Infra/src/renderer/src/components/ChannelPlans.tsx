import {useEffect,useRef,useState} from 'react'
import type {ChannelView} from '../../../shared/channels'
import type {Store} from '../../../shared/types'
import type {ScheduledJob} from '../../../shared/scheduler'
import type {PlanQuery} from '../../../shared/plan'
import {api} from '../api'
import {translate as uiText,useI18n,interfaceLocale} from '../i18n'
import {PlanEditor} from './PlanEditor'
import {scheduleLabel} from './PlanView'
import {Icon} from './Icon'
import '../styles/channel-plans.css'

/** This surface edits canonical Plan records; it owns no scheduling or persistence. */
export function ChannelPlans({channel,busy}:{channel:ChannelView;busy:boolean}){
 useI18n()
 const [data,setData]=useState<PlanQuery|null>(null),[store,setStore]=useState<Store|null>(null),[editing,setEditing]=useState<ScheduledJob|'new'|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0),sequence=useRef(0)
 useEffect(()=>{
  let alive=true,timer:ReturnType<typeof setTimeout>|undefined
  const load=async()=>{const version=++sequence.current;try{const [plans,people]=await Promise.all([api.call<PlanQuery>('plan.query',{filter:{channel:channel.id},limit:100}),api.call<Store>('session.list')]);if(alive&&version===sequence.current){setData(plans);setStore(people);setError('')}}catch(cause){if(alive&&version===sequence.current)setError((cause as Error).message)}}
  void load();const off=api.onEvent(event=>{if(['schedule:changed','store:changed','channel:changed'].includes(event.channel)&&!timer)timer=setTimeout(()=>{timer=undefined;void load()},90)})
  return()=>{alive=false;sequence.current++;off();clearTimeout(timer)}
 },[channel.id,channel.revision,reload])
 const open=async(id:string)=>{try{setEditing(await api.call<ScheduledJob>('schedule.get',{id}));setError('')}catch(cause){setError((cause as Error).message)}}
 const initial={name:(channel.name+' · '+uiText('Scheduled publishing')).slice(0,160),employeeId:channel.adminIds[0]??'',channelId:channel.id,prompt:uiText('Collect the latest news, collaborate with the channel employees, and publish a concise report with source links.')}
 return <section className="channel-plans" aria-label={uiText('Channel plans')}>
  <div className="channel-plans-heading"><strong>{uiText('Channel plans')}</strong><small>{uiText('{0} publishing plans',[data?.total??0])}</small></div>
  <p>{uiText('Publishing tasks use the same Plan records. Edit timing, prompts, assignees and pause state here or in Plan.')}</p>
  {!data&&!error&&<p role="status">{uiText('Loading…')}</p>}
  {data&&!data.total&&<p className="channel-plan-empty" role="status"><Icon name="calendar"/>{uiText('No publishing schedule. Automatic publishing is not configured.')}</p>}
  <div className="channel-plan-list">{data?.rows.map(job=><button type="button" key={job.id} data-channel-plan={job.id} onClick={()=>void open(job.id)} disabled={busy}>
   <Icon name={job.rule.kind==='event'?'radio-tower':'calendar'}/><span><strong>{job.name}</strong><small>{job.employee?.title??uiText('Removed employee')} · {scheduleLabel(job)}</small><small>{job.rule.kind==='event'&&job.status==='scheduled'?uiText('Waiting for event'):job.nextAt?new Date(job.nextAt).toLocaleString(interfaceLocale()):uiText('No upcoming run')}</small></span><span className={'plan-status state-'+job.status}>{uiText(job.status)}</span><Icon name="chevron-right"/>
  </button>)}</div>
  {data?.hasMore&&<small>{uiText('More plans are available in Plan.')}</small>}
  {error&&<p className="channel-inline-error" role="alert">{uiText(error)} <button type="button" onClick={()=>setReload(value=>value+1)}>{uiText('Retry')}</button></p>}
  <div className="channel-plan-actions"><button type="button" disabled={busy||!store||!channel.adminIds.length} onClick={()=>setEditing('new')}><Icon name="add"/>{uiText('Add publishing schedule')}</button></div>
  {editing&&store&&<PlanEditor key={editing==='new'?'new':editing.id+':'+editing.revision} job={editing==='new'?undefined:editing} initial={initial} store={store} timezone={Intl.DateTimeFormat().resolvedOptions().timeZone} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);setReload(value=>value+1)}} onReload={setEditing} onConversation={employee=>void api.call('view.open',{kind:'conversation',employee}).catch(cause=>setError(cause.message))}/>}
 </section>
}
