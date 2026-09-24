import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile)
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-chatter-ui-'))
const site=http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end(`<textarea></textarea><script>document.querySelector('textarea').addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();const answer=document.createElement('div');answer.className='ds-markdown';answer.textContent='GUI:'+e.target.value;document.body.append(answer)})</script>`)})
await new Promise(resolve=>site.listen(0,'127.0.0.1',resolve))
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),...(process.env.AGENTS_COMPANY_TEST_APP?{}:{AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins')}),AGENTS_COMPANY_CHAT_TEST_URL_DEEPSEEK:`http://127.0.0.1:${site.address().port}/`,AGENTS_COMPANY_HIDDEN:'1'}
delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env})
const page=await app.firstWindow(),cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[path.join(root,'bin/agents'),...args,'--json'],{env,timeout:25000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
try{
  await page.locator('.infinite-canvas').waitFor()
  assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
  await cli('group','add','Local')
  await page.locator('.add-employee').click()
  await expect(page.getByRole('group',{name:'员工类型'})).toBeVisible()
  await page.getByRole('button',{name:/Chatter/}).click()
  await expect(page.locator('select[name="chatProvider"]')).toHaveValue('doubao')
  await page.locator('select[name="chatProvider"]').locator('..').locator('.app-select-trigger').click()
  await page.getByRole('option',{name:'DeepSeek'}).click()
  await page.locator('input[name="title"]').fill('Web Friend')
  await page.locator('.save-employee').click()
  await expect(page.locator('.office-panel')).toHaveCount(0)
  const card=(await cli('session','list')).sessions.find(c=>c.title==='Web Friend');assert.equal(card.kind,'chatter');assert.equal(card.chatProvider,'deepseek')
  const cookieFile=path.join(temp,'cookie-fixture.json');fs.writeFileSync(cookieFile,JSON.stringify([{name:'__Host-fixture',value:'scoped',domain:'chat.deepseek.com',path:'/',secure:true}]),{mode:0o600})
  await cli('chatter','import',card.id,'--file',cookieFile)
  await cli('view','open','conversation','--employee',card.id)
  await expect(page.locator('.chatter-workbench')).toBeVisible()
  await expect(page.locator('.chatter-web-page webview')).toBeVisible({timeout:15000})
  const guestId=await app.evaluate(({webContents})=>webContents.getAllWebContents().find(contents=>contents.getType()==='webview')?.id)
  assert.equal((await cli('chatter','attach',card.id,String(guestId))).attached,true)
  await page.getByRole('button',{name:'CLI 会话'}).click()
  await page.locator('.chatter-workbench .composer textarea').fill('Hello UI')
  await page.locator('.chatter-workbench .send-btn').click()
  await expect(page.locator('.chatter-workbench .transcript')).toContainText('GUI:Hello UI',{timeout:30000})
  await expect(page.locator('.session-settings.controls')).toHaveCount(0)
  await expect(page.locator('.employee-terminal')).toHaveCount(0)
  console.log('PASS hidden UI creates a Chatter with styled provider picker and opens its dedicated conversation without coding controls')
}finally{await app.close();await new Promise(resolve=>site.close(resolve));fs.rmSync(temp,{recursive:true,force:true})}
