import {nativeFixture} from './native-fixture.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const {_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),project=path.resolve(import.meta.dirname,'../../..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-mui-'))),work=path.join(temp,'work','mini-notion-workspace','计划工作室'),build=path.join(temp,'projects','Build Studio'),home=path.join(temp,'state')
fs.mkdirSync(work,{recursive:true});fs.mkdirSync(build,{recursive:true});fs.mkdirSync(home)
const fixture=path.join(temp,'codex-fixture')
fs.writeFileSync(fixture,`#!/usr/bin/env node
const args=process.argv.slice(2);if(!args.includes('gpt-5.6-luna')||!args.includes('model_reasoning_effort="low"'))process.exit(4);
process.stdin.resume();process.stdin.on('end',()=>{for(const event of [{type:'thread.started',thread_id:'fixture-thread'},{type:'turn.started'},{type:'item.completed',item:{id:'reply',type:'agent_message',text:'Conversation is working.'}},{type:'turn.completed'}])process.stdout.write(JSON.stringify(event)+'\\n')});
`,{mode:0o755})
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:process.env.AGENTS_COMPANY_TEST_WIDTH||'1440',AGENTS_COMPANY_HEIGHT:'1100',CODEX_BIN:nativeFixture(fixture)};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[project],env})
const page=await app.firstWindow();page.setDefaultTimeout(20000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[path.join(project,'Infra/src/cli/agents'),...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const center=async name=>{const b=(await cli('room','layout',name)).bounds;await cli('canvas','set','--x',String(80-b.x*.8),'--y',String(150-b.y*.8),'--zoom','.8')}
let checks=0;const ok=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label)}
try{
  await page.locator('.infinite-canvas').waitFor()
  ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'all test windows stay hidden')
  await expect(page.locator('.plugin-directory [data-plugin="mininotion"]')).toBeVisible()
  await page.locator('.add-team').click()
  await page.locator('[data-mode="work"]').click()
  await page.locator('select[name="team-plugin"]').selectOption('mininotion')
  await page.locator('input[name="team-name"]').fill('计划工作室')
  await expect(page.locator('input[name="team-root"]')).toHaveValue(work)
  await page.locator('.save-team').click();await page.locator('.office-panel').waitFor({state:'detached'})
  ok((await cli('session','list')).teamSettings['计划工作室'].mode==='work','Team form creates Work with an installed plugin')
  await cli('group','add','Build Studio','--mode','build','--root',build)
  await cli('workspace','write','main.ts','--team','Build Studio','--content','export const original = true')
  const worker=await cli('card','create','--title','Writer','--group','计划工作室','--cwd','department/writer')
  await page.locator('.add-employee').click();await page.locator('input[name="title"]').fill('Owner');await page.locator('[data-directory-mode="bind"]').click();await page.locator('input[name="cwd"]').fill('department');await page.locator('.save-employee').click();await page.locator('.office-panel').waitFor({state:'detached'})
  ok((await cli('session','list')).sessions.some(c=>c.title==='Owner'&&c.cwd===path.join(work,'department')),'employee form creates a parent-scope subfolder inside plugin workspace')
  const opened=app.waitForEvent('window')
  await page.locator('.plugin-directory [data-plugin="mininotion"]').click()
  const pluginPage=await opened;await pluginPage.locator('.sidebar').waitFor({timeout:30000})
  ok(await page.locator('.plugin-directory').isVisible(),'installed-plugin directory stays visible while a workspace is open')
  await page.locator('.directory-home').click();await page.locator('.team-workspace').waitFor({state:'detached'})
  await center('计划工作室')
  await page.locator(`[data-card-id="${worker.id}"] .mascot`).click()
  await expect(page.locator('.conversation-dialog')).toBeVisible();await expect(page.locator('.composer textarea')).toBeEnabled()
  ok(await page.locator('.employee-inspector').count()===0&&await page.locator('.office-panel').count()===0,'clicking the employee body opens the conversation directly')
  await page.locator('.composer textarea').fill('hello');await page.locator('.composer textarea').press('Enter')
  await expect(page.locator('.transcript')).toContainText('Conversation is working.')
  ok(true,'conversation can send and render a reply through the real CLI service')
  await page.screenshot({path:path.join(project,'.aexus/artifacts/work-conversation.png')})
  await page.getByRole('button',{name:'收起会话',exact:true}).click()
  await center('Build Studio');await cli('ui','click','[data-team="Build Studio"]')
  await expect(page.locator('.file-workspace')).toBeVisible()
  await page.locator('[data-file="main.ts"] .file-open').click()
  await page.getByRole('textbox',{name:'文件内容'}).fill('export const edited = true')
  await page.getByRole('button',{name:'保存文件',exact:true}).click()
  ok(fs.readFileSync(path.join(build,'main.ts'),'utf8')==='export const edited = true','Build file browser edits the actual project file')
  await page.getByRole('button',{name:'＋ 文件夹',exact:true}).click();await page.getByRole('textbox',{name:'文件名称'}).fill('src');await page.getByRole('textbox',{name:'文件名称'}).press('Enter')
  await expect(page.locator('[data-file="src"]')).toBeVisible()
  await page.getByRole('button',{name:'重命名 main.ts',exact:true}).click();await page.getByRole('textbox',{name:'文件名称'}).fill('index.ts');await page.getByRole('textbox',{name:'文件名称'}).press('Enter')
  await expect(page.locator('[data-file="index.ts"]')).toBeVisible()
  await page.getByRole('button',{name:'删除 index.ts',exact:true}).click();await page.getByRole('button',{name:'撤销',exact:true}).click()
  await expect(page.locator('[data-file="index.ts"]')).toBeVisible()
  ok(fs.existsSync(path.join(build,'src'))&&fs.existsSync(path.join(build,'index.ts')),'Build supports folder creation, rename and reversible deletion')
  await page.screenshot({path:path.join(project,'.aexus/artifacts/build-files.png')})
  await page.getByRole('button',{name:'关闭工作空间',exact:true}).click();await page.locator('.team-workspace').waitFor({state:'detached'})
  const broken=await cli('card','create','--title','Missing folder','--group','Build Studio','--cwd','missing')
  fs.renameSync(broken.cwd,broken.cwd+'-moved');await cli('room','design','Build Studio','--theme','ocean')
  await center('Build Studio')
  await expect(page.locator(`[data-card-id="${broken.id}"]`)).toHaveAttribute('data-workspace-error','true')
  await page.locator(`[data-card-id="${broken.id}"] .mascot`).click()
  await expect(page.locator('.conversation-dialog')).toBeVisible();await expect(page.locator('.conversation-repair')).toBeVisible()
  ok(await page.locator('.employee-inspector').count()===0,'a broken legacy workspace opens chat with a repair notice, not an edit-only page')
  await page.getByRole('button',{name:'配置工作目录',exact:true}).click();await page.locator('[data-directory-mode="bind"]').click();await page.locator('input[name="cwd"]').fill(build);await page.locator('.save-employee').click()
  await expect(page.locator('.employee-inspector')).toHaveCount(0);await expect(page.locator('.composer textarea')).toBeEnabled();await expect(page.locator('.conversation-repair')).toHaveCount(0)
  ok(true,'repairing the directory returns directly to a usable conversation')
  ok(errors.length===0,'no renderer errors: '+errors.join('; '))
  console.log(`PASS=${checks} FAIL=0 — no model calls`)
}catch(error){console.error(error);if(!page.isClosed()){console.error(await page.locator('body').innerText());await page.screenshot({path:path.join(project,'.aexus/artifacts/modes-error.png')})}throw error}
finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
