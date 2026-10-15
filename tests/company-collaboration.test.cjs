const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-company-test-'));
process.env.CLOUD_HOSTS_HOME=home;
const agents=require('../src/agent-sessions.cjs'),original={sessions:agents.sessions,activate:agents.activate,send:agents.send};
const roles=[
 {id:'mgr',name:'Manager',engine:'codex',transport:'native',threadId:'thread-mgr',engineHostId:'local',targetHostId:'local',cwd:home+'/manager',running:true,busy:false},
 {id:'worker',name:'Worker',engine:'codex',transport:'native',threadId:'thread-worker',engineHostId:'local',targetHostId:'local',cwd:home+'/worker',running:true,busy:false},
 {id:'outsider',name:'Other team worker',engine:'codex',transport:'native',threadId:'thread-other',engineHostId:'remote',targetHostId:'remote',cwd:'/srv/code',running:true,busy:false},
];
let sends=[];
agents.sessions=()=>structuredClone(roles);
agents.activate=async args=>roles.find(row=>row.id===args.session);
agents.send=async args=>{sends.push(args);return {accepted:true,turnId:'delegated-turn-'+sends.length}};
const company=require('../src/company.cjs'),executor=require('../src/company-execution.cjs'),journal=require('../src/session-journal.cjs'),occupancy=require('../src/agent-occupancy.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await delay(10)}throw Error('Delegation did not reach expected state')};
after(()=>{executor.stop();Object.assign(agents,original);fs.rmSync(home,{recursive:true,force:true})});
test('manager permission is derived from actual role and team, visual links grant nothing',()=>{
 const own=company.createTeam({name:'QA',memberIds:['mgr','worker']});
 const another=company.createTeam({name:'Other',memberIds:['outsider']});
 assert.ok(own.id&&another.id);
 assert.equal(company.canDelegate({kind:'agent',agentId:'mgr'},'worker'),false);
 assert.throws(()=>company.bind({managerId:'mgr',employeeId:'worker'}),/Only a real manager/);
 company.assignRole({agentId:'mgr',role:'manager'});
 assert.equal(company.canDelegate({kind:'agent',agentId:'mgr'},'worker'),true);
 assert.equal(company.canDelegate({kind:'agent',agentId:'mgr'},'outsider'),false);
 company.bind({managerId:'mgr',employeeId:'worker'});
 assert.equal(company.bindings().length,1);
 assert.throws(()=>company.agentDelegate('mgr',{agentId:'outsider',text:'Out of scope'}),/Forbidden/);
 assert.throws(()=>company.assignRole({agentId:'outsider',role:'administrator'}),/locally/);
 company.assignRole({agentId:'mgr',role:'worker'});
 assert.equal(company.canDelegate({kind:'agent',agentId:'mgr'},'worker'),false);
 assert.equal(company.bindings().length,1,'visual relation does not grant access');
});
test('authenticated supervisor can create idempotent delegated task and follow exact native result',async()=>{
 company.assignRole({agentId:'mgr',role:'manager'});
 const before=sends.length;
 executor.start();
 const task=company.agentDelegate('mgr',{agentId:'worker',text:'Review the API',clientTaskId:'delegate-qa-1'});
 await until(()=>company.task({id:task.id}).status==='submitted');
 assert.equal(sends.length,before+1);
 assert.equal(sends.at(-1).session,'worker');
 assert.equal(sends.at(-1).scope.source,'company');
 assert.equal(company.agentDelegate('mgr',{agentId:'worker',text:'Review the API',clientTaskId:'delegate-qa-1'}).id,task.id);
 assert.throws(()=>company.agentDelegate('mgr',{agentId:'worker',text:'Different',clientTaskId:'delegate-qa-1'}),/reused/);
 assert.throws(()=>company.agentDelegate('worker',{agentId:'mgr',text:'Escalate'}),/Forbidden/);
 assert.equal(occupancy.occupied({agentId:'worker'}),true);
 const turn=company.task({id:task.id}).turnId;
 journal.observe(roles[1],{method:'item/completed',params:{threadId:'thread-worker',turnId:turn,item:{id:'answer-1',type:'agentMessage',text:'All checks passed'}}});
 journal.observe(roles[1],{method:'turn/completed',params:{threadId:'thread-worker',turn:{id:turn,status:'completed'}}});
 await until(()=>company.task({id:task.id}).status==='completed');
 assert.equal(company.task({id:task.id}).resultText,'All checks passed');
 assert.equal(occupancy.occupied({agentId:'worker'}),false);
});
test('failed remote execution is recorded independently and never silently reissued',async()=>{
 const item=company.delegate({agentId:'outsider',text:'Check current directory'});
 await until(()=>company.task({id:item.id}).status==='submitted');
 const turn=company.task({id:item.id}).turnId;
 journal.observe(roles[2],{method:'turn/completed',params:{threadId:roles[2].threadId,turn:{id:turn,status:'failed',error:{message:'Access denied'}}}});
 assert.equal(company.task({id:item.id}).status,'failed');
 assert.match(company.task({id:item.id}).error,/denied/);
 const old=sends.length;
 await delay(45);
 assert.equal(sends.length,old);
 const retried=company.retry({id:item.id});
 assert.equal(retried.status,'pending');
 await until(()=>company.task({id:item.id}).status==='submitted');
 assert.equal(sends.length,old+1);
});
