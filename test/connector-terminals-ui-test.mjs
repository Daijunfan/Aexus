import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {_electron as electron,expect} from '@playwright/test'
import platform from '../bin/platform.cjs'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-line-ends-'))),control=path.join(temp,'fixture'),output=path.join(root,'artifacts/badge-docking-fix')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'');fs.mkdirSync(output,{recursive:true})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1100',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of ['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_URL'])delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow()
const rpc=(auth,cmd,args={})=>new Promise((resolve,reject)=>{const socket=net.connect(platform.controlEndpoint(env.AGENTS_COMPANY_HOME));let buffer='';socket.on('error',reject);socket.on('connect',()=>socket.write(JSON.stringify({auth,cmd,args})+'\n'));socket.on('data',data=>{buffer+=data;if(buffer.includes('\n')){socket.end();const value=JSON.parse(buffer.split('\n')[0]);value.ok?resolve(value.data):reject(Error(value.error))}})})
const checkArrow=async(edge,connection)=>{
 const arrow=edge.locator('.management-arrow');await expect(arrow).toBeVisible()
 const {x,y,dx,dy}=await arrow.evaluate(e=>{const m=e.transform.baseVal.consolidate().matrix;return {x:m.e,y:m.f,dx:m.a,dy:m.b}})
 assert.ok(connection.points.some((b,i)=>{if(!i)return false;const a=connection.points[i-1];return Math.abs(dx-Math.sign(b.x-a.x))<1e-6&&Math.abs(dy-Math.sign(b.y-a.y))<1e-6&&x>=Math.min(a.x,b.x)-.001&&x<=Math.max(a.x,b.x)+.001&&y>=Math.min(a.y,b.y)-.001&&y<=Math.max(a.y,b.y)+.001}),'Arrow must follow an actual route segment toward the receiving employee')
 const end=connection.points.at(-1);assert.ok(Math.abs(x-end.x)<.001&&Math.abs(y-end.y)<.001,'Arrow tip must reach the actual receiving endpoint, never an earlier segment');const box=await arrow.boundingBox();assert.ok(box&&box.width>0&&box.height>0,'Arrow remains visible even when its final segment is short')
}
const followers=[]
try{
 await page.locator('.infinite-canvas').waitFor()
 const user=fs.readFileSync(path.join(env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim(),call=(cmd,args)=>rpc(user,cmd,args)
 await call('settings.set',{theme:'white'});await call('group.add',{name:'Studio',mode:'build'})
 const create=async(auth,title,role,avatar)=>{const c=await rpc(auth,'card.create',{title,group:'Studio',engine:'codex',model:'gpt-6-luna',effort:'low',managementRole:role,avatar});await expect.poll(async()=>(await call('session.status',{employee:c.id}))[0].initialization.status).toBe('ready');return c}
 const manager=await create(user,'Manager','manager','marmalade'),token=(await call('auth.agent-token',{id:manager.id})).token,workers=[]
 for(const [i,avatar] of ['byte','woodi','wondercube'].entries())workers.push(await create(token,'Employee '+(i+1),'employee',avatar))
 await call('room.bounds',{name:'Studio',bounds:{x:0,y:0,width:976,height:862,arrangement:'free'}})
 for(const [card,x,y] of [[manager,488,182],[workers[0],19,267],[workers[1],133,525],[workers[2],536,524]])await call('card.place',{id:card.id,x,y,snap:false})
 const before=(await call('office.layout')).connections.map(r=>({id:r.id,points:r.points,path:r.path}))
 for(const worker of workers){
  fs.writeFileSync(path.join(control,worker.id+'.hold-user'),'')
  await rpc(token,'session.send',{employee:worker.id,text:'Hold this fixture turn'})
  const socket=net.connect(platform.controlEndpoint(env.AGENTS_COMPANY_HOME));followers.push(socket)
  await new Promise((resolve,reject)=>{socket.once('error',reject);socket.once('connect',()=>socket.write(JSON.stringify({cmd:'session.follow',args:{employee:worker.id},auth:token})+'\n'));socket.once('data',()=>resolve())})
 }
 await page.emulateMedia({reducedMotion:'no-preference'})
 const active=page.locator('.management-connection[data-active=true]');await expect(active).toHaveCount(3);await expect(page.locator('.office-connections')).toHaveCSS('animation-name','management-flow');await expect(page.locator('.sleep-marks')).toHaveCount(0)
 for(const zoom of [.33,.8,1.2]){
  await call('canvas.set',{x:40,y:15,zoom})
  await expect(page.locator('.infinite-canvas')).toHaveAttribute('data-zoom',zoom.toFixed(3))
  for(const connection of before){
   const edge=page.locator(`[data-connection="${connection.id}"]`),arrow=edge.locator('.management-arrow')
   await checkArrow(edge,connection);await expect(arrow).toHaveAttribute('fill','none');await expect(arrow).toHaveCSS('stroke','rgb(50, 188, 120)')
   assert.equal(await edge.locator('.management-line').getAttribute('d'),connection.path,'Styling must not change the canonical editable route')
   assert.equal(await edge.locator('.management-line').getAttribute('marker-end'),null,'Active flow must not carry an overlapping triangle')
   assert.equal(await edge.locator('.management-terminal-lead').evaluate(e=>getComputedStyle(e).animationName),'none','Endpoint lead must stay steady')
   assert.equal(await arrow.evaluate(e=>getComputedStyle(e).animationName),'none','Direction arrow must stay steady');if(zoom===.33)assert.ok((await arrow.boundingBox()).width<=12,'Overview arrow stays compact')
  }
  await page.screenshot({path:path.join(output,`terminals-${zoom}.png`)})
  if(zoom===.33)await page.locator('.world-room').first().screenshot({path:path.join(output,'overview-detail.png')})
 }
 for(const side of ['left','top','right','bottom']){
  await call('connector.set',{manager:manager.id,employee:workers[0].id,target:{side,offset:.5}})
  const connection=(await call('office.layout')).connections.find(r=>r.employeeId===workers[0].id)
  await expect(page.locator(`[data-connection="${connection.id}"] .management-line`)).toHaveAttribute('d',connection.path);await checkArrow(page.locator(`[data-connection="${connection.id}"]`),connection)
 }
 await call('connector.reset',{manager:manager.id,employee:workers[0].id})
 followers.forEach(socket=>socket.destroy());followers.length=0
 for(const worker of workers)await call('session.interrupt',{employee:worker.id})
 await expect(page.locator('.management-terminal')).toHaveCount(0,{timeout:5000})
 assert.deepEqual((await call('office.layout')).connections.map(r=>({id:r.id,points:r.points,path:r.path})),before)
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 console.log('PASS active arrows at 33%, 80%, 120% and all four receiving sides: fixed open arrowhead, flowing body, canonical routing unchanged, idle arrows restored; isolated fixture only')
}finally{followers.forEach(socket=>socket.destroy());await app.close();fs.rmSync(temp,{recursive:true,force:true})}
