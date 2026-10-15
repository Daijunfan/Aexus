// Company reads real Agent identities and durable Core team/delegation records.
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clock=value=>value?new Date(value).toLocaleString():'';
export function companyPane(root,rpc,toast,{onOpenAgent,onOpenGroup}={}){
 let members=[],teams=[],relations=[],tasks=[],selected='all',disposed=false,timer,events=null,realtimeTimer=null;
 const error=e=>{if(!disposed)toast(e.message||String(e),'error')};
 root.innerHTML='<section class="company-workbench"><header class="company-title"><div><span class="collab-overline">COMPANY</span><h2>Agent organization</h2><p>Stable Agent IDs · permissioned delegation · live execution records</p></div><button type="button" class="primary" data-action="team-create">+ Team</button></header><div class="company-layout"><aside class="company-teams"></aside><div class="company-main"><div class="company-summary"></div><div class="company-people"></div><div class="company-activity"></div></div></div></section>';
 const q=selector=>root.querySelector(selector);
 const validTeam=()=>teams.find(row=>row.id===selected);
 const visible=()=>selected==='all'?members:members.filter(agent=>validTeam()?.memberIds.includes(agent.id));
 function person(agent){
  const active=tasks.filter(task=>task.agentId===agent.id&&['pending','routing','submitted','running'].includes(task.status));
  const role=agent.companyRole||'worker',teamNames=teams.filter(t=>t.memberIds.includes(agent.id)).map(t=>t.name);
  return '<article class="company-agent" data-agent="'+esc(agent.id)+'"><header><img src="./engines/'+esc(agent.engine)+'.svg" alt=""><div><strong data-no-i18n>'+esc(agent.name)+'</strong><small>'+esc(agent.engine)+' · '+esc(agent.targetHostId)+'</small></div><span class="company-agent-state '+(agent.busy?'busy':agent.running?'ready':'offline')+'">'+(active.length?'Tasks '+active.length:agent.busy?'Running':agent.running?'Ready':'Stopped')+'</span></header>'+
   '<div class="company-agent-details"><span data-no-i18n title="'+esc(agent.cwd||'')+'">'+esc(agent.cwd||'No work directory')+'</span><span data-no-i18n>'+esc(teamNames.join(' · ')||'Unassigned')+'</span></div>'+
   '<div class="company-agent-footer"><label>Policy <select data-role="'+esc(agent.id)+'">'+['worker','manager','coordinator','administrator'].map(item=>'<option value="'+item+'" '+(role===item?'selected':'')+'>'+{worker:'Worker',manager:'Team Manager',coordinator:'Coordinator',administrator:'App Admin'}[item]+'</option>').join('')+'</select></label><button type="button" data-delegate="'+esc(agent.id)+'">Delegate</button><button type="button" data-open="'+esc(agent.id)+'">Open</button></div></article>';
 }
 function render(){
  q('.company-teams').innerHTML='<strong>TEAMS <small>'+teams.length+'</small></strong><button type="button" data-team="all" class="'+(selected==='all'?'active':'')+'">All Agents <em>'+members.length+'</em></button>'+
   teams.map(t=>'<button type="button" data-team="'+esc(t.id)+'" class="'+(selected===t.id?'active':'')+'"><span data-no-i18n>'+esc(t.name)+'</span><em>'+t.memberIds.length+'</em></button>').join('')+
   '<p>Team membership controls management scope. Host and work directory remain unchanged.</p>';
  const people=visible(),busy=people.filter(row=>row.busy).length,current=validTeam();
  q('.company-summary').innerHTML='<div><strong>'+people.length+'</strong><span>Agents</span></div><div><strong>'+busy+'</strong><span>Native turns busy</span></div><div><strong>'+tasks.filter(task=>['pending','routing','submitted'].includes(task.status)).length+'</strong><span>Pending / active</span></div>'+
   (current?'<button type="button" data-action="team-edit">Edit '+esc(current.name)+'</button>':'');
  q('.company-people').innerHTML='<header class="company-section-head"><h3>'+esc(current?.name||'Agents')+'</h3><span>'+esc(current?.description||'')+'</span></header><div class="company-agent-grid">'+people.map(person).join('')+'</div>'+
   (!people.length?'<p class="company-empty">No Agents in this Team. Use Edit Team to add members.</p>':'');
  const names=new Map(members.map(a=>[a.id,a.name]));
  const edges=relations.filter(rel=>people.some(a=>a.id===rel.managerId)&&people.some(a=>a.id===rel.employeeId));
  const linked='<div class="company-relations"><h3>Management relations</h3><p>These connections are for visualization; actual authority follows policy and team membership.</p><div class="company-connection-list">'+edges.map(edge=>'<span>'+esc(names.get(edge.managerId))+' → '+esc(names.get(edge.employeeId))+' <button data-unbind="'+esc(edge.id)+'" title="Unlink">×</button></span>').join('')+'</div><button type="button" data-action="bind">+ Connect</button></div>';
  const records=tasks.filter(task=>selected==='all'||people.some(a=>a.id===task.agentId)).slice(0,60);
  q('.company-activity').innerHTML=linked+'<header class="company-section-head"><h3>Delegated work</h3><small>Tracked native task runs</small></header>'+
   '<div class="company-task-list">'+records.map(task=>'<article><header><strong>'+esc(names.get(task.agentId)||task.agentId)+'</strong><span class="company-task-state '+esc(task.status)+'">'+esc(task.status)+'</span><time>'+esc(clock(task.createdAt))+'</time></header><p data-no-i18n>'+esc(task.text)+'</p>'+
    (task.resultText?'<details><summary>Native result</summary><pre>'+esc(task.resultText)+'</pre></details>':'')+
    (task.error?'<div class="company-error" title="'+esc(task.error)+'">'+esc(task.error)+'</div>':'')+
    '<footer><span>'+esc(task.requestedBy)+'</span>'+(['failed','needs_review'].includes(task.status)?'<button data-retry="'+esc(task.id)+'">Retry recipient</button>':'')+'</footer></article>').join('')+
   (records.length?'':'<p class="company-empty">No delegated tasks yet.</p>')+'</div>';
 }
 async function refresh(){
  const [nextMembers,nextTeams,nextEdges,nextTasks]=await Promise.all([
   rpc('company.roster'),rpc('company.teams'),rpc('company.bindings'),rpc('company.tasks',{limit:200})]);
  if(disposed)return;
  members=nextMembers;teams=nextTeams;relations=nextEdges;tasks=nextTasks;
  if(selected!=='all'&&!validTeam())selected='all';
  render();
 }
 function dialog(html,onSubmit){
  const d=document.createElement('dialog');d.className='company-dialog';d.innerHTML=html;root.append(d);
  const close=()=>{d.close();d.remove()};
  d.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=close);
  d.oncancel=event=>{event.preventDefault();close()};
  d.querySelector('form').onsubmit=async event=>{
   event.preventDefault();const btn=d.querySelector('[type=submit]');btn.disabled=true;
   try{await onSubmit(new FormData(d.querySelector('form')),d);close();await refresh()}catch(err){error(err);btn.disabled=false}
  };
  d.showModal();d.querySelector('input,textarea,select')?.focus();
 }
 function teamEditor(team){
  const choices=members.map(a=>'<label class="company-member-option"><input type="checkbox" name="member" value="'+esc(a.id)+'" '+(team?.memberIds.includes(a.id)?'checked':'')+'><img src="./engines/'+esc(a.engine)+'.svg" alt=""><span>'+esc(a.name)+'</span><small>'+esc(a.targetHostId)+'</small></label>').join('');
  dialog('<form><header><h2>'+(team?'Edit Team':'Create Team')+'</h2><button type="button" data-close>×</button></header><label>Name<input name="name" required maxlength="100" value="'+esc(team?.name||'')+'"></label><label>Description<textarea name="description" maxlength="1000">'+esc(team?.description||'')+'</textarea></label><strong>Members</strong><div class="company-member-options">'+choices+'</div><footer><button type="button" data-close>Cancel</button><button type="submit" class="primary">Save Team</button></footer></form>',
  async data=>{
   const args={name:data.get('name'),description:data.get('description'),memberIds:data.getAll('member')};
   const updated=team?await rpc('company.updateTeam',{id:team.id,expectedRevision:team.revision,...args}):await rpc('company.createTeam',args);
   selected=updated.id;
  });
 }
 function delegateTo(agentId){
  const item=members.find(a=>a.id===agentId);
  if(!item)return;
  dialog('<form><header><h2>Delegate to '+esc(item.name)+'</h2><button type="button" data-close>×</button></header><p>Run on '+esc(item.targetHostId)+' · '+esc(item.cwd)+'. The native identity and project directory remain unchanged.</p><label>Task<textarea required name="text" rows="7" maxlength="16000" placeholder="Describe the result needed…"></textarea></label><footer><button type="button" data-close>Cancel</button><button class="primary" type="submit">Create task</button></footer></form>',
   data=>rpc('company.delegate',{agentId,text:data.get('text'),clientTaskId:'ui:'+crypto.randomUUID()}));
 }
 function connect(){
  const choices=members.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.name)+'</option>').join('');
  dialog('<form><header><h2>Show management relation</h2><button type="button" data-close>×</button></header><label>Manager<select name="managerId">'+choices+'</select></label><label>Subordinate<select name="employeeId">'+choices+'</select></label><p>Connecting cards cannot grant permissions. Role scope is evaluated independently.</p><footer><button type="button" data-close>Cancel</button><button type="submit" class="primary">Connect</button></footer></form>',
   data=>rpc('company.bind',{managerId:data.get('managerId'),employeeId:data.get('employeeId')}));
 }
 root.addEventListener('click',event=>{
  const team=event.target.closest('[data-team]');if(team){selected=team.dataset.team;render();return}
  const action=event.target.closest('[data-action]');
  if(action){if(action.dataset.action==='team-create')teamEditor();if(action.dataset.action==='team-edit')teamEditor(validTeam());if(action.dataset.action==='bind')connect();return}
  const open=event.target.closest('[data-open]');if(open){onOpenAgent?.(open.dataset.open);return}
  const delegate=event.target.closest('[data-delegate]');if(delegate){delegateTo(delegate.dataset.delegate);return}
  const unbind=event.target.closest('[data-unbind]');if(unbind){const edge=relations.find(item=>item.id===unbind.dataset.unbind);if(edge)void rpc('company.bind',{managerId:edge.managerId,employeeId:edge.employeeId,enabled:false}).then(refresh).catch(error);return}
  const retry=event.target.closest('[data-retry]');if(retry){if(!confirm('Confirm retry for this task only? Verify the previous native session first.'))return;void rpc('company.retry',{id:retry.dataset.retry}).then(refresh).catch(error)}
 });
 root.addEventListener('change',event=>{
  const role=event.target.closest('[data-role]');
  if(role){role.disabled=true;void rpc('company.assignRole',{agentId:role.dataset.role,role:role.value}).then(refresh).catch(error).finally(()=>{role.disabled=false})}
 });
 void refresh().catch(error);
 events=new EventSource('./events');events.onmessage=event=>{
  if(disposed||document.hidden||root.querySelector('dialog'))return;
  let value;try{value=JSON.parse(event.data)}catch{return}
  if(!['company-change','company-task','agent-event','approval'].includes(value.kind))return;
  clearTimeout(realtimeTimer);realtimeTimer=setTimeout(()=>void refresh().catch(error),130);
 };
 timer=setInterval(()=>{if(!disposed&&!document.hidden&&!root.querySelector('dialog'))void refresh().catch(error)},5000);
 return {dispose(){disposed=true;clearInterval(timer);clearTimeout(realtimeTimer);events?.close();root.querySelectorAll('dialog').forEach(item=>item.close())}};
}
