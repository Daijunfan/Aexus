window.runAgentBoardChecks=async function(){
 const checks=[],errors=[],calls=[],warnings=[],wait=async(fn)=>{for(let i=0;i<90;i++){if(fn())return true;await new Promise(r=>setTimeout(r,55))}return false};
 const check=(name,result)=>checks.push({name,passed:!!result});
 window.addEventListener('error',event=>errors.push(event.message));
 window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
 const hosts=[
  {id:'local',name:'Mac',os:'macos',host:'localhost',local:true,defaultDirectory:'/Users/test'},
  {id:'gpu',name:'GPU-server',os:'linux',host:'gpu.example',defaultDirectory:'/srv'}
 ];
 let shouldFail=true;
 const role={id:'native-gpu',name:'Original routed Codex',engine:'codex',kind:'agent',
  engineHostId:'local',targetHostId:'gpu',transport:'native',threadId:'exact-existing-thread',
  cwd:'/srv',status:'idle',running:true,busy:false,engineHost:hosts[0],targetHost:hosts[1]};
 const rpc=async(method,args={})=>{
  calls.push(method);
  if(method==='hosts.agent-hosts')return structuredClone(hosts);
  if(method==='hosts.agent-list')return [structuredClone(role)];
  if(method==='hosts.workspace')return {agentBoard:{roleOrder:{}}};
  if(method==='hosts.agent-tui'){if(shouldFail)throw Error('Codex native TUI did not attach (native_tui_handshake_timeout, generation 0)');return {...role,terminalId:'terminal-native-original',tuiState:'ready'};}
  if(method==='hosts.agent-read')return {events:[],cursor:0,approvals:[],busy:false,running:true,status:'idle'};
  if(method==='hosts.agent-capabilities')return {engines:{codex:true},transparentRouting:{codex:args.id==='local'&&args.targetHostId==='gpu'},routingVerified:true};
  throw Error('Unexpected backend command '+method);
 };
 class FakeSocket{
  static CONNECTING=0;static OPEN=1;static CLOSED=3;static CLOSING=2;
  constructor(){this.readyState=0;queueMicrotask(()=>{if(this.readyState!==0)return;this.readyState=1;this.onopen?.();this.onmessage?.({data:JSON.stringify({type:'ready',protocol:2})});});}
  send(){} close(){this.readyState=3;this.onclose?.();}
 }
 window.WebSocket=FakeSocket;
 const root=document.querySelector('#root');root.classList.add('board-workbench');
 const board=window.cloudClients['agent-board'](root,hosts,rpc,text=>warnings.push(String(text)),'gpu',
  {agentBoard:{hosts:['local','gpu'],columns:2,initialized:true}},async()=>{});
 const q=s=>root.querySelector(s);
 await wait(()=>!!q('[data-host="gpu"] [data-add-role]'));
 check('There is no duplicate blue global New Agent action',!q('#agent-new')&&!q('.agent-heading .primary'));
 check('Each host has exactly one top-right Add Agent action',q('[data-host="gpu"] .board-card-top [data-add-role]')&&
  q('[data-host="local"] .board-card-top [data-add-role]')&&root.querySelectorAll('[data-add-role]').length===2);
 q('[data-host="gpu"] .board-card-top [data-add-role]').click();
 check('Creating an Agent from GPU host preselects that work host',await wait(()=>q('#agent-target')?.value==='gpu'));
 q('.agent-create-dialog [data-close]')?.click();
 q('[data-session="native-gpu"]').click();
 check('A failed TUI preserves the session and offers reconnect without replacement chat UI',await wait(()=>
  !!q('.agent-inspector .agent-retry-connect')&&!q('.agent-inspector .agent-conversation-log')));
 check('TUI failure does not create a full-screen raw error',!warnings.some(x=>x.includes('native_tui_handshake_timeout'))&&
  !q('.agent-role-error')&&role.threadId==='exact-existing-thread');
 check('The failed attachment never calls the model',!calls.includes('hosts.agent-send'));
 shouldFail=false;
 q('.agent-retry-connect')?.click();
 check('Retry attaches native terminal to exact original thread',await wait(()=>
  !!q('.agent-inspector .xterm'))&&role.threadId==='exact-existing-thread'&&
  calls.filter(method=>method==='hosts.agent-tui').length===2);
 check('Recovery still never sends a model request',!calls.includes('hosts.agent-send'));
 q('.agent-inspector [data-close]')?.click();
 board.dispose();
 return {checks,passed:checks.every(row=>row.passed)&&!errors.length,errors,warnings};
};
