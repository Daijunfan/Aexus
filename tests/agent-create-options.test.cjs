const {test}=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../ui/agent-create-options.js');
const hosts=[{id:'local',name:'Local work computer',os:'macos'},
 {id:'gpu',name:'GPU-server',os:'linux'},
 {id:'cloud-two',name:'Cloud B',os:'linux'}];
test('Mac local work host has exactly one clickable origin',async()=>{
 const {sourceChoices,sourceLabel}=await load();
 assert.deepEqual(sourceChoices(hosts,'local').map(x=>x.id),['local']);
 assert.equal(sourceLabel(hosts[0]),'Mac 本地');
});
test('remote work host has only local Mac and itself; no cloud A to B',async()=>{
 const {sourceChoices}=await load();
 assert.deepEqual(sourceChoices(hosts,'gpu').map(x=>x.id),['local','gpu']);
 assert.deepEqual(sourceChoices(hosts,'cloud-two').map(x=>x.id),['local','cloud-two']);
 assert.throws(()=>sourceChoices(hosts,'does-not-exist'),/registered/);
});
test('Mac remote route presents only independently verified native engines',async()=>{
 const {permittedEngines,canCreateAgent}=await load();
 const ready={engines:{codex:true,claude:true,cline:true,pi:true},routingVerified:true,transparentRouting:{codex:true}};
 assert.deepEqual(permittedEngines('local','gpu',ready),['codex']);
 assert.ok(canCreateAgent('local','gpu','codex',ready));
 assert.equal(canCreateAgent('local','gpu','cline',ready),false);
 assert.equal(canCreateAgent('cloud-two','gpu','codex',ready),false);
 assert.equal(canCreateAgent('local','gpu','codex',{...ready,routingVerified:false}),false);
 assert.equal(canCreateAgent('local','gpu','codex',{...ready,transparentRouting:{codex:false}}),false);
 const pi={...ready,transparentRouting:{codex:false,pi:true}};
 assert.deepEqual(permittedEngines('local','gpu',pi),['pi']);
 assert.ok(canCreateAgent('local','gpu','pi',pi));
 assert.equal(canCreateAgent('local','gpu','codex',pi),false);
 const cline={...ready,transparentRouting:{codex:false,cline:true}};
 assert.deepEqual(permittedEngines('local','gpu',cline),['cline']);
 assert.ok(canCreateAgent('local','gpu','cline',cline));
 assert.equal(canCreateAgent('local','gpu','pi',cline),false);
 const claude={...ready,transparentRouting:{claude:true}};
 assert.deepEqual(permittedEngines('local','gpu',claude),['claude']);
 assert.ok(canCreateAgent('local','gpu','claude',claude));
});
test('same-host choices include only installed engines without gray disabled options',async()=>{
 const {permittedEngines,canCreateAgent}=await load();
 const caps={engines:{codex:true,claude:true,cline:false,pi:true}};
 assert.deepEqual(permittedEngines('gpu','gpu',caps),['codex','claude','pi']);
 assert.deepEqual(permittedEngines('gpu','gpu',undefined),['codex','claude','cline','pi']);
 assert.deepEqual(permittedEngines('local','local',{engines:{codex:true,claude:true,cline:true,pi:true}}),['codex','claude','cline','pi']);
 assert.equal(canCreateAgent('gpu','gpu','cline',caps),false);
 assert.ok(canCreateAgent('gpu','gpu','pi',caps));
});
