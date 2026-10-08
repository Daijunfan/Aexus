import assert from 'node:assert/strict'
import {createContractClient} from '../../../Contract/protocol.ts'

let listener,closed=false,updates=0
const client=createContractClient(async()=>({contractVersion:'1.0.0',command:'contract.call',data:null}),handler=>{listener=handler;return()=>{closed=true;listener=null}})
assert.equal(typeof client.watchWorkflow,'function')
const stop=client.watchWorkflow('wf_allowed',()=>updates++)
listener({channel:'session:changed',payload:{id:'wf_allowed',engineId:'deep-research',revision:1}})
listener({channel:'workflow:changed',payload:{id:'wf_other',engineId:'deep-research',revision:1}})
listener({channel:'workflow:changed',payload:{id:'wf_allowed',engineId:'deep-research',revision:'1'}})
assert.equal(updates,0)
listener({channel:'workflow:changed',payload:{id:'wf_allowed',engineId:'deep-research',revision:2}})
assert.equal(updates,1)
stop();assert.equal(closed,true);assert.equal(listener,null)
const legacy=createContractClient(async()=>({contractVersion:'1.0.0',command:'contract.call',data:null}))
assert.equal(legacy.watchWorkflow,undefined)
console.log('PASS Workflow change events are scoped invalidation hints with teardown and legacy Contract fallback')
