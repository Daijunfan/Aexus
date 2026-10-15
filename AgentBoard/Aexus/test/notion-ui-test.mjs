// Hidden, isolated visual acceptance: plugin remains driven by its CLI Core.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),exec=promisify(execFile)
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-nui-')))
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1020'};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env,timeout:30000})
const page=await app.firstWindow();page.setDefaultTimeout(20000)
let log='';app.process().stderr.on('data',d=>log+=d)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const cli=async(...args)=>{const r=JSON.parse((await exec(process.execPath,[path.join(root,'bin/agents'),...args,'--json'],{env,timeout:20000})).stdout);assert.ok(r.ok,r.error);return r.data}
const plugin=(method,params={})=>cli('plugin','call','mininotion',method,'--team','工作空间','--params',JSON.stringify(params))
let checks=0;const ok=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label)}
const artifacts=process.env.AGENTS_COMPANY_TEST_ARTIFACTS||path.join(root,'artifacts');fs.mkdirSync(artifacts,{recursive:true})
let frame=page
try{
 await page.locator('.infinite-canvas').waitFor()
 await cli('group','add','工作空间','--mode','work','--plugin','mininotion')
 await cli('settings','set','--theme','sage','--sidebar-width','64')
 await cli('card','create','--title','Aria','--group','工作空间','--avatar','cat','--engine','codex')
 await cli('card','create','--title','Milo','--group','工作空间','--avatar','cloud','--engine','codex')
 await plugin('settings.set',{changes:{theme:'light',sidebarWidth:240}})
 const plan=await plugin('page.create',{title:'项目计划',color:'green',icon:'📋',blocks:[{type:'heading',props:{level:2},content:'让每一个想法，都有一个开始。'},{type:'paragraph',content:'在这里整理项目、记录决策，与团队一起把计划变成结果。'},{type:'bulletListItem',content:'建立清晰的目标与优先级'},{type:'bulletListItem',content:'让记录和工作文件保存在同一个地方'},{type:'checkListItem',props:{checked:true},content:'确定本周要完成的工作'},{type:'checkListItem',props:{checked:false},content:'整理会议记录与参考资料'}]})
 const notes=await plugin('page.create',{title:'会议记录',color:'white',icon:'🗒️',blocks:[{type:'paragraph',content:'周一同步 · 目标、进度与下一步'}]})
 const db=await plugin('database.create',{title:'任务清单',color:'white',view:'board'})
 for(const [title,status] of [['整理产品需求','未开始'],['完成页面设计','进行中'],['验证 CLI 接口','已完成']])await plugin('record.create',{databaseId:db.id,title,color:'white',values:{status,priority:'中'}})
 const opening=app.waitForEvent('window');await cli('plugin','open','mininotion','--team','工作空间');frame=await opening;await frame.locator('.sidebar').waitFor()
 ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'all windows are hidden')
 ok(await page.locator('.company-header').isVisible()&&await page.locator('iframe').count()===0,'plugin opens in an independent native window')
 await plugin('page.open',{pageId:plan.id})
 await expect(frame.getByRole('textbox',{name:'页面标题'})).toHaveValue('项目计划')
 const bg=await frame.locator('.page-scroll').evaluate(e=>getComputedStyle(e).backgroundColor)
 ok(bg==='rgb(255, 255, 255)'&&(await plugin('page.get',{pageId:plan.id})).color==='green','existing page color survives as a label while the document surface stays white')
 await expect(frame.locator('.bn-editor')).toContainText('让每一个想法')
 await frame.screenshot({animations:'disabled',path:path.join(artifacts,'mininotion-0.14-document-light.png')})
 await frame.getByRole('textbox',{name:'页面标题'}).fill('项目计划 · 本周')
 await expect.poll(async()=>(await plugin('page.get',{pageId:plan.id})).title).toBe('项目计划 · 本周')
 await frame.locator('.bn-editor').click();await frame.locator('.bn-editor').press('End');await frame.locator('.bn-editor').pressSequentially(' 可编辑正文',{delay:3})
 await cli('plugin','dismiss',(await cli('plugin','windows'))[0].id)
 ok(JSON.stringify(await plugin('page.get',{pageId:plan.id})).includes('可编辑正文'),'title and document edits persist through shared CLI data and flush on close')
 const reopened=app.waitForEvent('window');await cli('plugin','open','mininotion','--team','工作空间');frame=await reopened;await frame.locator('.sidebar').waitFor()
 await frame.locator('.sidebar-nav').getByRole('button',{name:'主页',exact:true}).click()
 await expect(frame.locator('.recent-card')).toHaveCount(6)
 await expect(frame.locator('.overview')).toBeVisible()
 await frame.screenshot({animations:'disabled',path:path.join(artifacts,'mininotion-0.14-home-light.png')})
 ok(true,'home shows recent documents and functional task views in a neutral layout')
 // Host resize is still a CLI-backed preference, independent from the page-tree width.
 const handle=page.getByRole('separator',{name:'调整侧栏宽度'}),box=await handle.boundingBox()
 await page.mouse.move(box.x+box.width/2,box.y+100);await page.mouse.down();await page.mouse.move(box.x+box.width/2+16,box.y+100,{steps:4});await page.mouse.up()
 await expect.poll(async()=>(await cli('settings','get')).sidebarWidth).toBe(80)
 ok(true,'employee sidebar remains freely resizable and persisted through CLI')
 await plugin('settings.set',{changes:{theme:'dark'}})
 await expect(frame.locator('html')).toHaveAttribute('data-theme','dark')
 await plugin('page.open',{pageId:db.id})
 await expect(frame.locator('.database')).toBeVisible()
 await frame.screenshot({animations:'disabled',path:path.join(artifacts,'mininotion-0.14-board-dark.png')})
 ok(await frame.locator('.page-scroll').evaluate(e=>getComputedStyle(e).backgroundColor)==='rgb(25, 25, 25)','dark mode uses a neutral independent document window')
 await plugin('page.open',{pageId:notes.id})
 await frame.locator('.sidebar-nav').getByRole('button',{name:/搜索/}).click()
 await expect(frame.getByRole('dialog')).toBeVisible()
 await frame.getByRole('dialog').evaluate(e=>Promise.all(e.getAnimations().map(a=>a.finished)))
 ok(await frame.getByRole('dialog').evaluate(e=>getComputedStyle(e).opacity==='1'&&getComputedStyle(e).backgroundColor==='rgb(25, 25, 25)'),'search dialog is opaque and its text is readable in dark mode')
 await frame.screenshot({animations:'disabled',path:path.join(artifacts,'mininotion-0.14-search-dark.png')})
 await frame.locator('body').press('Escape')
 await plugin('settings.set',{changes:{theme:'light'}})
 await cli('view','open','home')
 ok((await cli('settings','get')).theme==='sage','plugin theme presentation does not overwrite office preferences')
 ok((await cli('schedule','list')).length===0,'MiniNotion creates no host schedules')
 ok(errors.length===0,'no renderer exceptions: '+errors.join('; '))
 console.log(`PASS=${checks} FAIL=0 — no model inference`)
}catch(error){console.error(log.slice(-4000));await frame.screenshot({animations:'disabled',path:path.join(artifacts,'mininotion-0.14-error.png')});throw error}
finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
