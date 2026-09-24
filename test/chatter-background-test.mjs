import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile)
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-chatter-bg-'))
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins'),AGENTS_COMPANY_HIDDEN:'1'}
delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env})
const page=await app.firstWindow(),cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
try{
  await page.locator('.infinite-canvas').waitFor()
  await cli('group','add','Local')
  const employee=await cli('card','create','--title','Quiet Chatter','--group','Local','--kind','chatter','--chat-provider','chatgpt')
  await cli('view','open','conversation','--employee',employee.id)
  await expect(page.locator('.chatter-chrome-page')).toBeVisible()
  assert.equal((await cli('chatter','chrome-status',employee.id)).connected,false)
  assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
  assert.ok(!fs.existsSync(path.join(env.AGENTS_COMPANY_HOME,'plugins/browser/auth/chatgpt/chrome-debug.json')))
  console.log('PASS hidden App defers managed Chrome and opens no visible website window')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
