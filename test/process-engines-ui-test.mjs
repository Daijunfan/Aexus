import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {_electron as electron,expect} from '@playwright/test'
const root=process.cwd(),require=createRequire(import.meta.url),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-process-ui-')),fixture=root+'/test/fixtures/process-adapter.cjs',out=root+'/artifacts/cline-engine/ui-fixture';fs.mkdirSync(out,{recursive:true})
const env={...process.env,AGENTS_COMPANY_HOME:temp+'/state',AGENTS_COMPANY_PROJECTS:temp+'/projects',AGENTS_COMPANY_HIDDEN:'1',CLINE_BIN:fixture,PI_BIN:fixture,CODEX_BIN:root+'/test/fixtures/initialization-codex.cjs'}
for(const k of Object.keys(env))if(k.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_PORT'].includes(k))delete env[k]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message))
const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
try{
 await page.locator('.infinite-canvas').waitFor();await call('group.add',{name:'Mixed Coding Agents',mode:'build'});const cards=[]
 for(const [engine,avatar] of [['codex','codex'],['claude','fireball'],['cline','clawd'],['pi','hoots']]){
  if(engine==='cline'||engine==='pi')await call('engine.configure',{engine,patch:{apiKey:'fixture-no-real-key'}})
  cards.push(await call('card.create',{title:engine,group:'Mixed Coding Agents',engine,avatar}))
 }
 await page.locator('.add-employee').click();await expect(page.locator('.engine-choices button')).toHaveCount(4);await page.locator('.engine-choices').screenshot({path:out+'/engine-picker.png'})
 // Closing a product view also leaves native card identities intact.
 await page.keyboard.press('Escape');await call('view.open',{kind:'home'});await page.locator('.employee-form').waitFor({state:'detached'})
 for(const theme of ['white','black']){
  await call('settings.set',{theme});await expect(page.locator('html')).toHaveAttribute('data-theme',theme)
  const buttons=await Promise.all(['.directory-edit','.directory-shared','.directory-overview'].map(sel=>page.locator(sel).boundingBox()));
  assert.ok(buttons.every(b=>b.width===44&&b.height===44));assert.equal(buttons[1].y-buttons[0].y-buttons[0].height,4);assert.equal(buttons[2].y-buttons[1].y-buttons[1].height,4);
  await page.locator('.plugin-directory').screenshot({path:out+'/sidebar-'+theme+'.png'});

  for(const card of cards){const icon=page.locator(`[data-card-id="${card.id}"] .badge-engine .engine-mark`);await expect(icon).toBeVisible();const box=await icon.boundingBox();assert.ok(Math.abs(box.width-box.height)<.1);assert.ok(box.width>0);
   // Inspect rasterized glyph pixels too: a visible bounding box did not catch a blank CSS mask.
   const ink=await icon.evaluate(async el=>{const svg=el.cloneNode(true);svg.style.color=getComputedStyle(el).color;svg.setAttribute('xmlns','http://www.w3.org/2000/svg');const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(new XMLSerializer().serializeToString(svg));await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=96;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,96,96);const data=ctx.getImageData(0,0,96,96).data;let pixels=0;for(let i=3;i<data.length;i+=4)if(data[i]>128)pixels++;return {pixels,color:getComputedStyle(el).color,svg:el.tagName,paths:el.querySelectorAll('path,rect').length,external:el.querySelectorAll('image,img').length}});
   assert.equal(ink.svg,'svg');assert.ok(ink.paths>0);assert.equal(ink.external,0);assert.ok(ink.pixels>700&&ink.pixels<7500,card.engine+' has a drawn glyph, not a blank tile');
   if(['codex','cline'].includes(card.engine)){const channels=ink.color.match(/\d+/g).map(Number);assert.ok(theme==='white'?Math.max(...channels)<150:Math.min(...channels)>150,card.engine+' contrasts with the badge')}
   await page.locator(`[data-card-id="${card.id}"] .employee-badge`).screenshot({path:out+`/badge-${theme}-${card.engine}.png`})}
 }
 for(const card of cards.filter(c=>['cline','pi'].includes(c.engine))){
  await call('view.open',{kind:'conversation',employee:card.id});await page.locator('.composer textarea').waitFor();await expect(page.locator('.session-settings')).toContainText(card.engine==='cline'?'Cline':'Pi');await expect(page.locator('.session-settings')).toContainText('Thinking off')
  const engineControl=page.locator('.session-settings [data-control="engine"]');assert.equal(await engineControl.evaluate(el=>el.tagName),'SPAN');await expect(engineControl).toHaveAttribute('title',/引擎创建后固定/);
  await page.getByRole('button',{name:'员工资料',exact:true}).click();await expect(page.locator('.employee-form .engine-choices')).toHaveCount(0);await expect(page.locator('.employee-engine-fixed')).toContainText('引擎创建后固定');await page.locator('.save-employee').click();await expect(page.locator('.employee-form')).toHaveCount(0);
  await page.locator('.composer textarea').fill('UNICODE_FIXTURE');await page.locator('.composer textarea').press('Enter');await expect(page.locator('.transcript')).toContainText('春')
  if(card.engine==='pi')await expect(page.locator('[data-control="plan"]')).toHaveCount(0)
  await expect(page.locator('[data-control="effort"]')).toHaveCount(0);await expect(page.locator('.employee-clone')).toBeDisabled()
  await page.screenshot({path:out+'/'+card.engine+'-chat.png'})
  await call('view.close')
 }
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 console.log('PASS hidden UI: 4 creation-only engine choices/marks in both themes; existing engine read-only; sidebar tools have equal dimensions and gaps; Cline/Pi normalized chat, defaults and capability controls; fixture only')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
