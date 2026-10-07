// Parse-only: no Core, credentials, employee state or provider calls.
import assert from 'node:assert/strict'
import {execFileSync,spawnSync} from 'node:child_process'
import {COMMANDS} from '../shared/api-registry.ts'

const options={cwd:new URL('..',import.meta.url),env:{...process.env,AGENTS_COMPANY_PARSE_ONLY:'1'},encoding:'utf8'}
const parse=(method,...args)=>JSON.parse(execFileSync(process.execPath,['Infra/src/cli/agents','session',method,...args,'--json'],options))
const quote={text:'Original quote',offset:0}
const flags=['--client-message-id','stable-request','--images','["image.png"]','--files','["report.pdf"]','--view','team-view','--reply-to','source-message','--reply-quote',JSON.stringify(quote),'--reply-conversation','group:source','--reply-text-only']
const expected={text:'same user message',images:['image.png'],files:['report.pdf'],viewId:'team-view',replyTo:'source-message',replyQuote:quote,replyConversation:'group:source',replyTextOnly:true,clientMessageId:'stable-request'}
for(const method of ['send','enqueue']){
 const positional=parse(method,'session-id','same user message',...flags)
 assert.deepEqual(positional,{cmd:'session.'+method,args:{id:'session-id',...expected}})
 const employee=parse(method,'--employee','employee-id','--text','same user message',...flags)
 assert.equal(employee.cmd,positional.cmd)
 for(const [field,value] of Object.entries(expected))assert.deepEqual(employee.args[field],value)
 assert.equal(employee.args.employee,'employee-id')
 assert.deepEqual(parse(method,'session-id','/status'),{cmd:'session.'+method,args:{id:'session-id',text:'/status'}})
 assert.equal(parse(method,'session-id','literal --unrecognized text').args.text,'literal --unrecognized text')
 const missing=spawnSync(process.execPath,['Infra/src/cli/agents','session',method,'session-id','text','--client-message-id','--files','[]','--json'],options)
 assert.notEqual(missing.status,0);assert.match(JSON.parse(missing.stdout).error,/requires a request ID/)
 const entry=COMMANDS.find(command=>command.name==='session.'+method)
 assert.match(entry.args,/--client-message-id ID/)
 assert.equal(entry.inputSchema.properties.clientMessageId.maxLength,160)
}
const steer=spawnSync(process.execPath,['Infra/src/cli/agents','session','steer','session-id','text','--client-message-id','key','--json'],options)
assert.notEqual(steer.status,0);assert.match(JSON.parse(steer.stdout).error,/supported by session send and enqueue/)
console.log('PASS private send/enqueue retry IDs across positional/employee CLI forms; scope, reply, attachments and legacy slash payloads preserved')
