import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {_electron as electron,expect} from '@playwright/test'
import platform from '../bin/platform.cjs'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-line-ends-'))),control=path.join(temp,'fixture'),output=path.join(root,'artifacts/connector-terminal-fix')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'');fs.mkdirSync(output,{recursive:true})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1100',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of ['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_URL'])delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow()
const rpc=(auth,cmd,args={})=>new Promise((resolve,reject)=>{const socket=net.connect(platform.controlEndpoint(env.AGENTS_COMPANY_HOME));let buffer='';socket.on('error',reject);socket.on('connect',()=>socket.write(JSON.stringify({auth,cmd,args})+'\n'));socket.on('data',data=>{buffer+=data;if(buffer.includes('\n')){socket.end();const value=JSON.parse(buffer.split('\n')[0]);value.ok?resolve(value.data):reject(Error(value.error))}})})
let keepActive
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
 const refresh=()=>Promise.all(workers.map(c=>rpc(token,'session.info',{employee:c.id})))
 await refresh();keepActive=setInterval(()=>void refresh().catch(()=>{}),400)
 const active=page.locator('.management-connection[data-active=true]');await expect(active).toHaveCount(3)
 for(const zoom of [.33,.8,1.2]){
  await call('canvas.set',{x:40,y:15,zoom})
  await expect(page.locator('.infinite-canvas')).toHaveAttribute('data-zoom',zoom.toFixed(3))
  for(const connection of before){
   const edge=page.locator(`[data-connection="${connection.id}"]`),end=connection.points.at(-1),port=edge.locator('.management-terminal circle')
   await expect(port).toHaveAttribute('cx',String(end.x));await expect(port).toHaveAttribute('cy',String(end.y))
   assert.equal(await edge.locator('.management-line').getAttribute('d'),connection.path,'Styling must not change the canonical editable route')
   assert.equal(await edge.locator('.management-line').getAttribute('marker-end'),null,'Active flow must not carry an overlapping triangle')
   assert.equal(await edge.locator('.management-terminal path').evaluate(e=>getComputedStyle(e).animationName),'none','Endpoint lead must stay steady')
   if(zoom===.33)assert.ok((await port.boundingBox()).width<6,'Overview port remains compact')
  }
  await page.screenshot({path:path.join(output,`terminals-${zoom}.png`)})
  if(zoom===.33)await page.locator('.world-room').first().screenshot({path:path.join(output,'overview-detail.png')})
 }
 clearInterval(keepActive);keepActive=undefined
 await expect(page.locator('.management-terminal')).toHaveCount(0,{timeout:5000})
 assert.deepEqual((await call('office.layout')).connections.map(r=>({id:r.id,points:r.points,path:r.path})),before)
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 console.log('PASS terminal ports at 33%, 80%, 120%: compact fixed endpoint, flowing body, canonical routing unchanged, idle arrows restored; isolated fixture only')
}finally{clearInterval(keepActive);await app.close();fs.rmSync(temp,{recursive:true,force:true})}
