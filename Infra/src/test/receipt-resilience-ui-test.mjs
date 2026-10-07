import {createReady,readyEmployee,acceptedMessage} from './fixtures/ui-contracts.mjs'
// Receipt lifecycle regression: disposable Core and hidden renderer, no paid inference.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {_electron as electron,expect} from '@playwright/test'
const root=path.resolve(import.meta.dirname,'../../..'),require=createRequire(import.meta.url)
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-receipt-resilience-'))),control=path.join(temp,'fixture')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'')
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1168',AGENTS_COMPANY_HEIGHT:'850',CODEX_BIN:path.join(root,'Infra/src/test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_WEB_URL'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[]
page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message))
const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
const status=async id=>(await call('session.status',{employee:id}))[0]
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
// Simulate native event ordering, not authorization: the real IPC receipt guard still executes.
const native=async active=>app.evaluate(({BrowserWindow},active)=>{
 const win=BrowserWindow.getAllWindows()[0]
 if(!globalThis.restoreReceipts)globalThis.restoreReceipts=()=>{delete win.isVisible;delete win.isFocused;delete win.isMinimized;delete win.webContents.isFocused}
 win.isVisible=()=>active;win.isFocused=()=>active;win.isMinimized=()=>false;win.webContents.isFocused=()=>active
},active)
const documentFocus=async active=>page.evaluate(active=>{
 Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>active})
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>active?'visible':'hidden'})
 window.dispatchEvent(new Event(active?'focus':'blur'));document.dispatchEvent(new Event('visibilitychange'))
},active)
try{
 await page.locator('.infinite-canvas').waitFor();await call('group.add',{name:'Receipt fixture'})
 const a=await createReady(call,{title:'Reader A',group:'Receipt fixture',engine:'codex',model:'gpt-6-luna'}),b=await createReady(call,{title:'Reader B',group:'Receipt fixture',engine:'codex',model:'gpt-6-luna'})
 for(const person of [a,b]){await call('session.send',{employee:person.id,text:'Reply for reading'});await expect.poll(async()=>(await status(person.id)).busy).toBe(false)}
 await call('view.open',{kind:'messages',employee:a.id});await page.locator('.reply-seen-marker').waitFor();await wait(800)
 assert.equal((await status(a.id)).lastReply.readAt,undefined,'hidden renderer must not acknowledge')
 await native(true)
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('api:event',{channel:'desktop:visibility',payload:{active:false,visible:true}}))
 await documentFocus(true)
 await expect.poll(async()=>!!(await status(a.id)).lastReply.readAt,{timeout:3500,message:'A stale native blur event must not permanently block a foreground receipt'}).toBe(true)
 await expect(page.locator(`[data-employee="${a.id}"] .message-unread-dot`)).toHaveCount(0)
 await expect(page.locator(`[data-employee="${b.id}"] .message-unread-dot`)).toHaveCount(1)
 await call('view.select',{id:'company'});await expect(page.locator(`[data-card-id="${a.id}"] .unread-dot`)).toHaveCount(0)
 await expect(page.locator(`[data-card-id="${b.id}"] .unread-dot`)).toHaveCount(1)
 // Native background protection remains intact even when Chromium reports focus.
 await native(false);await call('view.open',{kind:'messages',employee:b.id});await page.locator('.reply-seen-marker').waitFor();await wait(900)
 assert.equal((await status(b.id)).lastReply.readAt,undefined)
 // Regaining native focus without another visibility event must recover via the guarded retry.
 await native(true);await expect.poll(async()=>!!(await status(b.id)).lastReply.readAt,{timeout:3500}).toBe(true)
 await documentFocus(false)
 fs.writeFileSync(path.join(control,a.id+'.reply.txt'),Array.from({length:50},(_,i)=>'Reading paragraph '+i+'. Content is retained in the original employee conversation.').join('\n\n'))
 await call('session.send',{employee:a.id,text:'Long reply'});await expect.poll(async()=>(await status(a.id)).busy).toBe(false)
 await call('view.open',{kind:'messages',employee:a.id});await page.locator('.reply-seen-marker').waitFor()
 await page.locator('.transcript').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'))});await documentFocus(true);await wait(900)
 assert.equal((await status(a.id)).lastReply.readAt,undefined,'unseen end of long reply stays unread')
 await page.locator('.transcript').evaluate(el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'))})
 await expect.poll(async()=>!!(await status(a.id)).lastReply.readAt).toBe(true)
 // Opening a covering modal must not read beneath it; closing must resume without scrolling.
 await documentFocus(false);await call('view.open',{kind:'messages',employee:b.id})
 await call('session.send',{employee:b.id,text:'Reply below a dialog'});await expect.poll(async()=>(await status(b.id)).busy).toBe(false)
 await page.getByRole('button',{name:'New group',exact:true}).click();await expect(page.getByRole('dialog',{name:'New group',exact:true})).toBeVisible()
 await documentFocus(true);await wait(900);assert.equal((await status(b.id)).lastReply.readAt,undefined)
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'New group',exact:true})).toHaveCount(0)
 fs.mkdirSync(path.join(root,'.aexus/artifacts/slimming-final'),{recursive:true});fs.writeFileSync(path.join(root,'.aexus/artifacts/slimming-final/modal-receipt.json'),JSON.stringify({state:await status(b.id),dom:await page.evaluate(()=>{const transcript=document.querySelector('.transcript'),marker=transcript?.querySelector('.reply-seen-marker'),r=marker?.getBoundingClientRect();return {focus:document.hasFocus(),visibility:document.visibilityState,active:document.activeElement?.outerHTML,transcript:transcript?.getBoundingClientRect().toJSON(),scrollTop:transcript?.scrollTop,scrollHeight:transcript?.scrollHeight,marker:r?.toJSON(),hit:r&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.outerHTML,dialogs:[...document.querySelectorAll('[role=dialog]')].map(el=>el.outerHTML.slice(0,1000)),viewportRows:[...document.querySelectorAll('[data-chat-item]')].map(el=>({id:el.dataset.chatItem,rect:el.getBoundingClientRect().toJSON()}))}})},null,2));
 await expect.poll(async()=>!!(await status(b.id)).lastReply.readAt,{timeout:3500,message:'Closing a covering dialog resumes receipt observation'}).toBe(true)
 assert.deepEqual(errors,[])
 console.log('PASS receipt recovery: native focus races, background denial, exact long-reply visibility, modal close, shared inbox/canvas unread and untouched other employees; hidden fixture only')
}finally{await app.evaluate(()=>globalThis.restoreReceipts?.());await app.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
