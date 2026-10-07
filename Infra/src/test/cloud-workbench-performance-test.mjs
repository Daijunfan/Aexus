// Isolated UI measurements. Foreground document scheduling is simulated; native windows stay hidden.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {sshFixture} from './fixtures/cloud-workbench.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile)
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-perf-')),bin=path.join(temp,'bin');sshFixture(bin)
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',PATH:bin+path.delimiter+process.env.PATH};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow()
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env,timeout:20000})).stdout);assert.ok(r.ok,r.error);return r.data}
try{
 await page.locator('.infinite-canvas').waitFor();const host=await cli('host','create','--data',JSON.stringify({name:'Performance fixture',host:'fixture',os:'linux',defaultDirectory:temp}))
 const pending=app.waitForEvent('window');await page.locator('[data-plugin="cloud-hosts"]').click();const plugin=await pending;await expect(plugin.locator('#add')).toBeEnabled()
 const initial=await plugin.evaluate(()=>({readyMs:performance.now(),scripts:performance.getEntriesByType('resource').filter(r=>r.initiatorType==='script').map(r=>({name:r.name.split('/').at(-1),bytes:r.decodedBodySize}))}))
 await plugin.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});window.metrics={reads:0,samples:[],started:0,marker:''};const fetch_=window.fetch;window.fetch=async(...args)=>{const request=JSON.parse(args[1]?.body||'{}');if(request.method==='hosts.terminal-read')window.metrics.reads++;const response=await fetch_(...args);if(request.method==='hosts.terminal-read'){const copy=await response.clone().json();if(window.metrics.marker&&copy.result?.output?.includes(window.metrics.marker)){window.metrics.samples.push(performance.now()-window.metrics.started);window.metrics.marker=''}}return response}})
 await plugin.locator('[data-view=terminal]').click();await plugin.locator('#terminal-new').click();await expect(plugin.locator('.xterm')).toBeVisible();const term=(await cli('host','terminal-list',host.id))[0]
 await expect.poll(async()=>(await cli('host','terminal-read',host.id,'--terminal',term.id)).output).toMatch(/[$%#]/)
 for(let i=0;i<8;i++){
  await plugin.evaluate(async({id,terminal,i})=>{const tail=Date.now()+'_'+i;window.metrics.marker='PERF_'+tail;window.metrics.started=performance.now();await fetch('./rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:i,method:'hosts.terminal-input',params:{id,terminal,data:`printf '%s%s\\n' 'PERF_' '${tail}'\r`}})})},{id:host.id,terminal:term.id,i})
  await expect.poll(()=>plugin.evaluate(()=>window.metrics.samples.length),{intervals:[10,20,30,50],timeout:5000}).toBe(i+1)
 }
 const before=await plugin.evaluate(()=>window.metrics.reads);await new Promise(r=>setTimeout(r,3200));const idleReads=(await plugin.evaluate(()=>window.metrics.reads))-before
 const samples=await plugin.evaluate(()=>window.metrics.samples),sorted=[...samples].sort((a,b)=>a-b)
 const report={mode:process.env.CLOUD_PERF_LABEL||'after',initialScriptBytes:initial.scripts.reduce((s,r)=>s+r.bytes,0),initialScripts:initial.scripts,readyMs:Math.round(initial.readyMs),echoMedianMs:Math.round(sorted[4]),echoMaxMs:Math.round(sorted.at(-1)),idleReadsIn3200ms:idleReads,samples:samples.map(Math.round)}
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('.aexus/artifacts/cloud-performance-'+report.mode+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
 if(report.mode==='after'){assert.ok(report.initialScriptBytes<60000,'overview should not load interactive libraries');assert.ok(idleReads<=1,'idle terminal waits for output');assert.ok(report.echoMedianMs<150,'no 250ms polling delay')}
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
