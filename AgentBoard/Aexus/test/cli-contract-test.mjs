// Frozen pre-refactor parse-only payloads include historical defaults and remote @file handling.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {CLI_COMMANDS} from '../src/shared/api-registry.ts'
import {compileCliInputs} from '../src/shared/cli-contract.ts'
const root=path.resolve(import.meta.dirname,'..'),read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'))
const compiled=compileCliInputs(CLI_COMMANDS),cases=read('test/fixtures/cli-input-cases.json')
assert.deepEqual(compiled,read('bin/command-inputs.json'),'generated CLI inputs must match canonical schemas')
const messageCases=read('test/fixtures/cli-message-cases.json')
for(const {args,input,expected} of [...cases,...messageCases]){
 const result=spawnSync(process.execPath,[path.join(root,'bin/agents'),...args,'--json'],{cwd:root,env:{...process.env,AGENTS_COMPANY_PARSE_ONLY:'1'},input:JSON.stringify(input??{}),encoding:'utf8'})
 assert.ok(result.stdout,result.stderr)
 const actual=JSON.parse(result.stdout);if(actual.cmd)actual.args??={}
 assert.deepEqual(actual,expected,args.join(' '))
}
assert.equal(new Set(cases.map(({args})=>args.slice(0,2).join('.'))).size,Object.keys(compiled).length)
const unknown=JSON.parse(spawnSync(process.execPath,[path.join(root,'bin/agents'),'unknown-command','--json'],{cwd:root,env:{...process.env,AGENTS_COMPANY_PARSE_ONLY:'1'},encoding:'utf8'}).stdout)
assert.match(unknown.error,/unknown command: unknown-command/);assert.doesNotMatch(unknown.error,/not defined/)
console.log(`PASS ${cases.length+messageCases.length} original CLI payloads; ${Object.keys(compiled).length} schema-owned routes, remote input and failure parity`)
