// Official artwork, identity compatibility and playback; isolated hidden app, no model calls.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-pets-'))
const community=['woodi','marmalade','voltcoin','inky','byte','wondercube'],sprites=['codex','dewey','fireball','rocky','seedy','stacky','bsod','null-signal','hoots',...community],buddies=JSON.parse(fs.readFileSync(root+'/src/renderer/src/assets/pets/claude-buddies.json')),kinds=[...sprites,'clawd',...Object.keys(buddies)],control=path.join(temp,'fixture'),output=path.join(root,'artifacts/restored-companions')
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
 await page.locator('.add-employee').click();await expect(page.locator('.avatar-options button')).toHaveCount(34)
 await expect(page.locator('.avatar-collection')).toHaveCount(3)
 const claudeCollection=page.locator('.avatar-collection').filter({hasText:'Claude · 动画角色'});await expect(claudeCollection.locator('[data-avatar=clawd]')).toHaveCount(1);await expect(claudeCollection.locator('button')).toHaveCount(19)
 for(const kind of kinds){
  const pet=page.locator(`.avatar-options [data-avatar="${kind}"]`)
  if(sprites.includes(kind)){
   const atlas=await pet.locator('.pet-cell').evaluate(async el=>{const img=new Image();img.src=getComputedStyle(el).backgroundImage.slice(5,-2);await img.decode();return [img.naturalWidth,img.naturalHeight]});assert.deepEqual(atlas,[1536,kind==='hoots'||community.includes(kind)?2288:1872])
  }else if(kind==='clawd')assert.equal(await pet.locator('img').evaluate(async img=>{await img.decode();return img.naturalWidth}),47)
  else for(const clip of Object.values(buddies[kind])){assert.ok(clip.sequence.length);assert.ok(clip.sequence.every(index=>clip.frames[index]?.length===5))}
  await pet.hover();await expect(pet).toHaveAttribute('data-pose','pickup');await expect(pet).toHaveCSS('animation-name','pet-hop');const frame=await pet.getAttribute('data-frame');await expect.poll(()=>pet.getAttribute('data-frame')).not.toBe(frame)
  await page.mouse.move(1000,40);await expect(pet).toHaveClass(/official-napping/);await expect(pet.locator('.sleep-z')).toHaveCount(3)
 }
 for(const [i,collection] of (await page.locator('.avatar-collection').all()).entries())await collection.screenshot({path:path.join(output,`catalog-${i}.png`)})
 await expect(page.locator('.engine-choices .codex-mark')).toHaveAttribute('aria-label','Codex');await expect(page.locator('.engine-choices .claude-mark')).toHaveAttribute('aria-label','Claude Agent')
 for(const mark of await page.locator('.engine-choices .codex-mark,.engine-choices .claude-mark').all())assert.ok((await mark.locator('path').first().getAttribute('d')).length>500)
 await page.locator('.engine-choices').screenshot({path:path.join(output,'engine-marks.png')})
 await page.emulateMedia({reducedMotion:'reduce'})
 for(const kind of ['fireball','clawd','claude-octopus']){const pet=page.locator(`.avatar-options [data-avatar="${kind}"]`);await pet.hover();await expect(pet).toHaveCSS('animation-name','none');const frame=await pet.getAttribute('data-frame');await page.waitForTimeout(700);assert.equal(await pet.getAttribute('data-frame'),frame)}
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 console.log('PASS 34 preserved official and community characters, Clawd grouped with Claude, original identity preserved through CLI changes, atlas dimensions, animation frames, sleep/reduced-motion and engine marks; hidden fixture, no model calls')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
