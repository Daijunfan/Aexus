const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-agents-test-'));
process.env.CLOUD_HOSTS_HOME = home;
const registry = require('../src/registry.cjs');
const ssh = require('../src/ssh.cjs');
const terminals = require('../src/terminals.cjs');
const agents = require('../src/agent-sessions.cjs');
const core = require('../src/core.cjs');
const mac = registry.create({name:'mac-dev',host:'local-mac.invalid',os:'macos',defaultDirectory:'/Users/dev/repo'});
const win = registry.create({name:'win-dev',host:'win-dev.invalid',os:'windows',defaultDirectory:'C:\\work'});
process.on('exit',()=>fs.rmSync(home,{recursive:true,force:true}));

test('agent capability probes use the target OS and a fixed engine allowlist',async()=>{
 const original=ssh.execute;
 const probes=[];
 ssh.execute=async(id,command,directory,timeout)=>{
  probes.push({id,command,directory,timeout});
  return {exit_code:0,stdout:id===mac.id?'codex\nclaude\npi\n':'cline\r\n'};
 };
 try{
  const m=await agents.capabilities(mac.id),w=await agents.capabilities(win.id);
  assert.deepEqual(m.engines,{codex:true,claude:true,cline:false,pi:true,opencode:false});
  assert.deepEqual(w.engines,{codex:false,claude:false,cline:true,pi:false,opencode:false});
  assert.match(probes[0].command,/\$\{SHELL:-\/bin\/bash\}/);
  assert.match(probes[1].command,/Get-Command/);
  assert.equal(probes[0].timeout,16);
 }finally{ssh.execute=original}
});
test('agent sessions start unmodified CLI executables in a remote PTY',async()=>{
 const cli=require('../src/agent-cli.cjs'),create=cli.createClineSession,prepare=cli.prepareClaudeSession;
 const exe=ssh.execute,open=terminals.openTerminal;
 cli.createClineSession=async()=> ({sessionId:'native-cline-exact-id',hasInput:false});
 cli.prepareClaudeSession=async role=>['--session-id',role.nativeSessionId];
 let captured;
 ssh.execute=async()=>({exit_code:0,stdout:'codex\nclaude\ncline\npi\n'});
 terminals.openTerminal=(owner,cols,rows,options)=>{
  captured={owner,cols,rows,options};return {id:'terminal-1',kind:'agent',engine:options.engine,cwd:owner.remote.directory,running:true};
 };
 try{
  const result=await core.dispatch('hosts.agent-open',{id:mac.id,engine:'claude',directory:'/Users/dev/a project',cols:115,rows:33});
  assert.equal(result.hostId,mac.id);assert.equal(result.engine,'claude');
  assert.equal(captured.owner.id,'host:'+mac.id);
  assert.equal(captured.owner.remote.directory,'/Users/dev/a project');
  assert.equal(captured.options.command,'claude');
  assert.equal(captured.options.engine,'claude');
  assert.match(captured.options.args[1],/^[a-f0-9-]{36}$/);
  assert.deepEqual(captured.options.args.slice(0,1),['--session-id']);
  assert.deepEqual([captured.cols,captured.rows],[115,33]);
  await assert.rejects(()=>agents.open({id:mac.id,engine:'claude; rm -rf /'}),/不支持/);
  await assert.rejects(()=>agents.open({id:mac.id,engine:'pi',targetId:win.id}),/same-host/);
  await assert.rejects(()=>agents.open({id:mac.id,engine:'pi',directory:'a\nmalicious'}),/无效的工作目录/);
  await assert.rejects(()=>agents.open({id:mac.id,engine:'pi',directory:'relative/repo'}),/绝对路径/);
  await assert.rejects(()=>agents.open({id:win.id,engine:'cline',directory:'relative\\repo'}),/绝对路径/);
  const windows=await agents.open({id:win.id,engine:'cline',directory:'D:\\research'});
  assert.equal(windows.hostId,win.id);
  assert.deepEqual(captured.options.args,['--id','native-cline-exact-id','--tui','--auto-approve','true']);
  assert.equal(captured.owner.remote.directory,'D:\\research');
 }finally{ssh.execute=exe;terminals.openTerminal=open;cli.createClineSession=create;cli.prepareClaudeSession=prepare}
});
test('agent list remains distinct from terminal workbench and cannot close a foreign agent',async()=>{
 const list=terminals.listTerminals,close=terminals.close;
 const all=[
  {id:'a1',employee:'host:'+mac.id,kind:'agent',engine:'codex',running:true},
  {id:'t1',employee:'host:'+mac.id,running:true},
  {id:'a2',employee:'host:'+win.id,kind:'agent',engine:'cline',running:true}
 ];
 let closed;
 terminals.listTerminals=owner=>owner?all.filter(t=>t.employee===owner):all;
 terminals.close=async id=>{closed=id;return true};
 try{
  assert.deepEqual((await core.dispatch('hosts.agent-list',{id:mac.id})).filter(t=>['a1','a2','t1'].includes(t.id)).map(t=>t.id),['a1']);
  assert.deepEqual((await core.dispatch('hosts.agent-list',{})).filter(t=>['a1','a2','t1'].includes(t.id)).map(t=>t.id),['a1','a2']);
  await assert.rejects(()=>core.dispatch('hosts.agent-close',{id:mac.id,terminal:'a2'}),/不属于/);
  assert.equal(closed,undefined);
  assert.equal(await core.dispatch('hosts.agent-close',{id:mac.id,terminal:'a1'}),true);
  assert.equal(closed,'a1');
 }finally{terminals.listTerminals=list;terminals.close=close}
});
test('workspace mode supports agent board while preserving the independent file board',()=>{
 const saved=registry.workspace({mode:'file-board',fileBoardPatch:{columns:3}});
 const next=registry.workspace({mode:'agent-board'});
 assert.equal(next.mode,'agent-board');
 assert.equal(next.fileBoard.columns,3);
 assert.deepEqual(next.boards,saved.boards);
});


test('controller Codex route keeps launch host and work host distinct; remote cross-cloud creation is rejected',async()=>{
 const agentHosts=require('../src/agent-hosts.cjs');
 const native=require('../src/agent-native.cjs');
 const oldCapabilities=agentHosts.capabilities,oldOpen=native.open;
 let started;
 agentHosts.capabilities=async()=>({engines:{codex:true},transparentRouting:{codex:true},routingVerified:true});
 native.open=async item=>{started=item;item.running=true;item.status='idle';return {close:async()=>{}}};
 try{
  const role=await agents.open({engineHostId:'local',targetHostId:win.id,engine:'codex',name:'跨主机 Coding 会话',directory:'D:\\workspace'});
  assert.equal(role.engineHostId,'local');
  assert.equal(role.targetHostId,win.id);
  assert.equal(role.hostId,win.id);
  assert.equal(role.transport,'native');
  assert.equal(role.name,'跨主机 Coding 会话');
  assert.equal(started.cwd,'D:\\workspace');
  assert.equal(role.engineHost.id,'local');
  assert.equal(role.targetHost.name,win.name);
  assert.ok(agents.sessions(win.id).some(item=>item.id===role.id));
  assert.ok(!agents.sessions('local').some(item=>item.id===role.id));
  await assert.rejects(()=>agents.open({engineHostId:mac.id,targetHostId:win.id,engine:'codex',directory:'D:\\workspace'}),/controller-local/);
  await assert.rejects(()=>agents.open({engineHostId:win.id,targetHostId:'local',engine:'codex',directory:home}),/controller-local/);
  await assert.rejects(()=>agents.close({id:'local',session:role.id}),/不属于/);
  await agents.close({id:win.id,session:role.id});
  await agents.remove({id:win.id,session:role.id,confirm:true});
 }finally{agentHosts.capabilities=oldCapabilities;native.open=oldOpen}
});
test('existing Agent permission is reconfigured without relaunching or deleting the role',async()=>{
 const agentHosts=require('../src/agent-hosts.cjs');
 const native=require('../src/agent-native.cjs');
 const oldCapabilities=agentHosts.capabilities,oldOpen=native.open;
 agentHosts.capabilities=async()=>({engines:{codex:true},transparentRouting:{codex:true},routingVerified:true});
 native.open=async item=>{item.running=true;item.status='idle';return {close:async()=>{}}};
 try{
  const role=await agents.open({engineHostId:'local',targetHostId:win.id,engine:'codex',name:'权限切换',directory:'D:\\workspace'});
  assert.equal(role.permission,'full');
  await assert.rejects(()=>core.dispatch('hosts.agent-configure',{id:win.id,session:role.id,permission:'plan'}),/Invalid Agent permission/);
  await assert.rejects(()=>core.dispatch('hosts.agent-configure',{id:win.id,session:role.id,permission:'ask'}),/停止会话/);
  await agents.close({id:win.id,session:role.id});
  const updated=await core.dispatch('hosts.agent-configure',{id:win.id,session:role.id,permission:'ask'});
  assert.equal(updated.permission,'ask');
  assert.equal(agents.sessions(win.id).find(item=>item.id===role.id).permission,'ask');
  await agents.remove({id:win.id,session:role.id,confirm:true});
 }finally{agentHosts.capabilities=oldCapabilities;native.open=oldOpen}
});
test('configure is rejected while a role launch is in flight; the launch keeps its original permission',async()=>{
 const agentHosts=require('../src/agent-hosts.cjs');
 const cli=require('../src/agent-cli.cjs');
 const oldCaps=agentHosts.capabilities,oldExec=ssh.execute,oldTerm=terminals.openTerminal,oldCreate=cli.createClineSession;
 agentHosts.capabilities=async()=>({engines:{cline:true}});
 ssh.execute=async()=>({exit_code:0,stdout:''});
 let resolveSession;
 const sessionGate=new Promise(resolve=>{resolveSession=resolve});
 cli.createClineSession=async()=>{await sessionGate;return {sessionId:'native-cline-exact-id',hasInput:false}};
 let captured;
 terminals.openTerminal=(owner,cols,rows,options)=>{captured={owner,cols,rows,options};return {id:'terminal-1',kind:'agent',engine:options.engine,running:true}};
 try{
  const opening=agents.open({id:mac.id,engine:'cline',directory:'/Users/dev/repo'});
  const role=agents.sessions(mac.id).find(item=>item.engine==='cline'&&item.status==='starting');
  assert.ok(role,'role should be starting while its session identity is being generated');
  assert.equal(role.permission,'full');
  // A change accepted mid-flight would bake one permission into the CLI and
  // persist another. The guard must reject it before the CLI args are built.
  await assert.rejects(()=>core.dispatch('hosts.agent-configure',{id:mac.id,session:role.id,permission:'ask'}),/仍在启动/);
  assert.equal(agents.sessions(mac.id).find(item=>item.id===role.id).permission,'full');
  resolveSession();
  const launched=await opening;
  assert.equal(launched.permission,'full');
  assert.deepEqual(captured.options.args,['--id','native-cline-exact-id','--tui','--auto-approve','true']);
  // Preserve stop-then-change: once stopped, the new permission persists.
  await agents.close({id:mac.id,session:role.id});
  const updated=await core.dispatch('hosts.agent-configure',{id:mac.id,session:role.id,permission:'ask'});
  assert.equal(updated.permission,'ask');
  assert.equal(agents.sessions(mac.id).find(item=>item.id===role.id).permission,'ask');
  await agents.remove({id:mac.id,session:role.id,confirm:true});
 }finally{agentHosts.capabilities=oldCaps;ssh.execute=oldExec;terminals.openTerminal=oldTerm;cli.createClineSession=oldCreate}
});
test('configure is rejected while an activation retry cycle is in flight',async()=>{
 const agentHosts=require('../src/agent-hosts.cjs');
 const cli=require('../src/agent-cli.cjs');
 const oldCaps=agentHosts.capabilities,oldExec=ssh.execute,oldTerm=terminals.openTerminal,oldList=terminals.listTerminals,oldCreate=cli.createClineSession;
 let failOnce=false;
 agentHosts.capabilities=async()=>{if(failOnce){failOnce=false;throw Error('SSH connection timed out')}return {engines:{cline:true}}};
 ssh.execute=async()=>({exit_code:0,stdout:''});
 cli.createClineSession=async()=>({sessionId:'native-cline-exact-id',hasInput:false});
 let liveTerminal={id:'terminal-1',kind:'agent',engine:'cline',running:true};
 terminals.openTerminal=(owner,cols,rows,options)=>{liveTerminal={id:'terminal-1',kind:'agent',engine:options.engine,running:true};return liveTerminal};
 terminals.listTerminals=owner=>owner==='host:'+mac.id?[liveTerminal]:[];
 try{
  // Establish a stopped role first.
  const role=await agents.open({id:mac.id,engine:'cline',directory:'/Users/dev/repo'});
  await agents.close({id:mac.id,session:role.id});
  // Activate with the first capability probe failing offline, so the role
  // sits in the retry window: opening is empty but activations still holds it.
  failOnce=true;
  const recovering=agents.activate({id:mac.id,session:role.id});
  const until=Date.now()+5000;
  let view;
  do{await new Promise(resolve=>setTimeout(resolve,10));view=agents.sessions(mac.id).find(item=>item.id===role.id)}while(Date.now()<until&&view&&view.status!=='offline');
  assert.equal(view.status,'offline','first activation attempt should have failed offline');
  await assert.rejects(()=>core.dispatch('hosts.agent-configure',{id:mac.id,session:role.id,permission:'ask'}),/仍在启动/);
  await recovering;
  assert.equal(agents.sessions(mac.id).find(item=>item.id===role.id).permission,'full');
  await agents.close({id:mac.id,session:role.id});
  await agents.remove({id:mac.id,session:role.id,confirm:true});
 }finally{agentHosts.capabilities=oldCaps;ssh.execute=oldExec;terminals.openTerminal=oldTerm;terminals.listTerminals=oldList;cli.createClineSession=oldCreate}
});
