import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),root=path.resolve(import.meta.dirname,'..'),run=promisify(execFile)
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-init-ui-'))),control=path.join(temp,'fixture');fs.mkdirSync(control)
const claudeHome=path.join(temp,'claude');fs.mkdirSync(claudeHome);fs.writeFileSync(path.join(claudeHome,'settings.json'),JSON.stringify({env:{ANTHROPIC_BASE_URL:'https://api.deepseek.com/anthropic'}}))
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins'),CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1300',AGENTS_COMPANY_HEIGHT:'950'}
delete env.ELECTRON_RUN_AS_NODE;for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||key==='AGENTS_COMPANY_EMPLOYEE')delete env[key]
env.CLAUDE_CONFIG_DIR=claudeHome
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[]
page.on('pageerror',error=>errors.push(error.message))
const cli=async(...args)=>{const result=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:15000,maxBuffer:2e6})).stdout);assert.ok(result.ok,result.error);return result.data}
try{
 await page.locator('.infinite-canvas').waitFor();await cli('group','add','Team')
 assert.deepEqual((await cli('engine','models','--engine','codex')).models.map(model=>model.value),['gpt-6-luna','fixture-alt'])
 assert.deepEqual((await cli('engine','models','--engine','claude')).models.map(model=>model.value),['deepseek-flash','deepseek-v4-pro'])
 await cli('view','open','settings')
 await page.locator('select[name=default-codex-model]').selectOption('fixture-alt')
 await page.locator('select[name=default-claude-model]').selectOption('deepseek-flash')
 await page.locator('.save-settings').click();await expect(page.locator('.preferences-panel')).toHaveCount(0)
 assert.equal((await cli('settings','get')).defaultCodexModel,'fixture-alt');assert.equal((await cli('settings','get')).defaultClaudeModel,'deepseek-flash')
 await page.locator('.add-employee').click();await page.locator('input[name=title]').fill('New Manager');await page.locator('select[name=group]').selectOption('Team')
 await expect(page.locator('select[name=model]')).toContainText('Fixture alternate')
 await page.locator('.engine-choices button').filter({hasText:'Claude Code'}).click()
 await expect(page.locator('select[name=model]')).toContainText('DeepSeek Flash')
 await expect(page.locator('select[name=model] option[value="gpt-6-luna"]')).toHaveCount(0)
 await page.locator('.engine-choices button').filter({hasText:'Codex'}).click()
 await page.locator('select[name=model]').selectOption('gpt-6-luna')
 await page.locator('select[name=managementRole]').selectOption('manager')
 await page.locator('.save-employee').click()
 await expect(page.getByRole('dialog',{name:'员工资料'})).toHaveCount(0)
 await expect(page.getByRole('dialog',{name:'员工初始化'})).toHaveCount(0)
 const manager=(await cli('session','list')).sessions.find(card=>card.title==='New Manager'),avatar=page.locator(`[data-card-id="${manager.id}"]`)
 await expect(avatar).toBeDisabled();await expect(avatar).toHaveAttribute('data-state','initializing')
 await expect(avatar.locator('.badge-light')).toHaveCSS('background-color','rgb(245, 197, 66)')
 assert.equal(manager.model,'gpt-6-luna')
 await expect.poll(()=>fs.existsSync(path.join(control,manager.id+'-initializing.json'))).toBe(true)
 assert.equal(JSON.parse(fs.readFileSync(path.join(control,manager.id+'-initializing.json'))).model,'gpt-6-luna')
 await expect(page.locator('.conversation-dialog')).toHaveCount(0);assert.ok(!(await page.textContent('body')).includes('private initialization'))
 await page.screenshot({path:path.join(root,'artifacts/employee-initializing.png')})
 await avatar.evaluate(element=>element.click())
 assert.equal((await cli('view','get')).kind,'home');await expect(page.locator('.conversation-dialog')).toHaveCount(0)
 await cli('view','open','initialization','--employee',manager.id)
 fs.writeFileSync(path.join(control,manager.id+'.release'),'')
 await expect(avatar).toBeEnabled({timeout:15000});await expect(page.locator('.initialization-dialog')).toHaveCount(0)
 await avatar.click();await expect(page.locator('.conversation-dialog')).toBeVisible();await expect(page.locator('.conversation-empty')).toContainText('已就绪')
 assert.equal((await cli('session','transcript',manager.id)).items.length,0)
 await page.locator('.composer textarea').fill('First visible message');await page.locator('.send-btn').click()
 await expect(page.locator('.transcript')).toContainText('VISIBLE_REPLY');await expect(page.locator('.transcript')).not.toContainText('PRIVATE_INIT_TOOL_OUTPUT');await expect(page.locator('.transcript')).not.toContainText('private initialization')
 await page.screenshot({path:path.join(root,'artifacts/employee-initialized-first-chat.png')})
 await cli('view','close')
 const defaultCard=await cli('card','create','--title','Default Model','--group','Team');assert.equal(defaultCard.model,'fixture-alt')
 fs.writeFileSync(path.join(control,defaultCard.id+'.release'),'')
 await expect(page.locator(`[data-card-id="${defaultCard.id}"]`)).toBeEnabled({timeout:15000})
 assert.equal(JSON.parse(fs.readFileSync(path.join(control,defaultCard.id+'-initializing.json'))).model,'fixture-alt')
 await cli('settings','set','--default-codex-model','gpt-6-luna','--default-claude-model','deepseek-v4-pro')
 assert.equal((await cli('session','list')).sessions.find(card=>card.id===defaultCard.id).model,'fixture-alt')
 const failed=await cli('card','create','--title','Failed Employee','--group','Team','--model','gpt-6-luna','--effort','low')
 fs.writeFileSync(path.join(control,failed.id+'.fail'),'');fs.writeFileSync(path.join(control,failed.id+'.release'),'')
 await expect(page.locator(`[data-card-id="${failed.id}"]`)).toHaveAttribute('data-state','initialization-failed',{timeout:15000})
 await page.locator(`[data-card-id="${failed.id}"]`).locator('..').getByRole('button',{name:'查看初始化错误 / 重试'}).click()
 await expect(page.locator('.initialization-dialog')).toContainText('初始化失败')
 fs.unlinkSync(path.join(control,failed.id+'.fail'));await page.getByRole('button',{name:'重试初始化',exact:true}).click()
 await expect(page.locator(`[data-card-id="${failed.id}"]`)).toBeEnabled({timeout:15000})
 await expect(page.locator('.initialization-dialog')).toHaveCount(0)
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 console.log('PASS hidden UI and CLI: per-engine catalogs/defaults, explicit model used for initialization, no create-time popup, yellow noninteractive avatar, clean first conversation, failed initialization retry; no inference')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
