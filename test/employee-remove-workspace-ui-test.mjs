import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-delete-ui-'))),control=path.join(temp,'fixture')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'')
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[]
page.on('pageerror',error=>errors.push(error.message))
const cli=async(...args)=>{const result=JSON.parse((await promisify(execFile)(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:20000,maxBuffer:8e6})).stdout);assert.ok(result.ok,result.error);return result.data}
const create=async(title,extra=[])=>{const card=await cli('card','create','--title',title,'--group','Team','--model','gpt-6-luna',...extra);await expect.poll(async()=>(await cli('session','status','--employee',card.id))[0].initialization.status).toBe('ready');return card}
const exists=async id=>(await cli('session','list')).sessions.some(card=>card.id===id)
const dialog=page.getByRole('alertdialog',{name:/删除/})
try{
 await page.locator('.infinite-canvas').waitFor();await cli('group','add','Team')
 const keep=await create('Keep'),both=await create('Both')
 for(const card of [keep,both]){fs.mkdirSync(path.join(card.cwd,'nested'));fs.writeFileSync(path.join(card.cwd,'nested/file.txt'),'content')}
 await cli('view','open','conversation','--employee',keep.id)
 await page.getByRole('button',{name:'删除会话',exact:true}).click()
 await expect(dialog).toBeVisible();assert.deepEqual(await dialog.getByRole('button').allTextContents(),['both','only employee','cancel'])
 await expect(dialog).toContainText(keep.cwd);await expect(dialog.getByRole('button',{name:'cancel',exact:true})).toBeFocused()
 await dialog.getByRole('button',{name:'cancel',exact:true}).click();await expect(dialog).toHaveCount(0)
 assert.ok(await exists(keep.id));assert.ok(fs.existsSync(path.join(keep.cwd,'nested/file.txt')))
 await page.getByRole('button',{name:'删除会话',exact:true}).click();await dialog.getByRole('button',{name:'only employee',exact:true}).click()
 await expect(dialog).toHaveCount(0);assert.ok(!await exists(keep.id));assert.ok(fs.existsSync(path.join(keep.cwd,'nested/file.txt')))
 await cli('view','open','conversation','--employee',both.id);await page.getByRole('button',{name:'删除会话',exact:true}).click()
 await page.screenshot({path:path.join(root,'artifacts/employee-delete-options.png')})
 await dialog.getByRole('button',{name:'both',exact:true}).click();await expect(dialog).toHaveCount(0)
 assert.ok(!await exists(both.id));assert.ok(!fs.existsSync(both.cwd))
 const parent=await create('Parent'),child=await create('Child',['--directory-mode','bind','--cwd',parent.cwd])
 await cli('view','open','conversation','--employee',parent.id);await page.getByRole('button',{name:'删除会话',exact:true}).click()
 await dialog.getByRole('button',{name:'both',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('其他员工')
 assert.ok(await exists(parent.id));assert.ok(await exists(child.id));assert.ok(fs.existsSync(parent.cwd))
 await dialog.getByRole('button',{name:'only employee',exact:true}).click();await expect(dialog).toHaveCount(0);assert.ok(await exists(child.id))
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 console.log('PASS hidden UI: exactly both / only employee / cancel; cancel is focused and changes nothing; only employee keeps nested files; both deletes them; protected-folder failure stays actionable')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
