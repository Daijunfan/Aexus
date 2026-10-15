const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-native-recover-'));
process.env.CLOUD_HOSTS_HOME=home;
const fake=path.join(home,'fake-codex');fs.writeFileSync(fake,'#!/bin/sh\nexit 1\n',{mode:0o755});process.env.CLOUD_HOSTS_CODEX=fake;
const threadId='01a12eff-8888-78c0-9666-7540aabbccdd';
fs.writeFileSync(path.join(home,'agents.json'),JSON.stringify([{
 id:'persistent-native',name:'Important History',engine:'codex',engineHostId:'local',targetHostId:'local',
 threadId,transport:'native',startedOnce:true,cwd:home,permission:'ask',createdAt:Date.now()
}]));
const agents=require('../src/agent-sessions.cjs'),native=require('../src/agent-native.cjs'),core=require('../src/core.cjs');
const original=native.open;
test('temporary account failure preserves role, exact Codex ID and data on disk, without retry storm',async()=>{
 let opens=0;
 native.open=async()=>{opens++;throw Error('Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.')};
 try{
  await assert.rejects(agents.activate({id:'local',session:'persistent-native'}),/refresh token was already used/);
  assert.equal(opens,1,'Account login errors must not be retried automatically');
  const saved=agents.sessions('local').find(item=>item.id==='persistent-native');
  assert.equal(saved.threadId,threadId);
  assert.equal(saved.status,'login-required');
  assert.equal(saved.running,false);
  const disk=JSON.parse(fs.readFileSync(path.join(home,'agents.json'),'utf8'));
  assert.equal(disk.length,1);assert.equal(disk[0].threadId,threadId);
 }finally{native.open=original}
});
test('after account recovery the same role reopens its original native thread',async()=>{
 let observed;
 native.open=async(role,changed,options)=>{
  observed={id:role.id,threadId:role.threadId,options};
  role.running=true;role.status='idle';role.error=undefined;changed();
  return {close:async()=>{role.running=false},read:()=>({running:true,events:[]})};
 };
 try{
  const restored=await agents.activate({id:'local',session:'persistent-native'});
  assert.equal(restored.id,'persistent-native');assert.equal(restored.threadId,threadId);
  assert.equal(observed.threadId,threadId);assert.equal(observed.options.requireResume,true);
  assert.equal(observed.options.deferThread,false);
  assert.equal(agents.sessions('local').length,1);
 }finally{native.open=original}
});
test.after(async()=>{await core.shutdown();fs.rmSync(home,{recursive:true,force:true})});
