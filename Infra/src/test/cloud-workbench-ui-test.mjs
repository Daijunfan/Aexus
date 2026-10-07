import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
import {sshFixture,vncFixture} from './fixtures/cloud-workbench.mjs'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),root=path.resolve(import.meta.dirname,'../../..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'cloud-ui-'))),bin=path.join(temp,'bin');sshFixture(bin)
const vnc=await vncFixture(),env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),PATH:bin+path.delimiter+process.env.PATH,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow()
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env,timeout:35000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const errors=[]
try{
 await page.locator('.infinite-canvas').waitFor()
 const host=await cli('host','create','--data',JSON.stringify({name:'Ubuntu Studio',host:'fixture',os:'linux',distribution:'ubuntu',defaultDirectory:temp}));await cli('host','update',host.id,'--data',JSON.stringify({desktop:{protocol:'vnc',address:'127.0.0.1',port:vnc.port,viaHostId:host.id}}))
 const windows=await cli('host','create','--data',JSON.stringify({name:'Windows Workspace',host:'windows-fixture',os:'windows',defaultDirectory:'C:\\Users\\studio',desktop:{protocol:'rdp',address:'127.0.0.1',port:vnc.port,username:'studio'}}))
 await cli('host','create','--data',JSON.stringify({name:'Build Node',host:'offline',os:'linux',distribution:'debian',defaultDirectory:'/srv/build'}))
 const opened=app.waitForEvent('window');await page.locator('[data-plugin="cloud-hosts"]').click();const plugin=await opened;plugin.setDefaultTimeout(15000);plugin.on('pageerror',e=>errors.push(e.message))
 await expect(plugin.locator('#add')).toBeEnabled();await expect(plugin.locator('#detail h2')).toHaveText('Ubuntu Studio')
 fs.mkdirSync('artifacts',{recursive:true});await plugin.screenshot({path:'.aexus/artifacts/cloud-workbench-overview.png'})
 await plugin.evaluate(()=>{window.savedHost=document.querySelector('.host-card');Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))});await plugin.waitForTimeout(100);assert.equal(await plugin.evaluate(()=>window.savedHost===document.querySelector('.host-card')),true)
 await plugin.locator('#search').fill('Windows');await expect(plugin.locator('.host-card')).toHaveCount(1);await plugin.locator('#search').fill('')
 await plugin.locator('[data-view=terminal]').click();await plugin.locator('#terminal-new').click();await expect(plugin.locator('.xterm')).toBeVisible()
 await plugin.locator('.xterm-helper-textarea').focus();await plugin.keyboard.type('printf "CLOUD_UI_READY\\n"');await plugin.keyboard.press('Enter')
 await expect.poll(async()=>{const list=await cli('host','terminal-list',host.id);return list.length&&(await cli('host','terminal-read',host.id,'--terminal',list[0].id)).output}).toContain('\r\nCLOUD_UI_READY\r\n')
 const id=(await cli('host','terminal-list',host.id))[0].id
 await plugin.evaluate(()=>window.savedTerminal=document.querySelector('.xterm'));await plugin.locator('[data-view=terminal]').click();await plugin.locator(`[data-id="${host.id}"]`).click();assert.equal(await plugin.evaluate(()=>window.savedTerminal===document.querySelector('.xterm')),true)
 const surfaceBefore=await plugin.locator('.terminal-surface').boundingBox()
 await plugin.locator('#refresh').click();await expect(plugin.locator('#message')).toHaveText('连接状态已更新');assert.equal((await cli('host','terminal-list',host.id))[0].id,id);await expect(plugin.locator('.xterm')).toBeVisible();assert.deepEqual(await plugin.locator('.terminal-surface').boundingBox(),surfaceBefore)
 await plugin.screenshot({path:'.aexus/artifacts/cloud-workbench-terminal.png'})
 await plugin.locator('[data-view=overview]').click();await plugin.locator('[data-view=terminal]').click();await expect(plugin.locator('.xterm')).toBeVisible();assert.equal((await cli('host','terminal-list',host.id)).length,1)
 const flood='python3 -c '+"'"+'print(("高负载🙂 " + "x"*48 + "\\n")*30000);print("UI_"+"FLOOD_DONE")'+"'"
 await cli('host','terminal-input',host.id,'--terminal',id,'--data',flood,'--enter')
 await expect.poll(async()=>(await cli('host','terminal-read',host.id,'--terminal',id)).output,{timeout:10000}).toContain('UI_FLOOD_DONE')
 await plugin.locator('[data-view=overview]').click();await plugin.locator('[data-view=terminal]').click();await expect(plugin.locator('.xterm')).toBeVisible();await expect(plugin.locator('#terminal-status')).toContainText('运行中')
 await plugin.locator('#terminal-new').click();await expect.poll(async()=>(await cli('host','terminal-list',host.id)).length).toBe(2)
 const second=(await cli('host','terminal-list',host.id)).find(t=>t.id!==id)
 await expect(plugin.locator('#terminal-sessions')).toHaveValue(second.id)
 await plugin.locator('[data-view=overview]').click();await plugin.locator('[data-view=terminal]').click();await expect(plugin.locator('#terminal-sessions')).toHaveValue(second.id)
 await plugin.locator('#terminal-close').click();await expect(plugin.locator('#terminal-status')).toHaveText('已关闭')
 await plugin.locator('#terminal-sessions').selectOption(id)
 await plugin.locator('#terminal-close').click();await expect(plugin.locator('#terminal-status')).toHaveText('已关闭')
 await plugin.locator('[data-view=desktop]').click();await plugin.locator('#desktop-connect').click();await expect(plugin.locator('#desktop-status')).toHaveText('桌面已连接')
 await expect.poll(()=>vnc.events.frames).toBeGreaterThan(0)
 const canvas=plugin.locator('#desktop-screen canvas');await canvas.click({position:{x:120,y:120}});await plugin.keyboard.press('a');await expect.poll(()=>vnc.events.keys.length).toBeGreaterThan(0);await expect.poll(()=>vnc.events.pointers.length).toBeGreaterThan(0)
 await plugin.locator('#desktop-quality').selectOption('fast');await plugin.locator('#desktop-view-only').check()
 await plugin.screenshot({path:'.aexus/artifacts/cloud-workbench-vnc.png'})
 const keys=vnc.events.keys.length;await canvas.click({position:{x:150,y:150}});await plugin.keyboard.press('b');await plugin.waitForTimeout(150);assert.equal(vnc.events.keys.length,keys)
 await plugin.locator('#desktop-disconnect').click();await expect(plugin.locator('#desktop-status')).toHaveText('已断开');assert.deepEqual(await cli('host','desktop-list',host.id),[])
 await plugin.locator(`[data-id="${windows.id}"]`).click();await plugin.locator('#desktop-connect').click();await expect(plugin.locator('#desktop-launch')).toBeVisible();await expect(plugin.locator('#desktop-status')).toHaveText('通道就绪 · 等待桌面登录');await plugin.screenshot({path:'.aexus/artifacts/cloud-workbench-rdp.png'});await plugin.locator('#desktop-disconnect').click()
 await plugin.locator('[data-view=overview]').click();await plugin.locator('#edit').click();await plugin.locator('#desktop-config summary').click();await expect(plugin.locator('select[name=desktopProtocol]')).toHaveValue('rdp');await plugin.locator('#cancel').click()
 await plugin.setViewportSize({width:620,height:850});assert.equal(await plugin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await plugin.screenshot({path:'.aexus/artifacts/cloud-workbench-compact.png'})
 await plugin.setViewportSize({width:1200,height:900});await plugin.locator('#add').click()
 await plugin.locator('input[name=name]').fill('UI profile');await plugin.locator('input[name=host]').fill('fixture');await plugin.locator('input[name=defaultDirectory]').fill(temp);await plugin.locator('input[name=password]').fill('fixture-secret')
 await plugin.locator('#desktop-config summary').click();await plugin.locator('select[name=desktopProtocol]').selectOption('vnc');await plugin.locator('input[name=desktopPort]').fill(String(vnc.port));await plugin.locator('select[name=desktopVia]').selectOption(host.id)
 await plugin.getByRole('button',{name:'保存主机',exact:true}).click();await expect(plugin.locator('#detail h2')).toHaveText('UI profile')
 const created=(await cli('host','list')).find(h=>h.name==='UI profile');assert.equal(created.desktop.viaHostId,host.id);assert.equal(created.desktop.port,vnc.port);assert.equal(created.hasPassword,true)
 await plugin.locator('#reveal').click();await expect(plugin.locator('#password-view')).toHaveValue('fixture-secret');await plugin.locator('#reveal').click();await expect(plugin.locator('#password-view')).toHaveAttribute('type','password')
 await plugin.locator('#edit').click();await plugin.locator('input[name=name]').fill('UI renamed');await plugin.getByRole('button',{name:'保存主机',exact:true}).click();await expect(plugin.locator('#detail h2')).toHaveText('UI renamed')
 await plugin.locator('#remove').click();await plugin.locator('#remove').click();await expect(plugin.locator('#message')).toHaveText('主机已移除');assert.equal((await cli('host','list')).some(h=>h.id===created.id),false)
 const slow=await cli('host','create','--data',JSON.stringify({name:'Cancel fixture',host:'slow-fixture',os:'linux',defaultDirectory:temp}));await cli('host','update',slow.id,'--data',JSON.stringify({desktop:{protocol:'vnc',address:'127.0.0.1',port:vnc.port,viaHostId:slow.id}}))
 await plugin.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await plugin.locator(`[data-id="${slow.id}"]`).click();await plugin.locator('[data-view=desktop]').click();await plugin.locator('#desktop-connect').click()
 await expect(plugin.locator('#desktop-disconnect')).toHaveText('取消连接');await plugin.locator('[data-view=overview]').click();await plugin.locator('[data-view=desktop]').click();await expect(plugin.locator('#desktop-disconnect')).toHaveText('取消连接');await plugin.locator('#desktop-disconnect').click();await expect(plugin.locator('#desktop-status')).toHaveText('已断开');assert.deepEqual(await cli('host','desktop-list',slow.id),[])
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 console.log('PASS hidden Cloud workbench UI: search, real PTY input, refresh/tab retention, close, full RFB handshake/frame/key/pointer, view-only, quality, desktop cleanup, RDP readiness/download controls, profile CRUD/password/SSH configuration and 620px layout; no visible windows or inference')
}finally{await app.close();await vnc.close();fs.rmSync(temp,{recursive:true,force:true})}
