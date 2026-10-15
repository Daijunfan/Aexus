// Workspace / collaboration end-to-end fixture, restated for the Agent/Role split.
//
// This file previously drove an inline four-tab hub inside the Agent Board
// (`q('.agent-hub-nav').querySelectorAll('[data-hub]')` =
// Workspace|Company|Messages|Plan) plus the `.collab-*` and `.news-*` surfaces.
// Since the unified-workbench revision the product separates the two identities:
//
//   * the Agent Board owns native Coding Agent sessions only — no hub nav, no
//     `[data-hub]`, no hosted client frame;
//   * the Role Board owns Company, Messages and Plan through one hosted
//     original-Aexus client (`ui/role-board.js`, `ui/aexus-embed.js`);
//   * Single Host keeps distinct Agent and Role subpages.
//
// The fixture therefore no longer aborts on `q('.agent-hub-nav')` being null in
// the Agent Board. It asserts the same *intent* against the current contract:
// the collaboration surfaces moved rather than disappeared, native session
// identities stay stable and singular across the split, and reaching
// Company/Messages/Plan never starts a model turn or a Plan run.
//
// Where the old assertions now live (no path is dropped):
//   * Workspace/project/directory behaviour  -> tests/agent-board-webkit.js and
//     the Agent Board half of this fixture (native sessions, host columns).
//   * Company / Messages / Plan collaboration -> tests/role-board-webkit.js
//     (handshake, three views, one retained client) and
//     tests/role-board-live-ui.cjs (deep Core-backed behaviour, 10 checks).
window.runWorkspaceModeChecks=async()=>{
 const checks=[],errors=[];
 addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
 const q=selector=>document.querySelector(selector),add=(name,passed)=>checks.push({name,passed:!!passed});
 // Real ready gates only: every wait below polls an observable contract.
 const wait=async(fn,timeout=20000)=>{
  const end=Date.now()+timeout;
  do{ try{if(await fn())return true}catch{/* observable not mounted yet */} await new Promise(r=>setTimeout(r,65)) }while(Date.now()<end);
  return false;
 };
 const rpc=async(method,params={})=>{
  const payload=await fetch('./rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params})}).then(r=>r.json());
  if(payload.error)throw Error(payload.error.message);return payload.result;
 };

 add('Native Aexus shell is ready',await wait(()=>q('#add')&&!q('#add').disabled));
 const originalIds=(await rpc('hosts.agent-list')).map(row=>row.id);
 const planHistoryBefore=(await rpc('plan.history',{limit:20})).length;

 // ------------------------------------------------------------ Agent Board --
 q('#agent-board-mode').click();
 add('Agent Board mounts the native Agent workbench',await wait(()=>!!q('.agent-heading')&&!!q('.agent-grid')&&!!q('.agent-role-grid')));
 add('Agent Board owns only native Agents and hosts no collaboration hub',
  !q('.agent-hub-nav')&&!q('[data-hub]')&&!q('.workspace-directories')&&document.querySelectorAll('iframe').length===0);
 add('Saved native Agent session is displayed exactly once from the Core host',
  document.querySelectorAll('[data-session="native-fixture-one"]').length===1&&
  [...document.querySelectorAll('.agent-role')].map(card=>card.dataset.session).join('|')==='native-fixture-one'&&
  originalIds.includes('native-fixture-one'));
 add('Agent Board keeps its per-workgroup host-column control without a legacy role-column list',
  !!q('#agent-group-columns')&&!q('#agent-columns')&&!q('#agent-role-columns')&&!!q('.agent-role-resize'));
 add('Agent Board mode is persisted by the Core',(await rpc('hosts.workspace')).mode==='agent-board');

 // ------------------------------------------------------------- Role Board --
 q('#role-board-mode').click();
 add('Role Board mounts the collaboration hub on the same toolbar',
  await wait(()=>!!q('.agent-hub-nav')&&!!q('#role-board-mode')));
 add('Role Board hub exposes exactly Company, Messages and Plan',
  [...document.querySelectorAll('[data-role-view]')].map(button=>button.dataset.roleView).join('|')==='company|messages|plan');
 // Real ready gate for the hosted original-Aexus client, not a fixed sleep.
 const hostedReady=await wait(()=>window.cloudHosts?.roleBoard?.ready===true,30000);
 add('Hosted original Aexus client completes its handshake behind a real ready flag',hostedReady);
 if(!hostedReady){
  return {checks,passed:false,errors,diagnostics:{stage:'hosted client never became ready',
   status:q('.aexus-embed-status')?.textContent,roleViews:[...document.querySelectorAll('[data-role-view]')].map(b=>b.dataset.roleView)}};
 }
 const clientId=window.cloudHosts.roleBoard.clientId,instanceId=window.cloudHosts.roleBoard.instanceId;
 let reached=0;
 for(const view of ['messages','plan','company']){
  const since=Date.now();
  q('[data-role-view="'+view+'"]').click();
  const acknowledged=await wait(()=>window.cloudHosts.roleBoard.trace.some(row=>
   row.at>=since&&row.event==='received'&&row.type==='navigation.change'&&row.view===view));
  const retained=q('[data-role-view="'+view+'"]').getAttribute('aria-selected')==='true'&&
   document.querySelectorAll('iframe').length===1&&
   window.cloudHosts.roleBoard.clientId===clientId&&window.cloudHosts.roleBoard.instanceId===instanceId;
  if(acknowledged&&retained)reached++;
 }
 add('All three Role Board views render in one retained hosted client without a second frame',reached===3&&
  document.querySelectorAll('iframe').length===1);
 add('Role Board view selection is persisted by the Core',
  await wait(async()=>(await rpc('hosts.workspace')).roleBoard?.tab==='company'));
 add('Opening Company, Messages and Plan starts no native Agent session and no Plan run',
  (await rpc('hosts.agent-list')).length===originalIds.length&&
  (await rpc('plan.history',{limit:20})).length===planHistoryBefore);

 // --------------------------------------------- independence across the split --
 q('#agent-board-mode').click();
 add('Returning to the Agent Board detaches only the Role Board presentation',
  await wait(()=>!!q('.agent-heading')&&document.querySelectorAll('iframe').length===0));
 add('Native Agent session survives the Role Board round trip with a stable identity',
  document.querySelectorAll('[data-session="native-fixture-one"]').length===1&&
  (await rpc('hosts.agent-list')).map(row=>row.id).join('|')===originalIds.join('|'));
 add('Agent Board and Role Board keep independent persisted modes',
  (await rpc('hosts.workspace')).mode==='agent-board'&&
  (await rpc('hosts.workspace')).roleBoard?.tab==='company');
 add('No JavaScript errors or unhandled rejections',errors.length===0);
 return {checks,passed:checks.every(c=>c.passed),errors};
};
