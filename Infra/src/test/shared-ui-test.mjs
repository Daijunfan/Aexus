import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),project=path.resolve(import.meta.dirname,'../../..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-shared-ui-'))),shared=path.join(temp,'shared'),projects=path.join(temp,'projects')
const fixture=path.join(temp,'fixture');fs.mkdirSync(fixture);fs.writeFileSync(path.join(fixture,'release-all'),'')
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_SHARED_DIR:shared,AGENTS_COMPANY_PROJECTS:projects,AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000',CODEX_BIN:path.join(project,'Infra/src/test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:fixture};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[process.env.AGENTS_COMPANY_PROFILE_APPLICATION||project],env}),page=await app.firstWindow();page.setDefaultTimeout(20000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[path.join(project,'Infra/src/cli/agents'),...args,'--json'],{env,timeout:30000})).stdout);assert.ok(r.ok,r.error);return r.data}
let checks=0;const ok=(v,s)=>{assert.ok(v,s);console.log('PASS '+s);checks++}
try{
 await page.locator('.infinite-canvas').waitFor()
 await cli('settings','set','--language','zh-CN')
 await cli('group','add','Hosts','--mode','work','--plugin','cloud-hosts');await cli('card','create','--title','Fire','--group','Hosts','--avatar','fireball')
 await page.locator('.plugin-directory [data-plugin="cloud-hosts"]').click();await expect(page.locator('.plugin-directory [data-plugin="cloud-hosts"]')).toHaveAttribute('aria-pressed','true')
 ok(await page.locator('.plugin-directory .mascot,.plugin-agent-row').count()===0,'opening a plugin never inserts a stray employee into the main sidebar')
 await cli('group','add','Files');const card=await cli('card','create','--title','Worker','--group','Files')
 await expect.poll(async()=>(await cli('session','status','--employee',card.id))[0].initialization?.status,{timeout:20000}).toBe('ready')
 fs.writeFileSync(path.join(card.cwd,'packet.bin'),crypto.randomBytes(1024*1024));fs.mkdirSync(path.join(card.cwd,'incoming'))
 await cli('view','open','conversation','--employee',card.id);await page.locator('.employee-files').waitFor()
 ok((await cli('view','get')).employee===card.id,'a stale plugin selection does not block another Team employee')
 await page.locator('.directory-shared').click();await page.locator('.asset-browser').waitFor()
 const drawer=await page.locator('.asset-browser').boundingBox(),conversation=await page.locator('.conversation-dialog').boundingBox()
 ok(conversation.x>=drawer.x+drawer.width,'asset browser and employee workspace remain visible side by side')
 const source=page.locator('.employee-files [data-file="packet.bin"]'),sharedRoot=page.locator('[data-asset-id=shared]');await source.waitFor()
 await source.dragTo(sharedRoot);await expect.poll(()=>fs.existsSync(path.join(shared,'packet.bin'))).toBe(true)
 ok(fs.readFileSync(path.join(shared,'packet.bin')).equals(fs.readFileSync(path.join(card.cwd,'packet.bin'))),'fixed Shared tree row copies actual binary data')
 await cli('workspace','trash','packet.bin','--shared');await source.dragTo(page.locator('.directory-shared'))
 await expect.poll(()=>fs.existsSync(path.join(shared,'packet.bin'))).toBe(true)
 ok(fs.readFileSync(path.join(shared,'packet.bin')).equals(fs.readFileSync(path.join(card.cwd,'packet.bin'))),'sidebar remains a working drop target')
 await sharedRoot.click();const sharedFile=page.locator('[data-asset-id="shared|packet.bin"]');await sharedFile.waitFor()
 await sharedFile.focus();await page.keyboard.press('Meta+c');await page.locator('.employee-files [data-file="incoming"]').focus();await page.keyboard.press('Meta+v')
 await expect.poll(()=>fs.existsSync(path.join(card.cwd,'incoming/packet.bin'))).toBe(true)
 ok(fs.readFileSync(path.join(card.cwd,'incoming/packet.bin')).equals(fs.readFileSync(path.join(shared,'packet.bin'))),'Command-C and Command-V copy across scopes')
 await page.locator('.employee-files [data-file="incoming"] .file-open').click();await sharedFile.dragTo(page.locator('.employee-files [data-file="incoming"]'))
 await expect(page.locator('.employee-files .workspace-error')).toContainText('同名文件')
 await page.locator('.employee-files [data-file="incoming/packet.bin"] [aria-label="删除 packet.bin"]').click();await expect.poll(()=>fs.existsSync(path.join(card.cwd,'incoming/packet.bin'))).toBe(false)
 await page.keyboard.press('Meta+z');await expect.poll(()=>fs.existsSync(path.join(card.cwd,'incoming/packet.bin'))).toBe(true)
 ok(true,'duplicate drop preserves files and delete/undo restores employee bytes')
 await sharedRoot.dblclick();const manager=page.locator('.asset-workspace-overlay .file-workspace');await expect(manager).toBeVisible()
 const native=path.join(temp,'finder-upload.txt');fs.writeFileSync(native,'Native macOS file import');await manager.locator('input[type=file]').setInputFiles(native)
 await expect.poll(()=>fs.existsSync(path.join(shared,'finder-upload.txt'))).toBe(true)
 ok(fs.readFileSync(path.join(shared,'finder-upload.txt'),'utf8')==='Native macOS file import','native File paths import through the scoped Core transfer API')
 await cli('workspace','write','memo.md','--shared','--content','共享原文');await manager.locator('[data-file="memo.md"] .file-open').click()
 await expect(manager.locator('.file-preview textarea')).toHaveValue('共享原文');await manager.locator('.file-preview textarea').fill('共享内容已编辑');await manager.getByRole('button',{name:'保存文件',exact:true}).click()
 ok((await cli('workspace','read','memo.md','--shared')).content==='共享内容已编辑','shared text edits persist through the Core')
 for(const [name,content] of [['新建文档.txt','新建后的正文'],['新建笔记.md','# 标题\n\nMarkdown 正文']]){
  await manager.locator('[title="新建文件"]').click();await manager.locator('input[name="file-name"]').fill(name);await manager.locator('input[name="file-name"]').press('Enter')
  await expect.poll(()=>fs.existsSync(path.join(shared,name))).toBe(true);await expect(manager.locator('.file-preview header strong')).toHaveText(name);await manager.locator('.file-preview textarea').fill(content);await manager.getByRole('button',{name:'保存文件',exact:true}).click()
  ok((await cli('workspace','read',name,'--shared')).content===content,'new '+name+' is editable and retains its original filename')
 }
 await manager.locator('[data-file="memo.md"] .file-open').click();await expect(manager.locator('.file-preview textarea')).toHaveValue('共享内容已编辑')
 await manager.locator('[data-file="packet.bin"] .file-open').click();await expect(manager.locator('.file-preview')).toContainText('此文件暂不支持文本预览')
 ok(true,'saved Markdown reopens and binary preview is explicit')
 await page.locator('.asset-workspace-overlay .workspace-header>button').click();await expect(page.locator('.asset-workspace-overlay')).toHaveCount(0)
 for(const theme of ['white','black']){await cli('api','call','settings.set','--args',JSON.stringify({viewAppearance:{company:{theme}}}));await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await page.screenshot({path:path.join(project,`.aexus/artifacts/shared-${theme}.png`)})}
 await page.locator('.asset-browser header>button').click();await expect(page.locator('.asset-browser')).toHaveCount(0);ok((await cli('view','get')).kind==='conversation','closing asset browser preserves the conversation')
 ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'all app and plugin windows stayed hidden')
 ok(!errors.length,'no renderer errors: '+errors.join('; '));console.log(`PASS=${checks} — hidden UI, real scoped data, no inference`)
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
