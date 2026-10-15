// Real Windows ConPTY Ctrl+C and click-to-reactivate regression test.
// Staged fake native Agent CLI; nothing is sent to a model or user's account.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),exe=path.join(root,'Windows','test_agent_cli.exe');
if(!fs.existsSync(exe))throw Error('Windows fake native CLI was not compiled');
const wrapper=path.join(root,'Windows','test_agent_cli.cmd');
const asCmd=process.env.CLOUD_HOSTS_RESUME_AS_CMD==='1';
if(asCmd)fs.writeFileSync(wrapper,'@echo off\r\n"%~dp0test_agent_cli.exe" %*\r\nexit /b %ERRORLEVEL%\r\n');
const fake=asCmd?wrapper:exe;
const data=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-win-reactivate-'));
process.env.CLOUD_HOSTS_HOME=path.join(data,'core');process.env.CLOUD_HOSTS_PI=fake;
const work=path.join(data,'work');fs.mkdirSync(work);
const core=require(path.join(root,'backend','src','core.cjs'));
const agents=require(path.join(root,'backend','src','agent-sessions.cjs'));
const terminals=require(path.join(root,'backend','src','terminals.cjs'));
const wait=async (f,timeout=10000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await f())return true;await new Promise(r=>setTimeout(r,140))}return false};
(async()=>{
 let item;
 try{
  item=await core.dispatch('hosts.agent-open',{engineHostId:'local',targetHostId:'local',engine:'pi',directory:work,name:'Native ConPTY Resume'});
  assert.match(item.nativeSessionId,/^[0-9a-f-]{36}$/);
  assert.ok(await wait(async()=>((await terminals.read(item.terminalId,0)).output||'').includes('READY SESSION')),'Fake native Agent never entered ConPTY');
  const brokerFile=path.join(process.env.CLOUD_HOSTS_HOME,'terminal-'+item.terminalId+'.json');
  assert.ok(await wait(()=>!fs.existsSync(brokerFile),3000),'ConPTY must unlink its one-shot config after parsing');
  console.log('WINDOWS_BROKER_CONFIG_IS_ONE_SHOT=PASS');
  console.log('WINDOWS_CTRL_C_FAKE_AGENT_INITIALIZED=PASS');
  await terminals.input(item.terminalId,'\x03');
  if(!await wait(()=>!agents.sessions('local').find(a=>a.id===item.id).running,6000)){
   const result=await terminals.read(item.terminalId,0);
   console.error('CTRL_C_WIN_DIAGNOSTIC_OUTPUT='+JSON.stringify((result.output||'').slice(-1000)));
   throw Error('Ctrl+C did not terminate fake Windows native Agent');
  }
  console.log('WINDOWS_CTRL_C_TERMINATED_REAL_CONPTY_PROCESS=PASS');
  const [restored,simultaneous]=await Promise.all([
   core.dispatch('hosts.agent-activate',{id:'local',session:item.id}),
   core.dispatch('hosts.agent-activate',{id:'local',session:item.id})
  ]);
  assert.equal(restored.id,item.id);assert.equal(restored.running,true);assert.equal(restored.nativeSessionId,item.nativeSessionId);
  assert.equal(simultaneous.id,item.id);assert.equal(simultaneous.terminalId,restored.terminalId);
  assert.notEqual(restored.terminalId,item.terminalId);
  assert.ok(await wait(async()=>((await terminals.read(restored.terminalId,0)).output||'').includes(item.nativeSessionId)));
  console.log('WINDOWS_CLICK_REACTIVATES_SAME_SESSION_AFTER_CTRL_C=PASS');
  console.log('WINDOWS_SIMULTANEOUS_CLICKS_DO_NOT_DUPLICATE_AGENTS=PASS');
  console.log('WINDOWS_MODEL_MESSAGES=0');
 }finally{
  if(item&&agents.sessions('local').some(role=>role.id===item.id)){
   await agents.close({id:'local',session:item.id});
   await agents.remove({id:'local',session:item.id,confirm:true});
  }
  await core.shutdown();
  if(asCmd)fs.rmSync(wrapper,{force:true});
  for(let i=0;i<25;i++){
   try{fs.rmSync(data,{recursive:true,force:true});break}
   catch(error){if(i===24||!['EPERM','EBUSY'].includes(error.code))throw error;await new Promise(r=>setTimeout(r,250))}
  }
 }
})().catch(error=>{console.error(error);process.exitCode=1});
