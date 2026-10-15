// Opt-in real Pi CLI, no user prompt and no model turn. Isolated CloudHosts home.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-hosts-pi-live-'));
const bin=path.join(os.homedir(),'.npm-global/bin/pi');assert.ok(fs.existsSync(bin),'Pi must be installed');
process.env.CLOUD_HOSTS_HOME=path.join(tmp,'home');process.env.CLOUD_HOSTS_PI=bin;
const agents=require('../src/agent-sessions.cjs'),terminals=require('../src/terminals.cjs'),registry=require('../src/registry.cjs'),ssh=require('../src/ssh.cjs');
const target=process.argv[2],remote=['gpu','windows'].includes(target),windows=target==='windows';
const work=remote?(windows?'C:\\Users\\djf\\AppData\\Local\\Temp\\'+path.basename(tmp):'/tmp/'+path.basename(tmp)):tmp;
const hostId=remote?registry.create({name:'Native Pi session QA',host:windows?'DJF-Windows':'bupt208',jump:windows?'bupt208':undefined,os:windows?'windows':'linux',defaultDirectory:work}).id:'local';
const state=async role=>JSON.parse(remote?Buffer.from((await ssh.files(hostId,'native_io',{operation:'read',args:{path:role.nativeStateFile}},work)).data,'base64').toString():fs.readFileSync(role.nativeStateFile,'utf8'));
const wait=async(condition,timeout=20000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await condition())return;await new Promise(r=>setTimeout(r,130))}throw Error('Timeout awaiting real Pi terminal state')};
(async()=>{
 let role;
 try{
  if(remote)await ssh.execute(hostId,windows?'New-Item -ItemType Directory -Force -Path '+ssh.psquote(work)+'|Out-Null':'mkdir -p -- '+ssh.quote(work),windows?'C:\\Users\\djf':'/tmp',30);
  role=await agents.open({engineHostId:hostId,targetHostId:hostId,engine:'pi',name:'Live Pi Recovery Check',directory:work});
  const session=role.nativeSessionId;assert.match(session,/^[0-9a-f-]{36}$/);
  await wait(async()=>{
   const output=(await terminals.read(role.terminalId,0)).output||'';
   return output.length>25;
  });
  assert.equal(agents.sessions(hostId).find(v=>v.id===role.id)?.running,true);
  console.log('REAL_NATIVE_PI_NATIVE_TUI_STARTED=PASS');
  // Explicitly terminate the same PTY broker as an exiting Ctrl+C. It cannot
  // trigger a prompt or contaminate any model context.
  await terminals.close(role.terminalId);
  await wait(()=>!agents.sessions(hostId).find(v=>v.id===role.id)?.running);
  const resumed=await agents.activate({id:hostId,session:role.id});
  assert.equal(resumed.running,true,JSON.stringify(resumed));
  assert.equal(resumed.nativeSessionId,session);
  assert.equal(resumed.id,role.id);
  assert.equal(resumed.transport,'pty');
  assert.notEqual(resumed.terminalId,role.terminalId);
  console.log('REAL_NATIVE_PI_REACTIVATED_SAME_SESSION_ID=PASS');
  await wait(async()=>/deepseek|pi v/i.test((await terminals.read(resumed.terminalId,0)).output));
  await new Promise(r=>setTimeout(r,1000));
  await terminals.input(resumed.terminalId,'/new');await new Promise(r=>setTimeout(r,250));await terminals.input(resumed.terminalId,'\r');
  let current;
  await wait(async()=>{current=(await state(resumed)).sessionId;return current!==session});
  await terminals.close(resumed.terminalId);
  const switched=await agents.activate({id:hostId,session:role.id});
  assert.equal(switched.nativeSessionId,current,'Reconnect must follow the session selected by original /new');
  console.log('REAL_NATIVE_PI_NATIVE_NEW_SESSION_RECONNECT=PASS');
  console.log('REAL_NATIVE_PI_MODEL_INPUTS_SENT=0');
 }finally{
  if(role&&agents.sessions(hostId).some(v=>v.id===role.id)){
   await agents.close({id:hostId,session:role.id});
   await agents.remove({id:hostId,session:role.id,confirm:true});
  }
  await agents.shutdown();await terminals.shutdown();
  if(remote)await ssh.execute(hostId,windows?'Remove-Item -LiteralPath '+ssh.psquote(work)+' -Recurse -Force':'rm -rf -- '+ssh.quote(work),windows?'C:\\Users\\djf':'/tmp',30);
  fs.rmSync(tmp,{recursive:true,force:true});
 }
})().catch(err=>{console.error(err);process.exitCode=1});
