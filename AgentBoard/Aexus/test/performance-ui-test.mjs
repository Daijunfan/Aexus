// Hidden, isolated rendering benchmark. No production state or paid model calls.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),{_electron:electron}=require('@playwright/test')
const root=path.resolve(import.meta.dirname,'..'),baseline=process.argv.includes('--baseline'),backup=process.env.AGENTS_PERFORMANCE_BASELINE??(baseline?fs.readFileSync('/tmp/ac-perf-current-backup','utf8').trim():root)
if(baseline&&!fs.existsSync(backup+'/node_modules'))fs.symlinkSync(root+'/node_modules',backup+'/node_modules','dir')
const target=baseline?backup:root,folder=path.join(root,'artifacts/performance-0.48.1');fs.mkdirSync(folder,{recursive:true})
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-perf-'))),home=temp+'/state';fs.mkdirSync(home)
const groups=['Team A','Team B','Team C'],sessions=['fireball','dewey','marmalade','woodi'].map((avatar,i)=>{
 const group=groups[i<2?0:i-1],cwd=temp+'/projects/'+group+'/'+avatar;fs.mkdirSync(cwd,{recursive:true})
 return {id:'perf'+i,title:avatar,group,cwd,engine:i%2?'claude':'codex',kind:'worker',managementRole:'employee',avatar,createdAt:i+1,position:{x:i===1?390:100,y:i===1?220:220}}
})
fs.writeFileSync(home+'/sessions.json',JSON.stringify({groups,sessions,fullAccessDefaultApplied:true,access:{version:2,revision:1,relations:[],globalManagerIds:[]},rooms:Object.fromEntries(groups.map((g,i)=>[g,{col:i,row:0,w:1,h:1,bounds:{x:i%2*860,y:Math.floor(i/2)*650,width:760,height:560,pinned:true,shape:'rounded',arrangement:'free'},design:{scenery:false}}])),teamRoots:Object.fromEntries(groups.map(g=>[g,temp+'/projects/'+g])),preferences:{theme:'white',showTeamOverview:false},viewport:{x:20,y:20,zoom:.6}}))
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PROJECTS:temp+'/projects',AGENTS_COMPANY_WORKSPACES:temp+'/work',AGENTS_COMPANY_BUILTIN_PLUGINS:root+'/build/plugins',AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1168',AGENTS_COMPANY_HEIGHT:'1096'}
for(const key of Object.keys(env))if(/^(AGENTS_COMPANY_TOKEN|AGENTS_COMPANY_SOCKET|AGENTS_COMPANY_EMPLOYEE|ELECTRON_RUN_AS_NODE)/.test(key))delete env[key]
const installed=process.env.AGENTS_PERFORMANCE_APP
const app=await electron.launch({executablePath:installed||require('electron'),args:installed?[]:[target],env}),page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message))
const wait=ms=>new Promise(r=>setTimeout(r,ms))
try{
 await page.locator('.infinite-canvas').waitFor();await page.locator('.official-pet').first().waitFor()
 // Explicit diagnostic visibility: benchmark identical animated frames in hidden windows.
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('api:event',{channel:'desktop:visibility',payload:{active:false,visible:true}}))
 await wait(1400);await app.evaluate(({app})=>app.getAppMetrics());const samples=[]
 for(let i=0;i<3;i++){await wait(2000);samples.push(await app.evaluate(({app})=>app.getAppMetrics().filter(x=>['Browser','Tab','GPU'].includes(x.type)).map(x=>({type:x.type,cpu:x.cpu.percentCPUUsage,rss:x.memory.workingSetSize}))))}
 const moving=await page.locator('.official-frame').evaluateAll(nodes=>nodes.map(el=>({animation:getComputedStyle(el).animationName,rect:{width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}})))
 // Deterministic frozen frame only for visual comparison; runtime samples above are animated.
 await page.evaluate(()=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=0}))
 const screenshot=path.join(folder,baseline?'before-idle.png':installed?'installed-idle.png':'after-idle.png');await page.screenshot({path:screenshot,scale:'css'})
 if(!baseline){
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('api:event',{channel:'desktop:visibility',payload:{active:false,visible:false}}));await wait(100)
  assert.equal(await page.locator('.infinite-canvas').getAttribute('data-animated'),'false')
 }
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 const report={baseline,installed:!!installed,version:await app.evaluate(({app})=>app.getVersion()),samples,moving,screenshot,errors}
 fs.writeFileSync(path.join(folder,baseline?'before-idle.json':installed?'installed-idle.json':'after-idle.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
