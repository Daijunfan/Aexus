// Single Host projects only Role Board identities. Opening a role delegates
// to the original Aexus UI; this view never reads or creates native Agents.
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const engines={codex:'Codex',claude:'Claude Code',cline:'Cline',pi:'Pi',opencode:'OpenCode'};
const roles={employee:'Employee',manager:'Manager',governor:'Governor',secretary:'Secretary'};
function statusOf(role){
 if(role.initialization?.status==='failed')return {label:'Needs attention',state:'attention'};
 if(role.initialization?.status==='pending'||role.initialization?.status==='running')return {label:'Initializing',state:'starting'};
 if(role.busy)return {label:'Working',state:'working'};
 if(role.running)return {label:'Online',state:'online'};
 return {label:'Idle',state:'idle'};
}

export function roleHostPane(root,host,rpc,openRole){
 let disposed=false,pending=false;
 const sourceHost=host.id==='local'?'Local Host':host.name;
 root.innerHTML=`<section class="role-host-pane"><header><div><h2>Roles</h2><p ${host.id==='local'?'':'data-no-i18n'}>${esc(host.id==='local'?'Local Host':host.name)}</p></div><button type="button" data-role-refresh>Refresh</button><button type="button" data-role-manage>Open Role Board</button></header><p class="role-host-status" role="status">Loading roles…</p><div class="role-host-list"></div></section>`;
 const status=root.querySelector('.role-host-status'),list=root.querySelector('.role-host-list');
 const refresh=root.querySelector('[data-role-refresh]');
 function card(role){
  const engine=engines[role.engine]||role.engine||'';
  const state=statusOf(role);
  const icon=role.engine?`<img class="role-host-engine-icon" src="./engines/${esc(role.engine)}.svg" alt="${esc(engine)}" draggable="false">`:'';
  return `<article class="role-host-card" data-role-id="${esc(role.stableId)}"><button type="button" data-open-role="${esc(role.stableId)}">${icon}<span class="role-host-card-main"><span class="role-host-card-title"><strong data-no-i18n>${esc(role.name)}</strong><em>${esc(roles[role.managementRole]||role.managementRole||'employee')}</em></span><span class="role-host-card-state" data-state="${state.state}"><i></i>${state.label} · ${esc(engine)}</span><span class="role-host-card-meta"><small data-no-i18n title="${esc(role.directory)}">${esc(role.directory)}</small><small data-no-i18n title="${esc(sourceHost)}">${esc(sourceHost)}</small></span></span></button></article>`;
 }
 async function load(){
  if(disposed||pending)return;pending=true;refresh.disabled=true;
  try{
   const roster=await rpc('roleboard.roster');if(disposed)return;
   const hostRoles=roster.employees.filter(role=>role.source==='aexus'&&role.hostId===host.id);
   status.textContent=hostRoles.length?'':'No roles on this host.';
   list.innerHTML=hostRoles.length?hostRoles.map(card).join(''):'';
  }catch(error){if(!disposed){status.textContent=error.message;list.replaceChildren()}}
  finally{pending=false;if(!disposed)refresh.disabled=false}
 }
 root.querySelector('[data-role-manage]').onclick=()=>openRole();
 refresh.onclick=()=>void load();
 list.onclick=event=>{const button=event.target.closest('[data-open-role]');if(button)openRole(button.dataset.openRole)};
 void load();const timer=setInterval(()=>{if(!document.hidden)void load()},5000);
 return {dispose(){disposed=true;clearInterval(timer)}};
}
