// Fate skins share Core identity, real activity state and the existing flat picker.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {_electron as electron,expect} from '@playwright/test'
import {FATE_AVATARS,FATE_CHARACTERS,SPRITE_COLORS} from '../src/shared/office.ts'
const root=process.cwd(),require=createRequire(import.meta.url),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-fate-')),control=temp+'/fixture',out=root+'/artifacts/fate-companions'
fs.mkdirSync(control);fs.writeFileSync(control+'/release-all','');fs.mkdirSync(out,{recursive:true})
const env={...process.env,AGENTS_COMPANY_HOME:temp+'/state',AGENTS_COMPANY_PROJECTS:temp+'/projects',AGENTS_COMPANY_HIDDEN:'1',CODEX_HOME:temp+'/codex',CODEX_BIN:root+'/test/fixtures/initialization-codex.cjs',AC_INIT_FIXTURE:control}
for(const k of Object.keys(env))if(k.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_PORT'].includes(k))delete env[k]
assert.equal(FATE_CHARACTERS.length,21);assert.equal(new Set(FATE_AVATARS).size,42)
const assets=JSON.parse(fs.readFileSync(root+'/src/renderer/src/assets/pets/fate/sources.json'));assert.equal(assets.length,42)
for(const id of FATE_AVATARS){
 const file=root+'/src/renderer/src/assets/pets/fate/'+id+'.webp',meta=await sharp(file).metadata();assert.equal(meta.width,3072);assert.equal(meta.height,416);assert.equal(meta.hasAlpha,true)
 assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),assets.find(a=>a.id===id).sha256)
 const hashes=[];for(let i=0;i<8;i++){const frame=await sharp(file).extract({left:i*384,top:0,width:384,height:416}).raw().toBuffer();hashes.push(createHash('sha256').update(frame).digest('hex'));let alpha=0;for(let j=3;j<frame.length;j+=4)if(frame[j]>128)alpha++;assert.ok(alpha>4000&&alpha<384*416*.9,id+' contains visible art and a transparent margin')}
 assert.ok(new Set(hashes).size>=6,id+' has distinct authored animation frames');assert.notEqual(hashes[2],hashes[3]);assert.notEqual(hashes[4],hashes[5])
}
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
try{
 await page.locator('.infinite-canvas').waitFor();await call('group.add',{name:'Fate verification',mode:'build'});await call('settings.set',{theme:'white'})
 const card=await call('card.create',{title:'Identity stays',group:'Fate verification',avatar:FATE_AVATARS[0],engine:'codex',model:'gpt-6-luna',effort:'low'}),actor=page.locator(`[data-card-id="${card.id}"]`)
 for(const avatar of FATE_AVATARS){
  const updated=await call('card.update',{id:card.id,patch:{avatar,color:SPRITE_COLORS[avatar]}}),saved=updated.sessions.find(c=>c.id===card.id);assert.equal(saved.engine,card.engine);assert.equal(saved.cwd,card.cwd);assert.equal(saved.title,card.title)
  await expect(actor.locator('.fate-pet')).toHaveAttribute('data-avatar',avatar)
  const size=await actor.locator('.pet-cell').evaluate(async el=>{const img=new Image();img.src=getComputedStyle(el).backgroundImage.slice(5,-2);await img.decode();return [img.naturalWidth,img.naturalHeight]});assert.deepEqual(size,[3072,416])
 }
 await call('view.open',{kind:'employee',employee:card.id});await expect(page.locator('.avatar-options')).toHaveCount(1);await expect(page.locator('.avatar-options .fate-pet')).toHaveCount(42);await expect(page.locator('.avatar-collection')).toHaveCount(0)
 for(const avatar of FATE_AVATARS){const pet=page.locator(`.avatar-options [data-avatar="${avatar}"]`);const size=await pet.locator('.pet-cell').evaluate(async el=>{const img=new Image();img.src=getComputedStyle(el).backgroundImage.slice(5,-2);await img.decode();return [img.naturalWidth,img.naturalHeight]});assert.deepEqual(size,[1536,208]);await pet.hover();await expect(pet).toHaveAttribute('data-pose','pickup');const frame=await pet.getAttribute('data-frame');await expect.poll(()=>pet.getAttribute('data-frame')).not.toBe(frame)}
 await page.locator('.avatar-options [data-avatar="fate-rin-chibi"]').click();await page.locator('.save-employee').click();await expect(page.locator('.employee-form')).toHaveCount(0)
 await call('view.open',{kind:'home'});await page.mouse.move(1100,40)
 const pet=actor.locator('.fate-pet');await expect(pet).toHaveAttribute('data-avatar','fate-rin-chibi');await expect(pet.locator('.sleep-marks')).toHaveCount(1)
 fs.writeFileSync(control+'/'+card.id+'.hold-user','');await call('session.send',{employee:card.id,text:'Hold this deterministic fixture turn'})
 await expect(actor).toHaveAttribute('data-state','working');await expect(pet.locator('.sleep-marks')).toHaveCount(0);assert.ok(!(await pet.getAttribute('data-frame')).startsWith('sleep:'))
 await actor.screenshot({path:out+'/working-in-app.png'})
 await call('session.interrupt',{employee:card.id});await expect(actor).toHaveAttribute('data-state','sleeping');await expect(pet.locator('.sleep-marks')).toHaveCount(1);await actor.screenshot({path:out+'/resting-in-app.png'})
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 fs.writeFileSync(out+'/ui-verification.json',JSON.stringify({skins:42,servants:14,masters:7,framesPerSkin:8,flatPicker:true,identityPreserved:true,workSleepStatesVerified:true,productionDataUsed:false,modelCalls:0}))
 console.log('PASS 42 Fate skins, 336 authored cells, transparent assets, compact picker animation, Core selection/save, identity preservation and true work/rest state; hidden fixture only')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
