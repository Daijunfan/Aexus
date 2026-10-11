import {randomUUID} from 'node:crypto'
import {join} from 'node:path'
import {APP_HOME} from '../shared/protocol'
import {atomicJson,readJson} from './atomic-file'
import {authorize,requestContext,visibleEmployees,canSchedule,isAppAdministrator} from './authorization'
import {readStore} from './store'
import {scheduleRequest,scheduleCapabilities} from './scheduler/service'
import {instant,forecastSchedule} from './scheduler/time'
import {BUILTIN_PLAN_VIEWS,PLAN_STATES,PLAN_PRIORITIES,PLAN_LAYOUTS,PLAN_LAYOUT_CATALOG,PLAN_RUN_STATES,planState,type PlanView,type PlanViewSpec,type PlanViewOptions,type PlanFilter,type PlanRow,type PlanEmployee,type PlanTimeEvent,type PlanFeedEntry} from '../shared/plan'
import type {ScheduledJob,ScheduleRun} from '../shared/scheduler'

const file=join(APP_HOME,'plan-views.json')
let emit:()=>void=()=>{}
export const setPlanEmitter=(handler:()=>void)=>{emit=handler}
const catalog=()=>readJson<PlanView[]>(file,()=>[],value=>Array.isArray(value)&&value.every(view=>typeof view.id==='string'&&view.id.startsWith('pv_')&&typeof view.name==='string'&&PLAN_LAYOUTS.includes(view.layout)&&!!view.owner))
const own=(view:PlanView)=>{const p=requestContext().principal;return isAppAdministrator(p)||p.kind==='agent'&&view.owner?.kind==='agent'&&view.owner.employeeId===p.employeeId}
function fields(value:Record<string,any>,allowed:string[]){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Expected an object')
  for(const key of Object.keys(value))if(!allowed.includes(key)&&value[key]!==undefined)throw Error('Unknown Plan field: '+key)
}
function filter(value:PlanFilter={}):PlanFilter{
  fields(value,['search','employee','team','channel','states','priorities','tags'])
  for(const key of ['search','employee','team','channel'] as const)if(value[key]!==undefined&&(typeof value[key]!=='string'||value[key]!.length>240))throw Error('Invalid '+key)
  for(const [key,allowed] of [['states',PLAN_STATES],['priorities',PLAN_PRIORITIES]] as const)if(value[key]!==undefined&&(!Array.isArray(value[key])||value[key]!.some(v=>!(allowed as readonly string[]).includes(v))))throw Error('Invalid '+key)
  if(value.tags!==undefined&&(!Array.isArray(value.tags)||value.tags.length>20||value.tags.some(tag=>typeof tag!=='string'||!tag.trim()||tag.length>40)))throw Error('Invalid tags')
  if(value.employee==='self'){
    const p=requestContext().principal
    if(p.kind!=='agent')throw Error('self requires an authenticated employee')
    return {...value,employee:p.employeeId}
  }
  return {...value}
}
function timezone(value:unknown):string{
  const zone=value??Intl.DateTimeFormat().resolvedOptions().timeZone
  if(typeof zone!=='string'||/^[+-]/.test(zone))throw Error('Use an IANA timezone')
  new Intl.DateTimeFormat('en',{timeZone:zone}).format(0)
  return zone
}
function options(value:PlanViewOptions={}):PlanViewOptions{
  fields(value,['timezone','timelineScale','plannerMode','chartMetric','chartGroupBy','chartType'])
  const choices={timelineScale:['day','week','month'],plannerMode:['day','week','agenda'],chartMetric:['schedules','runs'],chartGroupBy:['status','employee','team','priority'],chartType:['bar','horizontal','line','donut']}
  for(const [key,values] of Object.entries(choices))if(value[key as keyof PlanViewOptions]!==undefined&&!values.includes(value[key as keyof PlanViewOptions]!))throw Error('Invalid '+key)
  return {...value,...(value.timezone!==undefined?{timezone:timezone(value.timezone)}:{})}
}
const viewFields=['name','layout','groupBy','filter','sort','direction','options']
function viewSpec(value:PlanViewSpec):PlanViewSpec{
  fields(value,viewFields)
  if(typeof value.name!=='string'||!value.name.trim()||value.name.length>80)throw Error('View name must contain 1–80 characters')
  if(!PLAN_LAYOUTS.includes(value.layout))throw Error('Choose a layout returned by plan.schema')
  if(!['status','employee','priority'].includes(value.groupBy??'status'))throw Error('Invalid grouping')
  if(!['nextAt','name','updatedAt','priority'].includes(value.sort??'nextAt')||!['asc','desc'].includes(value.direction??'asc'))throw Error('Invalid Plan sorting')
  return {name:value.name.trim(),layout:value.layout,groupBy:value.groupBy??'status',filter:filter(value.filter),sort:value.sort??'nextAt',direction:value.direction??'asc',...(value.options===undefined?{}:{options:options(value.options)})}
}
function matches(row:PlanRow,query:PlanFilter){
  return (!query.channel||row.action.channelId===query.channel||row.source==='channel:'+query.channel)&&(!query.employee||row.action.employeeId===query.employee)&&(!query.team||row.employee?.team===query.team)&&(!query.states?.length||query.states.includes(row.status))&&(!query.priorities?.length||query.priorities.includes(row.plan?.priority??'normal'))&&(!query.tags?.length||query.tags.every(tag=>row.plan?.tags.includes(tag)))&&(!query.search||[row.id,row.name,row.action.employeeId,row.action.prompt,row.employee?.title,row.employee?.team,row.employee?.role,row.plan?.notes,...(row.plan?.tags??[])].join(' ').toLowerCase().includes(query.search.toLowerCase()))
}
/** Read models consume only scheduler-authorized records, never raw persistent files. */
async function snapshot(){
  const jobs=await scheduleRequest('list',{}) as ScheduledJob[],runs=await scheduleRequest('history',{limit:1000}) as ScheduleRun[]
  const people=new Map<string,PlanEmployee>(readStore().sessions.filter(card=>!card.deleting).map(card=>[card.id,{id:card.id,title:card.title,team:card.group,avatar:card.avatar??(card.engine==='codex'?'robot':'cat'),color:card.color,engine:card.engine,role:card.managementRole??'employee'}]))
  const latest=new Map<string,ScheduleRun>()
  for(const run of runs)if(!latest.has(run.jobId)||run.status==='running')latest.set(run.jobId,run)
  const rows:PlanRow[]=jobs.map(job=>({...job,status:planState(job,latest.get(job.id)),lastRun:latest.get(job.id),employee:people.get(job.action.employeeId)??null,target:{id:job.action.employeeId,exists:people.has(job.action.employeeId),role:people.get(job.action.employeeId)?.role??null,title:people.get(job.action.employeeId)?.title??null,team:people.get(job.action.employeeId)?.team??null,engine:job.action.engine},timing:{timezone:'timezone' in job.rule?job.rule.timezone:null,kind:job.rule.kind,nextAt:job.nextAt,until:job.until??null,window:job.window??null},...scheduleCapabilities(job)}))
  return {jobs,rows,runs,people,byId:new Map(rows.map(row=>[row.id,row]))}
}
function dateRange(args:Record<string,any>,required=false){
  if((args.from===undefined)!==(args.to===undefined))throw Error('Provide both from and to')
  if(args.from===undefined){if(required)throw Error('from and to are required');return undefined}
  const from=Date.parse(instant(args.from)),to=Date.parse(instant(args.to))
  if(to<=from||to-from>93*86400000)throw Error('Range must be greater than zero and at most 93 days')
  return {from,to}
}
function runEntries(data:Awaited<ReturnType<typeof snapshot>>,query:PlanFilter,args:Record<string,any>):PlanFeedEntry[]{
  const range=dateRange(args),states=args.outcomes
  if(states!==undefined&&(!Array.isArray(states)||states.some(state=>!PLAN_RUN_STATES.includes(state))))throw Error('Invalid run outcomes')
  return data.runs.filter(run=>{
    if(range&&(Date.parse(run.startedAt)<range.from||Date.parse(run.startedAt)>=range.to))return false
    if(states?.length&&!states.includes(run.status))return false
    const row=data.byId.get(run.jobId)
    // Deleted schedules have no current priority/tags/state; never invent those properties.
    if(row)return matches({...row,name:run.jobName,action:run.action,employee:data.people.get(run.action.employeeId)??null},query)
    if(query.states?.length||query.priorities?.length||query.tags?.length)return false
    const employee=data.people.get(run.action.employeeId)
    return (!query.channel||run.action.channelId===query.channel)&&(!query.employee||query.employee===run.action.employeeId)&&(!query.team||query.team===employee?.team)&&(!query.search||[run.jobName,run.action.prompt,employee?.title,employee?.team,run.message].join(' ').toLowerCase().includes(query.search.toLowerCase()))
  }).map(run=>({...run,employee:data.people.get(run.action.employeeId)??null,jobAvailable:data.byId.has(run.jobId),plan:data.byId.get(run.jobId)?.plan}))
}
async function temporalView(args:Record<string,any>,timeline:boolean){
  fields(args,['from','to','timezone','filter','limit'])
  const {from,to}=dateRange(args,true)!,zone=timezone(args.timezone),limit=args.limit??500
  if(!Number.isInteger(limit)||limit<1||limit>2000)throw Error('Calendar limit must be 1–2000')
  const data=await snapshot(),query=filter(args.filter),rows=data.rows.filter(row=>matches(row,query)),ids=new Set(rows.map(row=>row.id)),now=Date.now()
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'})
  const date=(at:string)=>{const parts=Object.fromEntries(formatter.formatToParts(new Date(at)).map(p=>[p.type,p.value]));return parts.year+'-'+parts.month+'-'+parts.day}
  const events:PlanTimeEvent[]=[];let truncated=false
  for(const run of data.runs){
    if(!ids.has(run.jobId))continue
    const start=Date.parse(timeline?run.startedAt:run.scheduledAt),end=run.finishedAt?Date.parse(run.finishedAt):now
    if(timeline?(start>=to||(end>start?end<=from:start<from)):(start<from||start>=to))continue
    const at=new Date(start).toISOString()
    events.push({id:run.id,jobId:run.jobId,runId:run.id,name:run.jobName,employeeId:run.action.employeeId,employee:data.people.get(run.action.employeeId)??null,at,date:date(at),startAt:run.startedAt,endAt:run.finishedAt??null,status:run.status,kind:'run',durationKind:run.finishedAt?'actual':'elapsed',jobAvailable:true,canReschedule:false,trigger:run.trigger,message:run.message,scheduledAt:run.scheduledAt})
  }
  for(const row of rows){
    if(!row.enabled||!row.nextAt)continue
    const estimate=row.plan?.durationMinutes,duration=timeline?(estimate??0)*60000:0
    // Include a future estimate starting before the viewport if it crosses its left edge.
    const after=Math.max(from-duration-1,now-1),times=forecastSchedule(row,after,100,now)
    if(times.length===100&&Date.parse(times.at(-1)!)<to){const more=forecastSchedule(row,Date.parse(times.at(-1)!),1,now);if(more.length&&Date.parse(more[0])<to)truncated=true}
    for(const at of times){
      const start=Date.parse(at)
      if(start>=to||(duration?start+duration<=from:start<from))continue
      events.push({id:row.id+':'+at,jobId:row.id,name:row.name,employeeId:row.action.employeeId,employee:row.employee,at,date:date(at),startAt:at,endAt:estimate?new Date(start+estimate*60000).toISOString():null,status:'scheduled',kind:'forecast',durationKind:estimate?'estimate':'point',estimatedMinutes:estimate,jobAvailable:true,jobRevision:row.revision??0,canReschedule:row.rule.kind==='once'&&row.status!=='running'})
    }
  }
  events.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id))
  return {timezone:zone,from:new Date(from).toISOString(),to:new Date(to).toISOString(),events:events.slice(0,limit),truncated:truncated||events.length>limit,retainedHistoryLimit:1000}
}
export async function planRequest(method:string,args:Record<string,any>){
  authorize('plan.'+method,args)
  if(method==='schema')return {
    version:1,layouts:PLAN_LAYOUTS,layoutCatalog:PLAN_LAYOUT_CATALOG,states:PLAN_STATES,runStates:PLAN_RUN_STATES,priorities:PLAN_PRIORITIES,
    properties:[{id:'name',type:'title'},{id:'status',type:'computed-status',editable:false},{id:'employee',type:'employee-relation'},{id:'nextAt',type:'computed-date',editable:false},{id:'rule',type:'recurrence'},{id:'priority',type:'select'},{id:'tags',type:'multi-select'},{id:'notes',type:'text'},{id:'durationMinutes',type:'estimate-minutes',description:'Optional timeline estimate, independent of timeout and actual run duration'},{id:'prompt',type:'long-text'},{id:'lastRun',type:'run-relation',editable:false}],
    scheduler:await scheduleRequest('schema',{}),targets:visibleEmployees().filter(card=>canSchedule(requestContext().principal,card.id)).map(card=>({id:card.id,title:card.title,team:card.group,engine:card.engine,role:card.managementRole??'employee'})),
    data:{records:'plan.query',details:'schedule.get',create:'schedule.create',edit:'schedule.update',pause:'schedule.pause',resume:'schedule.resume',remove:'schedule.delete',preview:'schedule.preview',run:'schedule.run',history:'schedule.history',cancel:'schedule.cancel',timeline:'plan.timeline',analytics:'plan.analytics',feed:'plan.feed'},
    policies:{identity:'Same saved employee and native conversation in every view',permission:'All roles schedule themselves; other targets must be strictly lower roles within the existing Team/global scope. Non-global actors edit only authored schedules. Timed, recurring and event jobs all use schedule.*',availability:'Core must be running and host awake; closed UI is supported by agents serve',busy:'Skip rather than interrupt existing manual work',calendar:'Future enabled occurrences and actual recorded runs only; bounded results, never fabricated past executions',timeline:'Forecast spans use optional plan.durationMinutes; actual runs use startedAt/finishedAt. Timeout is not an estimate. One-off rescheduling uses schedule.update with expectedRevision; recurring occurrences require editing their rule.',analytics:'Aggregates all authorized matching schedules or retained runs, not a page. Runs are bounded to retained history; linked Team/priority refer to current records, not invented historic snapshots.',form:'Authenticated schedule creation only; no public links or new execution path'}
  }
  if(method==='views'){fields(args,[]);return [...BUILTIN_PLAN_VIEWS,...catalog().filter(own)]}
  if(method==='view-create'){
    fields(args,['spec']);const spec=viewSpec(args.spec),view:PlanView={...spec,id:'pv_'+randomUUID(),owner:requestContext().principal,revision:1};atomicJson(file,[...catalog(),view],true);emit();return view
  }
  if(method==='view-update'||method==='view-delete'){
    fields(args,method==='view-update'?['id','patch','expectedRevision']:['id','expectedRevision'])
    const all=catalog(),index=all.findIndex(view=>view.id===args.id),view=all[index]
    if(!view||!own(view))throw Error('Unknown or unauthorized saved Plan view; built-in views cannot be changed')
    if(args.expectedRevision!==undefined&&args.expectedRevision!==view.revision)throw Error('Plan view changed; reload before saving')
    if(method==='view-delete'){all.splice(index,1);atomicJson(file,all,true);emit();return {deleted:true}}
    fields(args.patch,viewFields)
    const next=viewSpec({...view,...args.patch,id:undefined,owner:undefined,revision:undefined} as any)
    all[index]={...next,id:view.id,owner:view.owner,revision:view.revision+1};atomicJson(file,all,true);emit();return all[index]
  }
  if(method==='query'){
    fields(args,['filter','sort','direction','offset','limit']);const query=filter(args.filter),data=await snapshot(),all=data.rows.filter(row=>matches(row,query)),offset=args.offset??0,limit=args.limit??100,sort=args.sort??'nextAt',direction=args.direction??'asc'
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>500)throw Error('Use nonnegative offset and limit 1–500')
    if(!['nextAt','name','updatedAt','priority'].includes(sort)||!['asc','desc'].includes(direction))throw Error('Invalid sort')
    const value=(row:PlanRow)=>sort==='priority'?PLAN_PRIORITIES.indexOf(row.plan?.priority??'normal'):sort==='name'?row.name.toLocaleLowerCase():sort==='updatedAt'?Date.parse(row.updatedAt):row.nextAt?Date.parse(row.nextAt):Number.MAX_SAFE_INTEGER
    all.sort((a,b)=>{const x=value(a),y=value(b);return (typeof x==='string'&&typeof y==='string'?x.localeCompare(y):Number(x)-Number(y))*(direction==='asc'?1:-1)||a.id.localeCompare(b.id)})
    return {now:new Date().toISOString(),hostTimezone:Intl.DateTimeFormat().resolvedOptions().timeZone,rows:all.slice(offset,offset+limit),total:all.length,offset,hasMore:offset+limit<all.length,counts:Object.fromEntries(PLAN_STATES.map(state=>[state,all.filter(row=>row.status===state).length])),facets:{tags:[...new Set(data.rows.flatMap(row=>row.plan?.tags??[]))].sort()}}
  }
  if(method==='calendar'||method==='timeline')return temporalView(args,method==='timeline')
  if(method==='analytics'){
    fields(args,['metric','groupBy','filter','outcomes','from','to'])
    const metric=args.metric??'schedules',groupBy=args.groupBy??'status',query=filter(args.filter),data=await snapshot()
    if(!['schedules','runs'].includes(metric)||!['status','employee','team','priority'].includes(groupBy))throw Error('Invalid analytics metric or grouping')
    if(metric==='schedules'&&(args.from!==undefined||args.to!==undefined||args.outcomes!==undefined))throw Error('Date range and outcomes apply to the runs metric only')
    const entries=metric==='schedules'?data.rows.filter(row=>matches(row,query)):runEntries(data,query,args),buckets=new Map<string,{key:string;label:string;value:number}>()
    for(const entry of entries){
      const employee=entry.employee,key=groupBy==='status'?entry.status:groupBy==='employee'?entry.action.employeeId:groupBy==='team'?(employee?'team:'+employee.team:'missing:team'):entry.plan?.priority??(metric==='runs'&&!(entry as PlanFeedEntry).jobAvailable?'__unknown__':'normal')
      const label=groupBy==='employee'?(employee?employee.title+' · '+employee.team:'Removed employee · '+entry.action.employeeId):groupBy==='team'?(employee?.team??'Removed employee'):key==='__unknown__'?'Unknown (removed schedule)':key.replaceAll('_',' ')
      const bucket=buckets.get(key)??{key,label,value:0};bucket.value++;buckets.set(key,bucket)
    }
    return {metric,groupBy,total:entries.length,buckets:[...buckets.values()].sort((a,b)=>b.value-a.value||a.key.localeCompare(b.key)),scope:metric==='schedules'?'All matching authorized schedules, across every page':'All matching retained runs; current linked employee and schedule metadata',...(metric==='runs'?{retainedHistoryLimit:1000}:{})}
  }
  if(method==='feed'){
    fields(args,['filter','outcomes','from','to','before','limit']);const limit=args.limit??30
    if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Feed limit must be 1–100')
    const data=await snapshot(),entries=runEntries(data,filter(args.filter),args).sort((a,b)=>b.startedAt.localeCompare(a.startedAt)||b.id.localeCompare(a.id))
    let before:{at:string;id:string}|undefined
    if(args.before!==undefined){if(typeof args.before!=='string'||args.before.length>512)throw Error('Invalid feed cursor');try{before=JSON.parse(Buffer.from(args.before,'base64url').toString());if(!before||typeof before.id!=='string'||typeof before.at!=='string')throw Error();instant(before.at)}catch{throw Error('Invalid feed cursor')}}
    const filtered=before?entries.filter(run=>run.startedAt<before!.at||run.startedAt===before!.at&&run.id<before!.id):entries,page=filtered.slice(0,limit),hasMore=filtered.length>limit,last=page.at(-1)
    return {entries:page,hasMore,nextCursor:hasMore&&last?Buffer.from(JSON.stringify({at:last.startedAt,id:last.id})).toString('base64url'):null,retainedHistoryLimit:1000}
  }
  throw Error('Unknown Plan method')
}
