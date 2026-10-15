import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-chat-scroll-'))),control=path.join(temp,'fixture')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'')
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1400',AGENTS_COMPANY_HEIGHT:'1000',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[]
page.on('pageerror',error=>errors.push(error.message))
const cli=async(...args)=>{const result=JSON.parse((await promisify(execFile)(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:20000,maxBuffer:8e6})).stdout);assert.ok(result.ok,result.error);return result.data}
const status=async id=>(await cli('session','status','--employee',id))[0]
const create=async title=>{const card=await cli('card','create','--title',title,'--group','Team','--model','gpt-6-luna','--effort','low');await expect.poll(async()=>(await status(card.id)).initialization.status).toBe('ready');return card}
const transcript=page.locator('.transcript'),top=()=>transcript.evaluate(e=>e.scrollTop),gap=()=>transcript.evaluate(e=>e.scrollHeight-e.clientHeight-e.scrollTop)
const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
try{
 await page.locator('.infinite-canvas').waitFor();await cli('group','add','Team');const card=await create('Reader')
 const reply=path.join(control,card.id+'.reply.txt'),stream=path.join(control,card.id+'.stream.txt'),hold=path.join(control,card.id+'.hold-user')
 fs.writeFileSync(reply,Array.from({length:90},(_,i)=>`历史段落 ${i}：这里是需要向上阅读的内容。`).join('\n\n'))
 await cli('session','send','--employee',card.id,'--text','第一轮');await expect.poll(async()=>(await status(card.id)).busy).toBe(false)
 await cli('view','open','conversation','--employee',card.id);await expect(transcript).toContainText('历史段落 89');await expect.poll(gap).toBeLessThan(4)
 fs.writeFileSync(hold,'');let text='正在处理，实时更新。\n\n'.repeat(15);fs.writeFileSync(stream,text)
 await cli('session','send','--employee',card.id,'--text','继续处理');await expect(transcript).toContainText('正在处理');await expect.poll(gap).toBeLessThan(4)
 const box=await transcript.boundingBox(),initialTop=await top();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,-650)
 await expect.poll(top).toBeLessThan(initialTop-200);await frame();let reading=await top()
 for(let i=0;i<3;i++){text+=`新的实时输出 ${i}\n\n`.repeat(8);fs.writeFileSync(stream,text);await expect(transcript).toContainText(`新的实时输出 ${i}`);assert.ok(Math.abs(await top()-reading)<3,'streaming pulled the reader away from history')}
 await cli('settings','set','--theme','space');await frame();assert.ok(Math.abs(await top()-reading)<3,'configuration refresh moved history')
 await transcript.evaluate(e=>{e.scrollTop=320});await frame();reading=await top()
 text+='拖动滚动条后仍有新内容\n\n';fs.writeFileSync(stream,text);await expect(transcript).toContainText('拖动滚动条后仍有新内容');assert.ok(Math.abs(await top()-reading)<3)
 fs.writeFileSync(reply,text);fs.unlinkSync(hold);await expect.poll(async()=>(await status(card.id)).busy).toBe(false);await frame();assert.ok(Math.abs(await top()-reading)<3,'turn completion moved history')
 await page.screenshot({path:path.join(root,'artifacts/chat-reading-during-updates.png')})
 await transcript.evaluate(e=>{e.scrollTop=e.scrollHeight});await frame();await expect.poll(gap).toBeLessThan(4)
 fs.writeFileSync(hold,'');text='回到底部后继续跟随\n\n'.repeat(15);fs.writeFileSync(stream,text)
 await cli('session','send','--employee',card.id,'--text','第三轮');await expect(transcript).toContainText('回到底部后继续跟随');await expect.poll(gap).toBeLessThan(4)
 text+='最后一段跟随更新\n\n'.repeat(12);fs.writeFileSync(stream,text);await expect(transcript).toContainText('最后一段跟随更新');await expect.poll(gap).toBeLessThan(4)
 fs.writeFileSync(reply,text);fs.unlinkSync(hold);await expect.poll(async()=>(await status(card.id)).busy).toBe(false)
 const other=await create('Other');fs.writeFileSync(path.join(control,other.id+'.reply.txt'),'另一名员工的历史\n\n'.repeat(90));await cli('session','send','--employee',other.id,'--text','你好');await expect.poll(async()=>(await status(other.id)).busy).toBe(false)
 await transcript.evaluate(e=>{e.scrollTop=0});await frame();await cli('view','open','conversation','--employee',other.id);await expect(transcript).toContainText('另一名员工的历史');await expect.poll(gap).toBeLessThan(4)
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 console.log('PASS hidden live stream: bottom follows new output, wheel/scrollbar history stays fixed through updates and completion, rendering stays live, bottom follow resumes, switching employees resets correctly')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
