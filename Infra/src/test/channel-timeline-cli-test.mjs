// Exercise the documented history commands without opening a Core or reading user state.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'

const parse=(...args)=>JSON.parse(execFileSync(process.execPath,['Infra/src/cli/agents','channel','timeline',...args,'--json'],{cwd:new URL('..',import.meta.url),env:{...process.env,AGENTS_COMPANY_PARSE_ONLY:'1'},encoding:'utf8'}))
const id='nc_fixture',beforeEntry='cm_question',cursor=Buffer.from(JSON.stringify([1,id,'news',beforeEntry,123,'np_previous'])).toString('base64url')
assert.deepEqual(parse(id),{cmd:'channel.timeline',args:{id}},'omitted options retain Core defaults')
assert.deepEqual(parse(id,'--kind','news','--before-entry',beforeEntry,'--limit','20'),{cmd:'channel.timeline',args:{id,kind:'news',beforeEntry,limit:20}},'the response-stage example preserves its channel, kind and question anchor')
assert.deepEqual(parse(id,'--cursor',cursor,'--limit','20','--before-entry',beforeEntry,'--kind','news'),{cmd:'channel.timeline',args:{id,kind:'news',beforeEntry,cursor,limit:20}},'older-page cursors are forwarded byte-for-byte with the same scope')
for(const [kind,limit] of [['all',100],['message',1]])assert.deepEqual(parse(id,'--kind',kind,'--limit',String(limit)),{cmd:'channel.timeline',args:{id,kind,limit}})
for(const command of ['read-state','acknowledge']){
 const entryIds=['np_article','cm_reply'],result=JSON.parse(execFileSync(process.execPath,['Infra/src/cli/agents','channel',command,id,'--entries',JSON.stringify(entryIds),'--json'],{cwd:new URL('..',import.meta.url),env:{...process.env,AGENTS_COMPANY_PARSE_ONLY:'1'},encoding:'utf8'}))
 assert.deepEqual(result,{cmd:'channel.'+command,args:{id,entryIds}},'personal reading commands preserve the exact channel and entry identities')
}
assert.deepEqual(JSON.parse(execFileSync(process.execPath,['Infra/src/cli/agents','channel','acknowledge',id,'--all','--json'],{cwd:new URL('..',import.meta.url),env:{...process.env,AGENTS_COMPANY_PARSE_ONLY:'1'},encoding:'utf8'})),{cmd:'channel.acknowledge',args:{id,all:true}},'marking every unread entry requires an explicit all flag')
console.log('PASS channel timeline CLI preserves default options, news-before-question scope, opaque continuation cursor, all/message filters and numeric page limits')
