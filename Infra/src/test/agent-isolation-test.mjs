import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {build} from 'esbuild'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-seatbelt-'))),run=promisify(execFile)
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'Infra/src/resources/plugins')}
const service=spawn(process.execPath,[root+'/Infra/src/cli/agents','serve'],{env,stdio:'ignore'}),ended=new Promise(resolve=>service.once('exit',resolve))
const cli=async(...args)=>{const result=JSON.parse((await run(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env,timeout:10000})).stdout);assert.ok(result.ok,result.error);return result.data}
try{
 for(let i=0;i<100;i++){try{await cli('status');break}catch{await new Promise(resolve=>setTimeout(resolve,30))}}
 await cli('group','add','Test')
 const worker=await cli('card','create','--title','Restricted','--group','Test'),other=await cli('card','create','--title','Other','--group','Test')
 const otherCredential=await cli('auth','agent-token',other.id);await cli('card','access-mode',worker.id,'isolated')
 const source=path.join(temp,'runner.ts'),bundle=path.join(temp,'runner.cjs')
 fs.writeFileSync(source,`import {spawnEmployeeProcess} from ${JSON.stringify(root+'/Infra/src/main/agent-process-isolation.ts')};const child=spawnEmployeeProcess(${JSON.stringify(worker.id)},${JSON.stringify(process.execPath)},['-e',process.argv[2]],{env:process.env,cwd:${JSON.stringify(worker.cwd)}});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);child.on('close',code=>process.exit(code??1));`)
 await build({entryPoints:[source],outfile:bundle,bundle:true,platform:'node',format:'cjs',logLevel:'silent'})
 const test=`const fs=require('fs'),assert=require('assert/strict'),{execFileSync}=require('child_process');assert.throws(()=>process.kill(${service.pid},0));for(const file of ${JSON.stringify([path.join(env.AGENTS_COMPANY_HOME,'control.token'),path.join(env.AGENTS_COMPANY_HOME,'sessions.json'),otherCredential.file])})assert.throws(()=>fs.readFileSync(file));assert.throws(()=>fs.writeFileSync(${JSON.stringify(path.join(env.AGENTS_COMPANY_HOME,'sessions.json'))},'corrupt'));const who=JSON.parse(execFileSync(process.execPath,[${JSON.stringify(root+'/Infra/src/cli/agents')},'auth','whoami','--json'],{encoding:'utf8'}));assert.equal(who.data.principal.employeeId,${JSON.stringify(worker.id)});assert.throws(()=>execFileSync(process.execPath,[${JSON.stringify(root+'/Infra/src/cli/agents')},'host','list','--json'],{encoding:'utf8',env:{PATH:process.env.PATH,AGENTS_COMPANY_HOME:${JSON.stringify(env.AGENTS_COMPANY_HOME)}}}));fs.writeFileSync('proof.txt','isolated');console.log('ISOLATION VERIFIED');`
 const result=await run(process.execPath,[bundle,test],{env,timeout:20000});assert.match(result.stdout,/ISOLATION VERIFIED/)
 assert.equal(fs.readFileSync(path.join(worker.cwd,'proof.txt'),'utf8'),'isolated');await cli('status')
 console.log('PASS actual macOS process sandbox: operator state/token and other credentials unreadable, state writes blocked, stripped-env fallback denied, own authenticated CLI and workspace write work')
}finally{service.kill('SIGTERM');await ended;fs.rmSync(temp,{recursive:true,force:true})}
