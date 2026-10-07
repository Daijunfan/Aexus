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
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-mui-'))),work=path.join(temp,'work','mini-notion-workspace','Planning'),build=path.join(temp,'projects','Build Studio'),home=path.join(temp,'state')
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
  await page.locator('.infinite-canvas').waitFor();ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'all windows stay hidden')
  await cli('group','add','Planning','--mode','work','--plugin','mininotion');await cli('group','add','Build Studio')
  await page.locator('.add-employee').click();await page.locator('input[name="title"]').fill('开发 Alice')
  ok(await page.locator('.directory-mode-options button').count()===2&&await page.locator('[data-directory-mode="default"]').getAttribute('aria-pressed')==='true','hiring exposes only default generation and physical-folder binding')
  await expect(page.locator('[data-default-cwd]')).toHaveText(path.join(work,'开发 Alice'))
  ok(await page.locator('input[name="cwd"]').count()===0,'default mode previews a name-derived path without a custom-folder field')
  await page.locator('.save-employee').click();await expect(page.locator('.office-panel')).toHaveCount(0)
  const alice=(await cli('session','list')).sessions.find(c=>c.title==='开发 Alice')
  ok(alice.cwd===path.join(work,'开发 Alice')&&fs.existsSync(alice.cwd),'default employee folder preserves exact Chinese, spacing and case')
  const nested=path.join(alice.cwd,'existing folder');fs.mkdirSync(nested)
  await page.locator('.add-employee').click();await page.locator('input[name="title"]').fill('Nested');await page.locator('[data-directory-mode="bind"]').click()
  await expect(page.locator('.employee-directory-picker')).toBeVisible()
  await page.screenshot({path:path.join(project,'.aexus/artifacts/employee-folder-picker.png')})
  await page.getByRole('option',{name:/开发 Alice/}).dblclick()
  await page.getByRole('option',{name:/existing folder/}).click()
  await expect(page.locator('input[name="cwd"]')).toHaveValue(nested)
  await page.locator('.save-employee').click();await expect(page.locator('.office-panel')).toHaveCount(0)
  ok((await cli('session','list')).sessions.some(c=>c.title==='Nested'&&c.cwd===nested),'binding selects an existing nested physical folder')
  await page.locator('.add-employee').click();await page.locator('input[name="title"]').fill('Outside');await page.locator('[data-directory-mode="bind"]').click()
  await expect(page.locator('input[name="cwd"]')).toHaveAttribute('readonly','')
  await expect(page.locator('.employee-directory-picker')).not.toContainText('Build Studio')
  ok(!(await cli('session','list')).sessions.some(c=>c.title==='Outside'),'Work binding only offers folders under its Team root')
  await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]})})
  await page.locator('.panel-close').click();await page.locator('.add-employee').click();await page.locator('select[name="group"]').selectOption('Build Studio');await page.locator('input[name="title"]').fill('Canceled');await page.locator('[data-directory-mode="bind"]').click()
  await expect(page.locator('.save-employee')).toBeDisabled()
  ok(!(await cli('session','list')).sessions.some(c=>c.title==='Canceled'),'canceling the Mac folder chooser cannot create an employee')
  const external=path.join(temp,'physical-external');fs.mkdirSync(external)
  await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]})},external)
  await page.locator('.panel-close').click();await page.locator('.add-employee').click();await page.locator('select[name="group"]').selectOption('Build Studio');await page.locator('input[name="title"]').fill('Builder');await page.locator('[data-directory-mode="bind"]').click()
  await page.getByRole('button',{name:'选择工作目录',exact:true}).click()
  await expect(page.locator('input[name="cwd"]')).toHaveValue(external)
  await page.locator('.save-employee').click();await expect(page.locator('.office-panel')).toHaveCount(0)
  ok((await cli('session','list')).sessions.some(c=>c.title==='Builder'&&c.cwd===external),'Build binding accepts an existing physical folder outside the Team root')
  // Delete an idle, never-started employee through the UI; native API cases are covered separately.
  const target=(await cli('session','list')).sessions.find(c=>c.title==='Nested')
  await cli('view','open','conversation','--employee',target.id);await expect(page.locator('.composer textarea')).toBeEnabled()
  await page.getByRole('button',{name:'删除会话',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button',{name:'only employee',exact:true}).click();await expect(page.locator('.conversation-dialog')).toHaveCount(0)
  ok(!(await cli('session','list')).sessions.some(c=>c.id===target.id)&&fs.existsSync(target.cwd),'UI removal deletes the employee/session while keeping its work folder')
  await page.screenshot({path:path.join(project,'.aexus/artifacts/employee-lifecycle-0.9.png')})
  ok(errors.length===0,'no renderer exceptions: '+errors.join('; '))
  console.log(`PASS=${checks} FAIL=0 — no model calls`)
}catch(error){console.error(error);if(!page.isClosed()){console.error(await page.locator('body').innerText());await page.screenshot({path:path.join(project,'.aexus/artifacts/employee-lifecycle-error.png')})}throw error}
finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
