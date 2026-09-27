// Independent native plugin windows, all windows hidden.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),root=path.resolve(import.meta.dirname,'..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-pwin-'))),env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),main=await app.firstWindow();main.setDefaultTimeout(20000)
let log='';app.process().stderr.on('data',data=>log+=data)
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[path.join(root,'bin/agents'),...args,'--json'],{env,timeout:30000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const windows=()=>cli('plugin','windows'),plugin=(method,params={})=>cli('plugin','call','mininotion',method,'--params',JSON.stringify(params))
let n=0;const ok=(condition,message)=>{assert.ok(condition,message);n++;console.log('PASS '+message)}
try{
 await main.locator('.infinite-canvas').waitFor();await cli('group','add','Planning','--mode','work','--plugin','mininotion')
 await cli('workspace','write','plan.md','--team','Planning','--content','# File view')
 await cli('view','open','workspace','--name','Planning')
 await expect(main.locator('.file-workspace')).toBeVisible();ok(await main.locator('iframe').count()===0,'Work Team workspace is the same file browser as other Teams')
 await cli('view','close')
 const [page]=await Promise.all([app.waitForEvent('window'),main.locator('.plugin-directory [data-plugin="mininotion"]').click()]);page.setDefaultTimeout(20000)
 await page.locator('.sidebar').waitFor();let state=(await windows())[0]
 ok(state.attached&&await main.locator('iframe').count()===0&&await main.locator('.infinite-canvas').isVisible(),'plugin is a separate native window; the company stays on the canvas')
 ok(await page.locator('iframe').count()===0,'plugin is loaded at the top level without a wrapper iframe')
 const note=await plugin('page.create',{title:'Independent page',color:'white'})
 await plugin('page.open',{pageId:note.id});await expect(page.getByRole('textbox',{name:'页面标题'})).toHaveValue('Independent page')
 await page.getByRole('textbox',{name:'页面标题'}).fill('Saved from its own window')
 await page.locator('.bn-editor').click();await page.locator('.bn-editor').pressSequentially('Independent native editing.',{delay:2})
 const again=await cli('plugin','open','mininotion');ok(again.id===state.id&&(await windows()).length===1,'repeated icon/CLI opens focus the existing window')
 await cli('plugin','place',state.id,'--x','650','--y','180','--width','800','--height','650')
 await expect.poll(async()=>(await windows())[0].bounds.x).toBe(650)
 await cli('plugin','place',state.id,'--x','900','--y','320')
 await expect.poll(async()=>(await windows())[0].bounds.x).toBe(900)
 ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length===2),'only company and plugin windows exist after moving; no connection overlay')
 await cli('plugin','dismiss',state.id)
 await expect.poll(()=>windows().then(w=>w.length)).toBe(0)
 const saved=await plugin('page.get',{pageId:note.id})
 ok(saved.title==='Saved from its own window'&&JSON.stringify(saved).includes('Independent native editing.'),'closing the independent window flushes document edits to the shared CLI backend')
 const reopened=app.waitForEvent('window');state=await cli('plugin','open','mininotion');const second=await reopened;second.setDefaultTimeout(20000);await second.locator('.sidebar').waitFor()
 await cli('plugin','mode',state.id,'minimized');ok((await windows())[0].mode==='minimized','window minimization is exposed through CLI')
 await cli('plugin','open','mininotion');ok((await windows())[0].mode==='normal','opening again restores the existing plugin window')
 await plugin('fs.write',{path:'draft.md',content:'# Original file'})
 const raw=(await plugin('page.list')).find(p=>p.sourceFile?.path==='draft.md');await plugin('page.open',{pageId:raw.id})
 await second.locator('.folder-markdown').waitFor();await second.getByRole('button',{name:'编辑文件',exact:true}).click();await second.getByRole('textbox',{name:'文件内容'}).fill('# Local pending edit')
 fs.writeFileSync(path.join(state.workspace,'draft.md'),'# External change')
 await assert.rejects(()=>cli('plugin','dismiss',state.id))
 ok((await windows()).length===1&&!second.isClosed()&&fs.readFileSync(path.join(state.workspace,'draft.md'),'utf8')==='# External change','a conflicting save blocks close and preserves the external document')
 await second.getByRole('button',{name:'取消编辑',exact:true}).click();await second.getByRole('button',{name:'编辑文件',exact:true}).click();await second.getByRole('textbox',{name:'文件内容'}).fill('# Saved on native close')
 await app.evaluate(({BrowserWindow},url)=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url).close(),state.url)
 await expect.poll(()=>windows().then(w=>w.length)).toBe(0)
 ok(fs.readFileSync(path.join(state.workspace,'draft.md'),'utf8')==='# Saved on native close','native window close uses the same save-first lifecycle as the CLI')
 const remaining=app.waitForEvent('window');state=await cli('plugin','open','mininotion');const last=await remaining;await last.locator('.sidebar').waitFor()
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('file:')).close())
 await expect.poll(()=>main.isClosed()).toBe(true)
 ok(!last.isClosed()&&(await windows()).length===1,'plugin stays usable when the company window is closed')
 await cli('plugin','dismiss',state.id)
 ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'all native windows stayed hidden')
 console.log(`PASS=${n} FAIL=0 — no model calls`)
}catch(error){console.error(log.slice(-5000));throw error}
finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
