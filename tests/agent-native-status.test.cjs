const {test} = require('node:test');
const assert = require('node:assert/strict');
const {NativeAgent} = require('../src/agent-native.cjs');

test('an unexpected native routing disconnection keeps its visible error after cleanup',async()=>{
 const role={running:true,status:'idle'};
 const updates=[];
 const agent=new NativeAgent(role,()=>updates.push(role.status));
 agent.fail(Error('引擎来源的私有路由通道已断开'));
 await agent.closing;
 assert.equal(role.status,'error');
 assert.equal(role.running,false);
 assert.match(role.error,/通道已断开/);
 assert.deepEqual(updates,['error','error']);
 assert.ok(agent.read().events.some(e=>e.kind==='error'));
});

test('explicit native session shutdown shows stopped without an artificial failure',async()=>{
 const role={running:true,status:'idle'};
 const agent=new NativeAgent(role,()=>{});
 await agent.close();
 assert.equal(role.status,'stopped');
 assert.equal(role.running,false);
 assert.equal(role.error,undefined);
 assert.ok(!agent.read().events.some(e=>e.kind==='error'));
});

test('native Workspace never injects CloudHosts collaboration tools',()=>{
 const client=new NativeAgent({id:'pristine-native'},()=>{});
 assert.deepEqual(client.dynamicTools,[]);
});
