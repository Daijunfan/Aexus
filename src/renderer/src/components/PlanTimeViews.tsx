import {translate as uiText,useI18n,interfaceLocale} from '../i18n'
import {useEffect,useLayoutEffect,useMemo,useRef,useState,type PointerEvent} from 'react'
import {Temporal} from '@js-temporal/polyfill'
import {createPortal} from 'react-dom'
import type {PlanFilter,PlanTimeEvent,PlanTimeline,PlanViewOptions} from '../../../shared/plan'
import {api} from '../api'
import {Icon} from './Icon'
import {EmployeePortrait} from './EmployeePortrait'
import {useDialogFocus} from '../office/useDialogFocus'
import '../styles/plan-time-views.css'

type Props={filter:PlanFilter;options:PlanViewOptions;hostZone:string;generation:number;onOptions:(patch:Partial<PlanViewOptions>)=>void;onOpen:(id:string)=>void}
const dateLabel=(value:string,zone:string)=>new Date(value).toLocaleString(interfaceLocale(),{timeZone:zone,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZoneName:'short'})
const timeLabel=(value:string,zone:string,seconds=false)=>new Date(value).toLocaleTimeString(interfaceLocale(),{timeZone:zone,hour:'2-digit',minute:'2-digit',second:seconds?'2-digit':undefined,hour12:false,timeZoneName:'short'})
const midnight=(date:Temporal.PlainDate,zone:string)=>date.toZonedDateTime({timeZone:zone,plainTime:'00:00'})
const zones=(host:string,current:string)=>[...new Set([host,current,'UTC','Asia/Shanghai','America/New_York','Europe/London','Asia/Tokyo'])]
const CARD_WIDTH=228,LANE_HEIGHT=112
function useClock(){
  const [now,setNow]=useState(Date.now())
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer)},[])
  return now
}
function eventDuration(event:PlanTimeEvent,now:number){
  if(event.durationKind==='point')return uiText('No duration estimate')
  if(event.durationKind==='estimate')return `${uiText('Estimated duration')}: ${new Intl.NumberFormat(interfaceLocale(),{style:'unit',unit:'minute',unitDisplay:'short'}).format(event.estimatedMinutes!)}`
  const seconds=Math.max(0,((event.endAt?Date.parse(event.endAt):now)-Date.parse(event.startAt))/1000),unit=seconds<60?'second':seconds<3600?'minute':'hour',value=seconds/(unit==='hour'?3600:unit==='minute'?60:1)
  const duration=new Intl.NumberFormat(interfaceLocale(),{style:'unit',unit,unitDisplay:'short',maximumFractionDigits:1}).format(value)
  return uiText(event.durationKind==='elapsed'?'Elapsed: {0}':'Actual duration: {0}',[duration])
}
function eventDescription(event:PlanTimeEvent,zone:string,now:number){
  return [event.name,`${event.employee?.title??uiText('Removed employee')} · ${event.employee?.team??''}`,dateLabel(event.startAt,zone)+(event.endAt?' → '+dateLabel(event.endAt,zone):''),event.kind==='run'?uiText(event.status.replaceAll('_',' ')):uiText('Upcoming occurrence'),eventDuration(event,now),event.message,!event.jobAvailable?uiText('Schedule removed · history preserved'):'',event.canReschedule?uiText('Drag to propose a new date; confirmation required.'):''].filter(Boolean).join('\n')
}
const EMPTY:PlanTimeline={events:[],timezone:'UTC',from:'',to:'',truncated:false,retainedHistoryLimit:1000}
function useTimeData(filter:PlanFilter,from:string,to:string,timezone:string,generation:number){
  const [attempt,setAttempt]=useState(0),queryKey=JSON.stringify([filter,from,to,timezone]),requestKey=JSON.stringify([queryKey,generation,attempt])
  const [result,setResult]=useState({queryKey:'',requestKey:'',data:EMPTY,error:''})
  useEffect(()=>{let alive=true;void api.call<PlanTimeline>('plan.timeline',{filter,from,to,timezone,limit:1000}).then(data=>{if(alive)setResult({queryKey,requestKey,data,error:''})}).catch(cause=>{if(alive)setResult({queryKey,requestKey,data:EMPTY,error:cause.message})});return()=>{alive=false}},[requestKey])
  return {data:result.queryKey===queryKey?result.data:EMPTY,error:result.requestKey===requestKey?result.error:'',loading:result.requestKey!==requestKey,retry:()=>setAttempt(value=>value+1)}
}
function RangeControls({zone,hostZone,anchor,setAnchor,step,onZone,children}:{zone:string;hostZone:string;anchor:string;setAnchor:(value:string)=>void;step:'day'|'week'|'month';onZone:(zone:string)=>void;children?:React.ReactNode}){
  useI18n()

  const move=(sign:number)=>{const date=Temporal.PlainDate.from(anchor);setAnchor(date.add(step==='month'?{months:sign}:{days:sign*(step==='day'?1:7)}).toString())}
  return <div className="plan-time-controls">{children}<button aria-label={uiText("Previous period")} onClick={()=>move(-1)}><Icon name="chevron-left"/></button><button onClick={()=>setAnchor(Temporal.Now.plainDateISO(zone).toString())}>{uiText("Today")}</button><button aria-label={uiText("Next period")} onClick={()=>move(1)}><Icon name="chevron-right"/></button><input aria-label={uiText("Visible date")} type="date" value={anchor} onChange={event=>{if(/^\d{4}-\d{2}-\d{2}$/.test(event.target.value))setAnchor(event.target.value)}}/><select aria-label={uiText("Time view zone")} value={zone} onChange={event=>onZone(event.target.value)}>{zones(hostZone,zone).map(value=><option key={value}>{value}</option>)}</select></div>
}
function EventBadge({event}:{event:PlanTimeEvent}){
  useI18n()
return <span className={`plan-run-outcome outcome-${event.status}`}>{event.kind==='forecast'?(event.durationKind==='point'?uiText('Scheduled instant'):uiText('Estimated span')):uiText(event.status.replaceAll('_',' '))}</span>}

export function PlanTimelineView(props:Props){
  useI18n()

  const {filter,options,hostZone,generation,onOptions,onOpen}=props,zone=options.timezone??hostZone,scale=options.timelineScale??'week'
  const [anchor,setAnchor]=useState(()=>Temporal.Now.plainDateISO(zone).toString()),[error,setError]=useState('')
  const now=useClock()
  const [move,setMove]=useState<{event:PlanTimeEvent;at:string}|null>(null),[saving,setSaving]=useState(false),[drag,setDrag]=useState<{id:string;dx:number}|null>(null)
  const scroller=useRef<HTMLDivElement>(null),positioned=useRef('')
  const pointer=useRef<{event:PlanTimeEvent;x:number;dx:number}|null>(null),suppressed=useRef(false)
  useDialogFocus('.plan-move-confirm',!!move)
  useEffect(()=>{if(!move)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented&&!event.isComposing&&!saving){event.preventDefault();setMove(null)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[move,saving])
  const date=Temporal.PlainDate.from(anchor),first=scale==='month'?date.with({day:1}):scale==='week'?date.subtract({days:date.dayOfWeek-1}):date
  const count=scale==='month'?first.daysInMonth:scale==='week'?7:1,last=first.add({days:count}),from=midnight(first,zone).toInstant().toString(),to=midnight(last,zone).toInstant().toString()
  const {data,error:loadError,loading,retry}=useTimeData(filter,from,to,zone,generation)
  const boundaries=useMemo(()=>scale==='day'?Array.from({length:midnight(first,zone).hoursInDay+1},(_,i)=>midnight(first,zone).add({hours:i}).epochMilliseconds):Array.from({length:count+1},(_,i)=>midnight(first.add({days:i}),zone).epochMilliseconds),[anchor,zone,scale])
  const cell=scale==='day'?72:scale==='week'?150:60,width=cell*(boundaries.length-1)
  const position=(at:number)=>{
    if(at<=boundaries[0])return 0
    if(at>=boundaries.at(-1)!)return width
    let i=0;while(boundaries[i+1]<=at)i++
    return (i+(at-boundaries[i])/(boundaries[i+1]-boundaries[i]))*cell
  }
  const firstEvent=()=>{const el=scroller.current;if(el&&data.events.length){const labelWidth=el.querySelector<HTMLElement>('.plan-timeline-axis>strong')?.offsetWidth??260,cardLeft=Math.min(width-CARD_WIDTH,position(Date.parse(data.events[0].startAt))+10);el.scrollLeft=Math.max(0,cardLeft-Math.max(8,(el.clientWidth-labelWidth-CARD_WIDTH)/2))}}
  useLayoutEffect(()=>{if(!loading&&!data.events.length){positioned.current='';return}const key=from+to+zone+scale+JSON.stringify(filter);if(!loading&&data.events.length&&Date.parse(data.from)===Date.parse(from)&&positioned.current!==key){positioned.current=key;firstEvent()}},[data,from,to,zone,scale,loading,JSON.stringify(filter)])
  const grouped=useMemo(()=>{
    const groups=new Map<string,{id:string;title:string;employee:PlanTimeEvent['employee'];events:PlanTimeEvent[]}>()
    for(const event of data.events){const row=groups.get(event.jobId)??{id:event.jobId,title:event.name,employee:event.employee,events:[]};row.events.push(event);groups.set(event.jobId,row)}
    return [...groups.values()].sort((a,b)=>(a.employee?.title??'').localeCompare(b.employee?.title??'')||a.id.localeCompare(b.id))
  },[data.events])
  const finishDrag=(e:PointerEvent<HTMLButtonElement>)=>{
    const value=pointer.current;pointer.current=null;setDrag(null)
    if(!value)return
    try{e.currentTarget.releasePointerCapture(e.pointerId)}catch{}
    if(Math.abs(value.dx)<5)return
    suppressed.current=true
    const start=Temporal.Instant.from(value.event.startAt).toZonedDateTimeISO(zone)
    const offset=scale==='day'?Math.round(value.dx/cell*4)*15:Math.round(value.dx/cell)
    if(!offset)return
    const at=start.add(scale==='day'?{minutes:offset}:{days:offset}).toInstant().toString()
    setMove({event:value.event,at});setError('')
  }
  const confirm=async()=>{if(!move||saving)return;setSaving(true);try{await api.call('schedule.update',{id:move.event.jobId,patch:{rule:{kind:'once',at:move.at}},expectedRevision:move.event.jobRevision});setMove(null);setError('')}catch(cause){setError((cause as Error).message)}finally{setSaving(false)}}
  return <section className="plan-timeline-view plan-time-workspace" aria-label={uiText("Schedule timeline")} aria-busy={loading}>
    <RangeControls zone={zone} hostZone={hostZone} anchor={anchor} setAnchor={setAnchor} step={scale} onZone={timezone=>onOptions({timezone})}><select aria-label={uiText("Timeline scale")} value={scale} onChange={event=>onOptions({timelineScale:event.target.value as typeof scale})}><option value="day">{uiText("Day · 15-minute moves")}</option><option value="week">{uiText("Week")}</option><option value="month">{uiText("Month")}</option></select><button disabled={!data.events.length} onClick={firstEvent}>{uiText("First occurrence")}</button></RangeControls>
    <div className="plan-time-legend"><span><i className="estimate"/>{uiText("Estimated duration")}</span><span><i className="actual"/>{uiText("Recorded run attempt")}</span><span>{uiText("◆ No estimate · instant only")}</span><small title={uiText("Timeout is a safety limit, not a duration. Drag only future one-time tasks; recurring rules open in the editor.")}>{uiText('Cards show details; the line shows duration.')}</small></div>
    {error&&<p className="plan-error" role="alert">{error}</p>}{loadError&&<div className="plan-error plan-time-error" role="alert"><span>{loadError}</span><button onClick={retry}>{uiText('Retry')}</button></div>}{loading&&<div className="plan-time-loading" role="status"><Icon name="loading"/>{uiText('Loading…')}</div>}{data.truncated&&<p className="plan-calendar-warning">{uiText("Bounded results. Narrow the date range or filter to inspect every occurrence.")}</p>}
    {!loading&&!loadError&&!data.events.length&&<div className="plan-empty"><h2>{uiText("No occurrences in this period")}</h2><p>{uiText("Change the date or filters. Paused schedules remain in Table and Board.")}</p></div>}
    {data.events.length>0&&<div className="plan-timeline-scroll" ref={scroller}><div className="plan-timeline-grid" style={{width:`calc(${width}px + var(--plan-time-label-width))`}}>
      <div className="plan-timeline-axis"><strong>{uiText("Schedule / employee")}</strong><div style={{width}}>{boundaries.slice(0,-1).map((at,i)=><span key={at} style={{width:cell}}>{scale==='day'?<><time>{new Date(at).toLocaleTimeString(interfaceLocale(),{timeZone:zone,hour:'2-digit',minute:'2-digit',hour12:false})}</time><small>{new Intl.DateTimeFormat(interfaceLocale(),{timeZone:zone,timeZoneName:'short'}).formatToParts(at).find(part=>part.type==='timeZoneName')?.value}</small></>:new Date(at).toLocaleDateString(interfaceLocale(),{timeZone:zone,weekday:scale==='week'?'short':undefined,day:'numeric'})}</span>)}</div></div>
      {grouped.map(row=>{
        const lanes:number[]=[],events=row.events.map(event=>{
          const start=Date.parse(event.startAt),end=event.endAt?Date.parse(event.endAt):event.durationKind==='elapsed'?now:start,left=position(start),spanWidth=Math.max(0,position(end)-left)
          const cardLeft=Math.min(width-CARD_WIDTH,left+10),occupiedLeft=Math.min(left,cardLeft),occupiedRight=Math.max(left+spanWidth,cardLeft+CARD_WIDTH)
          let lane=lanes.findIndex(until=>until<=occupiedLeft);if(lane<0)lane=lanes.length;lanes[lane]=occupiedRight+12
          return {event,left,spanWidth,cardLeft,occupiedLeft,occupiedRight,lane}
        })
        return <div className="plan-timeline-row" key={row.id} data-timeline-job={row.id} style={{height:lanes.length*LANE_HEIGHT+16}}><button className="plan-timeline-label" disabled={!row.events.some(event=>event.jobAvailable)} onClick={()=>onOpen(row.id)} title={row.title}><strong>{row.title}</strong><span className="plan-person">{row.employee?<EmployeePortrait avatar={row.employee.avatar as any} color={row.employee.color}/>:<span className="plan-person-missing" aria-hidden="true"><Icon name="person"/></span>}<span>{row.employee?.title??uiText("Removed employee")}<small>{row.employee?.team??''}</small></span></span></button><div className="plan-timeline-track" style={{width,backgroundSize:`${cell}px 100%`}}>
          {now>=boundaries[0]&&now<boundaries.at(-1)!&&<i className="plan-timeline-now" style={{left:position(now)}}/>}
          {events.map(({event,left,spanWidth,cardLeft,occupiedLeft,occupiedRight,lane})=><button key={event.id} data-time-event={event.id} disabled={!event.jobAvailable} aria-label={eventDescription(event,zone,now)} title={eventDescription(event,zone,now)} className={`plan-timeline-bar ${event.kind} ${event.durationKind} event-${event.status} ${event.canReschedule?'movable':''}`} style={{left:occupiedLeft,width:occupiedRight-occupiedLeft,top:8+lane*LANE_HEIGHT,transform:drag?.id===event.id?`translateX(${drag.dx}px)`:undefined}} onClick={e=>{if(!suppressed.current||e.detail===0)onOpen(event.jobId);suppressed.current=false}} onPointerDown={e=>{suppressed.current=false;if(!event.jobAvailable||!event.canReschedule||e.button!==0)return;pointer.current={event,x:e.clientX,dx:0};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(pointer.current?.event.id===event.id){pointer.current.dx=e.clientX-pointer.current.x;setDrag({id:event.id,dx:pointer.current.dx})}}} onPointerUp={finishDrag} onPointerCancel={()=>{pointer.current=null;setDrag(null)}}>
            <i className="plan-time-span" aria-hidden="true" style={{left:left-occupiedLeft,width:spanWidth}}/><i className="plan-time-marker" aria-hidden="true" style={{left:left-occupiedLeft}}/>
            <span className="plan-time-event-card" style={{left:cardLeft-occupiedLeft,width:CARD_WIDTH}}><span className="plan-time-event-heading"><time dateTime={event.startAt}>{timeLabel(event.startAt,zone,event.kind==='run')}</time><EventBadge event={event}/></span><strong className="plan-time-event-name">{event.name}</strong><span className="plan-time-event-duration">{eventDuration(event,now)}</span>{(event.message||!event.jobAvailable)&&<span className="plan-time-event-message">{event.jobAvailable?event.message:uiText('Schedule removed · history preserved')}</span>}</span>
          </button>)}
        </div></div>

      })}
    </div></div>}
    <p className="plan-time-footnote">{uiText("Spans sharing an employee can overlap visually. Existing scheduler busy rules still apply; an estimate does not reserve the employee.")}</p>
    {move&&createPortal(<div className="plan-editor-overlay"><div className="plan-editor-backdrop" onClick={()=>{if(!saving)setMove(null)}}/><section className="plan-move-confirm" role="dialog" aria-modal="true" aria-label={uiText("Confirm schedule move")} onKeyDown={e=>{if(e.key==='Escape'&&!saving){e.stopPropagation();setMove(null)}}}><h2>{uiText("Move this one-time task?")}</h2><strong>{move.event.name}</strong><dl><dt>{uiText("From")}</dt><dd>{dateLabel(move.event.startAt,zone)}</dd><dt>{uiText("To")}</dt><dd>{dateLabel(move.at,zone)} · {zone}</dd></dl><p>{uiText("The employee, prompt, estimate and history stay unchanged. A concurrent change will reject this move.")}</p>{error&&<p className="plan-error" role="alert">{error}</p>}<footer><button disabled={saving} onClick={()=>{setMove(null);setError('')}}>{uiText("Keep original")}</button><button className="primary" disabled={saving} onClick={()=>void confirm()}>{uiText("Confirm move")}</button></footer></section></div>,document.body)}
  </section>
}

export function PlanPlannerView({filter,options,hostZone,generation,onOptions,onOpen}:Props){
  useI18n()

  const zone=options.timezone??hostZone,mode=options.plannerMode??'week'
  const [anchor,setAnchor]=useState(()=>Temporal.Now.plainDateISO(zone).toString()),now=useClock()
  const date=Temporal.PlainDate.from(anchor),first=mode==='week'?date.subtract({days:date.dayOfWeek-1}):date,count=mode==='day'?1:7,last=first.add({days:count})
  const {data,error,loading,retry}=useTimeData(filter,midnight(first,zone).toInstant().toString(),midnight(last,zone).toInstant().toString(),zone,generation)
  const eventList=(day:Temporal.PlainDate)=>{const begin=midnight(day,zone).epochMilliseconds,end=midnight(day.add({days:1}),zone).epochMilliseconds;return data.events.filter(event=>{const start=Date.parse(event.startAt),finish=event.endAt?Date.parse(event.endAt):event.durationKind==='elapsed'?now:start;return start<end&&(finish>begin||start>=begin)})}
  return <section className={`plan-planner-view plan-time-workspace mode-${mode}`} aria-label={uiText("Day and week planner")} aria-busy={loading}>
    <RangeControls zone={zone} hostZone={hostZone} anchor={anchor} setAnchor={setAnchor} step={mode==='day'?'day':'week'} onZone={timezone=>onOptions({timezone})}><select aria-label={uiText("Planner mode")} value={mode} onChange={event=>onOptions({plannerMode:event.target.value as typeof mode})}><option value="day">{uiText("Day")}</option><option value="week">{uiText("Week")}</option><option value="agenda">{uiText("Agenda · next seven days")}</option></select></RangeControls>
    {error&&<div className="plan-error plan-time-error" role="alert"><span>{error}</span><button onClick={retry}>{uiText('Retry')}</button></div>}{loading&&<div className="plan-time-loading" role="status"><Icon name="loading"/>{uiText('Loading…')}</div>}{data.truncated&&<p className="plan-calendar-warning">{uiText("Some high-frequency occurrences are omitted. Narrow the date range or filters.")}</p>}
    {!error&&(!loading||data.events.length>0)&&<div className="plan-planner-scroll"><div className="plan-planner-days">{Array.from({length:count},(_,i)=>first.add({days:i})).map(day=>{const events=eventList(day),today=day.toString()===Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(zone).toPlainDate().toString();return <section className={`plan-planner-day ${today?'is-today':''}`} key={day.toString()} data-planner-date={day.toString()}><header><strong>{new Date(midnight(day,zone).epochMilliseconds).toLocaleDateString(interfaceLocale(),{timeZone:zone,weekday:'short',month:'short',day:'numeric'})}</strong><span>{events.length} {uiText("occurrences")}</span></header>{events.map(event=><button className={`plan-planner-event ${event.kind} event-${event.status}`} data-time-event={event.id} key={event.id} disabled={!event.jobAvailable} onClick={()=>onOpen(event.jobId)} title={eventDescription(event,zone,now)}><time dateTime={event.startAt}>{Date.parse(event.startAt)<midnight(day,zone).epochMilliseconds?uiText("Continues"):timeLabel(event.startAt,zone,event.kind==='run')}</time><span className="plan-planner-event-main"><strong>{event.name}</strong><span className="plan-person">{event.employee?<EmployeePortrait avatar={event.employee.avatar as any} color={event.employee.color}/>:<span className="plan-person-missing" aria-hidden="true"><Icon name="person"/></span>}<span>{event.employee?.title??uiText("Removed employee")}<small>{event.employee?.team}</small></span></span></span><span className="plan-planner-event-meta"><EventBadge event={event}/><small>{eventDuration(event,now)}</small></span>{event.message&&<span className="plan-planner-event-message">{event.message}</span>}{!event.jobAvailable&&<span className="plan-planner-event-message">{uiText("Schedule removed · history preserved")}</span>}</button>)}{!events.length&&<p className="plan-column-empty">{uiText("No scheduled work")}</p>}</section>})}</div></div>}

  </section>
}
