import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
import {nativeFixture} from './native-fixture.mjs'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-isolated-desktop-'))),fixture=path.join(temp,'codex')
fs.writeFileSync(fixture,`#!/usr/bin/env node
const {execFileSync}=require('child_process'),path=require('path');process.stdin.resume();process.stdin.on('end',()=>{const result=JSON.parse(execFileSync(path.join(process.cwd(),'.agents-company/bin/agents'),['auth','whoami','--json'],{encoding:'utf8'}));console.log(JSON.stringify({type:'item.completed',item:{id:'identity',type:'agent_message',text:JSON.stringify(result.data.principal)}}))});`,{mode:0o755})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',CODEX_BIN:nativeFixture(fixture),CODEX_HOME:path.join(temp,'codex-home')};delete env.ELECTRON_RUN_AS_NODE;fs.mkdirSync(env.CODEX_HOME)
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow()
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
try{
 await page.locator('.infinite-canvas').waitFor();await cli('group','add','Sandbox')
 const card=await cli('card','create','--title','Employee','--group','Sandbox','--access-mode','isolated')
 await cli('session','send','--employee',card.id,'--text','查看自己的身份')
 await expect.poll(async()=>(await cli('session','transcript','--employee',card.id)).text,{timeout:15000}).toContain(card.id)
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 console.log('PASS isolated desktop process executes its generated Electron/Node CLI launcher with its own employee identity; no inference')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
