import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),project=path.resolve(import.meta.dirname,'..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-ftc-'))),home=path.join(temp,'state'),remote=path.join(temp,'cloud'),bin=path.join(temp,'bin')
for(const p of [home,remote,bin])fs.mkdirSync(p)
fs.mkdirSync(path.join(remote,'dirA'));fs.writeFileSync(path.join(remote,'dirA/inner.txt'),'REMOTE INNER');fs.mkdirSync(path.join(remote,'dirB'));fs.writeFileSync(path.join(remote,'top.txt'),'REMOTE TOP')
fs.writeFileSync(path.join(bin,'ssh'),`#!/usr/bin/env python3
import os,sys
os.execv('/bin/sh',['sh','-c',sys.argv[-1]])
`,{mode:0o755})
const env={...process.env,PATH:bin+':'+process.env.PATH,SHELL:'/bin/bash',HISTFILE:'/dev/null',BASH_SILENCE_DEPRECATION_WARNING:'1',AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_TUNNEL_DIR:process.env.AGENTS_COMPANY_TEST_TUNNEL_DIR||path.join(project,'Modules/Tunnel'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1360',AGENTS_COMPANY_HEIGHT:'1050'};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[project],env}),page=await app.firstWindow();page.setDefaultTimeout(20000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[path.join(project,'bin/agents'),...args,'--json'],{env,timeout:30000})).stdout);assert.ok(r.ok,r.error);return r.data}
let failed=false,n=0;const ok=(value,label)=>{assert.ok(value,label);n++;console.log('PASS '+label)}
const breadcrumbPath=name=>page.locator(`.file-toolbar nav button[data-drop-folder="${name}"]`)
try{
  await page.locator('.infinite-canvas').waitFor();ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'windows remain hidden')

  // Local build Team: folder tree alpha/{child.txt}, beta, root.txt
  await cli('group','add','Build')
  await cli('workspace','mkdir','alpha','--team','Build')
  await cli('workspace','write','alpha/child.txt','--team','Build','--content','LOCAL CHILD')
  await cli('workspace','mkdir','beta','--team','Build')
  await cli('workspace','write','root.txt','--team','Build','--content','LOCAL ROOT')
  await cli('view','open','workspace','--name','Build')
  await expect(page.locator('.team-workspace')).toBeVisible()
  await expect(page.locator('.team-workspace .file-workspace:not(.employee-files)')).toBeVisible()
  await expect(page.locator('[data-file="alpha"]')).toBeVisible()
  ok(await page.locator('[data-file="alpha/child.txt"]').count()===0,'local folder starts collapsed, no child rows rendered')
  ok(await page.locator('[data-file="beta"]').isVisible()&&await page.locator('[data-file="root.txt"]').isVisible(),'local root lists all top-level entries')

  // Chevron click expands without entering: children appear, siblings stay, breadcrumb stays at root
  await page.locator('[data-file="alpha"] .file-open .codicon-chevron-right').click()
  await expect(page.locator('[data-file="alpha/child.txt"]')).toBeVisible()
  ok(await page.locator('[data-file="beta"]').isVisible(),'single chevron click keeps the sibling folder visible (working root not replaced)')
  ok(await breadcrumbPath('alpha').count()===0,'single chevron click does not navigate the breadcrumb into alpha')
  await page.screenshot({path:path.join(project,'artifacts/role-parity-20261015/filetree-local-expanded.png')})

  // Label click collapses back, still no navigation
  await page.locator('[data-file="alpha"] .file-open > span:not(.codicon)').click()
  await expect(page.locator('[data-file="alpha/child.txt"]')).toHaveCount(0)
  ok(await page.locator('[data-file="beta"]').isVisible()&&await breadcrumbPath('alpha').count()===0,'single label click collapses the tree without changing the working folder')

  // Double-click is the explicit enter: breadcrumb navigates and the folder stays expanded
  await page.locator('[data-file="alpha"] .file-open').dblclick()
  await expect(breadcrumbPath('alpha')).toBeVisible()
  await expect(page.locator('[data-file="alpha/child.txt"]')).toBeVisible()
  ok(await breadcrumbPath('alpha').isVisible(),'double-click explicitly enters the folder in the breadcrumb')

  // File single-click still previews the content
  await page.locator('[data-file="alpha/child.txt"] .file-open').click()
  await expect(page.locator('.file-preview textarea')).toHaveValue('LOCAL CHILD')
  ok(true,'single-clicking a file still opens its preview')

  // Remote cloud Team: host + remote directory fixture (real renderer path through the SSH shim)
  const host=await cli('host','create','--data',JSON.stringify({name:'Fixture',host:'fixture',os:'linux',defaultDirectory:remote}))
  await cli('group','add','Cloud','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
  await cli('view','open','workspace','--name','Cloud')
  await expect(page.locator('.team-workspace')).toBeVisible()
  await expect(page.locator('[data-file="dirA"]')).toBeVisible()
  ok(await page.locator('[data-file="dirA/inner.txt"]').count()===0,'remote folder starts collapsed')

  await page.locator('[data-file="dirA"] .file-open').click()
  await expect(page.locator('[data-file="dirA/inner.txt"]')).toBeVisible()
  ok(await page.locator('[data-file="dirB"]').isVisible()&&await breadcrumbPath('dirA').count()===0,'remote single click expands in place without entering or hiding siblings')
  await page.screenshot({path:path.join(project,'artifacts/role-parity-20261015/filetree-remote-expanded.png')})

  await page.locator('[data-file="dirA"] .file-open').click()
  await expect(page.locator('[data-file="dirA/inner.txt"]')).toHaveCount(0)
  ok(await breadcrumbPath('dirA').count()===0,'remote second click collapses and the working root is untouched')

  await page.locator('[data-file="dirA"] .file-open').dblclick()
  await expect(breadcrumbPath('dirA')).toBeVisible()
  await page.locator('[data-file="dirA/inner.txt"] .file-open').click()
  await expect(page.locator('.file-preview textarea')).toHaveValue('REMOTE INNER')
  ok(true,'remote double-click enters and file preview reads the remote fixture')

  ok(errors.length===0,'no renderer exceptions: '+errors.join('; '));console.log(`PASS=${n} FAIL=0 — folder single-click toggles the tree; breadcrumb/root unchanged; double-click enters; file preview intact on local and remote paths`)
}catch(error){failed=true;console.error(error);if(!page.isClosed()){console.error((await page.locator('body').innerText()).slice(-8000));await page.screenshot({path:path.join(project,'artifacts/role-parity-20261015/filetree-error.png')})}throw error}
finally{if(failed){app.process().kill('SIGKILL');await new Promise(r=>app.process().once('exit',r))}else await app.close();fs.rmSync(temp,{recursive:true,force:true})}
