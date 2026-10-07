import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'../../..'),require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-layout-unread-ui-'))),control=path.join(temp,'fixture')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'')
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1050',CODEX_BIN:path.join(root,'Infra/src/test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[]
page.on('pageerror',error=>errors.push(error.message))
const cli=async(...args)=>{const value=JSON.parse((await promisify(execFile)(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env,timeout:20000,maxBuffer:8e6})).stdout);assert.ok(value.ok,value.error);return value.data}
const status=async id=>(await cli('session','status','--employee',id))[0]
const create=async title=>{const card=await cli('card','create','--title',title,'--group','First','--model','gpt-6-luna','--effort','low');await expect.poll(async()=>(await status(card.id)).initialization.status).toBe('ready');return card}
try{
  await page.locator('.infinite-canvas').waitFor()
  await cli('group','add','First');await cli('group','add','Second')
  const worker=await create('Reviewer')
  await cli('canvas','set','--x','70','--y','100','--zoom','0.75')
  fs.writeFileSync(path.join(control,worker.id+'.reply.txt'),'检查过程。\n\n'.repeat(90)+'最后一段：测试已通过，请确认。')
  await cli('session','send','--employee',worker.id,'--text','请检查任务')
  await expect.poll(async()=>!!(await status(worker.id)).lastReply).toBe(true)
  const first=(await status(worker.id)).lastReply,bubble=page.locator('.activity-bubble[data-unread=true]')
  await expect(bubble).toHaveCount(1);await expect(bubble).toContainText(first.text)
  await expect(page.locator(`[data-card-id="${worker.id}"] .unread-dot`)).toHaveCount(1)
  await page.waitForTimeout(900);assert.equal((await status(worker.id)).lastReply.readAt,undefined)
  await page.screenshot({path:path.join(root,'.aexus/artifacts/layout-unread-floor.png')})
  await cli('view','open','conversation','--employee',worker.id)
  await page.locator('.reply-seen-marker').waitFor()
  await page.waitForTimeout(850)
  assert.equal((await status(worker.id)).lastReply.readAt,undefined,'hidden/background window is not read')
  // Exercise foreground visibility in an otherwise hidden native window: never disturb the user desktop.
  await page.evaluate(()=>{
    const root=document.querySelector('.transcript');root.scrollTop=0
    Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true})
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'})
    window.dispatchEvent(new Event('focus'));root.dispatchEvent(new Event('scroll'))
  })
  await app.evaluate(({BrowserWindow})=>{
    const win=BrowserWindow.getAllWindows()[0]
    globalThis.__restoreReadWindow=()=>{delete win.isVisible;delete win.isFocused;delete win.isMinimized;delete win.webContents.isFocused}
    win.isVisible=()=>true;win.isFocused=()=>true;win.isMinimized=()=>false;win.webContents.isFocused=()=>true
    win.webContents.send('api:event',{channel:'desktop:visibility',payload:{active:true}})
  })
  await page.waitForTimeout(850)
  assert.equal((await status(worker.id)).lastReply.readAt,undefined,'scrolling old history does not acknowledge the last answer')
  await page.locator('.transcript').evaluate(element=>{element.scrollTop=element.scrollHeight;element.dispatchEvent(new Event('scroll'))})
  await expect.poll(async()=>!!(await status(worker.id)).lastReply.readAt,{timeout:5000}).toBe(true)
  await expect(bubble).toHaveCount(0)
  await cli('view','close')
  await app.evaluate(()=>globalThis.__restoreReadWindow())
  await page.evaluate(()=>{Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});window.dispatchEvent(new Event('blur'))})
  fs.writeFileSync(path.join(control,worker.id+'.reply.txt'),'第二轮的最终回复，仍未读。')
  await cli('session','send','--employee',worker.id,'--text','第二个任务')
  await expect.poll(async()=>(await status(worker.id)).lastReply.id).not.toBe(first.id)
  await expect(bubble).toHaveCount(1)
  const second=(await status(worker.id)).lastReply
  assert.equal((await cli('session','acknowledge','--employee',worker.id,'--reply-id',first.id)).acknowledged,false)
  await cli('team-view','create','--name','Other','--teams','["Second"]')
  await expect(bubble).toHaveCount(0);assert.equal((await status(worker.id)).lastReply.readAt,undefined)
  await cli('team-view','select','all');await expect(bubble).toHaveCount(1)
  const small=(await cli('office','layout','--team','First')).rooms[0].bounds
  await cli('room','bounds','Second','--x',String(small.x),'--y',String(small.y+small.height+65))
  const camera=await cli('canvas','view')
  for(let i=0;i<8;i++)await create('New '+i)
  const rooms=(await cli('office','layout')).rooms
  for(const room of rooms)await expect.poll(()=>page.locator(`.world-room[data-department="${room.name}"]`).evaluate(element=>{const style=getComputedStyle(element);return [style.left,style.top,style.width,style.height].map(parseFloat)})).toEqual([room.bounds.x,room.bounds.y,room.bounds.width,room.bounds.height])
  const a=rooms[0].bounds,b=rooms[1].bounds
  assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y)
  assert.deepEqual(await cli('canvas','view'),camera)
  assert.equal((await status(worker.id)).lastReply.id,second.id)
  assert.equal((await status(worker.id)).lastReply.readAt,undefined)
  await page.screenshot({path:path.join(root,'.aexus/artifacts/layout-unread-expanded.png')})
  assert.deepEqual(errors,[])
  assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
  console.log('PASS hidden Electron: persistent unread bubble/red dot, background and offscreen replies not read, foreground-visible exact reply acknowledged, views preserve unread state, rendered Team growth/displacement matches Core and camera stays fixed')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
