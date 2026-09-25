import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
import {nativeFixture} from './native-fixture.mjs'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),project=path.resolve(import.meta.dirname,'..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-shared-ui-'))),shared=path.join(temp,'shared'),projects=path.join(temp,'projects')
const fixture=path.join(temp,'fixture');fs.writeFileSync(fixture,'#!/usr/bin/env node\nprocess.exit(0)\n',{mode:0o755})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_SHARED_DIR:shared,AGENTS_COMPANY_PROJECTS:projects,AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000',CODEX_BIN:nativeFixture(fixture)};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[project],env}),page=await app.firstWindow();page.setDefaultTimeout(20000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[path.join(project,'bin/agents'),...args,'--json'],{env,timeout:30000})).stdout);assert.ok(r.ok,r.error);return r.data}
let checks=0;const ok=(v,s)=>{assert.ok(v,s);console.log('PASS '+s);checks++}
try{
 await page.locator('.infinite-canvas').waitFor()
 await cli('group','add','Hosts','--mode','work','--plugin','cloud-hosts');await cli('card','create','--title','Fire','--group','Hosts','--avatar','fireball')
 await page.locator('[data-plugin="cloud-hosts"]').click();await expect(page.locator('[data-plugin="cloud-hosts"]')).toHaveAttribute('aria-pressed','true')
 ok(await page.locator('.plugin-directory .mascot,.plugin-agent-row').count()===0,'opening a plugin never inserts a stray employee into the main sidebar')
 await cli('group','add','Files');const card=await cli('card','create','--title','Worker','--group','Files')
 fs.writeFileSync(path.join(card.cwd,'packet.bin'),crypto.randomBytes(1024*1024));fs.mkdirSync(path.join(card.cwd,'incoming'))
 await cli('view','open','conversation','--employee',card.id);await page.locator('.employee-files').waitFor()
 ok((await cli('view','get')).employee===card.id,'a stale plugin selection does not block another Team employee')
 await page.getByRole('button',{name:'共享中转站',exact:true}).click();await page.locator('.shared-drawer').waitFor()
 const drawer=await page.locator('.shared-drawer').boundingBox(),conversation=await page.locator('.conversation-dialog').boundingBox()
 ok(conversation.x>=drawer.x+drawer.width,'shared drawer and employee workspace remain visible side by side')
 const source=page.locator('.employee-files [data-file="packet.bin"]');await source.waitFor()
 await source.dragTo(page.locator('.shared-files .file-list'),{targetPosition:{x:120,y:300}})
 ok(!fs.existsSync(path.join(shared,'packet.bin')),'empty file-list area is not a folder drop target')
 await source.dragTo(page.getByRole('button',{name:'共享中转站',exact:true}))
 await expect.poll(()=>fs.existsSync(path.join(shared,'packet.bin'))).toBe(true)
 ok(fs.readFileSync(path.join(shared,'packet.bin')).equals(fs.readFileSync(path.join(card.cwd,'packet.bin'))),'dragging employee file to sidebar copies actual binary data')
 await expect(page.locator('.transfer-list')).toHaveCount(0)
 const sharedFile=page.locator('.shared-files [data-file="packet.bin"]');await sharedFile.waitFor()
 await sharedFile.focus();await page.keyboard.press('Meta+c')
 await page.locator('.employee-files [data-file="incoming"]').focus();await page.keyboard.press('Meta+v')
 await expect.poll(()=>fs.existsSync(path.join(card.cwd,'incoming','packet.bin'))).toBe(true)
 ok(fs.readFileSync(path.join(card.cwd,'incoming','packet.bin')).equals(fs.readFileSync(path.join(shared,'packet.bin'))),'Command-C and Command-V copy files between scopes')
 await page.locator('.employee-files [data-file="incoming"] .file-open').click()
 await sharedFile.dragTo(page.locator('.employee-files [data-file="incoming"]'))
 await expect(page.locator('.employee-files .workspace-error')).toContainText('同名文件')
 await page.locator('.employee-files [data-file="incoming/packet.bin"] [aria-label="删除 packet.bin"]').click()
 await expect.poll(()=>fs.existsSync(path.join(card.cwd,'incoming','packet.bin'))).toBe(false)
 await expect(page.locator('.file-undo')).toHaveCount(0)
 await page.keyboard.press('Meta+z')
 await expect.poll(()=>fs.existsSync(path.join(card.cwd,'incoming','packet.bin'))).toBe(true)
 await page.locator('.employee-files [data-file="incoming/packet.bin"] [aria-label="删除 packet.bin"]').click()
 await expect.poll(()=>fs.existsSync(path.join(card.cwd,'incoming','packet.bin'))).toBe(false)
 await sharedFile.dragTo(page.locator('.employee-files [data-file="incoming"]'))
 await expect.poll(()=>fs.existsSync(path.join(card.cwd,'incoming','packet.bin'))).toBe(true)
 await expect(page.locator('.employee-files .workspace-error')).toHaveCount(0)
 ok(fs.readFileSync(path.join(card.cwd,'incoming','packet.bin')).equals(fs.readFileSync(path.join(shared,'packet.bin'))),'dragging from shared folder into a workspace folder uploads the file')
 const native=path.join(temp,'finder-upload.txt');fs.writeFileSync(native,'Native macOS file import')
 await page.locator('.shared-files input[type=file]').setInputFiles(native)
 await expect.poll(()=>fs.existsSync(path.join(shared,'finder-upload.txt'))).toBe(true)
 ok(fs.readFileSync(path.join(shared,'finder-upload.txt'),'utf8')==='Native macOS file import','preload extracts real native File paths and imports through the transfer API')
 await expect(page.locator('.transfer-list')).toHaveCount(0)
 await page.locator('.shared-files [data-file="finder-upload.txt"]').waitFor()
 for(const theme of ['white','black']){await cli('settings','set','--theme',theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);ok(await page.locator('.shared-files .file-list').evaluate(e=>getComputedStyle(e).backgroundColor===getComputedStyle(e.closest('.shared-drawer')).backgroundColor),'shared files follow '+theme+' theme');await page.screenshot({path:path.join(project,`artifacts/shared-${theme}.png`)})}
 await page.getByRole('button',{name:'收起共享中转站'}).click();await expect(page.locator('.shared-drawer')).toHaveCount(0);ok((await cli('view','get')).kind==='conversation','closing shared drawer preserves the conversation')
 ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'all app and plugin windows stayed hidden')
 ok(!errors.length,'no renderer errors: '+errors.join('; '))
 console.log(`PASS=${checks} — hidden UI, real CLI data, no inference`)
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
