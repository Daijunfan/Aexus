// Parse only; forwarding intent/status never dispatches work in this test.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
const parse=(...args)=>JSON.parse(execFileSync(process.execPath,['Infra/src/cli/agents','messenger',...args,'--json'],{cwd:new URL('..',import.meta.url),env:{...process.env,AGENTS_COMPANY_PARSE_ONLY:'1'},encoding:'utf8'}))
const value={clientMessageId:'attempt-1',messages:[{conversation:'channel:source',id:'news-id'}],to:'employee:recipient',comment:'Please review',textOnly:true,preview:{text:'Public preview',images:1},attempted:false}
assert.deepEqual(parse('forward-draft','--data',JSON.stringify(value)),{cmd:'messenger.forward-draft',args:{value}})
assert.deepEqual(parse('forward-draft','--data','null','--expected-client-message-id','attempt-1'),{cmd:'messenger.forward-draft',args:{value:null,expectedClientMessageId:'attempt-1'}})
assert.deepEqual(parse('forward-status','--client-message-id','attempt-1'),{cmd:'messenger.forward-status',args:{clientMessageId:'attempt-1'}})
assert.deepEqual(parse('forward','--messages',JSON.stringify(value.messages),'--to',value.to,'--comment',value.comment,'--text-only','--retry','--client-message-id',value.clientMessageId),{cmd:'messenger.forward',args:{messages:value.messages,to:value.to,comment:value.comment,textOnly:true,retry:true,clientMessageId:value.clientMessageId}})
console.log('PASS forwarding recovery CLI preserves pending intent, conditional discard, receipt lookup and explicit retry fields')
