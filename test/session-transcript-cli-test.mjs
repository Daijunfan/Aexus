// Parse-only: no daemon, credentials, employee state or model calls.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {COMMANDS} from '../src/shared/api-registry.ts'

const parse=(...args)=>JSON.parse(execFileSync(process.execPath,['bin/agents','session','transcript',...args,'--json'],{cwd:new URL('..',import.meta.url),env:{...process.env,AGENTS_COMPANY_PARSE_ONLY:'1'},encoding:'utf8'}))
assert.deepEqual(parse('fixture_id'),{cmd:'session.transcript',args:{id:'fixture_id',thinking:false}})
for(const limit of [1,2,1000]){
 const positional=parse('fixture_id','--limit',String(limit),'--thinking'),employee=parse('--employee','fixture_id','--limit',String(limit),'--thinking')
 assert.equal(positional.cmd,'session.transcript');assert.equal(positional.args.id,'fixture_id');assert.equal(positional.args.limit,limit);assert.equal(positional.args.thinking,true)
 assert.equal(employee.cmd,positional.cmd);assert.equal(employee.args.employee,positional.args.id);assert.equal(employee.args.limit,positional.args.limit);assert.equal(employee.args.thinking,true)
}
assert.equal(parse('--employee','fixture_id').args.limit,undefined,'omitting a limit preserves full-history reads')
const command=COMMANDS.find(value=>value.name==='session.transcript')
assert.match(command.args,/--limit N/);assert.match(command.args,/--employee ID/);assert.match(command.summary,/full conversation by default/)
assert.deepEqual(command.inputSchema.anyOf,[{required:['id']},{required:['employee']}]);assert.equal(command.inputSchema.properties.limit.maximum,1000)
console.log('PASS private transcript CLI preserves bounded tail reads for positional and employee selectors, full-history default, thinking and discoverable schema')
