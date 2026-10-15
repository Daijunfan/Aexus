const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-plan-independent-'));
process.env.CLOUD_HOSTS_HOME=home;
const agents=require('../src/agent-sessions.cjs');
const original={sessions:agents.sessions,open:agents.open,send:agents.send,activate:agents.activate};
const roles=[],opens=[],submissions=[];
agents.sessions=()=>structuredClone(roles);
agents.open=async args=>{
 opens.push(args);
 const role={id:'native-run-'+opens.length,name:args.name,engine:'codex',transport:'native',engineHostId:args.engineHostId,
  targetHostId:args.targetHostId,cwd:args.directory,permission:args.permission,running:true,busy:false,
  status:'idle',threadId:null};
 roles.push(role);return structuredClone(role);
};
agents.send=async args=>{
 submissions.push(structuredClone(args));
 const role=roles.find(r=>r.id===args.session);
 role.threadId='thread-fresh-'+opens.length;
 return {accepted:true,turnId:'turn-fresh-'+opens.length};
};
const plans=require('../src/plan-scheduler.cjs'),groups=require('../src/collaboration.cjs'),journal=require('../src/session-journal.cjs');
after(async()=>{await plans.stop();Object.assign(agents,original);fs.rmSync(home,{recursive:true,force:true})});
test('new Plan does not require an employee or pre-created Agent role',()=>{
 const job=plans.create({name:'CI validation',action:{type:'agent',mode:'fresh',engine:'codex',hostId:'local',directory:home,
  permission:'ask',text:'Run exactly these tests and report failures.'},rule:{kind:'weekly',days:[1,2,3,4,5],time:'09:00',timezone:'Asia/Shanghai'}});
 assert.equal(job.enabled,false);
 assert.equal(job.action.mode,'fresh');
 assert.equal(job.action.directory,home);
 assert.equal(job.action.agentId,undefined);
 assert.ok(job.nextAt&&Number.isFinite(Date.parse(job.nextAt)));
 assert.deepEqual(submissions,[]);
});
test('each independent run uses a fresh, exact native Codex session with only saved task text',async()=>{
 const group=groups.create({name:'Explicit QA results'});
 const text='Run the current project tests. Report any failing assertions.';
 const job=plans.create({name:'Independent report',action:{type:'agent',mode:'fresh',engine:'codex',hostId:'local',directory:home,
  text,groupId:group.id,permission:'ask'},rule:{kind:'once',at:new Date(Date.now()+60000).toISOString()}});
 plans.start();
 const run=await plans.run({id:job.id});
 assert.equal(run.status,'submitted');
 assert.equal(run.sessionId,'native-run-1');
 assert.equal(run.threadId,'thread-fresh-1');
 assert.equal(run.turnId,'turn-fresh-1');
 assert.equal(run.finishedAt,undefined,'submission is not a completed task');
 assert.equal(opens.length,1);
 assert.equal(opens[0].engineHostId,'local');assert.equal(opens[0].targetHostId,'local');
 assert.equal(opens[0].directory,home);assert.equal(opens[0].permission,'ask');
 assert.ok(opens[0].creationId.startsWith('plan_'));
 assert.equal(submissions.length,1);
 assert.equal(submissions[0].id,'local');assert.equal(submissions[0].session,'native-run-1');
 assert.equal(submissions[0].text,text,'saved native task prompt remains unchanged');
 assert.equal(submissions[0].scope.source,'plan');assert.equal(submissions[0].scope.agentId,'native-run-1');
 assert.equal(submissions[0].scope.planId,job.id);assert.equal(submissions[0].scope.runId,run.id);
 assert.deepEqual(groups.messages({id:group.id}).messages,[],'nothing is published until a native final answer exists');
 journal.observe(roles[0],{method:'item/completed',params:{threadId:roles[0].threadId,turnId:run.turnId,
  item:{id:'answer-one',type:'agentMessage',text:'One test failed in suite A.'}}});
 journal.observe(roles[0],{method:'turn/completed',params:{threadId:roles[0].threadId,turn:{id:run.turnId,status:'completed'}}});
 const completed=plans.history({id:job.id})[0];
 assert.equal(completed.status,'completed');assert.equal(completed.resultText,'One test failed in suite A.');
 assert.equal(completed.executionStatus,'completed');
 assert.match(completed.message,/outcome/);
 assert.equal(groups.messages({id:group.id}).messages.length,1);
 assert.equal(groups.messages({id:group.id}).messages[0].text,'One test failed in suite A.');
 assert.equal(groups.messages({id:group.id}).messages[0].author.kind,'core');
 assert.equal(submissions.length,1,'result publishing does not send another model prompt');
 journal.observe(roles[0],{method:'turn/completed',params:{threadId:roles[0].threadId,turn:{id:run.turnId,status:'completed'}}});
 assert.equal(groups.messages({id:group.id}).messages.length,1,'native duplicate notifications cannot publish twice');
});
test('scheduled runs sharing an occupied native work directory never race or replay another task',async()=>{
 const job1=plans.create({name:'First',action:{type:'agent',mode:'fresh',engine:'codex',hostId:'local',directory:home,text:'First'},
  rule:{kind:'once',at:new Date(Date.now()+60000).toISOString()}});
 const job2=plans.create({name:'Second',action:{type:'agent',mode:'fresh',engine:'codex',hostId:'local',directory:home,text:'Second'},
  rule:{kind:'once',at:new Date(Date.now()+60000).toISOString()}});
 const first=await plans.run({id:job1.id});
 assert.equal(first.status,'submitted');
 const sent=submissions.length;
 const blocked=await plans.run({id:job2.id});
 assert.equal(blocked.status,'attention');assert.match(blocked.message,/Workspace is busy/);
 assert.equal(submissions.length,sent);
 assert.equal(opens.length,2);
 assert.equal(plans.history({id:job2.id})[0].turnId,undefined);
});
test('fresh Plan refuses unsupported engines and invalid permissions before saving/dispatch',()=>{
 assert.throws(()=>plans.create({name:'Pi independent',action:{type:'agent',mode:'fresh',engine:'pi',hostId:'local',directory:home,text:'Check'},
  rule:{kind:'once',at:new Date(Date.now()+60000).toISOString()}}),/native Codex/);
 assert.throws(()=>plans.create({name:'Bad permission',action:{type:'agent',mode:'fresh',engine:'codex',permission:'god',directory:home,text:'Task'},
  rule:{kind:'once',at:new Date(Date.now()+60000).toISOString()}}),/permission/);
});
