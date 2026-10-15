const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-unified-task-'));
process.env.CLOUD_HOSTS_HOME=home;
const sessions=require('../src/agent-sessions.cjs');
const saved={sessions:sessions.sessions,send:sessions.send,activate:sessions.activate};
let member={id:'member',name:'Member',engine:'codex',transport:'native',targetHostId:'local',
 engineHostId:'local',cwd:home,threadId:'native-thread-member',permission:'full',running:true,busy:false};
const sends=[];
sessions.sessions=()=>[{...member}];
sessions.send=async args=>{sends.push(args);return {accepted:true,turnId:'turn-'+sends.length}};
sessions.activate=async()=>({...member});
const service=require('../src/agent-task-service.cjs');
after(()=>{Object.assign(sessions,saved);fs.rmSync(home,{recursive:true,force:true})});
const invoke=({prepare=()=> 'native instructions',authorize=()=>{}}={})=>service.submit({
 role:{...member},scope:{source:'company',agentId:member.id,taskId:'task-one'},
 prepare,authorize
});

test('shared Task/Run submission preserves exact native identity, source and authorization',async()=>{
 let checks=0;
 const result=await invoke({authorize:()=>{checks++}});
 assert.equal(checks,2,'permissions are checked before and after preparing the model input');
 assert.equal(result.agent.threadId,'native-thread-member');
 assert.equal(result.accepted.turnId,'turn-1');
 assert.equal(sends[0].session,'member');
 assert.equal(sends[0].text,'native instructions');
 assert.deepEqual(sends[0].scope,{source:'company',agentId:'member',taskId:'task-one'});
});

test('revoking permission during asynchronous message attachment staging prevents model submission',async()=>{
 const before=sends.length;let allowed=true;
 await assert.rejects(invoke({authorize:()=>{if(!allowed)throw Error('Collaboration grant revoked')},
  prepare:async()=>{allowed=false;return 'Would have sent'}}),/grant revoked/);
 assert.equal(sends.length,before,'the exact source may not dispatch after revocation');
});

test('modifying engine, host, workspace or native session during staging invalidates exact identity',async()=>{
 for(const [property,change] of [['threadId','another-thread'],['targetHostId','cloud-host'],['engine','pi'],['cwd','/different/workspace']]){
  const original=member,before=sends.length;
  await assert.rejects(invoke({prepare:async()=>{member={...member,[property]:change};return 'Untrusted old target'}}),/identity changed/);
  assert.equal(sends.length,before,'no native send may target changed '+property);
  member=original;
 }
});

test('unsupported sources and ambiguous receipts are blocked without a second submission',async()=>{
 await assert.rejects(service.submit({role:{...member},
  scope:{source:'guardian',agentId:'member'},prepare:()=> 'private'}),/Invalid native TaskContext/);
 const before=sends.length,normal=sessions.send;
 sessions.send=async()=>({accepted:true});
 try{await assert.rejects(invoke(),/without an exact turn ID/)}
 finally{sessions.send=normal}
 assert.equal(sends.length,before,'ambiguous receipts cannot be retried by the common service');
});
