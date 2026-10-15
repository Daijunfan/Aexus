// Expert item 8/10: an intermittent outage must not erase exact session metadata.
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-expert-agent-'));
process.env.CLOUD_HOSTS_HOME=path.join(temp,'data');fs.mkdirSync(process.env.CLOUD_HOSTS_HOME,{recursive:true});
const exactId='01a1bbbb-3333-4444-8888-ffffeeeeaaaa',piId='01234567-89ab-4cde-a321-030303030303';
const roles=[{id:'codex-exact',name:'Exact Codex',engine:'codex',engineHostId:'local',targetHostId:'local',transport:'native',threadId:exactId,cwd:temp,createdAt:1},
  {id:'pi-exact',name:'Exact Pi',engine:'pi',engineHostId:'local',targetHostId:'local',transport:'pty',nativeSessionId:piId,cwd:temp,createdAt:2}];
fs.writeFileSync(path.join(process.env.CLOUD_HOSTS_HOME,'agents.json'),JSON.stringify(roles));
const hosts=require('../src/agent-hosts.cjs'),agents=require('../src/agent-sessions.cjs'),core=require('../src/core.cjs');
const get=id=>agents.sessions('local').find(item=>item.id===id);
test('8: transient SSH/token failure retains exact native Codex thread and source metadata',async()=>{
 const old=hosts.capabilities;let attempts=0;
 hosts.capabilities=async()=>{attempts++;throw Error('Your access token could not be refreshed because the network is offline')};
 try{
  await assert.rejects(agents.activate({id:'local',session:'codex-exact'}),/network is offline/);
  assert.equal(attempts,1,'A login/refresh-token failure is not retried automatically');
  assert.equal(get('codex-exact').threadId,exactId);
  assert.equal(get('codex-exact').transport,'native');
  assert.equal(get('codex-exact').engineHostId,'local');
  assert.equal(get('codex-exact').targetHostId,'local');
  assert.equal(get('codex-exact').status,'login-required');
 }finally{hosts.capabilities=old}
});
test('8: transient SSH failure does not delete a resumable PTY Agent identity',async()=>{
 const old=hosts.capabilities;
 hosts.capabilities=async()=>{throw Error('SSH connection refused: temporary outage')};
 try{
  await assert.rejects(agents.activate({id:'local',session:'pi-exact'}),/temporary outage/);
  assert.equal(get('pi-exact').nativeSessionId,piId);
  assert.equal(get('pi-exact').status,'offline');
 }finally{hosts.capabilities=old}
});
test('10: failed create retries with fixed creation ID do not multiply role cards',async()=>{
 const old=hosts.capabilities;hosts.capabilities=async()=>{throw Error('Transient login failure')};
 const values={engineHostId:'local',targetHostId:'local',engine:'pi',directory:temp,name:'Failed new Pi',creationId:'stable-create-id-001'};
 try{
  await assert.rejects(agents.open(values),/Transient login failure/);
  const first=agents.sessions('local').filter(role=>role.name==='Failed new Pi');assert.equal(first.length,1);
  await assert.rejects(agents.open(values),/Transient login failure/);
  const second=agents.sessions('local').filter(role=>role.name==='Failed new Pi');
  assert.equal(second.length,1);assert.equal(second[0].id,first[0].id);
  await assert.rejects(agents.open({...values,creationId:undefined,name:'Legacy failed raw CLI'}),/Transient login failure/);
  assert.equal(agents.sessions('local').filter(role=>role.name==='Legacy failed raw CLI').length,0);
 }finally{hosts.capabilities=old}
});
after(async()=>{await core.shutdown();fs.rmSync(temp,{recursive:true,force:true})});
