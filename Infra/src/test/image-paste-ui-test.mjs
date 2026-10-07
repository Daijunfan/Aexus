import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'

const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-paste-'))),control=path.join(temp,'fixture')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'')
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',CODEX_BIN:path.join(root,'Infra/src/test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
delete env.ELECTRON_RUN_AS_NODE
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile)
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow()
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='
try{
  await page.locator('.infinite-canvas').waitFor();await cli('group','add','Screenshots')
  const card=await cli('card','create','--title','Viewer','--group','Screenshots','--engine','codex','--model','gpt-6-luna','--effort','low')
  await cli('view','open','conversation','--employee',card.id)
  const composer=page.locator('.composer textarea');await expect(composer).toBeEnabled()
  await composer.evaluate((element,base64)=>{const bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0)),transfer=new DataTransfer();transfer.items.add(new File([bytes],'screen.png',{type:'image/png'}));element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}))},png)
  await expect(page.locator('.attachment-chips button')).toHaveCount(1)
  const attached=(await page.locator('.attachment-chips button').innerText()).replace(/^🖼 /,'').replace(/ ×$/,'')
  assert.ok(attached.startsWith('.agents-attachments/pasted-'))
  assert.deepEqual(fs.readFileSync(path.join(card.cwd,attached)),Buffer.from(png,'base64'))
  assert.equal((await cli('workspace','image',attached,'--employee',card.id)).mimeType,'image/png')
  const encoded=path.join(temp,'screenshot.b64');fs.writeFileSync(encoded,png)
  await cli('workspace','write','.agents-attachments/from-cli.png','--employee',card.id,'--base64-file',encoded,'--create')
  assert.equal((await cli('workspace','image','.agents-attachments/from-cli.png','--employee',card.id)).mimeType,'image/png')
  await composer.fill('看看这张截图');await page.locator('.send-btn').click()
  await expect(page.locator('.attachment-chips button')).toHaveCount(0)
  assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
  console.log('PASS pasted screenshot uses the shared workspace.write CLI/Core API, appears as an attachment and is sent with the message')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
