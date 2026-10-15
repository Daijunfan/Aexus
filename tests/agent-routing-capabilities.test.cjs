const {test}=require('node:test'),assert=require('node:assert/strict');
const agents=require('../src/agent-sessions.cjs'),core=require('../src/core.cjs');
test('Core RPC forwards both Mac engine-origin ID and remote work-host ID to native capability probe',async()=>{
 const original=agents.capabilities,requests=[];
 agents.capabilities=async(source,target)=>{requests.push({source,target});return {hostId:source,targetHostId:target,engines:{codex:true},transparentRouting:{codex:source==='local'&&target!=='local'},routingVerified:source==='local'&&target!=='local'}};
 try{
  const cross=await core.dispatch('hosts.agent-capabilities',{id:'local',targetHostId:'GPU-server'});
  assert.deepEqual(requests,[{source:'local',target:'GPU-server'}]);
  assert.equal(cross.routingVerified,true,'without targetHostId the GUI can never enable remote Codex');
  const local=await core.dispatch('hosts.agent-capabilities',{id:'local',targetHostId:'local'});
  assert.equal(local.routingVerified,false);
  assert.deepEqual(requests[1],{source:'local',target:'local'});
 }finally{agents.capabilities=original}
});

test('Agent facade forwards target ID to actual installed engine compatibility check',async()=>{
 const hosts=require('../src/agent-hosts.cjs'),original=hosts.capabilities,recorded=[];
 hosts.capabilities=async(source,target)=>{recorded.push({source,target});return {routingVerified:source==='local'&&target==='gpu'}};
 try{
  const byIds=await agents.capabilities('local','gpu');
  const byParams=await agents.capabilities({id:'local',targetHostId:'gpu'});
  assert.equal(byIds.routingVerified,true);
  assert.equal(byParams.routingVerified,true);
  assert.deepEqual(recorded,[{source:'local',target:'gpu'},{source:'local',target:'gpu'}]);
 }finally{hosts.capabilities=original}
});
