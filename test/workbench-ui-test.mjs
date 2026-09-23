import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),project=path.resolve(import.meta.dirname,'..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-wui-'))),home=path.join(temp,'state'),remote=path.join(temp,'cloud'),bin=path.join(temp,'bin')
for(const p of [home,remote,bin])fs.mkdirSync(p)
fs.mkdirSync(path.join(remote,'nested'));fs.writeFileSync(path.join(remote,'nested/readme.md'),'REMOTE ORIGINAL')
fs.writeFileSync(path.join(bin,'ssh'),`#!/usr/bin/env python3
import os,sys
os.execv('/bin/sh',['sh','-c',sys.argv[-1]])
`,{mode:0o755})
const env={...process.env,PATH:bin+':'+process.env.PATH,SHELL:'/bin/bash',HISTFILE:'/dev/null',BASH_SILENCE_DEPRECATION_WARNING:'1',AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_TUNNEL_DIR:process.env.AGENTS_COMPANY_TEST_TUNNEL_DIR||path.join(project,'Modules/Tunnel'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1360',AGENTS_COMPANY_HEIGHT:'1050'};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[project],env}),page=await app.firstWindow();page.setDefaultTimeout(15000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[path.join(project,'bin/agents'),...args,'--json'],{env,timeout:30000})).stdout);assert.ok(r.ok,r.error);return r.data}
let failed=false,n=0;const ok=(value,label)=>{assert.ok(value,label);n++;console.log('PASS '+label)}
try{
 await page.locator('.infinite-canvas').waitFor();ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'windows remain hidden')
 await cli('group','add','Build');await cli('group','add','Work','--mode','work','--plugin','mininotion')
 await page.locator('.add-team').click();await page.locator('input[name="team-name"]').fill('Cloud Team');await page.locator('[data-mode="cloud"]').click()
 const contrast=async selector=>page.locator(selector).evaluate(element=>{const surface=element.closest('.sign-preview'),rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number),l=value=>{const c=rgb(value).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]},a=l(getComputedStyle(element).color),b=l(getComputedStyle(surface).backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)})
 for(const theme of ['white','light','space','black','midnight','sage']){await cli('settings','set','--theme',theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);assert.ok(await contrast('.sign-preview>span')>=4.5);assert.ok(await contrast('.sign-preview small')>=4.5)}
 await cli('settings','set','--theme','light');await expect(page.locator('.team-mode-options button')).toHaveCount(3)
 await page.screenshot({path:path.join(project,'artifacts/team-create-0.13-light.png')})
 ok(true,'Team creation exposes three environments and readable preview text across all six themes')

 await page.locator('input[name="remote-host"]').fill('fixture');await page.locator('input[name="remote-directory"]').fill(remote)
 await page.getByRole('button',{name:'测试连接',exact:true}).click();await expect(page.getByRole('status')).toContainText('连接成功')
 await page.locator('.save-team').click();await expect(page.locator('.office-panel')).toHaveCount(0)
 await page.locator('.add-employee').click();await page.locator('select[name="group"]').selectOption('Cloud Team');await page.locator('input[name="title"]').fill('Cloud engineer')
 await expect(page.locator('input[name="remote-host"],.execution-target')).toHaveCount(0);await expect(page.locator('.cloud-inheritance')).toContainText('fixture');await expect(page.locator('.engine-choices .codex-mark path')).toHaveAttribute('fill','#111111');assert.equal(await page.locator('.engine-choices .codex-mark').evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(17, 17, 17)')
 await page.locator('[data-directory-mode="bind"]').click();await page.locator('input[name="cwd"]').fill('.')
 await page.locator('.save-employee').click();await expect(page.locator('.office-panel')).toHaveCount(0)
 const employee=(await cli('session','list')).sessions.find(c=>c.title==='Cloud engineer')
 ok(employee.remote.directory===remote,'Team creation configures SSH once and hiring only inherits its cloud environment')
 await cli('view','open','conversation','--employee',employee.id);await expect(page.locator('.composer textarea')).toBeEnabled();await expect(page.locator('.employee-terminal')).toBeVisible()
 await expect.poll(async()=>(await cli('terminal','list','--employee',employee.id)).length).toBe(1)
 await page.getByRole('button',{name:'新建文件',exact:true}).click();await page.getByRole('textbox',{name:'文件名称'}).fill('cancel-me.txt');await page.getByRole('button',{name:'会话',exact:true}).click();await expect(page.getByRole('textbox',{name:'文件名称'})).toHaveCount(0);assert.ok(!fs.existsSync(path.join(remote,'cancel-me.txt')));
 await page.getByRole('button',{name:'新建文件夹',exact:true}).click();await page.getByRole('textbox',{name:'文件名称'}).fill('inline-folder');await expect(page.locator('.file-list .file-inline-editor')).toBeVisible();await expect(page.locator('.file-workspace>.file-create')).toHaveCount(0);await page.getByRole('textbox',{name:'文件名称'}).press('Enter');await expect.poll(()=>fs.existsSync(path.join(remote,'inline-folder'))).toBe(true);
 await page.getByRole('button',{name:'重命名 inline-folder',exact:true}).click();await page.getByRole('textbox',{name:'文件名称'}).fill('cancel-rename');await page.getByRole('textbox',{name:'文件名称'}).press('Escape');assert.ok(fs.existsSync(path.join(remote,'inline-folder')));await expect(page.locator('.conversation-dialog')).toBeVisible();
 await expect(page.locator('[data-file="nested"]')).toBeVisible();await page.locator('[data-file="nested"] .file-open').click();await expect(page.locator('[data-file="nested/readme.md"]')).toBeVisible()
 const tree=await page.locator('.employee-files .file-list').boundingBox(),chat=await page.locator('.conversation-chat').boundingBox(),terminal=await page.locator('.employee-terminal').boundingBox()
 ok(tree.x<chat.x&&terminal.y>chat.y,'expanded folder tree is left of the conversation and the terminal is below it')
 await page.locator('[data-file="nested/readme.md"] .file-open').click();await expect(page.getByRole('textbox',{name:'文件内容'})).toHaveValue('REMOTE ORIGINAL')
 await page.getByRole('textbox',{name:'文件内容'}).fill('EDITED THROUGH UI');await page.getByRole('button',{name:'保存文件',exact:true}).click()
 await expect.poll(()=>fs.readFileSync(path.join(remote,'nested/readme.md'),'utf8')).toBe('EDITED THROUGH UI')
 ok(!fs.existsSync(path.join(temp,'projects','Cloud Team')),'editor saves into the remote folder without creating a local copy')
 await page.getByRole('button',{name:'会话',exact:true}).click();await expect(page.locator('.composer textarea')).toBeVisible()
 await page.locator('.xterm-helper-textarea').focus();await page.keyboard.type('pwd > ui-terminal.txt');await page.keyboard.press('Enter')
 await expect.poll(()=>fs.existsSync(path.join(remote,'ui-terminal.txt'))).toBe(true)
 ok(fs.readFileSync(path.join(remote,'ui-terminal.txt'),'utf8').trim()===remote,'typing in xterm executes through SSH in the employee working folder')
 await page.keyboard.press('Escape');await expect(page.locator('.conversation-dialog')).toBeVisible()
 await page.getByRole('button',{name:'新建终端',exact:true}).click();await expect.poll(async()=>(await cli('terminal','list','--employee',employee.id)).length).toBe(2)
 ok((await cli('terminal','list','--employee',employee.id)).every(t=>t.cwd===remote),'new terminals always start from the employee directory; Escape stays inside the terminal')
 await page.locator('[data-file="nested/readme.md"] .file-open').click();await page.getByRole('textbox',{name:'文件内容'}).fill('UNSAVED USER EDIT')
 fs.writeFileSync(path.join(remote,'nested/readme.md'),'AGENT CHANGED FILE')
 await page.getByRole('button',{name:'保存文件',exact:true}).click();await expect(page.locator('.employee-files .workspace-error')).toContainText('文件已被其他操作修改')
 await page.locator('.back').click();await expect(page.locator('.conversation-dialog')).toBeVisible()
 ok(fs.readFileSync(path.join(remote,'nested/readme.md'),'utf8')==='AGENT CHANGED FILE','conflicts prevent overwriting agent edits and prevent closing away the unsaved draft')
 await page.getByRole('button',{name:'重新载入文件',exact:true}).click();await expect(page.getByRole('textbox',{name:'文件内容'})).toHaveValue('AGENT CHANGED FILE')
 await page.getByRole('textbox',{name:'文件内容'}).fill('SAVED ON CLOSE');await page.locator('.back').click();await expect(page.locator('.conversation-dialog')).toHaveCount(0)
 ok(fs.readFileSync(path.join(remote,'nested/readme.md'),'utf8')==='SAVED ON CLOSE','closing the conversation flushes editor changes through the workspace API')
 await cli('view','open','conversation','--employee',employee.id);await expect(page.locator('.composer textarea')).toBeEnabled();await expect(page.locator('.employee-terminal nav button')).toHaveCount(2)
 await page.locator('[data-file="nested"] .file-open').click();await page.locator('[data-file="nested/readme.md"] .file-open').click();await page.getByRole('button',{name:'重命名 nested',exact:true}).click();await page.getByRole('textbox',{name:'文件名称'}).fill('moved');await page.getByRole('textbox',{name:'文件名称'}).press('Enter')
 await expect(page.locator('[data-file="moved/readme.md"]')).toBeVisible();await expect(page.locator('.file-preview>header strong')).toHaveText('moved/readme.md')
 ok(fs.existsSync(path.join(remote,'moved/readme.md')),'renaming an expanded directory updates both its tree and the open editor path')
 await page.getByRole('button',{name:'会话',exact:true}).click()
 await page.screenshot({path:path.join(project,'artifacts/cloud-workbench-0.12.png')})
 ok((await cli('terminal','list','--employee',employee.id)).length===2,'reopening reuses existing terminals without duplicate StrictMode shells')
 ok(errors.length===0,'no renderer exceptions: '+errors.join('; '));console.log(`PASS=${n} FAIL=0 — hidden UI, remote transport fixture and actual PTYs; no model calls`)
}catch(error){failed=true;console.error(error);if(!page.isClosed()){console.error((await page.locator('body').innerText()).slice(-8000));await page.screenshot({path:path.join(project,'artifacts/workbench-error.png')})}throw error}
finally{if(failed){app.process().kill('SIGKILL');await new Promise(r=>app.process().once('exit',r))}else await app.close();fs.rmSync(temp,{recursive:true,force:true})}
