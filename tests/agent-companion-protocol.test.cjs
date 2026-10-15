const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-adapters-'));
process.env.CLOUD_HOSTS_HOME=home;
const fixture=path.join(__dirname,'fixtures/fake-agent-protocol.cjs');
const {Companion}=require('../src/agent-companion.cjs');
const journal=require('../src/session-journal.cjs');
const original={};
for(const name of ['CLAUDE','PI','CLINE']){const key='CLOUD_HOSTS_'+name;original[key]=process.env[key];process.env[key]=fixture}
const clients=[];
const role=engine=>({id:engine+'-adapter',name:engine,engine,transport:'pty',engineHostId:'local',targetHostId:'local',cwd:home,permission:'ask'});
const wait=async fn=>{for(let i=0;i<80;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,20))}throw Error('Timed out waiting for native event')};
after(async()=>{await Promise.allSettled(clients.map(client=>client.close()));for(const [key,val] of Object.entries(original)){if(val===undefined)delete process.env[key];else process.env[key]=val}fs.rmSync(home,{recursive:true,force:true})});
test('Claude: exact JSON session identity, native reply, and secure refusal to change IDs',async()=>{
 process.env.FAKE_ENGINE='claude';
 const record=role('claude'),client=new Companion(record,()=>{});clients.push(client);
 const turn=await client.send('Analyze tests',{source:'company',agentId:record.id,taskId:'test-claude'});
 assert.equal(turn.engineSessionId,record.collaborationSessionId);
 await wait(()=>journal.history({sessionId:record.id}).events.some(item=>item.kind==='turn'&&item.status==='completed'));
 assert.equal(record.collaborationStarted,true);
 assert.equal(journal.history({sessionId:record.id}).events.find(row=>row.kind==='assistant').text,'Claude structured result');
 const next=await client.send('Resume original',{source:'company',agentId:record.id,taskId:'test-claude'});
 await wait(()=>journal.history({sessionId:record.id}).events.some(row=>row.kind==='turn'&&row.turnId===next.turnId&&row.status==='completed'));
 assert.equal(record.collaborationSessionId,turn.engineSessionId);
});
test('Pi: JSON RPC preserves session and blocks tool until operator approves',async()=>{
 process.env.FAKE_ENGINE='pi';
 const record=role('pi'),client=new Companion(record,()=>{});clients.push(client);
 await client.ensure();assert.equal(client.threadId,record.collaborationSessionId);
 const run=await client.send('Pi task',{source:'company',agentId:record.id,taskId:'pi-task'});
 await wait(()=>client.read().approvals.length===1);
 assert.equal(journal.history({sessionId:record.id}).events.filter(row=>row.kind==='assistant').length,0);
 const request=client.read().approvals[0];assert.equal(request.engine,'pi');
 await client.respond({requestId:request.id,decision:'accept'});
 await wait(()=>journal.history({sessionId:record.id}).events.findLast(row=>row.kind==='turn')?.status==='completed');
 assert.equal(journal.history({sessionId:record.id}).events.find(row=>row.kind==='assistant').text,'Pi result 1');
 assert.equal(client.read().busy,false);
});
test('Pi: provider failure, aborted turn, and exhausted retry are not recorded as successful execution',()=>{
 const outcomes=[
  {message:{role:'assistant',stopReason:'error',errorMessage:'provider unavailable',content:[]},expected:'provider unavailable'},
  {message:{role:'assistant',stopReason:'aborted',errorMessage:'request aborted',content:[]},expected:'request aborted'},
  {retry:{type:'auto_retry_end',success:false,finalError:'rate limit exhausted'},expected:'rate limit exhausted'}
 ];
 for(let i=0;i<outcomes.length;i++){
  const item=outcomes[i],record={...role('pi'),id:'pi-error-'+i},client=new Companion(record,()=>{});
  clients.push(client);
  const turn='unit-failure-'+i;client.active={id:turn,output:'',completed:false};client.busy=true;client.trace('start',turn);
  if(item.message)client.onPi({type:'message_end',message:item.message});
  if(item.retry)client.onPi(item.retry);
  client.onPi({type:'agent_settled'});
  const settled=journal.history({sessionId:record.id}).events.findLast(row=>row.kind==='turn');
  assert.equal(settled.status,'failed');
  assert.match(settled.text,new RegExp(item.expected));
  assert.equal(client.view().busy,false);
 }
});

test('Cline: ACP setup, exact session load identity, permission and terminal event',async()=>{
 process.env.FAKE_ENGINE='cline';
 const record=role('cline'),client=new Companion(record,()=>{});clients.push(client);
 await client.ensure();assert.equal(record.collaborationAcpSessionId,'mock-cline-session');
 const run=await client.send('Review Cline',{source:'company',agentId:record.id,taskId:'cline-task'});
 await wait(()=>client.read().approvals.length===1);
 const permission=client.read().approvals[0];
 assert.equal(permission.engine,'cline');
 await client.respond({requestId:permission.id,decision:'decline'});
 await wait(()=>journal.history({sessionId:record.id}).events.findLast(item=>item.kind==='turn')?.status==='completed');
 assert.equal(journal.history({sessionId:record.id}).events.find(row=>row.kind==='assistant').text,'Cline result 1');
});
