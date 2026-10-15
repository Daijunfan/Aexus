const {test}=require('node:test'),assert=require('node:assert/strict');
const WebSocket=require('ws');
const proxy=require('../src/agent-tui-bridge.cjs');
function receive(socket){return new Promise((resolve,reject)=>{socket.once('message',data=>{try{resolve(JSON.parse(data))}catch(e){reject(e)}});socket.once('error',reject)});}
async function fixture(){
 const sends=[];
 const agent={role:{threadId:'01a12e83-ae95-7e90-8065-90530b27c2b1'},
  initialization:{userAgent:'test-native-appserver'},controlCwd:'/private/source',environments:[{environmentId:'remote',cwd:'/target',runtimeWorkspaceRoots:['/target']}],
  threadOptions:{cwd:'/private/source',approvalPolicy:'on-request',sandbox:'workspace-write',environments:[{environmentId:'remote',cwd:'/target',runtimeWorkspaceRoots:['/target']}]},
  child:{stdin:{write(line,cb){sends.push(JSON.parse(line));cb?.()}}}};
 const bridge=await proxy.open(agent),socket=new WebSocket(bridge.url,{headers:{Authorization:'Bearer '+bridge.token}});
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)});
 socket.send(JSON.stringify({method:'initialized'}));
 await new Promise(resolve=>setTimeout(resolve,12));
 return {agent,bridge,socket,sends,stop:async()=>{socket.close();await bridge.close()}};
}
test('Codex native TUI proxy uses exact app-server thread and rejects unrelated recovery',async()=>{
 const f=await fixture();try{
  let next=receive(f.socket);f.socket.send(JSON.stringify({id:1,method:'initialize',params:{}}));
  assert.equal((await next).result.userAgent,'test-native-appserver');assert.equal(f.sends.length,0);
  next=receive(f.socket);f.socket.send(JSON.stringify({id:3,method:'thread/resume',params:{threadId:'not-my-thread'}}));
  assert.match((await next).error.message,/thread ID mismatch/);assert.equal(f.sends.length,0);
  next=receive(f.socket);f.socket.send(JSON.stringify({id:4,method:'thread/resume',params:{threadId:f.agent.role.threadId}}));
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(f.sends.length,1);assert.match(f.sends[0].id,/^cloud-tui-/);
  assert.equal(f.sends[0].params.threadId,f.agent.role.threadId);
  assert.equal(f.sends[0].params.cwd,f.agent.controlCwd);
  assert.deepEqual(f.sends[0].params.environments,f.agent.threadOptions.environments);
  assert.ok(!('dynamicTools' in f.sends[0].params),'native thread/resume does not accept dynamicTools');
  assert.equal(f.bridge.handle({id:f.sends[0].id,result:{thread:{id:f.agent.role.threadId}}}),true);
  assert.equal((await next).result.thread.id,f.agent.role.threadId);
 }finally{await f.stop()}
});
test('Original Codex TUI turn uses native execution metadata while keeping prompt bytes unchanged',async()=>{
 const f=await fixture();try{
  let next=receive(f.socket);f.socket.send(JSON.stringify({id:7,method:'turn/start',params:{threadId:f.agent.role.threadId,cwd:'/unrelated/host',input:[{type:'text',text:'Do not modify me.'}]}}));
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(f.sends.length,1);
  assert.equal(f.sends[0].params.cwd,'/private/source');
  assert.equal(f.sends[0].params.environments[0].cwd,'/target');
  assert.deepEqual(f.sends[0].params.input,[{type:'text',text:'Do not modify me.'}]);
  f.bridge.handle({id:f.sends[0].id,result:{turn:{id:'turn-1'}}});
  assert.equal((await next).result.turn.id,'turn-1');
  next=receive(f.socket);f.bridge.handle({method:'turn/completed',params:{threadId:f.agent.role.threadId,turn:{id:'turn-1'}}});
  assert.equal((await next).method,'turn/completed');
 }finally{await f.stop()}
});
test('native new and fork select the current recovery identity without a model turn',async()=>{
 const f=await fixture();f.agent.changed=()=>{};
 try{
  const resume=receive(f.socket);f.socket.send(JSON.stringify({id:9,method:'thread/resume',params:{threadId:f.agent.role.threadId}}));
  while(!f.sends.length)await new Promise(r=>setTimeout(r,5));
  f.bridge.handle({id:f.sends.at(-1).id,result:{thread:{id:f.agent.role.threadId}}});await resume;
  const original=f.agent.role.threadId,auxiliary=receive(f.socket);
  f.socket.send(JSON.stringify({id:99,method:'thread/start',params:{ephemeral:true,threadSource:'thread_title'}}));
  assert.match((await auxiliary).error.message,/auxiliary/);assert.equal(f.agent.role.threadId,original);
  for(const [method,id] of [['thread/start','native-new'],['thread/fork','native-fork']]){
   const pending=receive(f.socket),before=f.sends.length;
   f.socket.send(JSON.stringify({id:10+before,method,params:{threadId:f.agent.role.threadId}}));
   while(f.sends.length===before)await new Promise(r=>setTimeout(r,5));
   f.bridge.handle({id:f.sends.at(-1).id,result:{thread:{id}}});
   assert.equal((await pending).result.thread.id,id);
   assert.equal(f.agent.role.threadId,id);
   assert.equal(f.agent.role.nativeHasInput,method==='thread/fork');
  }
  const pending=receive(f.socket);f.socket.send(JSON.stringify({id:33,method:'thread/fork',params:{threadId:'unrelated'}}));
  assert.match((await pending).error.message,/mismatch/);assert.equal(f.sends.length,3);
 }finally{await f.stop()}
});

test('native approval is forwarded to exactly one authenticated TUI and its answer reaches app-server',async()=>{
 const f=await fixture();try{
  const pending=receive(f.socket);
  assert.equal(f.bridge.handle({id:71,method:'item/commandExecution/requestApproval',params:{threadId:f.agent.role.threadId,reason:'Ask before executing'}}),true);
  const approval=await pending;
  assert.match(approval.id,/^cloud-server-/);
  assert.equal(approval.method,'item/commandExecution/requestApproval');
  f.socket.send(JSON.stringify({id:approval.id,result:{decision:'accept'}}));
  for(let i=0;i<30&&!f.sends.length;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(f.sends.length,1);
  assert.deepEqual(f.sends[0],{id:71,result:{decision:'accept'}});
 }finally{await f.stop()}
});
test('closing original TUI during initial thread/start still registers late exact thread ID',async()=>{
 const f=await fixture();try{
  f.agent.role.threadId=undefined;f.agent.role.nativePendingThread=true;
  f.agent.changed=()=>{f.agent.saves=(f.agent.saves||0)+1};
  f.socket.send(JSON.stringify({id:8,method:'thread/start',params:{cwd:'/fake'}}));
  for(let i=0;i<35&&!f.sends.length;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(f.sends.length,1);
  assert.equal(f.bridge.creatingThread,true);
  f.socket.close();await new Promise(resolve=>f.socket.once('close',resolve));
  const id='01a12fff-841c-73a0-a616-5c4eb153edcf';
  assert.equal(f.bridge.handle({id:f.sends[0].id,result:{thread:{id}}}),true);
  assert.equal(f.agent.role.threadId,id);
  assert.equal(f.agent.role.nativePendingThread,false);
  assert.equal(f.bridge.creatingThread,false);
  assert.equal(f.agent.saves,1);
 }finally{await f.bridge.close()}
});
test('401 token, 403 Origin and 409 existing-controller handshakes have distinct causes',async()=>{
 const f=await fixture();try{
  const attempt=(opts={})=>new Promise((resolve,reject)=>{
   const c=new WebSocket(f.bridge.url,{headers:{Authorization:'Bearer '+f.bridge.token,...opts.headers}});
   c.once('unexpected-response',(request,response)=>{resolve(response.statusCode);response.resume()});
   c.once('error',error=>reject(error));
   c.once('open',()=>{c.close();resolve(101)});
  });
  assert.equal(await attempt({headers:{Authorization:'Bearer wrong'}}),401);
  assert.equal(f.bridge.diagnostic.reason,'invalid_token');
  assert.equal(await attempt({headers:{Origin:'https://evil.example'}}),403);
  assert.equal(f.bridge.diagnostic.reason,'invalid_origin');
  assert.equal(await attempt(),409);
  assert.equal(f.bridge.diagnostic.reason,'occupied');
  assert.equal(f.bridge.activeConnections,1);
  f.bridge.releaseStale();
  assert.equal(f.bridge.activeConnections,0);
 }finally{await f.stop()}
});
test('overlapping native approvals answer their own app-server IDs exactly once even out of order',async()=>{
 const f=await fixture();
 try{
  const first=receive(f.socket);
  assert.equal(f.bridge.handle({id:33,method:'item/fileChange/requestApproval',params:{threadId:f.agent.role.threadId}}),true);
  const a=await first;
  const second=receive(f.socket);
  assert.equal(f.bridge.handle({id:34,method:'item/commandExecution/requestApproval',params:{threadId:f.agent.role.threadId}}),true);
  const b=await second;
  assert.notEqual(a.id,b.id);
  f.socket.send(JSON.stringify({id:b.id,result:{decision:'decline'}}));
  f.socket.send(JSON.stringify({id:a.id,result:{decision:'accept'}}));
  for(let tries=0;tries<55&&f.sends.length<2;tries++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.deepEqual(f.sends,[{id:34,result:{decision:'decline'}},{id:33,result:{decision:'accept'}}]);
  f.socket.send(JSON.stringify({id:a.id,result:{decision:'accept'}}));
  await new Promise(resolve=>setTimeout(resolve,45));
  assert.equal(f.sends.length,2,'A response must not be accepted twice');
 }finally{await f.stop()}
});
test('initial Codex thread creation survives view detachment and cannot spawn a second initial thread',async()=>{
 const f=await fixture();
 try{
  f.agent.role.threadId=undefined;f.agent.role.nativePendingThread=true;f.agent.changed=()=>{};
  f.socket.send(JSON.stringify({id:5,method:'thread/start',params:{cwd:'/untrusted'}}));
  for(let tries=0;tries<30&&!f.sends.length;tries++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(f.sends.length,1);
  f.socket.close();await new Promise(resolve=>f.socket.once('close',resolve));
  const second=new WebSocket(f.bridge.url,{headers:{Authorization:'Bearer '+f.bridge.token}});
  await new Promise((resolve,reject)=>{second.once('open',resolve);second.once('error',reject)});
  let next=receive(second);
  second.send(JSON.stringify({id:6,method:'thread/start',params:{cwd:'/ignored'}}));
  assert.match((await next).error.message,/pending/);
  assert.equal(f.sends.length,1,'A second window cannot fork the pending new session');
  const expected='01a12e83-ae95-7e90-8065-90530b27c2b1';
  assert.equal(f.bridge.handle({id:f.sends[0].id,result:{thread:{id:expected}}}),true);
  assert.equal(f.agent.role.threadId,expected);
  assert.equal(f.bridge.creatingThread,false);
  next=receive(second);
  second.send(JSON.stringify({id:7,method:'thread/resume',params:{threadId:expected}}));
  for(let tries=0;tries<30&&f.sends.length<2;tries++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(f.sends[1].params.threadId,expected);
  f.bridge.handle({id:f.sends[1].id,result:{thread:{id:expected}}});
  assert.equal((await next).result.thread.id,expected);
  second.close();
 }finally{await f.stop()}
});

test('thirty view detach and reattach cycles keep one bound thread and never leak controllers',async()=>{
 const f=await fixture();
 try{
  let socket=f.socket;
  const originalThread=f.agent.role.threadId;
  for(let cycle=0;cycle<30;cycle++){
   assert.equal(f.bridge.activeConnections,1);
   assert.equal(f.agent.role.threadId,originalThread);
   const next=receive(socket);
   socket.send(JSON.stringify({id:100+cycle,method:'thread/read',params:{threadId:originalThread}}));
   for(let n=0;n<30&&f.sends.length<=cycle;n++)await new Promise(r=>setTimeout(r,5));
   const last=f.sends.at(-1);
   assert.equal(last.method,'thread/read');
   assert.equal(last.params.threadId,originalThread);
   f.bridge.handle({id:last.id,result:{thread:{id:originalThread}}});
   assert.equal((await next).result.thread.id,originalThread);
   socket.close();await new Promise(resolve=>socket.once('close',resolve));
   for(let n=0;n<40&&f.bridge.activeConnections;n++)await new Promise(r=>setTimeout(r,5));
   assert.equal(f.bridge.activeConnections,0);
   if(cycle!==29){
    socket=new WebSocket(f.bridge.url,{headers:{Authorization:'Bearer '+f.bridge.token}});
    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)});
   }
  }
  assert.equal(f.agent.role.threadId,originalThread);
  assert.equal(f.bridge.activeConnections,0);
  assert.equal(f.sends.length,30);
 }finally{await f.bridge.close()}
});

test('native approval survives TUI window closure and is answered exactly once after reattach',async()=>{
 const f=await fixture();
 try{
  const original=f.agent.role.threadId;
  const pending=receive(f.socket);
  assert.equal(f.bridge.handle({id:901,method:'item/commandExecution/requestApproval',params:{threadId:original,reason:'User must approve'}}),true);
  const before=await pending;
  f.socket.close();await new Promise(resolve=>f.socket.once('close',resolve));
  for(let n=0;n<30&&f.bridge.activeConnections;n++)await new Promise(r=>setTimeout(r,5));
  assert.equal(f.bridge.activeConnections,0);
  assert.equal(f.sends.length,0,'Closing the view must not decline approval');
  const second=new WebSocket(f.bridge.url,{headers:{Authorization:'Bearer '+f.bridge.token}});
  const replay=receive(second);
  await new Promise((resolve,reject)=>{second.once('open',resolve);second.once('error',reject)});
  second.send(JSON.stringify({method:'initialized'}));
  const message=await replay;
  assert.equal(message.id,before.id);
  assert.equal(message.method,before.method);
  assert.equal(message.params.threadId,original);
  second.send(JSON.stringify({id:message.id,result:{decision:'accept'}}));
  for(let n=0;n<50&&!f.sends.length;n++)await new Promise(r=>setTimeout(r,5));
  assert.deepEqual(f.sends,[{id:901,result:{decision:'accept'}}]);
  second.send(JSON.stringify({id:message.id,result:{decision:'accept'}}));
  await new Promise(r=>setTimeout(r,20));
  assert.equal(f.sends.length,1);
  assert.equal(f.agent.role.threadId,original);
  second.close();
 }finally{await f.bridge.close()}
});

test('approval arriving while native view is detached queues until authenticated TUI returns',async()=>{
 const f=await fixture();
 try{
  f.socket.close();await new Promise(resolve=>f.socket.once('close',resolve));
  for(let n=0;n<30&&f.bridge.activeConnections;n++)await new Promise(r=>setTimeout(r,5));
  const id=902;
  assert.equal(f.bridge.handle({id,method:'item/tool/requestUserInput',params:{threadId:f.agent.role.threadId,questions:[{id:'approval-choice'}]}}),true);
  assert.equal(f.sends.length,0);
  const second=new WebSocket(f.bridge.url,{headers:{Authorization:'Bearer '+f.bridge.token}});
  const replay=receive(second);
  await new Promise((resolve,reject)=>{second.once('open',resolve);second.once('error',reject)});
  second.send(JSON.stringify({method:'initialized'}));
  const ask=await replay;
  assert.equal(ask.method,'item/tool/requestUserInput');
  second.send(JSON.stringify({id:ask.id,result:{answers:{'approval-choice':{answers:['yes']}}}}));
  for(let n=0;n<50&&!f.sends.length;n++)await new Promise(r=>setTimeout(r,5));
  assert.deepEqual(f.sends,[{id,result:{answers:{'approval-choice':{answers:['yes']}}}}]);
  second.close();
 }finally{await f.bridge.close()}
});

test('pending native approval waits for reconnecting TUI initialized handshake before replay',async()=>{
 const f=await fixture();
 try{
  const original=f.agent.role.threadId;
  f.socket.close();await new Promise(resolve=>f.socket.once('close',resolve));
  for(let i=0;i<50&&f.bridge.activeConnections;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.bridge.handle({id:2222,method:'item/commandExecution/requestApproval',params:{threadId:original,reason:'explicit'}}),true);
  const second=new WebSocket(f.bridge.url,{headers:{Authorization:'Bearer '+f.bridge.token}});
  await new Promise((resolve,reject)=>{second.once('open',resolve);second.once('error',reject)});
  let premature=0;
  second.on('message',()=>premature++);
  await new Promise(resolve=>setTimeout(resolve,45));
  assert.equal(premature,0,'Native TUI is not initialized and cannot yet accept approval replay');
  const replay=receive(second);
  second.send(JSON.stringify({method:'initialized'}));
  const approval=await replay;
  assert.equal(approval.method,'item/commandExecution/requestApproval');
  assert.equal(approval.params.threadId,original);
  second.send(JSON.stringify({id:approval.id,result:{decision:'decline'}}));
  for(let i=0;i<50&&!f.sends.length;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.deepEqual(f.sends,[{id:2222,result:{decision:'decline'}}]);
  second.close();
 }finally{await f.bridge.close()}
});

test('app-server turn acceptance after view detaches is journaled once without retry or thread switch',async()=>{
 const f=await fixture();
 try{
  const entries=[];
  f.agent.onTurnAccepted=(turnId,text)=>entries.push({turnId,text,threadId:f.agent.role.threadId});
  const thread=f.agent.role.threadId;
  f.socket.send(JSON.stringify({id:991,method:'turn/start',params:{threadId:thread,input:[{type:'text',text:'Run my existing task once.'}]}}));
  for(let i=0;i<60&&!f.sends.length;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.sends.length,1);
  assert.equal(f.sends[0].method,'turn/start');
  const request=f.sends[0];
  f.socket.close();await new Promise(resolve=>f.socket.once('close',resolve));
  assert.equal(f.bridge.handle({id:request.id,result:{turn:{id:'native-turn-991'}}}),true);
  assert.deepEqual(entries,[{turnId:'native-turn-991',text:'Run my existing task once.',threadId:thread}]);
  assert.equal(f.bridge.handle({id:request.id,result:{turn:{id:'native-turn-991'}}}),false);
  assert.equal(entries.length,1);
  assert.equal(f.sends.length,1,'View closure must never resend the model turn');
  assert.equal(f.agent.role.threadId,thread);
 }finally{await f.bridge.close()}
});
