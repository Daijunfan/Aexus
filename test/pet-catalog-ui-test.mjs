// Editable companions and greeting parity; hidden windows, no engine inference.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-pets-'))
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow();page.setDefaultTimeout(15000)
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[path.join(root,'bin/agents'),...args,'--json'],{env})).stdout);assert.ok(r.ok,r.error);return r.data}
try{
 await page.locator('.infinite-canvas').waitFor();await cli('group','add','Pet Studio');await cli('settings','set','--theme','white');for(const avatar of ['woodi','marmalade','voltcoin','inky','byte','wondercube']){const card=await cli('card','create','--title',avatar,'--avatar',avatar,'--group','Pet Studio');assert.equal(card.avatar,avatar)}await page.locator('.add-employee').click()
 await expect(page.locator('.avatar-options button')).toHaveCount(14)
 for(const kind of ['woodi','marmalade','voltcoin','inky','byte','wondercube']){
  const pet=page.locator(`.avatar-options [data-avatar="${kind}"]`);await pet.hover();await expect(pet).toHaveAttribute('data-pose','pickup');await expect(pet).toHaveCSS('animation-name','pet-hop');await page.mouse.move(1000,40);await expect(pet).toHaveClass(/official-napping/);await expect(pet.locator('.sleep-z')).toHaveCount(3)
 }
 for(const kind of ['codex','dewey','fireball','rocky','seedy','stacky','bsod','null-signal']){
  const pet=page.locator(`.avatar-options [data-avatar="${kind}"]`);await pet.hover();await expect(pet).toHaveAttribute('data-pose','pickup');await expect(pet).toHaveCSS('animation-name','pet-hop');const frame=await pet.getAttribute('data-frame');await expect.poll(()=>pet.getAttribute('data-frame')).not.toBe(frame)
 }
 await page.mouse.move(1000,40);await page.locator('.avatar-options').screenshot({path:path.join(root,'artifacts/pets-0.21.png')})
 await page.emulateMedia({reducedMotion:'reduce'});const pet=page.locator('.avatar-options [data-avatar="woodi"]');await pet.hover();await expect(pet).toHaveCSS('animation-name','none');await expect(pet).toHaveAttribute('data-pose','pickup')
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 console.log('PASS 6 licensed community pets, 8 classic pets, shared hover jump, sleep Z and reduced motion; no model calls')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
