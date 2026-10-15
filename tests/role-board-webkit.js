window.runWorkspaceModeChecks=async()=>{
 const checks=[],errors=[];window.addEventListener('error',e=>errors.push(e.message));
 window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
 const q=s=>document.querySelector(s),check=(name,passed)=>checks.push({name,passed:!!passed});
 const wait=async(fn)=>{const end=Date.now()+35000;do{if(fn())return true;await new Promise(r=>setTimeout(r,80))}while(Date.now()<end);return false};
 check('Native CloudHosts shell ready',await wait(()=>q('#add')&&!q('#add').disabled));
 q('#agent-board-mode').click();
 check('Agent Board opens Workspace directly',await wait(()=>q('.agent-heading'))&&!q('[data-hub]')&&!q('iframe'));
 q('#role-board-mode').click();
 check('Original Aexus handshake works in native WebKit',await wait(()=>window.cloudHosts?.roleBoard?.ready));
 if(!window.cloudHosts?.roleBoard?.ready)return {checks,errors,passed:false,diagnostic:q('.aexus-embed-status')?.textContent};
 const client=window.cloudHosts.roleBoard.clientId,instance=window.cloudHosts.roleBoard.instanceId;
 for(const view of ['messages','plan','company']){
  const since=Date.now();q('[data-role-view="'+view+'"]').click();
  check('Original '+view+' acknowledges navigation',await wait(()=>window.cloudHosts.roleBoard.trace.some(row=>row.at>=since&&row.event==='received'&&row.type==='navigation.change'&&row.view===view)));
  check(view+' retains the same original client',q('[data-role-view="'+view+'"]').getAttribute('aria-selected')==='true'&&document.querySelectorAll('iframe').length===1&&window.cloudHosts.roleBoard.clientId===client&&window.cloudHosts.roleBoard.instanceId===instance);
 }
 q('#agent-board-mode').click();
 check('Returning to native agents detaches only Role Board presentation',await wait(()=>q('.agent-heading')&&!q('iframe')));
 q('#single-mode').click();
 check('Single Host has distinct Agent and Role subpages',await wait(()=>q('[data-view="roles"]')&&q('[data-view="agents"]')));
 q('[data-view="roles"]').click();
 check('Single Host Role subpage mounts independently',await wait(()=>q('.role-host-pane'))&&!q('.agent-grid')&&!q('iframe'));
 check('No JavaScript errors',errors.length===0);
 return {checks,errors,passed:checks.every(c=>c.passed)};
};
