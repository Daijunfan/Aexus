// Exercise the Finder/Dock launch path that direct Playwright executable launches bypass.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import net from 'node:net'
import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
if(process.platform!=='darwin')throw Error('This launch test requires macOS')
const executable=process.env.AGENTS_COMPANY_TEST_APP
if(!executable||!/^.+\.app\/Contents\/MacOS\/[^/]+$/.test(executable))throw Error('Set AGENTS_COMPANY_TEST_APP to the packaged executable')
const app=executable.slice(0,executable.indexOf('.app/')+4),temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-ls-'))),home=temporary+'/state',output=path.resolve('artifacts/fixed-employee-engine'),{controlEndpoint}=createRequire(import.meta.url)('../bin/platform.cjs')
fs.mkdirSync(home);fs.mkdirSync(output,{recursive:true})
const call=(cmd,args={})=>new Promise((resolve,reject)=>{const socket=net.connect(controlEndpoint(home));let text='';socket.setTimeout(10000,()=>socket.destroy(Error('Core timeout')));socket.on('error',reject);socket.on('connect',()=>socket.write(JSON.stringify({cmd,args,auth:fs.readFileSync(home+'/control.token','utf8').trim()})+'\n'));socket.on('data',chunk=>{text+=chunk;if(text.includes('\n')){socket.end();const r=JSON.parse(text.split('\n')[0]);r.ok?resolve(r.data):reject(Error(r.error))}})})
const launchEnv={...process.env};delete launchEnv.ELECTRON_RUN_AS_NODE;delete launchEnv.ELECTRON_RENDERER_URL
let pid
try{
 execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app],{stdio:'pipe'})
 execFileSync('/usr/bin/open',['-g','-n','--env','AGENTS_COMPANY_HOME='+home,'--env','AGENTS_COMPANY_PROJECTS='+temporary+'/projects','--env','AGENTS_COMPANY_HIDDEN=1','--stdout',output+'/launchservices.log','--stderr',output+'/launchservices-errors.log',app],{env:launchEnv})
 const deadline=Date.now()+20000;let rendered=false
 while(Date.now()<deadline){try{const elements=await call('ui.dom',{selector:'.infinite-canvas'});if(elements.length){rendered=true;break}}catch{}await new Promise(r=>setTimeout(r,250))}
 assert.ok(rendered,'LaunchServices failed to start a rendered Core window')
 pid=JSON.parse(fs.readFileSync(home+'/runtime.lock')).pid
 assert.equal((await call('session.list')).sessions.length,0)
 await call('ui.screenshot',{path:output+'/launchservices-hidden.png',privacy:true})
 fs.writeFileSync(output+'/launchservices-result.json',JSON.stringify({executable,signed:true,finderDockLaunch:true,hiddenRendered:true,productionDataUsed:false,modelCalls:0}))
 console.log('PASS codesign verification and LaunchServices startup with isolated hidden rendered window; no model calls')
}finally{
 if(!pid&&fs.existsSync(home+'/runtime.lock'))pid=JSON.parse(fs.readFileSync(home+'/runtime.lock')).pid
 if(pid){try{process.kill(pid,'SIGTERM')}catch{}for(let i=0;i<80&&fs.existsSync(home+'/runtime.lock');i++)await new Promise(r=>setTimeout(r,100))}
 fs.rmSync(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}
