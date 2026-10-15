const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-mcp-test-'));
process.env.CLOUD_HOSTS_HOME=home;
const agents=require('../src/agent-sessions.cjs');
const initial=agents.sessions,role={id:'mcp-codex',name:'Codex',engine:'codex',transport:'native',targetHostId:'local',engineHostId:'local',cwd:home,threadId:'native-thread-mcp'};
agents.sessions=()=>[role];
const groups=require('../src/collaboration.cjs'),store=require('../src/collaboration-store.cjs'),mcp=require('../src/collaboration-mcp.cjs');
const native={role,dead:false,busy:true,toolScope:null},servers=[];
async function call(url,method,params,id=23,headers={}){
 const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json',...headers},
  body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
 return {status:response.status,body:[202,403].includes(response.status)?null:await response.json()};
}
after(async()=>{await Promise.all(servers.map(value=>value.close()));agents.sessions=initial;fs.rmSync(home,{recursive:true,force:true})});
test('MCP server advertises real scoped collaboration tools through the existing native Codex session',async()=>{
 const group=groups.create({name:'MCP',memberIds:[role.id]});
 const item=groups.post({id:group.id,text:'Publish tests',mentions:[role.id]});
 store.change(item.id,role.id,['pending'],{status:'submitted',turn_id:'turn-2'});
 native.toolScope={source:'group',agentId:role.id,groupId:group.id,messageId:item.id,turnId:'turn-2'};
 const server=await mcp.open(native);servers.push(server);
 const discovered=await call(server.url,'tools/list');
 assert.equal(discovered.status,200);
 assert.deepEqual(discovered.body.result.tools.map(tool=>tool.name),['cloud_docs','cloud_api','cloud_reply','cloud_group_reply','cloud_delegate','cloud_task_status','cloud_plan_create']);
 const welcome=await call(server.url,'initialize',{protocolVersion:'2025-03-26'});
 assert.equal(welcome.body.result.protocolVersion,'2025-03-26');
 const posted=await call(server.url,'tools/call',{name:'cloud_group_reply',arguments:{messageId:item.id,text:'Tests passed'}},'tool-id-1');
 assert.equal(posted.body.result.isError,undefined);
 const value=JSON.parse(posted.body.result.content[0].text);
 assert.equal(value.published,true);
 assert.equal(store.delivery(item.id,role.id).status,'replied');
 const second=await call(server.url,'tools/call',{name:'cloud_group_reply',arguments:{messageId:item.id,text:'Tests passed'}},'tool-id-1');
 assert.equal(JSON.parse(second.body.result.content[0].text).messageId,value.messageId);
 const different=await call(server.url,'tools/call',{name:'cloud_group_reply',arguments:{messageId:item.id,text:'Changed answer'}},'tool-id-1');
 assert.equal(different.body.result.isError,true,'repeating the same publication with changed contents must be rejected');
 const fake=await call(server.url,'tools/call',{name:'cloud_group_reply',arguments:{messageId:'wrong',text:'Impersonation'}},'tool-id-4');
 assert.equal(fake.body.result.isError,true);
 native.toolScope=null;
 const denied=await call(server.url,'tools/call',{name:'cloud_delegate',arguments:{agentId:role.id,text:'Escalate'}},'tool-id-6');
 assert.equal(denied.body.result.isError,true);
 const forged=await call(server.url,'tools/list',{},91,{origin:'https://attacker.invalid'});
 assert.equal(forged.status,403);
});
test('native App Server dynamic tool responses validate the exact thread and turn ID',async()=>{
 const {NativeAgent}=require('../src/agent-native.cjs');
 const group=groups.create({name:'Direct dynamic',memberIds:[role.id]});
 const item=groups.post({id:group.id,text:'Reply through dynamic tool',mentions:[role.id]});
 store.change(item.id,role.id,['pending'],{status:'submitted',turn_id:'turn-3'});
 const agent=new NativeAgent(role,()=>{}),answers=[];
 agent.busy=true;agent.toolScope={source:'group',agentId:role.id,groupId:group.id,messageId:item.id,turnId:'turn-3'};
 agent.child={stdin:{write:x=>answers.push(JSON.parse(x))}};
 const params={threadId:role.threadId,turnId:'turn-3',tool:'cloud_group_reply',callId:'call-stable-3',arguments:{messageId:item.id,text:'Pass'}};
 await agent.handleGroupTool({id:105,method:'item/tool/call',params:{...params,turnId:'other-turn'}});
 assert.equal(answers[0].result.success,false);
 await agent.handleGroupTool({id:106,method:'item/tool/call',params});
 assert.equal(answers[1].result.success,true);
 assert.equal(store.delivery(item.id,role.id).status,'replied');
});
