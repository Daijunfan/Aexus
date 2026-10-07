// Parse the actual public CLI aliases; no service, credentials or workspace mutations.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
const root=path.resolve(import.meta.dirname,'../../..'),output=path.join(root,'.aexus/artifacts/engine-launcher-scope/cli-parity.json'),env={...process.env,AGENTS_COMPANY_PARSE_ONLY:'1'};delete env.AEXUS_ENGINE_ID
const cases=[
 {args:['view','load-engine','deep-research'],expected:{cmd:'view.load-engine',args:{engineId:'deep-research'}}},
 {args:['view','launcher'],expected:{cmd:'view.launcher',args:{}}},
 {args:['infra','scope','--engine-id','deep-research','--available'],expected:{cmd:'infra.scope',args:{engineId:'deep-research',available:true}}},
 {args:['infra','bind','--engine-id','deep-research','--resources','{"teams":["Research"]}','--expected-revision','2'],expected:{cmd:'infra.bind',args:{engineId:'deep-research',resources:{teams:['Research']},expectedRevision:2}}},
 {args:['infra','unbind','--engine-id','deep-research','--resources','{"employees":["person-a"]}','--expected-revision','3'],expected:{cmd:'infra.unbind',args:{engineId:'deep-research',resources:{employees:['person-a']},expectedRevision:3}}},
 {args:['--engine-scope','deep-research','infra','group','list'],expected:{cmd:'group.list',args:{details:false},engineScope:'deep-research'}},
 {args:['session','list'],env:{AEXUS_ENGINE_ID:'profile-improvement'},expected:{cmd:'session.list',args:{live:false},engineScope:'profile-improvement'}}
],results=[]
for(const entry of cases){const result=spawnSync(process.execPath,[path.join(root,'Infra/src/cli/aexus'),...entry.args,'--json'],{cwd:root,env:{...env,...entry.env},encoding:'utf8',timeout:10000});let actual
 try{actual=JSON.parse(result.stdout);assert.equal(result.status,0,actual.error?.split('\n')[0]??result.stderr);assert.deepEqual(actual,entry.expected);results.push({args:entry.args,passed:true});console.log('PASS '+entry.args.join(' '))}
 catch(error){results.push({args:entry.args,passed:false,error:error.message,actual:actual?.ok===false?{ok:false,error:actual.error.split('\n')[0]}:actual});console.log('FAIL '+entry.args.join(' ')+' — '+error.message.split('\n')[0])}
}
for(const args of [['--engine-scope'],['--engine-scope','../deep-research','group','list']]){const result=spawnSync(process.execPath,[path.join(root,'Infra/src/cli/aexus'),...args,'--json'],{cwd:root,env,encoding:'utf8',timeout:10000});assert.notEqual(result.status,0);results.push({args,passed:true,rejected:true})}
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({passed:results.every(r=>r.passed),results},null,2));assert.ok(results.every(r=>r.passed),'CLI parity failed; see '+output)
