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
const args=process.argv.slice(2);if(!args.includes('gpt-5.6-luna')||!args.includes('model_reasoning_effort="low"'))process.exit(4);
process.stdin.resume();process.stdin.on('end',()=>{for(const event of [{type:'thread.started',thread_id:'fixture-thread'},{type:'turn.started'},{type:'item.completed',item:{id:'reply',type:'agent_message',text:'Conversation is working.'}},{type:'turn.completed'}])process.stdout.write(JSON.stringify(event)+'\\n')});
`,{mode:0o755})
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:process.env.AGENTS_COMPANY_TEST_WIDTH||'1440',AGENTS_COMPANY_HEIGHT:'1100',CODEX_BIN:nativeFixture(fixture)};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[project],env})
const page=await app.firstWindow();page.setDefaultTimeout(20000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[path.join(project,'bin/agents'),...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const center=async name=>{const b=(await cli('room','layout',name)).bounds;await cli('canvas','set','--x',String(80-b.x*.8),'--y',String(150-b.y*.8),'--zoom','.8')}
let appClosed=false;let checks=0;const ok=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label)}
try{
  await page.locator('.infinite-canvas').waitFor()
  ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'all validation windows remain hidden')
  const opening=app.waitForEvent('window');await page.locator('[data-plugin="mininotion"]').click();const frame=await opening;await frame.locator('.sidebar').waitFor()
  ok((await cli('group','list')).length===0,'direct plugin entry needs no Team and creates no hidden Team')
  ok(await page.locator('.plugin-create-team,.plugin-team-links,.panel-backdrop').count()===0,'click opens the full plugin page without a Team menu or modal backdrop')
  ok(await page.locator('iframe').count()===0&&await page.locator('.company-header').isVisible(),'plugin has its own native window and leaves the company canvas visible')
  const plugin=(method,params={})=>cli('plugin','call','mininotion',method,'--params',JSON.stringify(params))
  const note=await plugin('page.create',{title:'Direct plugin page',color:'green'})
  await plugin('page.open',{pageId:note.id})
  await expect(frame.getByRole('textbox',{name:'页面标题'})).toHaveValue('Direct plugin page')
  await frame.getByRole('textbox',{name:'页面标题'}).fill('Same MiniNotion interface')
  await page.screenshot({path:path.join(project,'artifacts/direct-mininotion.png')})
  await page.locator('.directory-home').click()
  await cli('plugin','dismiss',(await cli('plugin','windows'))[0].id)
  ok((await plugin('page.get',{pageId:note.id})).title==='Same MiniNotion interface','sidebar navigation saves edits through the same MiniNotion backend')
  await page.locator('.directory-settings').click();await expect(page.locator('.preferences-panel')).toBeVisible()
  await page.locator('[data-theme-option="white"]').click();await page.locator('.save-settings').click();await expect(page.locator('.preferences-panel')).toHaveCount(0)
  await expect.poll(()=>page.locator('.infinite-canvas').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)')
  ok((await cli('settings','get')).theme==='white','white theme is applied and persisted through CLI settings')
  for(const theme of ['light','space','black','midnight','sage','white']){
    await cli('settings','set','--theme',theme)
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme)
    const colors=await page.locator('.company-brand').evaluate(e=>({ink:getComputedStyle(e).color,paper:getComputedStyle(e.closest('header')).backgroundColor}))
    const luminance=color=>{const rgb=color.match(/[0-9.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722}
    const a=luminance(colors.ink),b=luminance(colors.paper);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>4.5,theme+' header contrast')
  }
  ok(true,'all six theme backgrounds retain readable header text')
  await page.locator('.directory-settings').click();await page.screenshot({path:path.join(project,'artifacts/settings-white.png')});await page.getByRole('button',{name:'关闭设置',exact:true}).click()
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
  for(const avatar of kinds)await cli('card','create','--title',avatar,'--group','Pet Gallery','--avatar',avatar,'--cwd',avatar)
  const layout=await cli('room','layout','Pet Gallery');await cli('canvas','set','--x','80','--y','110','--zoom','.75')
  await expect(page.locator('.infinite-canvas')).toHaveAttribute('data-zoom','0.750')
  await expect(page.locator('.official-pet')).toHaveCount(8)
  const assets=await page.locator('.official-pet image').evaluateAll(async elements=>Promise.all(elements.map(async el=>{const image=new Image();image.src=el.getAttribute('href');await image.decode();return [image.naturalWidth,image.naturalHeight]})))
  ok(assets.every(([w,h])=>w===1536&&h===1872),'all eight official pet sheets are bundled locally and decode at native geometry')
  await page.screenshot({path:path.join(project,'artifacts/pets-white.png')})
  await cli('settings','set','--theme','space');await expect(page.locator('html')).toHaveAttribute('data-theme','space');await page.screenshot({path:path.join(project,'artifacts/pets-space.png')})
  const card=(await cli('session','list')).sessions.find(c=>c.avatar==='dewey')
  await cli('view','open','conversation','--employee',card.id);await expect(page.locator('.composer textarea')).toBeEnabled()
  const live=(await cli('session','list','--live')).find(s=>s.cardId===card.id)
  fs.writeFileSync(fixture,`#!/usr/bin/env node
const a=process.argv.slice(2);if(!a.includes('gpt-5.6-luna')||!a.includes('model_reasoning_effort="low"'))process.exit(4);process.stdin.resume();process.stdin.on('end',()=>{process.stdout.write(JSON.stringify({type:'turn.started'})+'\\n');setInterval(()=>{},1000)});
`,{mode:0o755})
  await cli('session','send',live.id,'fixture');await cli('view','close')
  const pet=page.locator(`[data-card-id="${card.id}"] .official-pet`)
  await expect(pet).toHaveAttribute('data-frame',/^7:/)
  const first=await pet.getAttribute('data-frame');await expect.poll(()=>pet.getAttribute('data-frame')).not.toBe(first)
  ok(true,'official work animation advances through original frames')
  await cli('session','interrupt',live.id);await expect(pet).toHaveAttribute('data-frame','0:4')
  ok(await pet.locator('.sleep-marks').count()===1,'idle pets use a closed-eye frame, breathing motion and sleep marks')
  ok(errors.length===0,'no renderer exceptions: '+errors.join('; '))
  await cli('settings','set','--theme','black')
  await app.close();appClosed=true
  const restarted=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[project],env})
  try{const reopened=await restarted.firstWindow();await expect(reopened.locator('html')).toHaveAttribute('data-theme','black');assert.deepEqual(await reopened.evaluate(()=>window.agents.call('settings.get')),{theme:'black',zoomSensitivity:4,panSensitivity:2,sidebarWidth:64,snapEmployees:true});ok(true,'theme and both sensitivities survive a full app restart')}finally{await restarted.close()}
  console.log(`PASS=${checks} FAIL=0 — no model calls`)
}catch(error){console.error(error);if(!page.isClosed()){console.error(await page.locator('body').innerText());await page.screenshot({path:path.join(project,'artifacts/preferences-error.png')})}throw error}
finally{if(!appClosed)await app.close();fs.rmSync(temp,{recursive:true,force:true})}
