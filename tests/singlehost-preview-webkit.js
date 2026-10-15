// UI + real isolated HTTP backend. Seeded persisted roles are never launched.
window.runWorkspaceModeChecks=async()=>{
 const checks=[],errors=[];const check=(name,ok)=>checks.push({name,passed:!!ok});
 window.addEventListener('error',e=>errors.push(e.message));
 window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
 const wait=async fn=>{for(let i=0;i<100;i++){if(await fn())return true;await new Promise(r=>setTimeout(r,70))}return false};
 const rpc=async(method,params={})=>{
  const resp=await fetch('./rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params})}).then(r=>r.json());
  if(resp.error)throw Error(resp.error.message);return resp.result;
 };
 await wait(()=>document.querySelector('#hosts .host-card[data-id="local"]'));
 check('Core computer is first and pinned on the left',document.querySelector('#hosts .host-card')?.dataset.id==='local'&&!document.querySelector('#hosts [data-id="local"]').draggable);
 check('Core host exposes its actual operating system and local status',await (async()=>{
  const h=await rpc('hosts.get',{id:'local'});return h.local===true&&h.os&&h.status?.connected;
 })());
 document.querySelector('#hosts [data-id="local"]').click();
 check('Single-host overview includes Coding Agent preview',await wait(()=>document.querySelector('#single-agents-preview .single-agent-tile')));
 const preview=document.querySelector('#single-agents-preview'),tiles=[...preview.querySelectorAll('[data-session]')],names=tiles.map(t=>t.querySelector('strong').textContent);
 check('Only sessions targeting Core-local work host appear in its preview',names.length===2&&names.includes('Locally Launched Pi')&&names.includes('Remote-origin Codex'));
 check('Preview identifies original engine location separately from work location',
  preview.querySelector('[data-session="role-remote"] .single-agent-source')?.textContent==='DJF-Windows'&&
  preview.querySelector('[data-session="role-local"] .single-agent-source')?.textContent?.startsWith('Local'));
 check('Native engine icon and click-to-resume state rendered for stopped roles',
  !!preview.querySelector('[data-session="role-remote"] img[src*="codex.svg"]')&&
  !!preview.querySelector('[data-session="role-local"] img[src*="pi.svg"]')&&
  tiles.every(t=>t.textContent.includes('Click to resume')));
 preview.querySelector('#single-agents-all').click();
 check('Single-host Coding Agents view contains exactly the chosen local work host',await wait(()=>document.querySelector('#panel.single-agent-workbench .agent-host-card[data-host="local"]'))&&
  document.querySelectorAll('#panel.single-agent-workbench .agent-host-card').length===1);
 check('Single-host Agent panel has two sessions and no other host Agent',
  document.querySelectorAll('#panel.single-agent-workbench .agent-role').length===2&&
  !document.querySelector('#panel .agent-role[data-session="remote-target"]'));
 check('Viewing the Agent board does not automatically launch, send messages or relaunch stopped Agents',
  (await rpc('hosts.agent-list',{id:'local'})).every(item=>!item.running));
 check('No renderer errors or unhandled rejections',errors.length===0);
 return {checks,errors,passed:checks.every(x=>x.passed)};
}
