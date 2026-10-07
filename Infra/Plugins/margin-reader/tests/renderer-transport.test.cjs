"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
test('renderer RPC checks response IDs/envelopes and preserves authoritative error codes without retries',async()=>{
 const {requestRpc}=await import('../ui/rpc-client.mjs');let calls=0;
 const fetch=async(_url,options)=>{calls++;const q=JSON.parse(options.body);return {ok:true,json:async()=>({jsonrpc:'2.0',id:q.id,result:{ok:true}})};};
 assert.deepEqual(await requestRpc('test:rpc','settings.get',{}, {fetch,id:'id-1'}),{ok:true});assert.equal(calls,1);
 for(const reply of [{jsonrpc:'2.0',id:'wrong',result:{}},{jsonrpc:'2.0',id:'id-1',result:{},error:{}},{jsonrpc:'2.0',id:'id-1'},null])await assert.rejects(requestRpc('test:rpc','fs.write',{}, {id:'id-1',fetch:async()=>({ok:true,json:async()=>reply})}),e=>e.code==='INVALID_RESPONSE'&&e.details.mayHaveCompleted);
 await assert.rejects(requestRpc('test:rpc','study.card.update',{}, {id:'id-1',fetch:async()=>({ok:true,json:async()=>({jsonrpc:'2.0',id:'id-1',error:{code:-32000,message:'Conflict',data:{code:'CONFLICT',details:{currentRevision:8}}}})})}),e=>e.code==='CONFLICT'&&e.details.currentRevision===8);
});
test('renderer RPC timeout aborts the transport once and reports uncertain completion',async()=>{
 const {requestRpc}=await import('../ui/rpc-client.mjs');let calls=0,aborted=false;
 await assert.rejects(requestRpc('test:rpc','study.note.create',{}, {id:'timeout-id',timeoutMs:25,fetch:(_url,options)=>{calls++;options.signal.addEventListener('abort',()=>aborted=true);return new Promise(()=>{});}}),e=>e.code==='REQUEST_TIMEOUT'&&e.details.requestId==='timeout-id'&&e.details.mayHaveCompleted);
 assert.equal(calls,1);assert(aborted);
});
