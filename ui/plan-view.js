// Aexus Plan-inspired schedule surface over native CloudHosts Agent IDs.
// Calendar, board and timeline are projections of the SAME Core job/run log.
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const locale=()=>document.documentElement.lang==='zh-CN'?'zh-CN':'en-US';
const timeLabel=raw=>raw?new Date(raw).toLocaleString(locale(),{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'Not scheduled';
const localDay=value=>{const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const shortDay=date=>new Date(date).toLocaleDateString(locale(),{weekday:'short'});
const monthTitle=date=>date.toLocaleDateString(locale(),{month:'long',year:'numeric'});
function toLocalInput(date){const d=new Date(date),n=new Date(d.getTime()-d.getTimezoneOffset()*60000);return n.toISOString().slice(0,16)}
export function planPane(root,rpc,toast,{draft,onOpenGroup,onOpenAgent}={}){
 let jobs=[],runs=[],agents=[],groups=[],teams=[],workHosts=[],workspaces=[],savedViews=[],layout='board',month=new Date(),disposed=false,timer,events=null,realtimeTimer=null,pendingConfirm=null;
 const viewStorageKey='cloudhosts.plan.activeView';
 let activeViewId='';try{activeViewId=sessionStorage.getItem(viewStorageKey)||''}catch{}
 let monthData=null,monthDataKey='',monthLoading=false;
 month.setDate(1);month.setHours(0,0,0,0);
 const report=error=>{if(!disposed)toast(error.message||String(error),'error')};
 root.innerHTML=`<section class="collab-plan"><header class="collab-plan-heading"><div><span class="collab-overline">PLAN</span><h2>Scheduled work</h2><p>Native Agent tasks · recurring dates · verifiable execution receipts</p></div><div class="collab-plan-toolbar"><div class="collab-layout-select" role="tablist" aria-label="Plan layout"><button data-layout="board" class="active">Board</button><button data-layout="table">Table</button><button data-layout="calendar">Calendar</button><button data-layout="timeline">Timeline</button><button data-layout="planner">Planner</button><button data-layout="list">List</button><button data-layout="gallery">Gallery</button><button data-layout="charts">Charts</button><button data-layout="feed">Feed</button><button data-layout="form">Form</button></div><div class="collab-view-controls"><select class="collab-saved-view" aria-label="Saved Plan view"><option value="">All plans</option></select><button type="button" class="collab-save-view">Save view</button><button type="button" class="collab-delete-view" hidden>Delete view</button></div><button class="primary collab-add-task">+ New task</button></div></header><div class="collab-plan-metrics"></div><div class="collab-plan-body"></div><div class="collab-plan-footer"><strong>Execution policy</strong><span>Codex resumes its bound native thread. Claude, Pi and Cline use a distinct, persistent collaboration session; the original interactive terminal is preserved. Work-directory reservations are shared across Messages, Company and Plan. Fixed reminders require no model call.</span></div></section>`;
 const q=sel=>root.querySelector(sel),body=q('.collab-plan-body');
 const currentView=()=>savedViews.find(item=>item.id===activeViewId)||null;
 function status(item){
  if(item.archived)return 'archived';
  const recent=runs.find(run=>run.jobId===item.id)||item.lastRun;
  if(['submitted','dispatching','running'].includes(recent?.status))return 'running';
  if(!item.nextAt&&item.rule.kind==='once')return 'completed';
  if(!item.enabled)return 'paused';
  if(['failed','interrupted','timed_out','needs_review','attention'].includes(recent?.status))return 'attention';
  return Date.parse(item.nextAt)<=Date.now()?'due':'scheduled';
 }
 function visibleJobs(){
  const filter=currentView()?.filter||{};
  return jobs.filter(item=>{
   const search=[item.name,item.notes,item.action?.text].join(' ').toLowerCase();
   const team=teams.find(row=>row.id===filter.team||row.name===filter.team);
   return (!filter.search||search.includes(filter.search.toLowerCase()))&&
    (!filter.employee||item.action?.agentId===filter.employee)&&
    (!filter.team||!!team&&team.memberIds.includes(item.action?.agentId))&&
    (!filter.channel||item.action?.groupId===filter.channel)&&
    (!filter.states?.length||filter.states.includes(status(item))||status(item)==='due'&&filter.states.includes('scheduled'))&&
    (!filter.priorities?.length||filter.priorities.includes(item.priority||'normal'))&&
    (!filter.tags?.length||filter.tags.every(tag=>(item.tags||[]).includes(tag)));
  });
 }
 function sorted(){
  const view=currentView(),key=view?.sort||'nextAt',direction=view?.direction==='desc'?-1:1;
  const value=row=>key==='name'?row.name.toLowerCase():key==='priority'?['low','normal','high','urgent'].indexOf(row.priority||'normal'):
   key==='updatedAt'?Date.parse(row.updatedAt):Number(new Date(row.nextAt||'9999-12-31'));
  return visibleJobs().sort((a,b)=>{
   const x=value(a),y=value(b);
   return ((typeof x==='string'&&typeof y==='string'?x.localeCompare(y):Number(x)-Number(y))*direction)||a.id.localeCompare(b.id);
  });
 }
 function updateViewControls(){
  const select=q('.collab-saved-view');
  select.innerHTML='<option value="">All plans</option>'+savedViews.filter(view=>!view.builtin)
   .map(view=>'<option value="'+escapeHtml(view.id)+'" data-no-i18n>'+escapeHtml(view.name)+'</option>').join('');
  select.value=activeViewId;q('.collab-delete-view').hidden=!currentView()||currentView().builtin;
 }
 function selectView(id){
  activeViewId=savedViews.some(view=>view.id===id)?id:'';
  try{if(activeViewId)sessionStorage.setItem(viewStorageKey,activeViewId);else sessionStorage.removeItem(viewStorageKey)}catch{}
  const view=currentView();if(view)layout={plan:'planner',chart:'charts'}[view.layout]||view.layout;
  updateViewControls();render();
 }
 function icon(item){const engine=item.action.engine||agents.find(agent=>agent.id===item.action.agentId)?.engine||'codex';return item.action.type==='agent'?`<img src="./engines/${escapeHtml(engine)}.svg" alt="${escapeHtml(engine)}">`:'<span>◷</span>'}
 function taskCard(item,compact=false){
  const state=status(item),last=runs.find(run=>run.jobId===item.id),independent=agents.some(agent=>agent.id===item.action.agentId&&agent.transport==='pty');
  return `<article class="collab-task-card ${compact?'compact':''}" data-job="${escapeHtml(item.id)}"><div class="collab-task-line">${icon(item)}<span class="collab-priority ${escapeHtml(item.priority)}">${escapeHtml(item.priority)}</span><span class="collab-task-status status-${state}">${state}</span></div><h3 data-edit="${escapeHtml(item.id)}" data-no-i18n>${escapeHtml(item.name)}</h3><p data-no-i18n>${escapeHtml(item.action.text)}</p><div class="collab-task-meta"><span>${escapeHtml(timeLabel(item.nextAt))}</span><span>${item.rule.kind==='interval'?'↻ Every '+Math.floor(item.rule.everySeconds/60)+' min':item.rule.kind==='weekly'?'Weekly':item.rule.kind==='monthly'?'Monthly':'One-time'}</span></div><div class="collab-task-meta">${item.action.type==='agent'?(item.action.mode==='fresh'?(last?.sessionId?`<button type="button" data-native="${escapeHtml(last.sessionId)}">Native run</button>`:`<span>Fresh Codex · ${escapeHtml(item.action.hostId)}</span>`):independent?`<span>Separate collaboration session</span><button type="button" data-native="${escapeHtml(item.action.agentId)}">Open Agent</button>`:`<button type="button" data-native="${escapeHtml(item.action.agentId)}">Bound native session</button>`):'<span>Reminder / Message</span>'}${last?`<span class="collab-last-run">Last: ${escapeHtml(last.status)}</span>`:''}</div><div class="collab-task-actions"><button type="button" data-toggle="${escapeHtml(item.id)}">${item.enabled?'Pause':'Enable'}</button><button type="button" data-run="${escapeHtml(item.id)}">${pendingConfirm===item.id?'Confirm run':'Run now'}</button><button type="button" data-history="${escapeHtml(item.id)}">History</button><button type="button" data-edit="${escapeHtml(item.id)}">Edit</button><button type="button" data-archive="${escapeHtml(item.id)}">Archive</button></div></article>`;
 }
 function visibleRuns(){if(!currentView())return runs;const ids=new Set(visibleJobs().map(row=>row.id));return runs.filter(row=>ids.has(row.jobId))}
 function renderMetrics(){
  const filtered=visibleJobs(),results=visibleRuns(),enabled=filtered.filter(job=>job.enabled).length;
  const awaiting=results.filter(run=>['attention','unknown','failed','interrupted'].includes(run.status)).length;
  q('.collab-plan-metrics').innerHTML=`<div><strong>${filtered.length}</strong><span>${currentView()?'Visible plans':'Plans'}</span></div><div><strong>${enabled}</strong><span>Enabled</span></div><div><strong>${results.length}</strong><span>Recorded runs</span></div><div><strong>${awaiting}</strong><span>Needs attention</span></div>`;
 }
 function renderBoard(){
  const groups=[['Upcoming',['scheduled','due']],['Running',['running']],['Needs attention',['attention']],['Paused',['paused']],['Completed',['completed']]];
  body.innerHTML=`<div class="collab-board-grid">${groups.map(([title,states])=>{const entries=sorted().filter(j=>states.includes(status(j)));return `<section class="collab-board-column"><h3>${title} <small>${entries.length}</small></h3><div class="collab-board-stack">${entries.map(j=>taskCard(j)).join('')||'<p class="collab-board-empty">No tasks</p>'}</div></section>`}).join('')}</div>`;
 }
 function renderTable(){
  const items=sorted();
  body.innerHTML=`<div class="collab-table-scroll"><table class="collab-plan-table"><thead><tr><th>Task</th><th>State</th><th>Next run</th><th>Context</th><th>Recent execution</th><th>Actions</th></tr></thead><tbody>${items.map(item=>{
   const last=runs.find(run=>run.jobId===item.id);
   const sessionId=last?.sessionId||item.action.agentId;
   return `<tr data-job="${escapeHtml(item.id)}"><td><strong data-edit="${escapeHtml(item.id)}" data-no-i18n>${escapeHtml(item.name)}</strong><small data-no-i18n>${escapeHtml(item.action.text)}</small></td><td>${escapeHtml(status(item))}</td><td>${escapeHtml(timeLabel(item.nextAt))}</td><td>${item.action.type==='notice'?'Reminder':item.action.mode==='fresh'?'New Codex session':agents.find(agent=>agent.id===item.action.agentId)?.transport==='pty'?'Separate collaboration session':'Bound native Codex thread'}</td><td>${escapeHtml(last?.status||'Not yet run')}${sessionId?` <button type="button" data-native="${escapeHtml(sessionId)}">Open session</button>`:''}</td><td><button type="button" data-history="${escapeHtml(item.id)}">History</button> <button type="button" data-edit="${escapeHtml(item.id)}">Edit</button> <button type="button" data-toggle="${escapeHtml(item.id)}">${item.enabled?'Pause':'Enable'}</button> <button type="button" data-run="${escapeHtml(item.id)}">${pendingConfirm===item.id?'Confirm run':'Run now'}</button></td></tr>`;
  }).join('')||'<tr><td colspan="6">No scheduled tasks</td></tr>'}</tbody></table></div>`;
 }
 function calendarKey(){return month.getFullYear()+'-'+month.getMonth()}
 async function loadMonth(){
  const key=calendarKey();if(monthDataKey===key||monthLoading)return;
  monthLoading=true;
  try{
   const data=await rpc('plan.calendar',{start:new Date(month.getFullYear(),month.getMonth(),1).toISOString(),
    end:new Date(month.getFullYear(),month.getMonth()+1,1).toISOString()});
   if(disposed||calendarKey()!==key)return;
   monthData=data;monthDataKey=key;
   if(['calendar','planner'].includes(layout))render();
  }catch(error){report(error)}finally{monthLoading=false;if(!disposed&&calendarKey()!==key)void loadMonth()}
 }
 function occurrences(){
  const map={},visible=new Set(visibleJobs().map(row=>row.id));
  for(const row of monthData?.occurrences||[]){if(!visible.has(row.jobId))continue;const key=localDay(row.scheduledAt);(map[key]??=[]).push({jobId:row.jobId,name:row.name,time:row.scheduledAt,type:'planned'})}
  for(const row of monthData?.runs||[]){if(!visible.has(row.jobId))continue;const key=localDay(row.startedAt);(map[key]??=[]).push({jobId:row.jobId,name:row.name,time:row.startedAt,status:row.status,type:'run'})}
  return map;
 }
 function renderCalendar(){
  const start=new Date(month),firstDay=(start.getDay()+6)%7,total=new Date(start.getFullYear(),start.getMonth()+1,0).getDate(),cells=Math.ceil((firstDay+total)/7)*7;
  const dates=Array.from({length:cells},(_,i)=>new Date(start.getFullYear(),start.getMonth(),i-firstDay+1));
  const days=Array.from({length:7},(_,i)=>shortDay(new Date(2026,0,5+i)));
  if(monthDataKey!==calendarKey()){monthData=null;void loadMonth()}
  const map=occurrences();
  body.innerHTML=`<div class="collab-calendar-toolbar"><button data-calendar="prev" aria-label="Previous month">‹</button><h3>${escapeHtml(monthTitle(start))}</h3><button data-calendar="today">Today</button><button data-calendar="next" aria-label="Next month">›</button></div>
  <p class="collab-calendar-legend">◯ Upcoming occurrence &nbsp; ● Actual run ${monthData?.truncatedJobs?.length?' · High-frequency plans truncated; narrow the date range for details':''}</p><div class="collab-calendar-grid">${days.map(day=>`<div class="collab-calendar-weekday">${escapeHtml(day)}</div>`).join('')}${dates.map(d=>{
   const key=localDay(d),same=d.getMonth()===start.getMonth(),today=localDay(d)===localDay(new Date()),dayJobs=map[key]||[];
   return `<div class="collab-calendar-cell ${same?'':'outside'} ${today?'today':''}"><button class="collab-calendar-date" data-day="${key}" title="Create a Plan on ${key}">${d.getDate()}</button>${dayJobs.slice(0,4).map(entry=>`<button class="collab-calendar-task ${entry.type==='run'?'ran':''}" data-edit="${escapeHtml(entry.jobId)}" title="${escapeHtml(timeLabel(entry.time)+' · '+entry.name+(entry.status?' ('+entry.status+')':''))}" data-no-i18n>${entry.type==='run'?'● ':'◯ '}${escapeHtml(entry.name)}</button>`).join('')}${dayJobs.length>4?`<small>+${dayJobs.length-4} more</small>`:''}</div>`;
  }).join('')}</div>`;
 }
 function renderTimeline(){
  const items=sorted();
  body.innerHTML=`<div class="collab-timeline">${items.map(job=>{
   const last=runs.find(row=>row.jobId===job.id),actual=last?.finishedAt?Math.max(0,(Date.parse(last.finishedAt)-Date.parse(last.startedAt))/60000):null;
   return `<div class="collab-timeline-row"><time>${escapeHtml(timeLabel(job.nextAt))}<small>Next scheduled</small>${actual!==null?`<small>Actual ${actual.toFixed(1)} min</small>`:''}</time><span class="collab-timeline-marker ${status(job)}"></span>${taskCard(job,true)}</div>`;
  }).join('')||'<p class="collab-board-empty">No schedules yet. Create a new task to start planning.</p>'}</div>`;
 }
 function renderList(){
  body.innerHTML='<div class="collab-plan-list">'+sorted().map(job=>'<div data-job="'+escapeHtml(job.id)+'"><button data-edit="'+escapeHtml(job.id)+'" data-no-i18n>'+escapeHtml(job.name)+'</button><span>'+escapeHtml(job.rule.kind)+'</span><time>'+escapeHtml(timeLabel(job.nextAt))+'</time><em>'+escapeHtml(status(job))+'</em><button data-history="'+escapeHtml(job.id)+'">Runs</button></div>').join('')+'</div>';
 }
 function renderGallery(){body.innerHTML='<div class="collab-gallery-grid">'+sorted().map(job=>taskCard(job)).join('')+'</div>'}
 function renderCharts(){
  const visible=visibleRuns(),counts=visible.reduce((acc,row)=>(acc[row.status]=(acc[row.status]||0)+1,acc),{});
  body.innerHTML='<div class="collab-plan-charts"><h3>Execution status distribution</h3><p>'+(currentView()?'Recent runs matching this saved view.':'Recorded runs from the authoritative Plan log.')+'</p><div class="collab-chart-rows">'+Object.entries(counts).map(([key,total])=>'<div><strong>'+escapeHtml(key)+'</strong><span><i style="width:'+Math.min(100,Math.round(total/Math.max(1,visible.length)*100))+'%"></i></span><em>'+total+'</em></div>').join('')+'</div></div>';
  if(!currentView())void rpc('plan.analytics').then(stats=>{if(disposed||layout!=='charts'||currentView())return;const entries=Object.entries(stats.byStatus);body.querySelector('.collab-chart-rows').innerHTML=entries.map(([key,total])=>'<div><strong>'+escapeHtml(key)+'</strong><span><i style="width:'+Math.min(100,Math.round(total/Math.max(1,stats.runs)*100))+'%"></i></span><em>'+total+'</em></div>').join('')||'<p>No runs yet.</p>'}).catch(report);
 }
 function renderFeed(){
  body.innerHTML='<div class="collab-plan-feed">'+visibleRuns().map(run=>'<article><time>'+escapeHtml(timeLabel(run.startedAt))+'</time><span>'+escapeHtml(run.status)+'</span><button data-history="'+escapeHtml(run.jobId)+'" data-no-i18n>'+escapeHtml(run.name)+'</button><p data-no-i18n>'+escapeHtml(run.resultText||run.message||'')+'</p></article>').join('')+'</div>';
 }
 function renderPlanner(){
  if(monthDataKey!==calendarKey()){monthData=null;void loadMonth()}
  const map=occurrences(),days=Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0]));
  body.innerHTML='<div class="collab-calendar-toolbar"><button data-calendar="prev">‹</button><h3>'+escapeHtml(monthTitle(month))+' · planner</h3><button data-calendar="today">Today</button><button data-calendar="next">›</button></div><div class="collab-plan-agenda">'+days.map(([day,events])=>'<section><h3>'+escapeHtml(day)+'</h3>'+events.map(item=>'<div><time>'+escapeHtml(timeLabel(item.time))+'</time><button data-edit="'+escapeHtml(item.jobId)+'" data-no-i18n>'+escapeHtml(item.name)+'</button><span>'+escapeHtml(item.status||item.type)+'</span></div>').join('')+'</section>').join('')+'</div>';
 }
 function renderForm(){
  body.innerHTML='<div class="collab-plan-form-landing"><h3>Plan editor</h3><p>Create one-time, interval, weekly or monthly native work. Existing tasks remain editable from the other views.</p><button type="button" class="primary" data-new-plan>Open Plan form</button></div>';
 }
 function render(){
  renderMetrics();q('.collab-layout-select').querySelectorAll('button').forEach(button=>button.classList.toggle('active',button.dataset.layout===layout));
  ({table:renderTable,calendar:renderCalendar,timeline:renderTimeline,planner:renderPlanner,list:renderList,gallery:renderGallery,charts:renderCharts,feed:renderFeed,form:renderForm,board:renderBoard}[layout]||renderBoard)();
 }
 async function refresh(){
  const [newJobs,newRuns,newAgents,newGroups,newHosts,newWorkspaces,newTeams,newViews]=await Promise.all([
   rpc('plan.list'),rpc('plan.history',{limit:250}),rpc('hosts.agent-list'),rpc('messages.list'),
   rpc('hosts.agent-hosts'),rpc('workspaces.list'),rpc('company.teams'),rpc('plan.views')]);
  if(disposed)return;
  const changed=JSON.stringify([jobs,runs,teams,savedViews])!==JSON.stringify([newJobs,newRuns,newTeams,newViews]);
  jobs=newJobs;runs=newRuns;agents=newAgents;groups=newGroups;workHosts=newHosts;workspaces=newWorkspaces;teams=newTeams;savedViews=newViews;
  if(activeViewId&&!currentView()){activeViewId='';try{sessionStorage.removeItem(viewStorageKey)}catch{}}
  if(currentView())layout={plan:'planner',chart:'charts'}[currentView().layout]||currentView().layout;
  if(changed){monthDataKey='';monthData=null}
  if(changed||!body.children.length)render();
  updateViewControls();
 }
 function editor({initialText=draft?.text||'',initialGroupId=draft?.groupId||'',initialDay,previous}={}){
  const dialog=document.createElement('dialog');dialog.className='collab-plan-dialog';
  const at=initialDay?`${initialDay}T09:00`:toLocalInput(Date.now()+3600000);
  const defaultZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
  const selectHosts=workHosts.map(host=>`<option value="${escapeHtml(host.id)}" data-no-i18n>${escapeHtml(host.name)} · ${escapeHtml(host.os)}</option>`).join('');
  const selectWorkspaces=workspaces.map(item=>`<option value="${escapeHtml(item.id)}" data-no-i18n>${escapeHtml(item.name||item.directory)} · ${escapeHtml(item.hostId)} · ${escapeHtml(item.directory)}</option>`).join('');
  const selectRoles=agents.filter(agent=>agent.transport==='pty'||agent.engine==='codex'&&agent.transport==='native'&&agent.threadId)
   .map(agent=>`<option value="${escapeHtml(agent.id)}" data-no-i18n>${escapeHtml(agent.name)} · ${escapeHtml(agent.targetHostId)}</option>`).join('');
  const selectGroups=groups.map(group=>`<option value="${escapeHtml(group.id)}" data-no-i18n>${escapeHtml(group.name)}</option>`).join('');
  const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((name,i)=>`<label class="collab-weekday"><input type="checkbox" name="weekday" value="${i+1}" checked>${name}</label>`).join('');
  dialog.innerHTML=`<form><header><h2>${previous?'Edit Plan':'New Plan'}</h2><button type="button" data-close aria-label="Close">×</button></header>
   <label>Plan title<input name="name" maxlength="160" required value="${escapeHtml(previous?.name||'')}"></label>
   <label>Action<select name="type"><option value="agent">Native Agent task · saved text</option><option value="notice">Reminder · no model call</option></select></label>
   <label class="collab-plan-context">Conversation context<select name="contextMode"><option value="resume">Continue assigned Agent work session</option><option value="fresh">Create a fresh Codex session</option></select></label>
   <label class="collab-plan-workspace">Work directory bookmark<select name="workspaceId"><option value="">Custom host and path</option>${selectWorkspaces}</select></label>
   <label class="collab-plan-host">Run on host<select name="hostId">${selectHosts}</select></label>
   <label class="collab-plan-directory">Absolute project directory<input name="directory" placeholder="Absolute path on the selected host" spellcheck="false" data-no-i18n></label>
   <label class="collab-plan-permission">Native permissions<select name="permission"><option value="ask">Ask for approval (default)</option><option value="full">Full access · target account</option></select></label>
   <label class="collab-target-agent" hidden>Agent work session (other engines use a separate collaboration branch)<select name="agentId"><option value="">Select assigned Agent</option>${selectRoles}</select></label>
   <label class="collab-target-group">Result destination / reminder (optional)<select name="groupId"><option value="">Keep in Plan only</option>${selectGroups}</select></label>
   <label>Task / reminder text<textarea name="text" rows="5" required maxlength="16000" data-no-i18n>${escapeHtml(initialText)}</textarea></label>
   <div class="collab-form-grid"><label>When<select name="kind"><option value="once">One-time</option><option value="interval">Interval</option><option value="weekly">Days of week · timezone</option><option value="monthly">Monthly · timezone</option></select></label>
    <label class="collab-at">Date and time<input name="at" type="datetime-local" value="${escapeHtml(at)}"></label>
    <label class="collab-every" hidden>Every (minutes)<input name="everyMinutes" type="number" min="1" max="525600" value="60"></label>
    <label class="collab-plan-time" hidden>Local time · HH:mm<input name="localTime" type="time" value="09:00"></label>
    <label class="collab-plan-timezone" hidden>IANA timezone<input name="timezone" value="${escapeHtml(defaultZone)}" spellcheck="false"></label>
    <label class="collab-plan-day" hidden>Monthly day<select name="monthDay">${Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}<option value="last">Last day</option></select></label>
    <label>Priority<select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></label></div>
   <div class="collab-plan-weekdays" hidden><strong>Allowed weekdays</strong><div>${weekdays}</div></div>
   <div class="collab-plan-preview" aria-live="polite">Preview is read-only · no Agent process will start.</div>
   <label>Notes<textarea name="notes" rows="2" maxlength="16000" placeholder="Internal notes only" data-no-i18n></textarea></label>
   <label>Tags (comma-separated)<input name="tags" maxlength="850" placeholder="verification, release" data-no-i18n></label>
   <label class="collab-enabled"><input name="enabled" type="checkbox"> Enable automatic execution after saving</label>
   <p class="collab-plan-disclaimer">Scheduled work can incur model charges. Continue the Agent's Codex thread or its persistent Claude/Pi/Cline collaboration branch. A separate Codex session is an explicit option. Confirm target, permissions and time before enabling automatic runs. The Core must remain running for execution.</p>
   <footer><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save Plan</button></footer></form>`;
  root.append(dialog);
  const form=dialog.querySelector('form'),close=()=>{dialog.close();dialog.remove()};
  dialog.querySelectorAll('[data-close]').forEach(button=>button.onclick=close);
  dialog.oncancel=e=>{e.preventDefault();close()};
  const q=selector=>dialog.querySelector(selector);
  function ruleFromForm(){
   const data=new FormData(form),kind=data.get('kind');
   if(kind==='once'){
    const raw=data.get('at'),when=new Date(raw);
    if(!raw||Number.isNaN(when.valueOf()))throw Error('Choose a valid future date and time');
    return {kind:'once',at:when.toISOString()};
   }
   if(kind==='interval')return {kind:'interval',everySeconds:Number(data.get('everyMinutes'))*60};
   const timezone=data.get('timezone'),time=data.get('localTime');
   if(kind==='weekly')return {kind:'weekly',days:data.getAll('weekday').map(Number),time,timezone};
   if(kind==='monthly')return {kind:'monthly',day:data.get('monthDay')==='last'?'last':Number(data.get('monthDay')),time,timezone};
   throw Error('Choose a schedule rule');
  }
  function actionFromForm(){
   const data=new FormData(form),text=data.get('text'),groupId=data.get('groupId');
   if(data.get('type')==='notice')return {type:'notice',text,...(groupId?{groupId}:{})};
   if(data.get('contextMode')==='resume')return {type:'agent',mode:'resume',agentId:data.get('agentId'),text,...(groupId?{groupId}:{})};
   return {type:'agent',mode:'fresh',engine:'codex',hostId:form.elements.hostId.value,directory:data.get('directory'),
    ...(data.get('workspaceId')?{workspaceId:data.get('workspaceId')}:{}),
    permission:data.get('permission'),text,...(groupId?{groupId}:{})};
  }
  function refreshFields(){
   const agent=form.elements.type.value==='agent',fresh=form.elements.contextMode.value==='fresh',kind=form.elements.kind.value;
   q('.collab-plan-context').hidden=!agent;
   q('.collab-plan-workspace').hidden=!agent||!fresh;
   q('.collab-plan-host').hidden=!agent||!fresh;
   q('.collab-plan-directory').hidden=!agent||!fresh;
   form.elements.directory.readOnly=!!form.elements.workspaceId.value;
   form.elements.hostId.disabled=!!form.elements.workspaceId.value;
   q('.collab-plan-permission').hidden=!agent||!fresh;
   q('.collab-target-agent').hidden=!agent||fresh;
   q('.collab-at').hidden=kind!=='once';q('.collab-every').hidden=kind!=='interval';
   q('.collab-plan-time').hidden=!['weekly','monthly'].includes(kind);
   q('.collab-plan-timezone').hidden=!['weekly','monthly'].includes(kind);
   q('.collab-plan-weekdays').hidden=kind!=='weekly';q('.collab-plan-day').hidden=kind!=='monthly';
  }
  const hostById=id=>workHosts.find(host=>host.id===id);
  form.elements.hostId.onchange=()=>{form.elements.directory.value=hostById(form.elements.hostId.value)?.defaultDirectory||''};
  form.elements.workspaceId.onchange=()=>{
   const selected=workspaces.find(w=>w.id===form.elements.workspaceId.value);
   if(selected){form.elements.hostId.value=selected.hostId;form.elements.directory.value=selected.directory}
   refreshFields();
  };
  if(!previous){const ready=agents.find(agent=>agent.engine==='codex'&&agent.transport==='native'&&agent.threadId);if(ready){form.elements.contextMode.value='resume';form.elements.agentId.value=ready.id}else form.elements.contextMode.value='fresh'}
  form.elements.hostId.value=previous?.action.hostId||workHosts.find(h=>h.id==='local')?.id||workHosts[0]?.id||'';
  form.elements.directory.value=previous?.action.directory||hostById(form.elements.hostId.value)?.defaultDirectory||'';
  form.elements.type.onchange=refreshFields;form.elements.contextMode.onchange=refreshFields;form.elements.kind.onchange=refreshFields;
  if(previous){
   form.elements.name.value=previous.name;form.elements.type.value=previous.action.type;
   form.elements.contextMode.value=previous.action.mode||(previous.action.agentId?'resume':'fresh');
   form.elements.text.value=previous.action.text;form.elements.notes.value=previous.notes||'';
   form.elements.tags.value=(previous.tags||[]).join(', ');
   form.elements.priority.value=previous.priority;form.elements.enabled.checked=previous.enabled;
   if(previous.action.agentId)form.elements.agentId.value=previous.action.agentId;
   if(previous.action.groupId)form.elements.groupId.value=previous.action.groupId;
   form.elements.kind.value=previous.rule.kind;
   if(previous.rule.kind==='once')form.elements.at.value=toLocalInput(previous.rule.at);
   if(previous.rule.kind==='interval')form.elements.everyMinutes.value=previous.rule.everySeconds/60;
   if(['weekly','monthly'].includes(previous.rule.kind)){
    form.elements.localTime.value=previous.rule.time;form.elements.timezone.value=previous.rule.timezone;
   }
   if(previous.rule.kind==='weekly')q('.collab-plan-weekdays').querySelectorAll('input').forEach(input=>input.checked=previous.rule.days.includes(Number(input.value)));
   if(previous.rule.kind==='monthly')form.elements.monthDay.value=String(previous.rule.day);
  }else if(initialGroupId)form.elements.groupId.value=initialGroupId;
  const chosenWorkspace=previous?.action.workspaceId||draft?.workspaceId;
  if(chosenWorkspace&&!previous)form.elements.contextMode.value='fresh';
  if(chosenWorkspace){
   const source=workspaces.find(w=>w.id===chosenWorkspace);
   if(source){form.elements.workspaceId.value=source.id;form.elements.hostId.value=source.hostId;form.elements.directory.value=source.directory}
  }
  refreshFields();dialog.showModal();form.elements.name.focus();
  let previewTimer,previewId=0;
  const requestId='ui_'+crypto.randomUUID().replaceAll('-','');
  async function previewSchedule(){
   const request=++previewId;
   try{
    const upcoming=await rpc('plan.preview',{rule:ruleFromForm(),count:3});
    if(!dialog.isConnected||request!==previewId)return;
    q('.collab-plan-preview').textContent=upcoming.length?'Next: '+upcoming.map(timeLabel).join(' · '):'No upcoming dates';
   }catch(error){if(dialog.isConnected&&request===previewId)q('.collab-plan-preview').textContent=error.message}
  }
  form.addEventListener('change',()=>{refreshFields();clearTimeout(previewTimer);previewTimer=setTimeout(()=>void previewSchedule(),170)});
  form.addEventListener('input',()=>{clearTimeout(previewTimer);previewTimer=setTimeout(()=>void previewSchedule(),220)});
  void previewSchedule();
  form.onsubmit=async event=>{
   event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
   try{
    const data=new FormData(form),action=actionFromForm(),rule=ruleFromForm(),tags=String(data.get('tags')||'').split(',').map(x=>x.trim()).filter(Boolean);
    const base={name:data.get('name'),notes:data.get('notes'),priority:data.get('priority'),tags,
     enabled:!!data.get('enabled'),action,rule};
    if(previous){
     const previousAction=previous.action,previousRule=previous.rule;
     const semanticAction=row=>({type:row.type,mode:row.mode||null,text:row.text,groupId:row.groupId||null,
      agentId:row.agentId||null,hostId:row.hostId||null,directory:row.directory||null,permission:row.permission||null,workspaceId:row.workspaceId||null});
     const semanticRule=row=>row.kind==='once'?{kind:'once',at:row.at}:row.kind==='interval'?
      {kind:'interval',everySeconds:row.everySeconds}:row.kind==='weekly'?
      {kind:'weekly',time:row.time,timezone:row.timezone,days:[...row.days].sort()}:
      {kind:'monthly',day:row.day,time:row.time,timezone:row.timezone};
     const patch={name:base.name,notes:base.notes,priority:base.priority,tags:base.tags,enabled:base.enabled};
     if(JSON.stringify(semanticAction(previousAction))!==JSON.stringify(semanticAction(action)))patch.action=action;
     if(JSON.stringify(semanticRule(previousRule))!==JSON.stringify(semanticRule(rule)))patch.rule=rule;
     await rpc('plan.update',{id:previous.id,expectedRevision:previous.revision,patch});
    }else await rpc('plan.create',{...base,clientRequestId:requestId});
    clearTimeout(previewTimer);close();await refresh();toast('Plan saved');
   }catch(error){report(error);button.disabled=false}
  };
 }
 function viewEditor(){
  const previous=currentView(),filter=previous?.filter||{},viewOptions=previous?.options||{};
  const dialog=document.createElement('dialog');dialog.className='collab-view-dialog';
  const options=(values,current)=>values.map(([id,label])=>
   `<option value="${escapeHtml(id)}" ${id===current?'selected':''}>${escapeHtml(label)}</option>`).join('');
  const layouts=[['table','Table'],['board','Board'],['timeline','Timeline'],['calendar','Calendar'],
   ['plan','Planner'],['list','List'],['gallery','Gallery'],['chart','Chart'],['feed','Feed'],['form','Form']];
  const employeeOptions=[['','All Agents'],...agents.map(agent=>[agent.id,agent.name||agent.id])];
  const teamOptions=[['','All Teams'],...teams.map(team=>[team.id,team.name])];
  const groupOptions=[['','All groups'],...groups.map(group=>[group.id,group.name])];
  const field=(name,value='')=>escapeHtml(value);
  dialog.innerHTML=`<form><header><h2>${previous?'Edit saved view':'Save Plan view'}</h2><button type="button" data-view-close aria-label="Close">×</button></header>
   <p>Save the layout, filter and sorting. Tasks and execution records remain unchanged.</p>
   <label>View name<input name="name" required maxlength="80" value="${field('name',previous?.name||'My Plan view')}" data-no-i18n></label>
   <div class="collab-view-grid">
    <label>Layout<select name="layout">${options(layouts,previous?.layout||({planner:'plan',charts:'chart'}[layout]||layout))}</select></label>
    <label>Search<input name="search" maxlength="240" value="${field('search',filter.search)}" placeholder="Name, notes or task instructions"></label>
    <label>Tags<input name="tags" maxlength="850" value="${field('tags',(filter.tags||[]).join(', '))}" placeholder="Comma-separated tags"></label>
    <label>Status<select name="state">${options([['','All states'],...['scheduled','due','paused','completed','attention'].map(x=>[x,x])],filter.states?.[0]||'')}</select></label>
    <label>Priority<select name="priority">${options([['','All priorities'],...['low','normal','high','urgent'].map(x=>[x,x])],filter.priorities?.[0]||'')}</select></label>
    <label>Agent<select name="employee">${options(employeeOptions,filter.employee||'')}</select></label>
    <label>Team<select name="team">${options(teamOptions,filter.team||'')}</select></label>
    <label>Result group<select name="channel">${options(groupOptions,filter.channel||'')}</select></label>
    <label>Group by<select name="groupBy">${options([['status','Status'],['employee','Agent'],['priority','Priority']],previous?.groupBy||'status')}</select></label>
    <label>Sort by<select name="sort">${options([['nextAt','Next occurrence'],['name','Name'],['updatedAt','Last edit'],['priority','Priority']],previous?.sort||'nextAt')}</select></label>
    <label>Direction<select name="direction">${options([['asc','Ascending'],['desc','Descending']],previous?.direction||'asc')}</select></label>
   </div>
   <details><summary>Display options</summary><div class="collab-view-grid">
    <label>Display timezone<input name="timezone" maxlength="100" placeholder="IANA timezone (optional)" value="${field('timezone',viewOptions.timezone)}"></label>
    <label>Timeline scale<select name="timelineScale">${options([['','Default'],['day','Day'],['week','Week'],['month','Month']],viewOptions.timelineScale||'')}</select></label>
    <label>Planner mode<select name="plannerMode">${options([['','Default'],['day','Day'],['week','Week'],['agenda','Agenda']],viewOptions.plannerMode||'')}</select></label>
    <label>Chart metric<select name="chartMetric">${options([['','Default'],['schedules','Schedules'],['runs','Runs']],viewOptions.chartMetric||'')}</select></label>
    <label>Chart group<select name="chartGroupBy">${options([['','Default'],['status','Status'],['employee','Agent'],['team','Team'],['priority','Priority']],viewOptions.chartGroupBy||'')}</select></label>
    <label>Chart style<select name="chartType">${options([['','Default'],['bar','Bar'],['horizontal','Horizontal'],['line','Line'],['donut','Donut']],viewOptions.chartType||'')}</select></label>
   </div></details>
   <footer><button type="button" data-view-close>Cancel</button>${previous?'<button type="submit" value="update">Update view</button>':''}
   <button type="submit" value="create" class="primary">Save as new</button></footer></form>`;
  root.append(dialog);
  const form=dialog.querySelector('form'),close=()=>{dialog.close();dialog.remove()};
  dialog.querySelectorAll('[data-view-close]').forEach(button=>button.onclick=close);
  dialog.oncancel=event=>{event.preventDefault();close()};
  form.onsubmit=async event=>{
   event.preventDefault();
   const button=event.submitter;button.disabled=true;
   try{
    const value=name=>String(form.elements.namedItem(name).value||'').trim();
    const filters={},display={};
    if(value('search'))filters.search=value('search');
    if(value('tags'))filters.tags=value('tags').split(',').map(tag=>tag.trim()).filter(Boolean);
    if(value('state'))filters.states=[value('state')];
    if(value('priority'))filters.priorities=[value('priority')];
    for(const name of ['employee','team','channel'])if(value(name))filters[name]=value(name);
    for(const name of ['timezone','timelineScale','plannerMode','chartMetric','chartGroupBy','chartType'])
     if(value(name))display[name]=value(name);
    const spec={name:value('name'),layout:value('layout'),groupBy:value('groupBy'),filter:filters,sort:value('sort'),direction:value('direction'),
     ...(Object.keys(display).length?{options:display}:{})};
    const updated=button.value==='update'&&previous
     ?await rpc('plan.view-update',{id:previous.id,expectedRevision:previous.revision,patch:spec})
     :await rpc('plan.view-create',{spec});
    close();await refresh();selectView(updated.id);toast('Plan view saved');
   }catch(error){report(error);button.disabled=false}
  };
  dialog.showModal();form.elements.name.focus();
 }
 q('.collab-add-task').onclick=()=>editor();
 q('.collab-saved-view').onchange=event=>selectView(event.target.value);
 q('.collab-save-view').onclick=viewEditor;
 q('.collab-delete-view').onclick=async event=>{
  const view=currentView();if(!view||view.builtin)return;
  const button=event.currentTarget;
  if(button.dataset.confirm!==view.id){button.dataset.confirm=view.id;button.textContent='Confirm delete';return}
  try{
   await rpc('plan.view-delete',{id:view.id,expectedRevision:view.revision});
   button.textContent='Delete view';delete button.dataset.confirm;
   activeViewId='';await refresh();selectView('');toast('Saved view deleted');
  }catch(error){report(error);button.textContent='Delete view';delete button.dataset.confirm}
 };
 q('.collab-layout-select').onclick=event=>{const selected=event.target.closest('[data-layout]');if(selected){selectView('');layout=selected.dataset.layout;render()}};
 body.addEventListener('click',async event=>{
  if(event.target.closest('[data-new-plan]')){editor();return}
  const editNode=event.target.closest('[data-edit]');if(editNode){const target=jobs.find(row=>row.id===editNode.dataset.edit);if(target)editor({previous:target});return}
  const clickedRow=event.target.closest('[data-job]');
  if(clickedRow&&!event.target.closest('button,a,input,select')){const target=jobs.find(row=>row.id===clickedRow.dataset.job);if(target)editor({previous:target});return}
  const node=event.target.closest('button');if(!node)return;
  if(node.dataset.calendar){
   if(node.dataset.calendar==='today'){month=new Date();month.setDate(1)}
   else month=new Date(month.getFullYear(),month.getMonth()+(node.dataset.calendar==='prev'?-1:1),1);
   render();return;
  }
  if(node.dataset.day){editor({initialDay:node.dataset.day});return}
  if(node.dataset.native){onOpenAgent?.(node.dataset.native);return}
  const task=jobs.find(job=>['toggle','run','history','archive'].some(key=>node.dataset[key]===job.id));if(!task)return;
  try{
   if(node.dataset.toggle){await rpc('plan.update',{id:task.id,expectedRevision:task.revision,patch:{enabled:!task.enabled}});pendingConfirm=null;await refresh()}
   else if(node.dataset.run){
    if(pendingConfirm!==task.id){pendingConfirm=task.id;render();return}
    pendingConfirm=null;const result=await rpc('plan.run',{id:task.id});await refresh();toast(result.status==='submitted'?'Task submitted to exact native thread':result.message,result.status==='attention'||result.status==='failed'?'error':'info');
   }else if(node.dataset.history){
    const entries=await rpc('plan.history',{id:task.id,limit:50}),dialog=document.createElement('dialog');dialog.className='collab-run-history';
    dialog.innerHTML=`<header><h2 data-no-i18n>${escapeHtml(task.name)} · history</h2><button data-close>×</button></header><div>${entries.map(run=>`<article><time>${escapeHtml(timeLabel(run.startedAt))}</time><strong>${escapeHtml(run.status)}</strong><p data-no-i18n>${escapeHtml(run.message)}</p>
     <small>Run: ${escapeHtml(run.id)} · Session: ${escapeHtml(run.sessionId||'-')} · Turn: ${escapeHtml(run.turnId||'-')}</small>
     <small>Execution: ${escapeHtml(run.executionStatus||run.status)} · Publication: ${escapeHtml(run.publicationStatus||'not requested')}</small>
     ${run.resultText?`<pre data-no-i18n>${escapeHtml(run.resultText)}</pre>`:''}${run.publishError?`<p class="collab-run-error">Publication: ${escapeHtml(run.publishError)}</p>`:''}
     ${run.status==='submitted'&&run.turnId?`<button type="button" data-cancel-run="${escapeHtml(run.id)}">Cancel this run</button>`:''}
     ${run.sessionId?`<button type="button" data-native-session="${escapeHtml(run.sessionId)}">Open Agent</button>`:''}
    </article>`).join('')||'<p>No runs recorded.</p>'}</div><footer><button data-close>Close</button></footer>`;
    root.append(dialog);dialog.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>{dialog.close();dialog.remove()});
    dialog.addEventListener('click',event=>{const cancel=event.target.closest('[data-cancel-run]');if(cancel){if(!confirm('Cancel this exact native turn?'))return;void rpc('plan.cancel',{runId:cancel.dataset.cancelRun}).then(()=>{dialog.close();dialog.remove();refresh()}).catch(report)}const native=event.target.closest('[data-native-session]');if(native){dialog.close();dialog.remove();onOpenAgent?.(native.dataset.nativeSession)}});
    dialog.showModal();
   }else if(node.dataset.archive){
    if(node.dataset.confirm!=='yes'){node.dataset.confirm='yes';node.textContent='Confirm archive';return}
    await rpc('plan.archive',{id:task.id,expectedRevision:task.revision});await refresh();
   }
  }catch(error){report(error)}
 });
 void refresh().then(()=>{if(draft&&(draft.text!==undefined||draft.workspaceId||draft.groupId))editor()}).catch(report);
 events=new EventSource('./events');events.onmessage=event=>{
  if(disposed||document.hidden||root.querySelector('dialog'))return;
  let row;try{row=JSON.parse(event.data)}catch{return}
  if(!['plan-change','agent-event'].includes(row.kind))return;
  clearTimeout(realtimeTimer);realtimeTimer=setTimeout(()=>void refresh().catch(report),150);
 };
 timer=setInterval(()=>{if(!disposed&&!document.hidden&&!root.querySelector('dialog'))void refresh().catch(report)},9000);
 return {prefill(next){draft=next;editor({initialText:next.text,initialGroupId:next.groupId})},dispose(){disposed=true;clearInterval(timer);clearTimeout(realtimeTimer);events?.close();root.querySelectorAll('dialog').forEach(d=>d.close())}};
}
