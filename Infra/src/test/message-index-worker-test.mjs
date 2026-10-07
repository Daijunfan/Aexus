// Exercise the actual bundled worker protocol, including concurrent scope isolation and shutdown.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-index-worker-'))
process.env.AGENTS_COMPANY_HOME=temp;process.env.AGENTS_COMPANY_PACKAGE_ROOT=root
const bundle=path.join(temp,'client.cjs');await build({entryPoints:[root+'/Infra/src/main/message-index-client.ts'],outfile:bundle,bundle:true,platform:'node',format:'cjs',logLevel:'silent'})
const client=createRequire(import.meta.url)(bundle),options={query:'shared needle',author:'all',filter:'all',offset:0,limit:5},checks=[]
let loads=0
const source=id=>({id,version:'same-source-v1',read:()=>{loads++;return Array.from({length:1200},(_,index)=>({conversation:id,id:'m'+index,text:'shared needle '+index,createdAt:index,author:'reader',role:'assistant',authorIdentity:{kind:'agent',employeeId:id.split(':')[1]},images:[]}))}})
try{
 assert.equal(fs.existsSync(path.join(temp,'cache')),false)
 const [a,b]=await Promise.all([client.queryMessageIndex('search',[source('employee:a')],{},options),client.queryMessageIndex('search',[source('employee:b')],{'employee:b/m1199':{hidden:true}},options)])
 assert.equal(a.total,1200);assert.equal(b.total,1199);assert.ok(a.rows.every(row=>row.conversation==='employee:a'));assert.ok(b.rows.every(row=>row.conversation==='employee:b'));assert.ok(b.rows.every(row=>row.id!=='m1199'))
 checks.push('Concurrent clients keep independent allowed sources, hidden flags, counts and rows')
 const before=loads;await client.closeMessageIndex();const restarted=await client.queryMessageIndex('search',[source('employee:a')],{},options);assert.equal(loads,before);assert.deepEqual(restarted,a)
 const running=client.queryMessageIndex('search',[source('group:c')],{},options),closing=client.closeMessageIndex()
 await assert.rejects(client.queryMessageIndex('search',[source('group:d')],{},options),/closing/)
 assert.equal((await running).total,1200);await closing
 checks.push('Restart reuses persisted projections, orderly close drains its accepted query, and no new query starts during shutdown')
 const broken={id:'group:broken',version:'broken',read:()=>{throw Error('Original source unavailable')}}
 await assert.rejects(client.queryMessageIndex('search',[broken],{},options),/Original source unavailable/)
 assert.equal((await client.queryMessageIndex('search',[source('group:broken')],{},options)).total,1200)
 client.removeIndexedConversation('group:broken');await client.closeMessageIndex();const count=loads;await client.queryMessageIndex('search',[source('group:broken')],{},options);assert.equal(loads,count+1)
 checks.push('Failed source reads leave the worker usable; source deletion persists before the owned thread closes')
 fs.writeFileSync(root+'/.aexus/artifacts/slimming-final/worker-verification.json',JSON.stringify({passed:true,checks},null,2));console.log('PASS '+checks.join('; '))
}finally{await client.closeMessageIndex();fs.rmSync(temp,{recursive:true,force:true})}
