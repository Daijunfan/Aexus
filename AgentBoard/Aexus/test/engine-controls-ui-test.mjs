// Hidden, isolated native UI with deterministic Codex protocol and Claude SDK fixtures; no provider calls.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-engine-ui-'))
const binary=path.join(temp,'codex')
fs.writeFileSync(binary,`#!/usr/bin/env node
const readline=require('readline'),emit=value=>process.stdout.write(JSON.stringify(value)+'\\n'),initialize=require(${JSON.stringify(path.join(root,'test/fixtures/ui-codex-initialization.cjs'))})(emit);if(!process.argv.includes('app-server'))process.exit(9);
readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;if(initialize(r))return;process.stdout.write(JSON.stringify({id:r.id,result:r.method==='model/list'?{data:[{id:'luna',model:'gpt-5.6-luna',displayName:'GPT-5.6 Luna',supportedReasoningEfforts:[{reasoningEffort:'low'}],defaultReasoningEffort:'low',serviceTiers:[{id:'priority',name:'Fast',description:'1.5x speed, increased usage'}]}]}:{}})+'\\n')});
`,{mode:0o755})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',CODEX_BIN:binary,CODEX_HOME:path.join(temp,'codex'),CLAUDE_CONFIG_DIR:path.join(temp,'claude'),CLAUDE_BIN:path.join(temp,'claude-fixture'),AC_INIT_FIXTURE:path.join(temp,'fixture')};delete env.ELECTRON_RUN_AS_NODE
fs.mkdirSync(env.AC_INIT_FIXTURE);fs.writeFileSync(path.join(env.AC_INIT_FIXTURE,'release-all'),'')
fs.writeFileSync(env.CLAUDE_BIN,'#!/usr/bin/env node\nif(process.argv.includes("--version"))console.log("2.1.0 fixture");else process.exitCode=9\n',{mode:0o755})
const claudeSdk=path.join(temp,'claude-sdk.mjs');fs.writeFileSync(claudeSdk,`export{tool,createSdkMcpServer}from ${JSON.stringify(path.join(root,'test/fixtures/discussion-claude-sdk.mjs'))};import{query as fixtureQuery}from ${JSON.stringify(path.join(root,'test/fixtures/discussion-claude-sdk.mjs'))};export function query(args){const result=fixtureQuery(args);result.supportedCommands=async()=>[{name:'usage',description:'Deterministic usage command',argumentHint:''}];return result}`)
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow();page.setDefaultTimeout(20000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[path.join(root,'bin/agents'),...args,'--json'],{env,timeout:25000})).stdout);assert.ok(r.ok,r.error);return r.data}
try{
 await page.locator('.infinite-canvas').waitFor();await cli('settings','set','--language','zh-CN');await cli('engine','configure','--engine','claude','--data',JSON.stringify({sdkPath:claudeSdk}));await cli('group','add','Test')
 const card=await cli('card','create','--title','Luna','--group','Test','--engine','codex','--model','gpt-5.6-luna');await expect.poll(async()=>(await cli('session','status','--employee',card.id))[0].initialization.status).toBe('ready');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.AC_INIT_FIXTURE,card.id+'-read.json'),'utf8')).operations,['identity','index']);await cli('view','open','conversation','--employee',card.id)
 await expect(page.locator('.composer textarea')).toBeEnabled();await expect(page.locator('[data-control="model"]')).toContainText('GPT-5.6 Luna')
 await page.getByRole('button',{name:'打开斜杠命令',exact:true}).click();await expect(page.getByRole('listbox',{name:'斜杠命令'})).toContainText('/model');await expect(page.getByRole('listbox',{name:'斜杠命令'})).toContainText('/fast')
 await page.locator('.composer textarea').fill('/status');await page.locator('.composer textarea').press('Enter');await expect(page.locator('.transcript')).toContainText('"engine": "codex"');await expect(page.locator('.composer textarea')).toHaveValue('')
 await page.locator('.composer textarea').fill('/model');await page.locator('.composer textarea').press('Enter');await expect(page.locator('[data-control="model"] .menu')).toBeVisible();await page.locator('[data-control="model"] .menu button').click()
 await page.locator('[data-control="effort"] .ctl').click();await expect(page.locator('[data-control="effort"] .menu button')).toHaveCount(2);await page.locator('[data-control="effort"] .menu').getByRole('button',{name:'低',exact:true}).click()
 await page.getByRole('button',{name:'Fast 模式',exact:true}).click();await expect(page.getByRole('button',{name:'Fast 模式',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:'Fast 模式',exact:true})).toContainText('1.5×')
 assert.equal((await cli('session','list')).sessions.find(s=>s.id===card.id).fastMode,true)
 await page.screenshot({path:path.join(root,'artifacts/engine-codex-controls.png')})
 await page.locator('.back').click()
 const claude=await cli('card','create','--title','Claude','--group','Test','--engine','claude','--model','fixture-claude');await expect.poll(async()=>(await cli('session','status','--employee',claude.id))[0].initialization.status).toBe('ready');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.AC_INIT_FIXTURE,claude.id+'-read.json'),'utf8')).operations,['identity','index']);await cli('view','open','conversation','--employee',claude.id)
 await expect(page.locator('.composer textarea')).toBeEnabled();await page.locator('.composer textarea').fill('/usage');await expect(page.getByRole('listbox',{name:'斜杠命令'})).toContainText('/usage');await page.locator('.composer textarea').press('Enter')
 await expect(page.locator('.composer textarea')).toHaveValue('');await expect.poll(async()=>{const live=await cli('session','list','--live');return live.find(s=>s.cardId===claude.id)?.busy}).toBe(false)
 await expect(page.locator('.transcript .turn-assistant').or(page.locator('.transcript .turn.assistant'))).not.toHaveCount(0)
 assert.equal(JSON.parse(fs.readFileSync(path.join(env.AC_INIT_FIXTURE,claude.id+'-work.json'),'utf8')).text.split('[Current message]\n').at(-1),'/usage');await expect(page.locator('.transcript')).toContainText('WORK_FINISHED')
 await page.screenshot({path:path.join(root,'artifacts/engine-claude-commands.png')})
 assert.equal(errors.length,0,errors.join('; '));assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 console.log('PASS native model/effort/Fast controls, slash menu + Enter execution, Claude fixture /usage and hidden windows; no provider calls')
}catch(error){await page.screenshot({path:path.join(root,'artifacts/engine-controls-error.png')});throw error}
finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
