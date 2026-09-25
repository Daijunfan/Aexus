import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),root=path.resolve(import.meta.dirname,'..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-host-ui-'))),home=path.join(temp,'state'),remote=path.join(temp,'remote'),bin=path.join(temp,'bin')
for(const p of [home,remote,bin])fs.mkdirSync(p);fs.mkdirSync(path.join(remote,'Project'))
fs.writeFileSync(path.join(bin,'ssh'),`#!/usr/bin/env python3\nimport os,sys\nos.execv('/bin/sh',['sh','-c',sys.argv[-1]])\n`,{mode:0o755})
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),PATH:bin+':'+process.env.PATH,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1500',AGENTS_COMPANY_HEIGHT:'1100'};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow();page.setDefaultTimeout(20000)
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:35000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const errors=[];page.on('pageerror',e=>errors.push(e.message))
try{
 await page.locator('.infinite-canvas').waitFor();await cli('settings','set','--theme','white');await cli('group','add','Local Studio')
 await cli('card','create','--title','Local worker','--group','Local Studio')
 const local=page.locator('[data-department="Local Studio"]');await expect(local.locator('.team-os')).toHaveAttribute('data-os','macos')
 assert.equal(await local.locator('.team-header').evaluate(e=>e.clientHeight),168) // 170px includes the 2px floor divider.
 assert.ok(await local.locator('.team-title strong').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=34))
 assert.ok(await local.locator('.team-os img').evaluate(e=>e.complete&&e.naturalWidth>0))
 const header=await local.locator('.team-header').boundingBox(),worker=await local.locator('.employee-location').boundingBox();assert.ok(worker.y>=header.y+header.height)
 const opened=app.waitForEvent('window');await page.locator('[data-plugin="cloud-hosts"]').click();const plugin=await opened;plugin.on('pageerror',e=>errors.push(e.message));await plugin.locator('#add').click()
 await plugin.locator('input[name=name]').fill('GPU Lab');await plugin.locator('input[name=host]').fill('fixture');await plugin.locator('input[name=defaultDirectory]').fill(remote);await plugin.locator('input[name=password]').fill('fixture-only');await plugin.getByRole('button',{name:'保存主机',exact:true}).click()
 await expect(plugin.locator('#detail h2')).toHaveText('GPU Lab');await expect(plugin.locator('#password-view')).toHaveAttribute('type','password')
 await plugin.locator('#reveal').click();await expect(plugin.locator('#password-view')).toHaveValue('fixture-only');await plugin.locator('#reveal').click();await expect(plugin.locator('#password-view')).toHaveAttribute('type','password')
 await plugin.locator('#check').click();await expect(plugin.locator('.status-card')).toContainText('连接正常')
 fs.mkdirSync('artifacts',{recursive:true});await plugin.screenshot({path:'artifacts/cloud-hosts-plugin.png'})
 const host=(await cli('host','list'))[0];await page.locator('.add-team').click();await page.locator('input[name=team-name]').fill('Cloud Research');await page.locator('[data-mode=cloud]').click()
 await expect(page.locator('input[name=remote-host],input[name=ssh-port],select[name=remote-os]')).toHaveCount(0)
 await page.locator('select[name=cloud-host-id]').selectOption(host.id)
 await page.getByRole('button',{name:'浏览目录',exact:true}).click();await page.getByRole('button',{name:'▱ Project',exact:true}).click();await page.getByRole('button',{name:'绑定此目录',exact:true}).click()
 await expect(page.locator('input[name=remote-directory]')).toHaveValue(path.join(remote,'Project'))
 await page.screenshot({path:'artifacts/cloud-team-binding.png'});await page.locator('.save-team').click();await expect(page.locator('.office-panel')).toHaveCount(0)
 const settings=(await cli('group','list','--details')).find(g=>g.name==='Cloud Research');assert.equal(settings.hostId,host.id);assert.equal(settings.remote.directory,path.join(remote,'Project'))
 const cloud=page.locator('[data-department="Cloud Research"]');await cli('room','bounds','Local Studio','--x','0','--y','0');await cli('room','bounds','Cloud Research','--x','850','--y','0');await cli('canvas','set','--x','35','--y','40','--zoom','.62');await expect(page.locator('.infinite-canvas')).toHaveAttribute('data-zoom','0.620');await expect(cloud.locator('.team-health')).toHaveAttribute('data-connected','true');await expect(cloud.locator('.team-kind')).toHaveText('Cloud')
 await page.screenshot({path:'artifacts/team-header-expanded.png'})
 await plugin.locator('#edit').click();await plugin.locator('input[name=name]').fill('GPU Renamed');await plugin.getByRole('button',{name:'保存主机',exact:true}).click();await expect.poll(async()=>(await cli('host','get',host.id)).name).toBe('GPU Renamed')
 await plugin.locator('#remove').click();await plugin.locator('#remove').click();await expect(plugin.locator('#message')).toContainText('仍被 Team 绑定')
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())));assert.deepEqual(errors,[])
 console.log('PASS hidden installed-capable UI: full-height Team header, readable titles/macOS icon, employee clearance, independent Cloud Hosts CRUD/password/status, registry-only Team creation and remote directory picker')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
