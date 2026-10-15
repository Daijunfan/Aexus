// Aexus Plan-inspired local scheduler for native CloudHosts Agent sessions.
// No roles, bootstrap prompts or model-context mirroring. A scheduled Agent
// action sends exactly the text the user saved, once, to one exact native ID.
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const registry=require('./registry.cjs'),groups=require('./collaboration.cjs');
const hosts=require('./agent-hosts.cjs'),journal=require('./session-journal.cjs'),occupancy=require('./agent-occupancy.cjs');
const planTime=require('./plan-time.cjs');
const taskService=require('./agent-task-service.cjs');
const file=()=>path.join(registry.home,'plans.json');
const clone=value=>structuredClone(value);
const iso=ms=>new Date(ms).toISOString();
const date=value=>{const ms=Date.parse(value);if(!Number.isFinite(ms)||typeof value!=='string')throw Error('Use a valid ISO date/time');return ms};
const text=(value,label,max=16000)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw Error(label+' must contain 1–'+max+' characters');return value.trim()};
function normalizedTags(tags=[]){
 if(!Array.isArray(tags)||tags.length>20)throw Error('Plan tags must be an array of at most 20 items');
 const unique=new Set();
 for(const value of tags){const tag=text(value,'Plan tag',40);if(unique.has(tag))throw Error('Duplicate Plan tag');unique.add(tag)}
 return [...unique];
}
const agentList=()=>require('./agent-sessions.cjs').sessions();
const actions=new Map();
const activeStates=new Set(['dispatching','submitted','running']);
const activeRuns=(data,id)=>data.runs.filter(run=>run.jobId===id&&activeStates.has(run.status));
function requireRunAuthorization(job,action){
 if(!job.createdBy?.startsWith('agent:'))return;
 const creator=job.createdBy.slice(6),company=require('./company.cjs');
 if(action.type!=='agent'||action.mode!=='resume'||
  !company.canManage({kind:'agent',agentId:creator},action.agentId,'schedule'))
  throw Error('Scheduled Agent creator no longer has permission for this target');
 if(action.groupId){const group=groups.get({id:action.groupId});
  if(group.archived||!group.memberIds.includes(creator))throw Error('Scheduled Agent creator no longer belongs to the publication group');
 }
}
function assertNotRunning(data,id){
 if(actions.has(id)||activeRuns(data,id).length)throw Error('Cannot change or archive a Plan while its native run is active. Cancel that run or await its terminal event.');
}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
let timer=null,working=false,unsubscribe=null;
function state(){
 if(!fs.existsSync(file()))return {version:1,jobs:[],runs:[]};
 if(fs.lstatSync(file()).isSymbolicLink())throw Error('Plan database cannot be a symlink');
 const row=JSON.parse(fs.readFileSync(file(),'utf8'));
 if(!row||row.version!==1||!Array.isArray(row.jobs)||!Array.isArray(row.runs))throw Error('Invalid Plan database');
 return row;
}
function write(data){
 fs.mkdirSync(registry.home,{recursive:true,mode:0o700});
 const tmp=file()+'.'+process.pid+'.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(tmp,file());queueMicrotask(()=>require('./core-events.cjs').publish('plan-change'))}
 finally{fs.rmSync(tmp,{force:true})}
}
function byId(data,id){const item=data.jobs.find(row=>row.id===id);if(!item)throw Error('Unknown Plan task');return item}
function actionSpec(action){
 if(!action||typeof action!=='object'||Array.isArray(action))throw Error('Choose a Plan action');
 const body=text(action.text,'Task instruction or reminder');
 if(action.type==='notice'){
  if(action.groupId!==undefined){const group=groups.get({id:action.groupId});if(group.archived)throw Error('Cannot publish to an archived group')}
  return {type:'notice',text:body,...(action.groupId?{groupId:action.groupId}:{})};
 }
 if(action.type==='agent'){
  const groupId=action.groupId;
  if(groupId!==undefined){const group=groups.get({id:groupId});if(group.archived)throw Error('Cannot publish results to an archived group')}
  const mode=action.mode||(action.agentId?'resume':'fresh');
  if(mode==='fresh'){
   if(action.engine!=='codex')throw Error('Scheduled independent runs currently require native Codex');
   const linked=action.workspaceId?require('./workspaces.cjs').get({id:action.workspaceId}):null;
   const host=hosts.get(linked?.hostId||action.hostId||'local');
   if(linked&&action.hostId&&action.hostId!==linked.hostId)throw Error('Workspace and Plan host mismatch');
   const directory=hosts.directory(host,linked?.directory||action.directory);
   const permission=action.permission||'ask';
   if(!['ask','full'].includes(permission))throw Error('Invalid scheduled Agent permission');
   return {type:'agent',mode:'fresh',engine:'codex',hostId:host.id,
    workspaceId:linked?.id||require('./workspaces.cjs').identity(host.id,directory).id,
    directory,permission,text:body,...(groupId?{groupId}:{})};
  }
  if(mode==='resume'){
   if(typeof action.agentId!=='string'||!action.agentId)throw Error('Select the exact existing native Agent session');
   const role=agentList().find(row=>row.id===action.agentId);
   if(!role)throw Error('Unknown Agent session');
   if(!['codex','claude','pi','cline'].includes(role.engine)||!['native','pty'].includes(role.transport))throw Error('Unsupported structured Agent transport');
   const identity=role.transport==='native'?role.threadId:
     require('./agent-sessions.cjs').executionIdentity({id:role.targetHostId,session:role.id}).collaborationSessionId;
   if(!identity)throw Error('An exact native collaboration identity is required');
   return {type:'agent',mode:'resume',text:body,engine:role.engine,agentId:role.id,hostId:role.targetHostId,
    engineHostId:role.engineHostId,threadId:identity,engineIdentity:role.engineIdentity?clone(role.engineIdentity):null,
    ...(groupId?{groupId}:{})};
  }
  throw Error('Plan context mode must be fresh or resume');
 }
 throw Error('Plan action must be notice or agent');
}
function ruleSpec(rule,now=Date.now()){return planTime.validate(rule,now)}
function nextAt(rule,now=Date.now()){return planTime.next(rule,now)}
function countNext(job,now){return job.rule.kind==='once'?null:nextAt(job.rule,now)}
function preview({rule,after,count=5}={}){
 return planTime.preview(ruleSpec(rule,Date.parse(after)||Date.now()),after?date(after):Date.now(),count);
}
function list({includeArchived=false}={}){
 const data=state();return clone(data.jobs.filter(row=>includeArchived||!row.archived).map(row=>({
  ...row,lastRun:data.runs.findLast(run=>run.jobId===row.id)||null
 })));
}
function get({id}){const data=state(),job=byId(data,id);return clone({...job,lastRun:data.runs.findLast(run=>run.jobId===id)||null})}
function create({name,action,rule,enabled=false,notes='',priority='normal',tags=[],graceSeconds=120,clientRequestId,createdBy='operator'}={}){
  if(typeof createdBy!=='string'||!/^(?:operator|agent:[a-zA-Z0-9_-]{1,180})$/.test(createdBy))throw Error('Invalid Plan creator identity');
 name=text(name,'Plan name',160);
 if(typeof enabled!=='boolean')throw Error('enabled must be boolean');
 if(!Number.isInteger(graceSeconds)||graceSeconds<0||graceSeconds>3600)throw Error('graceSeconds must be 0..3600');
 if(!['low','normal','high','urgent'].includes(priority))throw Error('Unknown Plan priority');
 if(typeof notes!=='string'||notes.length>16000)throw Error('Plan notes too long');
 tags=normalizedTags(tags);
 const data=state(),now=Date.now(),requestFingerprint=digest([name,action,rule,enabled,notes,priority,graceSeconds,createdBy,...(tags.length?[tags]:[])]);
 if(clientRequestId!==undefined){
  if(typeof clientRequestId!=='string'||!/^[-\w]{6,160}$/.test(clientRequestId))throw Error('Invalid Plan request ID');
  const existing=data.jobs.find(job=>job.clientRequestId===clientRequestId);
  if(existing){if(existing.requestFingerprint!==requestFingerprint)throw Error('Plan request ID was reused with different content');return clone(existing)}
 }
 const spec=ruleSpec(rule,now),task=actionSpec(action);
 if(enabled&&date(nextAt(spec))<=now)throw Error('Enabled Plan must have a future occurrence');
 const item={id:'pl_'+randomUUID(),name,notes,priority,tags,action:task,rule:spec,enabled,archived:false,createdBy,
  nextAt:nextAt(spec),graceSeconds,occurrences:0,createdAt:iso(now),updatedAt:iso(now),revision:1,
  ...(clientRequestId?{clientRequestId,requestFingerprint}:{})};
 data.jobs.push(item);write(data);return clone(item);
}
function update({id,patch={},expectedRevision}={}){
 if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('Invalid Plan patch');
 const data=state(),item=byId(data,id);
 if(item.archived)throw Error('Archived Plan is read-only');
 if(expectedRevision!==undefined&&expectedRevision!==item.revision)throw Error('Plan changed; reload before saving');
 assertNotRunning(data,item.id);
 for(const key of Object.keys(patch))if(!['name','notes','priority','tags','enabled','action','rule','graceSeconds'].includes(key))throw Error('Unsupported Plan edit: '+key);
 if(patch.graceSeconds!==undefined){if(!Number.isInteger(patch.graceSeconds)||patch.graceSeconds<0||patch.graceSeconds>3600)throw Error('graceSeconds must be 0..3600');item.graceSeconds=patch.graceSeconds}
 if(patch.action!==undefined)item.action=actionSpec(patch.action);
 if(patch.rule!==undefined){item.rule=ruleSpec(patch.rule);item.nextAt=nextAt(item.rule);item.occurrences=0}
 if(patch.name!==undefined)item.name=text(patch.name,'Plan name',160);
 if(patch.notes!==undefined){if(typeof patch.notes!=='string'||patch.notes.length>16000)throw Error('Plan notes too long');item.notes=patch.notes}
 if(patch.priority!==undefined){if(!['low','normal','high','urgent'].includes(patch.priority))throw Error('Unknown Plan priority');item.priority=patch.priority}
 if(patch.tags!==undefined)item.tags=normalizedTags(patch.tags);
 if(patch.enabled!==undefined){
  if(typeof patch.enabled!=='boolean')throw Error('enabled must be boolean');
  if(patch.enabled&&!item.nextAt)throw Error('A completed one-off Plan cannot be re-enabled');
  // Do not replay an occurrence that elapsed while manually paused.
  if(patch.enabled&&date(item.nextAt)<=Date.now()&&item.rule.kind!=='once')item.nextAt=countNext(item,Date.now());
  if(patch.enabled&&date(item.nextAt)<=Date.now())throw Error('Plan occurrence has passed; create another task');
  item.enabled=patch.enabled;
 }
 item.revision++;item.updatedAt=iso(Date.now());write(data);return clone(item);
}
function archive({id,expectedRevision}){
 const data=state(),item=byId(data,id);
 assertNotRunning(data,id);
 if(expectedRevision!==undefined&&expectedRevision!==item.revision)throw Error('Plan changed; reload before archiving');
 item.archived=true;item.enabled=false;item.nextAt=null;item.revision++;item.updatedAt=iso(Date.now());write(data);
 return {archived:true,id};
}
function history({id,limit=100}={}){
 if(!Number.isInteger(limit)||limit<1||limit>500)throw Error('Plan history limit must be 1..500');
 const data=state();if(id)byId(data,id);
 return clone(data.runs.filter(run=>!id||run.jobId===id).slice(-limit).reverse());
}
async function dispatch(item,trigger,scheduledAt=iso(Date.now())){
 if(actions.has(item.id)||activeRuns(state(),item.id).length)throw Error('Plan already has an active native run');
 const task=(async()=>{
  const data=state(),current=byId(data,item.id);
  if(current.archived)throw Error('Plan is archived');
  const run={id:'pr_'+randomUUID(),jobId:current.id,name:current.name,trigger,scheduledAt,
   action:{...current.action},startedAt:iso(Date.now()),status:'dispatching',message:'Dispatch pending; will not replay after an interrupted process'};
  if(trigger==='scheduled'){
   current.nextAt=countNext(current,Math.max(Date.now(),date(scheduledAt)));current.occurrences++;if(!current.nextAt)current.enabled=false;
   current.updatedAt=iso(Date.now());current.revision++;
  }
  data.runs.push(run);write(data); // Durably claim before any potentially charged model action.
  try{
   requireRunAuthorization(current,run.action);
    let outcome;
   if(run.action.type==='notice'){
    if(run.action.groupId)outcome=groups.postSystem(run.action.groupId,run.action.text,run.id);
    run.status='notified';run.message=run.action.groupId?'Posted to Messages; no model input sent':'Reminder recorded; no model input sent';
   }else{
    const agents=require('./agent-sessions.cjs');let role;
    if(run.action.mode==='fresh'){
     occupancy.acquire({hostId:run.action.hostId,directory:run.action.directory,owner:'plan:'+run.id});
     // Fresh native thread, never --last or a reused human conversation.
     // Context is isolated; files and native project rules are not isolated.
     const sameWorkspace=agentList().find(row=>row.busy&&row.targetHostId===run.action.hostId&&row.cwd===run.action.directory);
     const submittedConflict=state().runs.find(row=>row.id!==run.id&&row.status==='submitted'&&row.action?.mode==='fresh'&&
      row.action.hostId===run.action.hostId&&row.action.directory===run.action.directory);
     if(sameWorkspace||submittedConflict)throw Error('Workspace is busy; this occurrence was skipped without sending a model task');
     role=await agents.open({engineHostId:run.action.hostId,targetHostId:run.action.hostId,
      engine:'codex',name:current.name+' · '+run.id.slice(3,11),directory:run.action.directory,
      permission:run.action.permission,creationId:'plan_'+run.id});
     run.sessionId=role.id;
    }else{
     role=agents.sessions().find(row=>row.id===run.action.agentId);
     if(!role||(role.transport==='native'?role.threadId:role.collaborationSessionId)!==run.action.threadId||role.targetHostId!==run.action.hostId||
        role.engineHostId!==run.action.engineHostId||JSON.stringify(role.engineIdentity||null)!==JSON.stringify(run.action.engineIdentity||null))
      throw Error('Exact Agent identity changed; no prompt was submitted');
     if(role.busy)throw Error('Agent is busy. The scheduled task was skipped without interrupting it');
     occupancy.acquire({agentId:role.id,hostId:role.targetHostId,directory:role.cwd,owner:'plan:'+run.id});
     if(role.transport==='native'&&!role.running){await agents.activate({id:role.targetHostId,session:role.id});role=agents.sessions().find(row=>row.id===role.id)}
     if(!role||(role.transport==='native'&&!role.running)||(role.transport==='native'?role.threadId:role.collaborationSessionId)!==run.action.threadId)
      throw Error('Exact native Agent session identity is unavailable');
     run.sessionId=role.id;
    }
    // Send exactly the user-saved text. The scheduler owns routing/output;
    // no role, group, report or tool instructions enter the model context.
    const submitted=await taskService.submit({role,activate:false,
     scope:{source:'plan',planId:current.id,runId:run.id,agentId:role.id},
     authorize:()=>requireRunAuthorization(current,run.action),
     prepare:()=>run.action.text});
    outcome=submitted.accepted;
    const after=agents.sessions().find(row=>row.id===role.id)||role;
    run.status='submitted';run.message='Native turn accepted; waiting for completion';
    run.threadId=after.threadId||after.collaborationSessionId||null;
    if(outcome?.turnId)run.turnId=outcome.turnId;
   }
  }catch(error){run.status=run.action.type==='agent'?'attention':'failed';run.message=error.message}
  finally{
   if(run.status!=='submitted'){run.finishedAt=iso(Date.now());occupancy.release('plan:'+run.id)}
   const latest=state();const existing=latest.runs.find(row=>row.id===run.id);
   if(existing)Object.assign(existing,run);write(latest);
   if(run.status==='submitted')reconcileCompleted(run);
  }
  return clone(run);
 })();
 actions.set(item.id,task);
 try{return await task}finally{actions.delete(item.id)}
}
function settleNativeTurn(event){
 if(event.kind!=='turn'||event.status==='running'||!event.turnId)return;
 const data=state(),match=data.runs.find(run=>run.status==='submitted'&&run.sessionId===event.sessionId&&run.turnId===event.turnId);
 if(!match)return;
 occupancy.release('plan:'+match.id);
 match.status=event.status==='completed'?'completed':event.status==='interrupted'?'interrupted':'failed';
 match.finishedAt=event.time;match.executionStatus=event.status;match.publicationStatus=match.action.groupId?'pending':'not-requested';
 const answer=taskService.finalAnswer(event.sessionId,event.turnId);
 match.resultText=answer.slice(0,16000);
 match.message=match.status==='completed'?'Native turn completed; review project outcome and recorded results.':event.text||'Native turn ended unsuccessfully';
 write(data);
 if(match.status==='completed'&&match.action.groupId&&answer.trim()){
  try{
   const agent=agentList().find(row=>row.id===match.sessionId);
   groups.postSystem(match.action.groupId,answer.slice(0,16000),match.id,agent);
   const revised=state(),target=revised.runs.find(row=>row.id===match.id);if(target){target.publishedAt=iso(Date.now());target.publicationStatus='published';write(revised)}
  }catch(error){
   const revised=state(),target=revised.runs.find(row=>row.id===match.id);if(target){target.publishError=error.message;target.publicationStatus='failed';write(revised)}
  }
 }
}
function reconcileCompleted(run){
 if(!run.sessionId||!run.turnId)return;
 const completed=taskService.finishedTurn(run.sessionId,run.turnId);
 if(completed)settleNativeTurn(completed);
}
async function run({id}={}){return dispatch(byId(state(),id),'manual')}
async function cancel({runId}={}){
 const data=state(),run=data.runs.find(row=>row.id===runId);
 if(!run)throw Error('Unknown Plan run');
 if(!activeStates.has(run.status)||!run.turnId||!run.sessionId)throw Error('Only a currently accepted native run can be cancelled');
 const agents=require('./agent-sessions.cjs');
 const role=agents.sessions().find(row=>row.id===run.sessionId);
 if(!role)throw Error('The original native Agent session is no longer registered');
 const current=agents.read({id:role.targetHostId,session:role.id,cursor:0});
 if(!current.busy||current.turnId!==run.turnId)throw Error('Native run ID mismatch; no other turn was interrupted');
 if(run.cancelRequestedAt)return clone(run);
 await agents.interrupt({id:role.targetHostId,session:role.id});
 const latest=state(),same=latest.runs.find(row=>row.id===runId);
 if(same&&activeStates.has(same.status)){same.cancelRequestedAt=iso(Date.now());same.message='Cancellation requested for the exact native turn';write(latest)}
 return clone(same||run);
}
function calendar({start,end}={}){
 const first=date(start),last=date(end);
 if(last<=first||last-first>366*86400000)throw Error('Calendar range must cover 1–366 days');
 const data=state(),occurrences=[],truncatedJobs=[];
 for(const job of data.jobs){
  if(job.archived||!job.enabled)continue;
  try{
   let cursor=first-1;
   for(let count=0;count<10000;count++){
    const at=planTime.next(job.rule,cursor);
    if(!at||date(at)>=last)break;
    occurrences.push({jobId:job.id,name:job.name,scheduledAt:at});
    cursor=date(at);
    if(count===9999&&planTime.next(job.rule,cursor)&&date(planTime.next(job.rule,cursor))<last)truncatedJobs.push(job.id);
   }
  }catch(error){throw Error('Invalid calendar schedule for '+job.id+': '+error.message)}
 }
 return {start,end,occurrences:occurrences.sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt)),
  truncatedJobs,runs:clone(data.runs.filter(row=>date(row.startedAt)>=first&&date(row.startedAt)<last))};
}
function planStatus(item,last){
 if(['submitted','dispatching','running'].includes(last?.status))return 'running';
 if(item.disabledReason)return 'attention';
 if(!item.nextAt&&item.rule.kind==='once')return 'completed';
 if(!item.enabled)return 'paused';
 if(['failed','interrupted','timed_out','needs_review','attention'].includes(last?.status))return 'attention';
 if(!item.nextAt)return 'completed';
 return 'scheduled';
}
function query({search='',status,filter={},sort='nextAt',direction='asc',limit=200,offset=0}={},visible=()=>true,actorId){
 if(typeof search!=='string'||search.length>240||!Number.isSafeInteger(limit)||limit<1||limit>500||
  !Number.isSafeInteger(offset)||offset<0)throw Error('Invalid Plan query');
 if(!filter||typeof filter!=='object'||Array.isArray(filter))throw Error('Invalid Plan query filter');
 const options=['search','employee','team','channel','states','priorities','tags'];
 for(const key of Object.keys(filter))if(!options.includes(key))throw Error('Unknown Plan query filter: '+key);
 for(const key of ['search','employee','team','channel'])
  if(filter[key]!==undefined&&(typeof filter[key]!=='string'||filter[key].length>240))throw Error('Invalid '+key+' filter');
 const choices={states:['scheduled','running','paused','completed','attention','due'],
  priorities:['low','normal','high','urgent']};
 for(const [key,valid] of Object.entries(choices))
  if(filter[key]!==undefined&&(!Array.isArray(filter[key])||filter[key].some(x=>!valid.includes(x))))throw Error('Invalid '+key+' filter');
 if(filter.tags!==undefined)normalizedTags(filter.tags);
 if(status!==undefined&&!choices.states.includes(status))throw Error('Invalid Plan status');
 if(!['nextAt','name','updatedAt','priority'].includes(sort)||!['asc','desc'].includes(direction))throw Error('Invalid Plan sort');
 const agents=new Map(agentList().map(row=>[row.id,row]));
 const company=require('./company.cjs'),teams=company.teams(),roles=new Map(company.roster().map(row=>[row.id,row.companyRole]));
 const teamOf=id=>teams.find(row=>row.memberIds.includes(id));
 if(filter.employee==='self'&&!actorId)throw Error('self requires an authenticated Agent');
 const employeeId=filter.employee==='self'?actorId:filter.employee;
 const all=list().filter(visible),facets={tags:[...new Set(all.flatMap(row=>row.tags||[]))].sort()};
 const rendered=all.map(row=>{
  const actualStatus=planStatus(row,row.lastRun),person=agents.get(row.action.agentId),team=teamOf(row.action.agentId);
  return {...row,status:actualStatus,employee:person?{id:person.id,title:person.name,team:team?.name||null,
    engine:person.engine,role:roles.get(person.id)||null}:null,
   target:row.action.type==='agent'&&row.action.agentId?{id:row.action.agentId,exists:!!person,
    role:roles.get(row.action.agentId)||null,title:person?.name||null,
    team:team?.name||null,engine:row.action.engine||null}:null,
   timing:{kind:row.rule.kind,timezone:row.rule.timezone||null,nextAt:row.nextAt,until:row.until||null,
    window:row.window||null}};
 });
 const filtered=rendered.filter(row=>{
  const term=(filter.search||search).toLowerCase();
  const has=term?[row.id,row.name,row.notes,row.action.text,row.employee?.title,row.employee?.team,...(row.tags||[])].some(x=>String(x||'').toLowerCase().includes(term)):true;
  const state=row.status==='scheduled'&&row.nextAt&&Date.parse(row.nextAt)<=Date.now()?'due':row.status;
  return has&&(!employeeId||row.action.agentId===employeeId)&&
   (!filter.team||teams.some(team=>(team.id===filter.team||team.name===filter.team)&&team.memberIds.includes(row.action.agentId)))&&
   (!filter.channel||row.action.groupId===filter.channel)&&
   (!status||(status==='scheduled'?row.status==='scheduled':state===status))&&
   (!filter.states?.length||filter.states.includes(state)||filter.states.includes(row.status))&&
   (!filter.priorities?.length||filter.priorities.includes(row.priority||'normal'))&&
   (!filter.tags?.length||filter.tags.every(tag=>(row.tags||[]).includes(tag)));
 });
 const priority=['low','normal','high','urgent'];
 const value=row=>sort==='name'?row.name.toLowerCase():sort==='priority'?priority.indexOf(row.priority||'normal'):
  sort==='updatedAt'?Date.parse(row.updatedAt):row.nextAt?Date.parse(row.nextAt):Number.MAX_SAFE_INTEGER;
 filtered.sort((a,b)=>{const x=value(a),y=value(b);
  return (typeof x==='string'&&typeof y==='string'?x.localeCompare(y):x-y)*(direction==='asc'?1:-1)||a.id.localeCompare(b.id)});
 const counts=Object.fromEntries(['scheduled','running','paused','completed','attention'].map(state=>
  [state,filtered.filter(row=>row.status===state).length]));
 return {now:iso(Date.now()),hostTimezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
  rows:clone(filtered.slice(offset,offset+limit)),total:filtered.length,offset,hasMore:offset+limit<filtered.length,counts,facets};
}
function analytics(){
 const data=state(),byStatus={};
 for(const run of data.runs)byStatus[run.status]=(byStatus[run.status]||0)+1;
 return {plans:data.jobs.length,active:data.jobs.filter(row=>row.enabled&&!row.archived).length,runs:data.runs.length,byStatus};
}
function timeline({start,end}={}){
 return calendar({start,end});
}
function feed({limit=100}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>500)throw Error('Invalid activity limit');
 return clone(state().runs.slice(-limit).reverse());
}
function recordMissed(item,now){
 const data=state(),current=byId(data,item.id);
 const missed={id:'pr_'+randomUUID(),jobId:item.id,name:item.name,trigger:'scheduled',scheduledAt:item.nextAt,
  action:{...current.action},status:'missed',startedAt:iso(now),finishedAt:iso(now),message:'Occurrence missed its grace window; no task text was submitted.'};
 current.nextAt=countNext(current,now);current.occurrences++;current.updatedAt=iso(now);current.revision++;
 if(!current.nextAt)current.enabled=false;
 data.runs.push(missed);write(data);return missed;
}
async function tick(now=Date.now()){
 if(working)return [];
 working=true;const results=[];
 try{
  for(const job of state().jobs){
   if(!job.enabled||job.archived||!job.nextAt||date(job.nextAt)>now||actions.has(job.id))continue;
   try{
    if(now-date(job.nextAt)>(job.graceSeconds??120)*1000){results.push(recordMissed(job,now));continue}
    results.push(await dispatch(job,'scheduled',job.nextAt));
   }catch(error){results.push({jobId:job.id,status:'failed',message:error.message})}
  }
  return results;
 }finally{working=false}
}
function start(){
 if(timer)return;
 unsubscribe=journal.subscribe(settleNativeTurn);
 const data=state();let changed=false;
 for(const run of data.runs)if(['dispatching','submitted'].includes(run.status)){
  run.status='unknown';run.message='Core restarted mid-dispatch. The saved task will not be replayed automatically.';
  run.finishedAt=iso(Date.now());changed=true;
 }
 if(changed)write(data);
 timer=setInterval(()=>{void tick().catch(error=>console.error('CloudHosts Plan scheduler:',error.message))},2500);
 timer.unref?.();
 void tick().catch(error=>console.error('CloudHosts Plan scheduler:',error.message));
}
async function stop(){clearInterval(timer);timer=null;unsubscribe?.();unsubscribe=null;await Promise.allSettled([...actions.values()])}
module.exports={list,get,create,update,archive,history,preview,run,cancel,calendar,timeline,query,analytics,feed,tick,start,stop};
