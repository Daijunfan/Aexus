// Packaged Windows native PTY smoke. Run explicitly under the installed Windows Node.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=process.env.CLOUD_HOSTS_TEST_APP_ROOT||path.resolve(__dirname,'..');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-windows-agent-'));
process.env.CLOUD_HOSTS_HOME=path.join(data,'registry');
const cwd=path.join(data,'workspace');fs.mkdirSync(cwd);
const core=require(path.join(root,'backend/src/core.cjs'));
const terminals=require(path.join(root,'backend/src/terminals.cjs'));
const agents=require(path.join(root,'backend/src/agent-sessions.cjs'));
(async()=>{
 let item;
 try{
  const local=(await core.dispatch('hosts.list'))[0];
  assert.equal(local.id,'local');assert.equal(local.status.connected,true);
  assert.equal((await core.dispatch('hosts.get',{id:'local'})).id,'local');
  const command=await core.dispatch('hosts.exec',{id:'local',directory:cwd,command:'Write-Output CLOUDHOSTS_LOCAL_WINDOWS_EXEC'});
  assert.equal(command.exit_code,0);assert.match(command.stdout,/CLOUDHOSTS_LOCAL_WINDOWS_EXEC/);
  const files=await core.dispatch('hosts.files',{id:'local',directory:cwd,operation:'workspace',arguments:{operation:'list',args:{path:'.',hidden:false}}});
  assert.equal(files.root,cwd);assert.ok(Array.isArray(files.entries));
  console.log('WIN_2_9_5_LOCAL_HOST_SIDEBAR_AND_NATIVE_EXEC_FILE=PASS');
  // Codex uses the native app-server / original TUI in 2.9.8; this is a
  // separate ConPTY infrastructure smoke test, not a fabricated Codex PTY.
  item=await core.dispatch('hosts.terminal-open',{id:'local',directory:cwd,cols:95,rows:30});
  assert.equal(item.host,'local');
  assert.equal(terminals.terminalOwner(item.id),'host:local');
  await new Promise(resolve=>setTimeout(resolve,900));
  const read=await core.dispatch('hosts.terminal-read',{id:'local',terminal:item.id,cursor:0,waitMs:50});
  assert.equal(typeof read.output,'string');assert.ok(read.cursor>=0);
  console.log('WIN_LOCAL_NATIVE_TERMINAL_CONPTY=PASS');
  console.log('WIN_LOCAL_SHELL_STREAM=PASS');
 }finally{
  if(item)await core.dispatch('hosts.terminal-close',{id:'local',terminal:item.id})
  await core.shutdown();
  // Windows ConPTY teardown can finish asynchronously after the broker exits.
  for(let n=0;n<24;n++){
   try{fs.rmSync(data,{recursive:true,force:true});break}
   catch(error){if(n===23||error.code!=='EPERM'&&error.code!=='EBUSY')throw error;await new Promise(r=>setTimeout(r,250))}
  }
  console.log('WIN_LOCAL_AGENT_WORKSPACE_RELEASED=PASS');
 }
})().catch(error=>{console.error(error);process.exitCode=1});
