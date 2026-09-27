import {nativeFixture} from './native-fixture.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const {_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),project=path.resolve(import.meta.dirname,'..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-dir-'))),home=path.join(temp,'state'),legacy=path.join(home,'workspace'),projects=path.join(temp,'projects')
fs.mkdirSync(legacy,{recursive:true});fs.writeFileSync(path.join(legacy,'keep.txt'),'Legacy files must stay here')
const groups=['Engineering','Design','Research','Leadership']
const sessions=Array.from({length:8},(_,i)=>({id:`legacy-${i}`,title:i===0?'CEO':`Engineer ${i}`,engine:'codex',cwd:legacy,group:i===0?'Leadership':'Engineering',model:'gpt-5.6-luna',effort:'low',permissionMode:'default',threadId:'old-context-must-not-resume',createdAt:Date.now()+i}))
fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify({groups,sessions,teamRoots:{},teamSettings:{},rooms:{}}))
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PROJECTS:projects,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1168',AGENTS_COMPANY_HEIGHT:'1096'};delete env.ELECTRON_RUN_AS_NODE
if(process.env.AGENTS_COMPANY_TEST_REAL!=='1'){
  const binary=path.join(temp,'codex-fixture');fs.writeFileSync(binary,`#!/usr/bin/env node
const fs=require('node:fs');const a=process.argv.slice(2);if(!a.includes('gpt-5.6-luna')||!a.includes('model_reasoning_effort="low"')||a.includes('old-context-must-not-resume'))process.exit(4);
process.stdin.resume();process.stdin.on('end',()=>{fs.writeFileSync('directory-ready.txt','WORKSPACE_OK');for(const e of [{type:'thread.started',thread_id:'new-thread'},{type:'turn.started'},{type:'item.completed',item:{id:'reply',type:'agent_message',text:'DIRECTORY_READY'}},{type:'turn.completed'}])process.stdout.write(JSON.stringify(e)+'\\n')});
`,{mode:0o755});env.CODEX_BIN=nativeFixture(binary)
}
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[project],env}),page=await app.firstWindow();page.setDefaultTimeout(15000)
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[path.join(project,'bin/agents'),...args,'--json'],{env,timeout:25000,maxBuffer:8<<20})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
let checks=0;const ok=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS '+label)}
try{
  await page.locator('.infinite-canvas').waitFor()
  ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'validation uses a hidden, non-activating window')
  ok((await cli('session','list')).sessions.every(c=>c.workspaceError),'reproduces the actual 8-employee / 4-unbound-Team legacy state')
  await cli('ui','click','[data-card-id="legacy-0"]')
  await page.getByRole('button',{name:'配置工作目录',exact:true}).click()
  const rootInput=page.locator('.workspace-contract > code')
  await expect(rootInput).toHaveText(path.join(projects,'Leadership'))
  await expect(page.locator('.save-employee')).toBeEnabled()
  ok(await page.locator('select[name="group"] option:disabled').count()===1,'unbound Teams remain selectable and directory configuration is not locked')
  await page.locator('[data-directory-mode="default"]').click()
  await page.locator('.save-employee').click();await expect(page.locator('.composer textarea')).toBeEnabled()
  const leadership=path.join(projects,'Leadership'),cwd=path.join(leadership,'CEO')
  const configured=(await cli('session','list')).sessions.find(c=>c.id==='legacy-0')
  ok(configured.cwd===cwd&&fs.existsSync(cwd)&&!configured.threadId&&!configured.workspaceError,'one save binds the Team, creates the employee directory and clears stale engine context')
  const live=(await cli('session','list','--live')).find(s=>s.cardId==='legacy-0')
  assert.equal(live.model,'gpt-5.6-luna');assert.equal(live.effort,'low')
  await cli('config','permission',live.id,'acceptEdits')
  await page.locator('.composer textarea').fill('In your current working directory, write directory-ready.txt containing exactly WORKSPACE_OK, then read it back and reply exactly DIRECTORY_READY. Do not browse, delegate, or change other files.')
  await page.locator('.composer textarea').press('Enter')
  await expect(page.locator('.turn.assistant').last()).toContainText('DIRECTORY_READY',{timeout:90000})
  await expect.poll(async()=>(await cli('session','info',live.id)).busy,{timeout:90000}).toBe(false)
  await expect.poll(()=>fs.existsSync(path.join(cwd,'directory-ready.txt'))).toBe(true)
  ok(fs.readFileSync(path.join(cwd,'directory-ready.txt'),'utf8').trim()==='WORKSPACE_OK','after configuring the directory, Send works and the engine writes the expected real file')
  await page.locator('.employee-details').click()
  const picked=path.join(leadership,'picked 中文 folder');fs.mkdirSync(picked)
  await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]})},picked)
  await page.getByRole('button',{name:'选择工作目录',exact:true}).click()
  await expect(page.locator('input[name="cwd"]')).toHaveValue(picked)
  await page.locator('.save-employee').click();await expect(page.locator('.composer textarea')).toBeEnabled()
  ok((await cli('session','list')).sessions.find(c=>c.id==='legacy-0').cwd===picked,'native picker result reaches the shared API and a usable conversation (picker stubbed to avoid a visible dialog)')
  await page.locator('.employee-details').click();await page.locator('select[name="group"]').selectOption('Engineering')
  await expect(rootInput).toHaveText(path.join(projects,'Engineering'))
  await page.locator('.save-employee').click();await expect(page.locator('.composer textarea')).toBeEnabled()
  const repaired=await cli('session','list')
  ok(repaired.sessions.every(c=>!c.workspaceError),'binding an old Team repairs its other legacy employees too')
  ok(fs.readFileSync(path.join(legacy,'keep.txt'),'utf8')==='Legacy files must stay here','legacy files are neither moved nor deleted')
  await assert.rejects(()=>cli('group','root','Engineering',home))
  ok((await cli('session','list')).teamRoots.Engineering===path.join(projects,'Engineering'),'invalid roots cannot override the managed project directory')
  await page.screenshot({path:path.join(project,'artifacts/directory-repair.png')})
  console.log(`PASS=${checks} FAIL=0 — ${process.env.AGENTS_COMPANY_TEST_REAL==='1'?'GPT-5.6 Luna / low only':'no model calls'}`)
}catch(error){console.error(error);if(!page.isClosed()){console.error(await page.locator('body').innerText());await page.screenshot({path:path.join(project,'artifacts/directory-repair-error.png')})}throw error}
finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
