import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-pw-'))),run=promisify(execFile)
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work')}
const service=spawn(process.execPath,[path.join(root,'Infra/src/cli/agents'),'serve'],{env,stdio:'ignore'}),done=new Promise(r=>service.once('exit',r))
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[path.join(root,'Infra/src/cli/agents'),...args,'--json'],{env,timeout:25000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
try{
 for(let i=0;i<100;i++){try{if((await cli('status')).running)break}catch{}await new Promise(r=>setTimeout(r,30))}
 const [a,b]=await Promise.all([cli('plugin','open','mininotion'),cli('plugin','open','mininotion')])
 assert.equal(a.id,b.id);assert.equal((await cli('plugin','windows')).length,1);assert.equal(a.attached,false)
 assert.ok((await fetch(a.url).then(r=>r.text())).includes('Mini Notion'))
 console.log('PASS pure CLI opens a deduplicated live plugin view without Electron')
 const state=await cli('plugin','place',a.id,'--x','-300','--y','100','--width','900','--height','680')
 assert.deepEqual(state.bounds,{x:-300,y:100,width:900,height:680})
 assert.equal((await cli('plugin','mode',a.id,'minimized')).mode,'minimized')
 assert.equal((await cli('plugin','open','mininotion')).mode,'normal')
 await assert.rejects(()=>cli('plugin','place',a.id,'--width','0'))
 console.log('PASS window geometry and mode are CLI-owned and validated')
 await cli('plugin','dismiss',a.id);assert.equal((await cli('plugin','windows')).length,0);await assert.rejects(()=>fetch(a.url))
 console.log('PASS closing the CLI window releases its HTTP view')
}finally{service.kill('SIGTERM');await done;fs.rmSync(temp,{recursive:true,force:true})}
