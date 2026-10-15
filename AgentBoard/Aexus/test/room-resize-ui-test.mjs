import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-resize-ui-'))),control=path.join(temp,'fixture')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'')
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1050',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[]
page.on('pageerror',error=>errors.push(error.message))
const cli=async(...args)=>{const value=JSON.parse((await promisify(execFile)(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:20000,maxBuffer:8e6})).stdout);assert.ok(value.ok,value.error);return value.data}
const room=page.locator('.world-room[data-department="Team"]')
const seats=()=>room.locator('.employee-location').evaluateAll(items=>items.map(item=>{const rect=item.getBoundingClientRect();return {x:rect.x,y:rect.y}}))
const still=(before,after)=>before.forEach((p,i)=>{assert.ok(Math.abs(p.x-after[i].x)<.1,`x moved: ${p.x} -> ${after[i].x}`);assert.ok(Math.abs(p.y-after[i].y)<.1,`y moved: ${p.y} -> ${after[i].y}`)})
try{
 await page.locator('.infinite-canvas').waitFor();await cli('group','add','Team')
 for(const title of ['One','Two']){const card=await cli('card','create','--title',title,'--group','Team','--model','gpt-6-luna','--effort','low');await expect.poll(async()=>(await cli('session','status','--employee',card.id))[0].initialization.status).toBe('ready')}
 await cli('canvas','set','--x','150','--y','160','--zoom','0.7');await expect(page.locator('.infinite-canvas')).toHaveAttribute('data-zoom','0.700')
 const before=await seats()
 const drag=async(edge,dx,dy)=>{
  const box=await room.boundingBox(),inset=4*.7
  const x=edge==='w'?box.x+inset:edge==='e'?box.x+box.width-inset:box.x+box.width/2
  const y=edge==='n'?box.y+inset:edge==='s'?box.y+box.height-inset:box.y+box.height/2
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:10})
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  still(before,await seats())
  await page.mouse.up()
  const layout=await cli('room','layout','Team')
  const expected=[layout.bounds.x,layout.bounds.y,layout.bounds.width,layout.bounds.height]
  await expect.poll(async()=> (await room.evaluate(element=>[element.style.left,element.style.top,element.style.width,element.style.height].map(parseFloat))).every((value,i)=>Math.abs(value-expected[i])<.01)).toBe(true)
  still(before,await seats());return layout
 }
 const initial=await cli('room','layout','Team'),shrunk=await drag('e',-250,0)
 assert.ok(shrunk.bounds.width<initial.bounds.width)
 const stopped=await drag('e',-200,0);assert.ok(Math.abs(stopped.bounds.width-shrunk.bounds.width)<.01)
 const larger=await drag('e',250,0);assert.ok(larger.bounds.width>shrunk.bounds.width)
 await drag('w',120,0);await drag('w',-100,0)
 await drag('s',0,90);await drag('n',0,75);await drag('n',0,-65);await drag('s',0,-140)
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts/room-resize-fixed-employees.png')})
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 console.log('PASS hidden mouse resize: employees stay visually fixed during/after edge drags, contact stops shrinking, expanding works, and persisted CLI bounds match preview')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
