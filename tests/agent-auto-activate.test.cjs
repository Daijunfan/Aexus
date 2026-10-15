const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-agent-reactivate-'));
process.env.CLOUD_HOSTS_HOME=path.join(home,'home');
const executable=path.join(home,'fixture-pi');
fs.writeFileSync(executable,`#!/usr/bin/env python3
import sys,time,signal
print('READY SESSION: '+ ' '.join(sys.argv[1:]),flush=True)
while True:time.sleep(.1)
`,{mode:0o755});
process.env.CLOUD_HOSTS_PI=executable;
const core=require('../src/core.cjs'),agents=require('../src/agent-sessions.cjs'),terminals=require('../src/terminals.cjs');
const wait=async(fn,timeout=14000)=>{const until=Date.now()+timeout;while(Date.now()<until){if(await fn())return;await new Promise(r=>setTimeout(r,90))}throw Error('Timed out waiting for fake Agent subprocess')};
const ready=async id=>wait(async()=>((await terminals.read(id,0)).output||'').includes('READY SESSION'));
test('Core host is permanently visible and its files, shell, native terminal work without local SSH',async()=>{
 const rows=await core.dispatch('hosts.list');assert.equal(rows[0].id,'local');assert.equal(rows[0].local,true);
 assert.equal((await core.dispatch('hosts.get',{id:'local'})).id,'local');
 assert.equal((await core.dispatch('hosts.check',{id:'local'})).connected,true);
 const shell=await core.dispatch('hosts.exec',{id:'local',command:process.platform==='win32'?'Write-Output local-shell':'printf local-shell',directory:home});
 assert.equal(shell.exit_code,0);assert.match(shell.stdout,/local-shell/);
 const listing=await core.dispatch('hosts.files',{id:'local',operation:'workspace',directory:home,arguments:{operation:'list',args:{path:'.',hidden:true}}});
 assert.ok(listing.entries.some(entry=>entry.name==='fixture-pi'));
 const t=await core.dispatch('hosts.terminal-open',{id:'local',directory:home,cols:80,rows:20});
 assert.equal(t.host,'local');
 assert.equal(terminals.terminalOwner(t.id),'host:local');
 await core.dispatch('hosts.terminal-close',{id:'local',terminal:t.id});
 await assert.rejects(core.dispatch('hosts.remove',{id:'local'}),/cannot be deleted/);
});
test('Ctrl+C exits a native CLI; clicking role auto-recovers same persisted Pi session identity',async()=>{
 const item=await agents.open({engineHostId:'local',targetHostId:'local',engine:'pi',directory:home,name:'Interrupted Pi Session'});
 assert.match(item.nativeSessionId,/^[\da-f-]{36}$/);
 await ready(item.terminalId);
 await terminals.input(item.terminalId,'\x03');
 await wait(()=>!agents.sessions('local').find(v=>v.id===item.id)?.running);
 const before=agents.sessions('local').find(v=>v.id===item.id);
 assert.equal(before.running,false);
 const [first,duplicate]=await Promise.all([agents.activate({id:'local',session:item.id}),agents.activate({id:'local',session:item.id})]);
 assert.equal(first.id,item.id);assert.equal(first.running,true);
 assert.equal(duplicate.id,item.id);
 assert.equal(first.nativeSessionId,item.nativeSessionId,'resume must not start another unrelated Pi session');
 assert.equal(first.transport,'pty');
 assert.equal(agents.sessions('local').filter(v=>v.id===item.id).length,1);
 await agents.close({id:'local',session:item.id});
 await agents.remove({id:'local',session:item.id,confirm:true});
});
test('Claude reconnect distinguishes an untouched native session from saved history',async()=>{
 process.env.CLOUD_HOSTS_CLAUDE=executable;
 const item=await agents.open({engineHostId:'local',targetHostId:'local',engine:'claude',directory:home,name:'Claude Native Resume'});
 assert.ok(item.nativeSessionId);
 await ready(item.terminalId);
 await terminals.input(item.terminalId,'\x03');
 await wait(()=>!agents.sessions('local').find(v=>v.id===item.id)?.running);
 let next=await agents.activate({id:'local',session:item.id});
 assert.equal(next.running,true);
 assert.equal(next.nativeSessionId,item.nativeSessionId);
 await new Promise(r=>setTimeout(r,110));
 let output=(await terminals.read(next.terminalId,0)).output;
 assert.match(output,new RegExp('--session-id\\s+'+item.nativeSessionId));
 const hook=require('node:child_process').spawnSync(process.execPath,[path.join(__dirname,'../Runtime/claude_session_state.cjs'),item.nativeStateFile],{input:JSON.stringify({hook_event_name:'UserPromptSubmit',session_id:item.nativeSessionId}),encoding:'utf8'});
 assert.equal(hook.status,0);assert.equal(hook.stdout,'','Lifecycle metadata must never become prompt context');
 await agents.close({id:'local',session:item.id});
 next=await agents.activate({id:'local',session:item.id});await ready(next.terminalId);
 output=(await terminals.read(next.terminalId,0)).output;
 assert.match(output,new RegExp('--resume\\s+'+item.nativeSessionId));
 await agents.close({id:'local',session:item.id});
 await agents.remove({id:'local',session:item.id,confirm:true});
 delete process.env.CLOUD_HOSTS_CLAUDE;
});
test('New same-host Codex role uses the native app-server/TUI and never --last',async()=>{
 const native=require('../src/agent-native.cjs'),open=native.open;
 let options;
 native.open=async(item,notify,opts)=>{
  options=opts;item.status='idle';item.running=true;item.nativePendingThread=true;
  return {close:async()=>{item.running=false},read:()=>({events:[],cursor:0,running:!item.running})};
 };
 try{
  const role=await agents.open({engineHostId:'local',targetHostId:'local',engine:'codex',directory:home,name:'Exact Native Codex'});
  assert.equal(role.transport,'native');assert.equal(role.nativePendingThread,true);
  assert.equal(role.threadId,undefined,'The original TUI creates its own exact first thread');
  assert.equal(options.deferThread,true);
  assert.equal(options.requireResume,false);
  await agents.close({id:'local',session:role.id});
  await agents.remove({id:'local',session:role.id,confirm:true});
 }finally{native.open=open}
});
test('A missing local Pi executable retains the exact role until Pi can be reinstalled',async()=>{
 const item=await agents.open({engineHostId:'local',targetHostId:'local',engine:'pi',directory:home,name:'Irrecoverable Pi'});
 await ready(item.terminalId);
 await terminals.input(item.terminalId,'\x03');
 await wait(()=>!agents.sessions('local').find(v=>v.id===item.id)?.running);
 fs.unlinkSync(executable);
 await assert.rejects(agents.activate({id:'local',session:item.id}),/尚未安装|not installed/);
 const preserved=agents.sessions('local').find(v=>v.id===item.id);
 assert.equal(preserved.nativeSessionId,item.nativeSessionId,'Missing engine binary must never select another conversation');
 assert.equal(preserved.status,'error');
 assert.ok(fs.existsSync(home));
});
test.after(async()=>{await core.shutdown();fs.rmSync(home,{recursive:true,force:true})});
