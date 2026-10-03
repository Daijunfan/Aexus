// Real Core IPC and hidden renderer; all employee work uses a local protocol fixture.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import platform from '../bin/platform.cjs'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile)
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-highlight-ui-'))),control=path.join(temp,'fixture'),output=path.join(root,'artifacts/communication-highlight')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'');fs.mkdirSync(output,{recursive:true})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1500',AGENTS_COMPANY_HEIGHT:'1050',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control,PYTHONDONTWRITEBYTECODE:'1'}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_WEB_URL'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[],followers=[]
page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message))
const call=async(auth,...args)=>{const result=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env:{...env,...(auth?{AGENTS_COMPANY_TOKEN:auth}:{})},timeout:20000,maxBuffer:8e6})).stdout);assert.ok(result.ok,result.error);return result.data}
const cli=(...args)=>call(null,...args),status=async card=>(await cli('session','status','--employee',card.id))[0]
const create=async(title,group,role='employee')=>{const card=await cli('card','create','--title',title,'--group',group,'--management-role',role,'--engine','codex','--model','gpt-6-luna');await expect.poll(async()=>(await status(card)).initialization.status).toBe('ready');return card}
const line=(a,b)=>page.locator(`.management-connection[data-manager="${a.id}"][data-employee="${b.id}"]`)
const follow=async(auth,employee)=>{const socket=net.connect(platform.controlEndpoint(env.AGENTS_COMPANY_HOME));followers.push(socket);await new Promise((resolve,reject)=>{socket.once('error',reject);socket.once('connect',()=>socket.write(JSON.stringify({cmd:'session.follow',args:{employee},auth})+'\n'));socket.once('data',()=>resolve())});return socket}
try{
 await page.locator('.infinite-canvas').waitFor();await cli('group','add','Workers');await cli('group','add','Governors')
 const manager=await create('Manager','Workers','manager'),governor=await create('Governor','Governors','governor'),worker=await create('Bound Employee','Workers'),unbound=await create('Unbound Employee','Workers')
 const mt=(await cli('auth','agent-token',manager.id)).token,gt=(await cli('auth','agent-token',governor.id)).token
 await cli('management','bind','--manager',manager.id,'--employee',worker.id);await cli('management','bind','--manager',governor.id,'--employee',manager.id)
 const geometry=()=>cli('session','list').then(store=>({rooms:store.rooms,positions:store.sessions.map(card=>[card.id,card.position])})),before=await geometry()
 const relations=(await cli('management','topology')).edges
 const targets=[manager,worker,unbound],pairs=[[mt,manager,worker],[gt,governor,manager],[gt,governor,unbound]]
 for(const card of targets)fs.writeFileSync(path.join(control,card.id+'.hold-user'),'')
 const measurements=[]
 for(const theme of ['white','black']){
  await cli('settings','set','--theme',theme)
  await page.evaluate(()=>{
   window.__highlightObserver?.disconnect();window.__highlightSamples=[]
   const active=new Map()
   window.__highlightObserver=new MutationObserver(()=>{
    const now=performance.now(),shown=new Set()
    for(const node of document.querySelectorAll('.management-connection[data-active=true]')){const key=node.getAttribute('data-manager')+'>'+node.getAttribute('data-employee');shown.add(key);if(!active.has(key))active.set(key,now)}
    for(const [key,start] of active)if(!shown.has(key)){window.__highlightSamples.push(now-start);active.delete(key)}
   });window.__highlightObserver.observe(document.querySelector('.canvas-world'),{attributes:true,attributeFilter:['data-active'],childList:true,subtree:true})
  })
  const start=performance.now()
  await Promise.all(pairs.map(([auth,,target])=>call(auth,'session','send','--employee',target.id,'--text','Held communication fixture')))
  for(const [,source,target] of pairs)await expect(line(source,target)).toHaveAttribute('data-active','true')
  await expect(line(governor,unbound)).toHaveAttribute('data-temporary','true')
  await expect(line(manager,worker).locator('.management-line')).toHaveCSS('stroke','rgb(20, 122, 78)')
  await expect(page.locator('.office-connections')).toHaveCSS('animation-name','management-flow')
  await expect(page.locator('.management-connection[data-active=true]')).toHaveCount(0,{timeout:2000})
  const elapsedMs=Math.round(performance.now()-start);assert.ok(elapsedMs<1500,'communication cue exceeded its bounded display window')
  const highlightMs=await page.evaluate(()=>window.__highlightSamples.map(Math.round))
  assert.equal(highlightMs.length,3);assert.ok(highlightMs.every(ms=>ms<900),'rendered cue outlived its deadline')
  await expect(line(manager,worker)).toHaveAttribute('data-active','false');await expect(line(governor,manager)).toHaveAttribute('data-active','false');await expect(line(governor,unbound)).toHaveCount(0)
  const live=(await cli('management','activity')).interactions
  assert.equal(live.length,3);assert.ok(live.every(item=>item.kind==='task'&&item.highlighted===false))
  for(const card of targets){assert.equal((await status(card)).busy,true);await expect(page.locator(`[data-card-id="${card.id}"]`)).toHaveAttribute('data-state','working')}
  const layout=await cli('office','layout');assert.equal(layout.connections.length,2);assert.ok(layout.connections.every(edge=>!edge.active))
  assert.deepEqual((await cli('management','topology')).edges,relations);assert.deepEqual(await geometry(),before)
  await page.reload();await page.locator('.infinite-canvas').waitFor();await expect(line(manager,worker)).toHaveAttribute('data-active','false');await expect(line(governor,unbound)).toHaveCount(0)
  const subscription=await follow(gt,manager.id)
  await expect(line(governor,manager)).toHaveAttribute('data-active','true')
  await expect(line(governor,manager)).toHaveAttribute('data-active','false',{timeout:1500})
  assert.equal(subscription.destroyed,false);assert.equal((await status(manager)).busy,true)
  subscription.destroy()
  await page.screenshot({path:path.join(output,'expired-'+theme+'.png')})
  measurements.push({theme,elapsedMs,highlightMs,remainingTasks:live.length})
  for(const card of targets)await cli('session','interrupt','--employee',card.id)
  await expect.poll(async()=>(await cli('management','activity')).interactions.length).toBe(0)
 }
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(win=>!win.isVisible())))
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({measurements,errors,productionDataUsed:false,modelCalls:0},null,2)+'\n')
 console.log('PASS 600ms cues: Manager->Employee, Governor->Employee/Manager; long tasks and subscriptions remain alive, bound arrows return, temporary arrows vanish, reload does not replay, both themes; '+JSON.stringify(measurements))
}finally{followers.forEach(socket=>socket.destroy());await app.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
