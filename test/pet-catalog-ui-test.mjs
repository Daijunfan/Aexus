// Official artwork, identity compatibility and playback; isolated hidden app, no model calls.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
import {FATE_AVATARS} from '../src/shared/office.ts'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-pets-'))
const community=['woodi','marmalade','voltcoin','inky','byte','wondercube'],sprites=['codex','dewey','fireball','rocky','seedy','stacky','bsod','null-signal','hoots',...community],buddies=JSON.parse(fs.readFileSync(root+'/src/renderer/src/assets/pets/claude-buddies.json')),selectable=[...sprites,...FATE_AVATARS],kinds=[...sprites,'clawd',...Object.keys(buddies)],control=path.join(temp,'fixture'),output=path.join(root,'artifacts/avatar-picker')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'');fs.mkdirSync(output,{recursive:true})
const env={...process.env,CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1'}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow();page.setDefaultTimeout(15000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[path.join(root,'bin/agents'),...args,'--json'],{env})).stdout);assert.ok(r.ok,r.error);return r.data}
try{
 await page.locator('.infinite-canvas').waitFor();await cli('group','add','Pet Studio');await cli('settings','set','--theme','white')
 const card=await cli('card','create','--title','Original identity','--avatar','marmalade','--group','Pet Studio','--model','gpt-6-luna'),mascot=page.locator(`[data-card-id="${card.id}"] .mascot`)
 await expect(mascot).toHaveAttribute('data-avatar','marmalade')
 for(const avatar of kinds){const updated=await cli('card','update',card.id,'--avatar',avatar),edited=updated.sessions.find(c=>c.id===card.id);assert.equal(edited.avatar,avatar);assert.equal(edited.id,card.id);await expect(mascot).toHaveAttribute('data-avatar',avatar)}
 const claude=await cli('card','create','--title','Claude mark','--avatar','clawd','--engine','claude','--group','Pet Studio')
 for(const theme of ['black','white']){
  await cli('settings','set','--theme',theme)
  for(const [engine,id] of [['codex',card.id],['claude',claude.id]]){
   const badge=page.locator(`[data-card-id="${id}"] .employee-badge`),mark=badge.locator('.badge-engine svg')
   await expect(mark).toHaveAttribute('width','24');await expect(mark).toHaveAttribute('height','24')
   const geometry=await mark.evaluate(el=>{const r=el.getBoundingClientRect(),b=el.closest('.employee-badge').getBoundingClientRect();return {inside:r.left>=b.left&&r.top>=b.top&&r.right<=b.right&&r.bottom<=b.bottom,square:Math.abs(r.width-r.height)<.1,fill:getComputedStyle(el.querySelector('path')).fill}})
   assert.ok(geometry.inside&&geometry.square);assert.notEqual(geometry.fill,'none');if(engine==='claude')assert.equal(geometry.fill,'rgb(217, 119, 87)')
   await badge.screenshot({path:path.join(output,`badge-${theme}-${engine}.png`)})
  }
 }
 await page.locator('.add-employee').click();await expect(page.locator('.avatar-options button')).toHaveCount(57)
 await expect(page.locator('.avatar-options')).toHaveCount(1)
 await expect(page.locator('.avatar-collection,.avatar-collection-label,.avatar-options .buddy-body,.avatar-options [data-avatar=clawd]')).toHaveCount(0)
 assert.deepEqual((await page.locator('.avatar-options .mascot').evaluateAll(elements=>elements.map(el=>el.dataset.avatar))).sort(),[...selectable].sort(),'all other characters must remain, without duplicates')
 await expect(page.locator('.field-heading').filter({hasText:'选择你的伙伴'})).toContainText('57 款伙伴')
 for(const kind of sprites){
  const pet=page.locator(`.avatar-options [data-avatar="${kind}"]`)
  if(sprites.includes(kind)){
   const atlas=await pet.locator('.pet-cell').evaluate(async el=>{const img=new Image();img.src=getComputedStyle(el).backgroundImage.slice(5,-2);await img.decode();return [img.naturalWidth,img.naturalHeight]});assert.deepEqual(atlas,[1152,208])
  }else if(kind==='clawd')assert.equal(await pet.locator('img').evaluate(async img=>{await img.decode();return img.naturalWidth}),47)
  else for(const clip of Object.values(buddies[kind])){assert.ok(clip.sequence.length);assert.ok(clip.sequence.every(index=>clip.frames[index]?.length===5))}
  await pet.hover();await expect(pet).toHaveAttribute('data-pose','pickup');await expect(pet).toHaveCSS('animation-name','pet-hop');const frame=await pet.getAttribute('data-frame');await expect.poll(()=>pet.getAttribute('data-frame')).not.toBe(frame)
  await page.mouse.move(1000,40);await expect(pet).toHaveClass(/official-napping/);await expect(pet.locator('.sleep-z')).toHaveCount(3)
 }
 await page.locator('.avatar-options').screenshot({path:path.join(output,'catalog.png')})
 await expect(page.locator('.engine-choices .codex-mark')).toHaveAttribute('aria-label','Codex');await expect(page.locator('.engine-choices .claude-mark')).toHaveAttribute('aria-label','Claude Agent')
 for(const mark of await page.locator('.engine-choices .codex-mark,.engine-choices .claude-mark').all())assert.ok((await mark.locator('path').first().getAttribute('d')).length>500)
 await page.locator('.engine-choices').screenshot({path:path.join(output,'engine-marks.png')})
 await page.emulateMedia({reducedMotion:'reduce'})
 const geometry=[]
 for(const theme of ['white','black']){
  await cli('settings','set','--theme',theme)
  const entries=await page.locator('.avatar-options button').evaluateAll(buttons=>buttons.map(button=>{
   const pet=button.querySelector('.mascot'),view=pet.querySelector('.pet-viewport'),label=button.querySelector('.avatar-label'),frame=pet.querySelector('.official-frame')
   const bottom=Math.max(pet.getBoundingClientRect().bottom,view.getBoundingClientRect().bottom,frame.getBoundingClientRect().bottom)
   return {avatar:pet.dataset.avatar,position:getComputedStyle(pet).position,ownViewport:view.offsetParent===pet,gap:label.getBoundingClientRect().top-bottom}
  }))
  for(const entry of entries){assert.equal(entry.position,'relative');assert.ok(entry.ownViewport);assert.ok(entry.gap>=16,JSON.stringify(entry))}
  geometry.push({theme,entries});await page.locator('.avatar-options').screenshot({path:path.join(output,`catalog-${theme}.png`)})
 }
 fs.writeFileSync(path.join(output,'geometry.json'),JSON.stringify(geometry,null,2)+'\n')
 for(const kind of ['fireball','hoots','marmalade','fate-saber-anime','fate-saber-chibi']){const pet=page.locator(`.avatar-options [data-avatar="${kind}"]`);await pet.hover();await expect(pet).toHaveCSS('animation-name','none');const frame=await pet.getAttribute('data-frame');await page.waitForTimeout(700);assert.equal(await pet.getAttribute('data-frame'),frame)}
 // Retired picker entries must not silently change saved employee identities.
 await cli('view','close');await cli('view','open','employee','--employee',card.id)
 await expect(page.locator('.avatar-options')).toHaveCount(1);await expect(page.locator('.avatar-options button')).toHaveCount(57)
 await expect(page.locator('.avatar-options .buddy-body,.avatar-options [data-avatar=clawd]')).toHaveCount(0)
 await expect(page.locator('.employee-preview .mascot')).toHaveAttribute('data-avatar',kinds.at(-1))
 await page.locator('.save-employee').click();await expect(page.locator('.employee-form')).toHaveCount(0)
 const preserved=(await cli('session','list')).sessions.find(c=>c.id===card.id)
 assert.equal(preserved.avatar,kinds.at(-1));assert.equal(preserved.cwd,card.cwd);assert.equal(preserved.engine,card.engine)
 await cli('view','open','employee','--employee',card.id)
 await page.locator('.avatar-options [data-avatar="hoots"]').click()
 await expect(page.locator('.employee-preview .mascot')).toHaveAttribute('data-avatar','hoots')
 await expect(page.locator('.avatar-options button.selected .mascot')).toHaveAttribute('data-avatar','hoots')
 await page.locator('.save-employee').click();await expect(page.locator('.employee-form')).toHaveCount(0)
 assert.equal((await cli('session','list')).sessions.find(c=>c.id===card.id).avatar,'hoots')
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 console.log('PASS unified 57-character picker, only Clawd and the previously retired text-art choices hidden, saved identities and profile selection/save preserved, image/name clearance in both themes, retained animation frames and reduced-motion; hidden fixture, no model calls')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
