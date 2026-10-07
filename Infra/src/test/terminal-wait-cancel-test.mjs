import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'terminal-cancel-')),root=path.resolve(import.meta.dirname,'../../..'),require=createRequire(import.meta.url),Module=require('node:module')
process.env.AGENTS_COMPANY_HOME=temp
const result=await build({stdin:{contents:"export * from './Infra/src/main/terminals'",resolveDir:root},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',logLevel:'silent'})
const module=new Module(root+'/terminal-cancel-fixture.cjs');module.filename=root+'/terminal-cancel-fixture.cjs';module.paths=Module._nodeModulePaths(root);module._compile(result.outputFiles[0].text,module.filename)
const {openTerminal,readTerminal,waitTerminalOutput,closeTerminals}=module.exports
try{
 const terminal=openTerminal({id:'cancel-fixture',cwd:temp})
 await new Promise(r=>setTimeout(r,300))
 // Switching away must release 15-second waits immediately, including many repeated switches.
 const started=performance.now()
 for(let i=0;i<100;i++){
  const controller=new AbortController(),cursor=readTerminal(terminal.id).cursor,pending=waitTerminalOutput(terminal.id,cursor,15000,controller.signal)
  controller.abort();await assert.rejects(pending,error=>error.name==='AbortError')
 }
 assert.ok(performance.now()-started<1000)
 const aborted=new AbortController();aborted.abort();await assert.rejects(waitTerminalOutput(terminal.id,0,15000,aborted.signal),{name:'AbortError'})
 const cursor=readTerminal(terminal.id).cursor,startedWait=performance.now(),empty=await waitTerminalOutput(terminal.id,cursor,60)
 assert.equal(empty.output,'');assert.ok(performance.now()-startedWait>=45)
 console.log('PASS 100 cancelled long reads release immediately; already-aborted requests reject; normal bounded waits retain their timeout')
}finally{await closeTerminals();fs.rmSync(temp,{recursive:true,force:true})}
