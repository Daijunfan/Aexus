// Single Host projects only Role Board identities. Opening a role delegates
// to the original Aexus UI; this view never reads or creates native Agents.
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const engines={codex:'Codex',claude:'Claude Code',cline:'Cline',pi:'Pi'};

export function roleHostPane(root,host,rpc,openRole){
 let disposed=false,pending=false;
 root.innerHTML=`<section class="role-host-pane"><header><div><h2>Roles</h2><p ${host.id==='local'?'':'data-no-i18n'}>${esc(host.id==='local'?'Local Host':host.name)}</p></div><button type="button" data-role-refresh>Refresh</button><button type="button" data-role-manage>Open Role Board</button></header><p class="role-host-status" role="status">Loading roles…</p><div class="role-host-list"></div></section>`;
 const status=root.querySelector('.role-host-status'),list=root.querySelector('.role-host-list');
 const refresh=root.querySelector('[data-role-refresh]');
 async function load(){
  if(disposed||pending)return;pending=true;refresh.disabled=true;
  try{
   const roster=await rpc('roleboard.roster');if(disposed)return;
   const roles=roster.employees.filter(role=>role.source==='aexus'&&role.hostId===host.id);
   status.textContent=roles.length?'':'No roles on this host.';
   list.innerHTML=roles.length?`<table class="role-host-table"><thead><tr><th>Role</th><th>Team</th><th>Engine</th><th>Status</th><th>Working directory</th></tr></thead><tbody>${roles.map(role=>`<tr data-role-id="${esc(role.stableId)}"><td><button type="button" data-open-role="${esc(role.stableId)}" data-no-i18n>${esc(role.name)}</button><small>${esc(role.managementRole||'employee')}</small></td><td data-no-i18n>${esc(role.team)}</td><td>${esc(engines[role.engine]||role.engine)}</td><td>${role.initialization?.status==='failed'?'Needs attention':role.busy?'Working':role.running?'Online':'Idle'}</td><td data-no-i18n title="${esc(role.directory)}">${esc(role.directory)}</td></tr>`).join('')}</tbody></table>`:'';
  }catch(error){if(!disposed){status.textContent=error.message;list.replaceChildren()}}
  finally{pending=false;if(!disposed)refresh.disabled=false}
 }
 root.querySelector('[data-role-manage]').onclick=()=>openRole();
 refresh.onclick=()=>void load();
 list.onclick=event=>{const button=event.target.closest('[data-open-role]');if(button)openRole(button.dataset.openRole)};
 void load();const timer=setInterval(()=>{if(!document.hidden)void load()},5000);
 return {dispose(){disposed=true;clearInterval(timer)}};
}
