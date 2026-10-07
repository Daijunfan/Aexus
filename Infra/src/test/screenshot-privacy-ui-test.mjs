// Verify actual exported pixels, not just the privacy flag; no model calls or production data.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import sharp from 'sharp'
import {_electron as electron} from '@playwright/test'
const root=process.cwd(),require=createRequire(import.meta.url),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-export-')),out=root+'/.aexus/artifacts/restored-companions'
fs.mkdirSync(out,{recursive:true})
const env={...process.env,AGENTS_COMPANY_HOME:temp+'/state',AGENTS_COMPANY_PROJECTS:temp+'/projects',AGENTS_COMPANY_HIDDEN:'1'}
for(const k of Object.keys(env))if(k.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT'].includes(k))delete env[k]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow()
const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
const pink=async file=>{const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true});let n=0;for(let i=0;i<data.length;i+=info.channels)if(data[i]>180&&data[i+1]<90&&data[i+2]>180)n++;return n}
try{
 await page.locator('.infinite-canvas').waitFor();await call('group.add',{name:'Private Path',mode:'build'})
 await page.locator('.team-root-label').waitFor()
 // Bright diagnostic color lets the test detect even one stale sensitive frame.
 await page.locator('.team-root-label').evaluate(el=>{el.style.background='#ff00ff';el.style.color='#ff00ff';el.style.width='300px';el.style.height='40px'})
 await page.screenshot({path:out+'/privacy-visible.png'});assert.ok(await pink(out+'/privacy-visible.png')>100)
 for(let i=0;i<3;i++){
  const file=out+`/privacy-export-${i}.png`;await call('ui.screenshot',{path:file,privacy:true});assert.equal(await pink(file),0,'Privacy export captured a stale frame containing the visible path')
  assert.equal(await page.locator('.team-root-label').evaluate(el=>getComputedStyle(el).visibility),'visible')
 }
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 console.log('PASS actual private export pixels across repeated hidden-window captures; live labels restored')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
