import {nativeFixture} from './native-fixture.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const {_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),project=path.resolve(import.meta.dirname,'..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-mui-'))),work=path.join(temp,'work','mini-notion-workspace'),build=path.join(temp,'projects','Build Studio'),home=path.join(temp,'state')
fs.mkdirSync(work,{recursive:true});fs.mkdirSync(build,{recursive:true});fs.mkdirSync(home)
const fixture=path.join(temp,'codex-fixture')
fs.writeFileSync(fixture,`#!/usr/bin/env node
const args=process.argv.slice(2);if(args.includes('--version')){console.log('codex-cli 0.156.1');process.exit(0)}if(!args.includes('gpt-5.6-luna')||!args.includes('model_reasoning_effort="low"'))process.exit(4);
let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{const initialization=input.includes('[Agents Company private initialization]');if(initialization)for(const match of input.matchAll(/^- (.+\\.md)$/gm))require('fs').readFileSync(require('path').resolve(process.cwd(),match[1]));for(const event of [{type:'thread.started',thread_id:'fixture-thread'},{type:'turn.started'},{type:'item.completed',item:{id:'reply',type:'agent_message',text:initialization?'OK':'Conversation is working.'}},{type:'turn.completed'}])process.stdout.write(JSON.stringify(event)+'\\n')});
`,{mode:0o755})
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:process.env.AGENTS_COMPANY_TEST_WIDTH||'1440',AGENTS_COMPANY_HEIGHT:'1100',CODEX_HOME:path.join(temp,'codex'),CODEX_BIN:nativeFixture(fixture)};delete env.ELECTRON_RUN_AS_NODE
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_ALLOW_INSECURE'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[project],env})
const page=await app.firstWindow();page.setDefaultTimeout(20000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[path.join(project,'bin/agents'),...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const center=async name=>{const b=(await cli('room','layout',name)).bounds;await cli('canvas','set','--x',String(80-b.x*.8),'--y',String(150-b.y*.8),'--zoom','.8')}
let appClosed=false;let checks=0;const ok=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label)}
try{
  await page.locator('.infinite-canvas').waitFor()
  await cli('settings','set','--language','en')
  await expect(page.locator('html')).toHaveAttribute('data-presentation','company')
  const originalPreferences=await cli('settings','get'),messagesAppearance=originalPreferences.viewAppearance.messages,planAppearance=originalPreferences.viewAppearance.plan
  ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'all validation windows remain hidden')
  const opening=app.waitForEvent('window');await page.locator('[data-plugin="mininotion"]').click();const frame=await opening;await frame.locator('.sidebar').waitFor()
  ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'direct plugin window also remains hidden')
  ok((await cli('group','list')).length===0,'direct plugin entry needs no Team and creates no hidden Team')
  ok(await page.locator('.plugin-create-team,.plugin-team-links,.panel-backdrop').count()===0,'click opens the full plugin page without a Team menu or modal backdrop')
  ok(await page.locator('iframe').count()===0&&await page.locator('.company-header').isVisible(),'plugin has its own native window and leaves the company canvas visible')
  const plugin=(method,params={})=>cli('plugin','call','mininotion',method,'--params',JSON.stringify(params))
  const note=await plugin('page.create',{title:'Direct plugin page',color:'green'})
  await plugin('page.open',{pageId:note.id})
  await expect(frame.getByRole('textbox',{name:/^(页面标题|Page title)$/})).toHaveValue('Direct plugin page')
  await frame.getByRole('textbox',{name:/^(页面标题|Page title)$/}).fill('Same MiniNotion interface')
  await page.screenshot({path:path.join(project,'artifacts/direct-mininotion.png')})
  await page.locator('.directory-home').click()
  await cli('plugin','dismiss',(await cli('plugin','windows'))[0].id)
  ok((await plugin('page.get',{pageId:note.id})).title==='Same MiniNotion interface','sidebar navigation saves edits through the same MiniNotion backend')
  await page.getByRole('button',{name:'Application settings',exact:true}).click();const settingsPanel=page.locator('.preferences-panel');await expect(settingsPanel).toBeVisible()
  await expect(settingsPanel.locator('#settings-tab-company')).toHaveAttribute('aria-selected','true')
  await settingsPanel.getByText('More color schemes',{exact:true}).click();await settingsPanel.locator('[data-theme-option="blue"]').click()
  await expect.poll(async()=>(await cli('settings','get')).viewAppearance.company.theme).toBe('blue');await expect(settingsPanel).toBeVisible()
  await expect(settingsPanel.getByRole('button',{name:'Apply settings',exact:true})).toHaveCount(0)
  const statusBefore=await settingsPanel.locator('.settings-save-status').boundingBox()
  await settingsPanel.locator('.settings-employee-defaults>summary').click();await settingsPanel.getByLabel('Default permissions',{exact:true}).selectOption('acceptEdits')
  assert.equal((await cli('settings','get')).defaultPermissionMode,originalPreferences.defaultPermissionMode,'permission selection still needs explicit Apply')
  assert.ok(await settingsPanel.locator('.settings-scroll-body').evaluate(el=>el.scrollTop>0));const statusAfter=await settingsPanel.locator('.settings-save-status').boundingBox();assert.ok(Math.abs(statusBefore.y-statusAfter.y)<1)
  await settingsPanel.getByRole('button',{name:'Apply employee defaults',exact:true}).click();await expect.poll(async()=>(await cli('settings','get')).defaultPermissionMode).toBe('acceptEdits');await expect(settingsPanel).toBeVisible();await settingsPanel.getByRole('button',{name:'Close settings',exact:true}).click();await expect(settingsPanel).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-theme','blue')
  const companyColors=await page.locator('.infinite-canvas').evaluate(el=>{const probe=document.createElement('div');document.body.append(probe);probe.style.background='var(--company-canvas)';const expected=getComputedStyle(probe).backgroundColor;probe.style.background='var(--theme-wash)';const messageWash=getComputedStyle(probe).backgroundColor;probe.remove();return {actual:getComputedStyle(el).backgroundColor,expected,messageWash}})
  assert.equal(companyColors.actual,companyColors.expected);assert.notEqual(companyColors.actual,companyColors.messageWash)
  const blueSettings=await cli('settings','get');assert.deepEqual(blueSettings.viewAppearance.messages,messagesAppearance);assert.deepEqual(blueSettings.viewAppearance.plan,planAppearance);assert.equal(blueSettings.theme,messagesAppearance.theme);assert.equal(blueSettings.themeColor,messagesAppearance.themeColor)
  ok(blueSettings.viewAppearance.company.theme==='blue'&&blueSettings.defaultPermissionMode==='acceptEdits','Company color autosaves while important permission defaults require Apply; Messages and Plan remain unchanged')
  for(const theme of ['violet','blue','mint','teal','cyan','rose','coral','amber','indigo','graphite','light','space','black','midnight','sage','white']){
    await cli('settings','set','--view','company','--theme',theme)
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme)
    const settings=await cli('settings','get');assert.equal(settings.viewAppearance.company.theme,theme);assert.deepEqual(settings.viewAppearance.messages,messagesAppearance);assert.deepEqual(settings.viewAppearance.plan,planAppearance);assert.equal(settings.theme,messagesAppearance.theme)
    const colors=await page.locator('.company-brand').evaluate(e=>{const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),rgb=color=>{ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3)};return {ink:rgb(getComputedStyle(e).color),paper:rgb(getComputedStyle(e.closest('header')).backgroundColor)}})
    const luminance=color=>{const rgb=color.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722}
    const a=luminance(colors.ink),b=luminance(colors.paper);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>4.5,theme+' header contrast')
  }
  ok(true,'all curated and legacy theme backgrounds retain readable header text')
  await page.getByRole('button',{name:'Application settings',exact:true}).click();await page.screenshot({path:path.join(project,'artifacts/settings-white.png')});await page.getByRole('button',{name:'Close settings',exact:true}).click()
  const measureZoom=async sensitivity=>{
    await cli('settings','set','--zoom-sensitivity',String(sensitivity));await cli('canvas','set','--x','80','--y','120','--zoom','1')
    await expect(page.locator('.infinite-canvas')).toHaveAttribute('data-zoom','1.000')
    await cli('ui','wheel','.infinite-canvas','--dy','-20','--zoom')
    return Math.abs(Math.log((await cli('canvas','view')).zoom))
  }
  const slow=await measureZoom(1),fast=await measureZoom(4)
  ok(fast>slow*3.8&&fast<slow*4.2,'identical native pinch/wheel input scales four times faster at 4x')
  await cli('settings','set','--pan-sensitivity','2')
  await cli('canvas','set','--x','80','--y','120','--zoom','1');await expect(page.locator('.infinite-canvas')).toHaveAttribute('data-zoom','1.000')
  await cli('ui','wheel','.infinite-canvas','--dy','20')
  ok(Math.abs((await cli('canvas','view')).y-120)===40,'pan sensitivity changes actual wheel translation')
  await assert.rejects(()=>cli('settings','set','--zoom-sensitivity','0'))
  ok((await cli('settings','get')).zoomSensitivity===4,'invalid sensitivity does not corrupt saved preferences')
  await cli('group','add','Pet Gallery')
  const kinds=['codex','dewey','fireball','rocky','seedy','stacky','bsod','null-signal']
  for(const avatar of kinds){const created=await cli('card','create','--title',avatar,'--group','Pet Gallery','--avatar',avatar,'--cwd',avatar,'--engine','codex','--model','gpt-5.6-luna','--effort','low');assert.equal(created.permissionMode,'acceptEdits');assert.ok(path.relative(path.join(temp,'projects'),created.cwd).split(path.sep)[0]!=='..');await expect.poll(async()=>{const state=(await cli('session','status','--employee',created.id))[0];if(state.initialization?.status==='failed')throw Error(state.initialization.error);return state.initialization?.status}).toBe('ready')}
  const layout=await cli('room','layout','Pet Gallery');await cli('canvas','set','--x','80','--y','110','--zoom','.75')
  await expect(page.locator('.infinite-canvas')).toHaveAttribute('data-zoom','0.750')
  await expect(page.locator('.official-pet')).toHaveCount(8)
  const assets=await page.locator('.official-pet .pet-cell').evaluateAll(async elements=>Promise.all(elements.map(async el=>{const image=new Image(),match=getComputedStyle(el).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/);if(!match)throw Error('Missing sprite background');image.src=match[1];await image.decode();return [image.naturalWidth,image.naturalHeight]})))
  ok(assets.length===8&&assets.every(([w,h])=>w===1536&&h===1872),'all eight official pet sheets are bundled locally and decode at native geometry')
  await page.screenshot({path:path.join(project,'artifacts/pets-white.png')})
  await cli('settings','set','--view','company','--theme','space');await expect(page.locator('html')).toHaveAttribute('data-theme','space');await page.screenshot({path:path.join(project,'artifacts/pets-space.png')})
  const card=(await cli('session','list')).sessions.find(c=>c.avatar==='dewey')
  await cli('view','open','conversation','--employee',card.id);await expect(page.locator('.composer textarea')).toBeEnabled()
  const live=(await cli('session','list','--live')).find(s=>s.cardId===card.id)
  fs.writeFileSync(fixture,`#!/usr/bin/env node
const a=process.argv.slice(2);if(a.includes('--version')){console.log('codex-cli 0.156.1');process.exit(0)}if(!a.includes('gpt-5.6-luna')||!a.includes('model_reasoning_effort="low"'))process.exit(4);process.stdin.resume();process.stdin.on('end',()=>{process.stdout.write(JSON.stringify({type:'turn.started'})+'\\n');setInterval(()=>{},1000)});
`,{mode:0o755})
  await cli('session','send',live.id,'fixture');await cli('view','close')
  const pet=page.locator(`[data-card-id="${card.id}"] .official-pet`)
  await expect(pet).toHaveAttribute('data-frame',/^7:/)
  // Exercise normal canvas animation without showing the native validation window.
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('api:event',{channel:'desktop:visibility',payload:{active:false,visible:true}}))
  await expect(page.locator('.infinite-canvas')).toHaveAttribute('data-animated','true')
  const first=await pet.getAttribute('data-frame');await expect.poll(()=>pet.getAttribute('data-frame')).not.toBe(first)
  ok(true,'official work animation advances through original frames')
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('api:event',{channel:'desktop:visibility',payload:{active:false,visible:false}}))
  await expect(page.locator('.infinite-canvas')).toHaveAttribute('data-animated','false')
  ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'animation fixture keeps every native window hidden')
  await cli('session','interrupt',live.id);await expect(pet).toHaveAttribute('data-frame','0:4')
  ok(await pet.locator('.sleep-marks').count()===1,'idle pets use a closed-eye frame, breathing motion and sleep marks')
  ok(errors.length===0,'no renderer exceptions: '+errors.join('; '))
  await cli('settings','set','--view','company','--theme','black')
  await app.close();appClosed=true
  const restarted=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[project],env})
  try{const reopened=await restarted.firstWindow();await expect(reopened.locator('html')).toHaveAttribute('data-presentation','company');await expect(reopened.locator('html')).toHaveAttribute('data-theme','black');const settings=await reopened.evaluate(()=>window.agents.call('settings.get'));assert.equal(settings.viewAppearance.company.theme,'black');assert.deepEqual(settings.viewAppearance.messages,messagesAppearance);assert.deepEqual(settings.viewAppearance.plan,planAppearance);for(const [key,value] of Object.entries({theme:messagesAppearance.theme,themeColor:messagesAppearance.themeColor,defaultPermissionMode:'acceptEdits',zoomSensitivity:4,panSensitivity:2,sidebarWidth:64,snapEmployees:true}))assert.equal(settings[key],value,key);ok(true,'Company theme, independent Messages alias, permission default and both sensitivities survive a full app restart')}finally{await restarted.close()}
  console.log(`PASS=${checks} FAIL=0 — no model calls`)
}catch(error){console.error(error);if(!page.isClosed()){console.error(await page.locator('body').innerText());await page.screenshot({path:path.join(project,'artifacts/preferences-error.png')})}throw error}
finally{if(!appClosed)await app.close();fs.rmSync(temp,{recursive:true,force:true})}
