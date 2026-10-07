// Anonymous layout, private state, hidden rendering, no engine/model/SSH requests.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {_electron as electron} from '@playwright/test'
const require=createRequire(import.meta.url),root=process.cwd(),label=process.env.AGENTS_NAV_LABEL||'after'
const output=path.join(root,'.aexus/artifacts/navigation-performance');fs.mkdirSync(output,{recursive:true})
const scene=JSON.parse(fs.readFileSync(path.join(root,'Infra/src/test/fixtures/navigation-scene.json')))
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-nav-')),home=path.join(temp,'state');fs.mkdirSync(home)
const sessions=scene.sessions.map(c=>{const cwd=path.join(temp,c.id);fs.mkdirSync(cwd);return {...c,cwd}})
const view={x:-420,y:850,zoom:.36}
const store={...scene,sessions,fullAccessDefaultApplied:true,access:{version:2,revision:1,relations:scene.relations,globalManagerIds:[]},teamRoots:Object.fromEntries(scene.groups.map(g=>[g,temp])),preferences:{theme:'white',showTeamOverview:false},viewport:view,teamViews:[{id:'nav-all',name:'Navigation All',teams:scene.groups,viewport:view},{id:'nav-half',name:'Navigation Half',teams:scene.groups.slice(0,7),viewport:view}],activeTeamViewId:'nav-all'}
fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify(store))
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1400',AGENTS_COMPANY_HEIGHT:'1000',CODEX_BIN:path.join(root,'Infra/src/test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),PYTHONDONTWRITEBYTECODE:'1'}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_URL','AGENTS_COMPANY_WEB_URL','ELECTRON_RUN_AS_NODE'].includes(key))delete env[key]
const started=performance.now(),app=await electron.launch({executablePath:process.env.AGENTS_NAV_APP||require('electron'),args:process.env.AGENTS_NAV_APP?[]:[root],env}),page=await app.firstWindow(),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message))
try{
 await page.locator('.infinite-canvas .world-room').first().waitFor()
 const startupMs=performance.now()-started,call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
 assert.equal((await call('session.list')).access.relations.length,scene.relations.length,'fixture relations survived startup');
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start')
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('api:event',{channel:'desktop:visibility',payload:{active:false,visible:true}}))
 await page.evaluate(()=>{window.navLong=[];new PerformanceObserver(list=>window.navLong.push(...list.getEntries().map(e=>e.duration))).observe({entryTypes:['longtask']})})
 const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(null)))))
 const measure=async(name,work)=>{const before=performance.now();await work();await frame();return {name,ms:+(performance.now()-before).toFixed(1)}}
 const timings=[]
 for(let i=0;i<4;i++)timings.push(await measure('view-'+i,async()=>{await call('team-view.select',{id:i%2?'nav-all':'nav-half'});await page.waitForFunction(name=>document.querySelector('.company-view-trigger')?.getAttribute('title')==='Company Views · '+name,i%2?'Navigation All':'Navigation Half')}))
 for(let i=0;i<3;i++){
  timings.push(await measure('profile-open-'+i,async()=>{await call('view.open',{kind:'employee',employee:sessions[0].id});await page.locator('.employee-profile-page').waitFor()}))
  await page.getByRole('button',{name:'Change character',exact:true}).click();await page.locator('.avatar-options').waitFor()
  if(label!=='before')assert.equal(await page.locator('.infinite-canvas').getAttribute('data-animated'),'false','occluded canvas pauses visual playback only')
  timings.push(await measure('profile-close-'+i,()=>call('view.close')))
 }
 timings.push(await measure('pan-60',()=>page.evaluate(async()=>{const el=document.querySelector('.infinite-canvas');for(let i=0;i<60;i++){el.dispatchEvent(new WheelEvent('wheel',{deltaX:2,deltaY:1,bubbles:true,cancelable:true}));await new Promise(r=>requestAnimationFrame(r))}})))
 const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(path.join(output,label+'.cpuprofile'),JSON.stringify(profile))
 const hits=new Map(profile.nodes.map(n=>[n.id,{name:n.callFrame.functionName||'(anonymous)',url:n.callFrame.url,line:n.callFrame.lineNumber,us:0}]))
 profile.samples?.forEach((id,i)=>hits.get(id).us+=profile.timeDeltas?.[i]??0)
 const hot=[...hits.values()].sort((a,b)=>b.us-a.us).slice(0,15)
 const report={label,startupMs:+startupMs.toFixed(1),employees:sessions.length,relations:scene.relations.length,timings,longTasks:await page.evaluate(()=>window.navLong),hot,errors}
 fs.writeFileSync(path.join(output,label+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
