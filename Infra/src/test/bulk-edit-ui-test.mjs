import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),root=path.resolve(import.meta.dirname,'../../..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-bulk-ui-'))),control=path.join(temp,'fixture');fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'')
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1560',AGENTS_COMPANY_HEIGHT:'1050',CODEX_BIN:path.join(root,'Infra/src/test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of ['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_EMPLOYEE'])delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[]
page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',()=>errors.push('Unexpected native confirmation'))
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env,timeout:20000,maxBuffer:8e6})).stdout);assert.ok(r.ok,r.error);return r.data}
const create=async(title,group)=>{const c=await cli('card','create','--title',title,'--group',group,'--model','gpt-6-luna','--effort','low');fs.mkdirSync(path.join(c.cwd,'nested'));fs.writeFileSync(path.join(c.cwd,'nested/file.txt'),'keep or delete');return c}
const roster=async()=>(await cli('session','list')).sessions
const edit=page.getByRole('button',{name:'编辑画布',exact:true}),toolbar=page.getByRole('toolbar',{name:'画布编辑'}),dialog=page.getByRole('alertdialog')
const employee=c=>page.getByRole('button',{name:'选中员工 '+c.title,exact:true}),team=name=>page.getByRole('button',{name:'选中团队 '+name,exact:true})
try{
 await page.locator('.infinite-canvas').waitFor();await cli('settings','set','--theme','white')
 for(const name of ['Alpha','Beta','Keep'])await cli('group','add',name)
 const a1=await create('Alpha One','Alpha'),a2=await create('Alpha Two','Alpha'),b1=await create('Beta One','Beta'),b2=await create('Beta Two','Beta'),keep=await create('Keep One','Keep')
 for(const [i,name] of ['Alpha','Beta','Keep'].entries())await cli('room','bounds',name,'--x',String(i*800),'--y','0','--width','760','--height','620')
 await cli('canvas','set','--x','350','--y','80','--zoom','.45');await expect(page.locator('.infinite-canvas')).toHaveAttribute('data-zoom','0.450')
 const iconBox=await edit.boundingBox(),plugins=await page.locator('.plugin-icons').boundingBox();assert.ok(iconBox.y>=plugins.y+plugins.height,'edit switch sits below the plugins')
 await edit.click();await expect(toolbar).toBeVisible();await expect(toolbar.getByRole('button',{name:'选中员工',exact:true})).toHaveAttribute('aria-pressed','true')
 await employee(a1).click();await employee(a2).click();await expect(toolbar.getByRole('status')).toHaveText('已选 2 名员工')
 await expect(employee(a1)).toHaveAttribute('aria-pressed','true');await expect(page.locator('.conversation-dialog')).toHaveCount(0)
 await page.screenshot({path:root+'/.aexus/artifacts/bulk-edit-employees.png'})
 await toolbar.getByRole('button',{name:'删除所选'}).click();await expect(dialog).toHaveCount(1);await expect(dialog).toContainText('2 名员工');await expect(dialog).toContainText(a1.cwd);await expect(dialog).toContainText(a2.cwd)
 await expect(dialog.getByRole('button',{name:'取消',exact:true})).toBeFocused();await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.ok((await roster()).some(c=>c.id===a1.id))
 await toolbar.getByRole('button',{name:'删除所选'}).click();await dialog.getByRole('button',{name:'保留文件夹',exact:true}).click();await expect(dialog).toHaveCount(0)
 await expect(toolbar.getByRole('status')).toHaveText('已选 0 名员工');assert.ok(!(await roster()).some(c=>[a1.id,a2.id].includes(c.id)));assert.ok(fs.existsSync(a1.cwd)&&fs.existsSync(a2.cwd))
 await employee(b1).click();await toolbar.getByRole('button',{name:'选中团队',exact:true}).click();await expect(toolbar.getByRole('status')).toHaveText('已选 0 个团队')
 await expect(page.locator('.employee-select-toggle')).toHaveCount(0);await team('Alpha').click();await team('Beta').click();await expect(toolbar.getByRole('status')).toHaveText('已选 2 个团队')
 await page.screenshot({path:root+'/.aexus/artifacts/bulk-edit-teams.png'})
 await toolbar.getByRole('button',{name:'删除所选'}).click();await expect(dialog).toHaveCount(1);await expect(dialog).toContainText('2 个团队及 2 名员工')
 await dialog.getByRole('button',{name:'同时删除文件夹',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(team('Alpha')).toHaveCount(0);await expect(team('Beta')).toHaveCount(0)
 assert.ok(!fs.existsSync(b1.cwd)&&!fs.existsSync(b2.cwd));assert.ok(fs.existsSync(a1.cwd),'previously retained files are not selected employees');assert.deepEqual((await roster()).map(c=>c.id),[keep.id])
 const extra=await create('Keep Two','Keep');await cli('room','bounds','Keep','--x','0','--y','0')
 await toolbar.getByRole('button',{name:'选中员工',exact:true}).click();await employee(keep).click();await employee(extra).click()
 const sshFile=path.join(keep.cwd,'key');fs.writeFileSync(sshFile,'fixture SSH reference');await cli('host','create','--data',JSON.stringify({name:'Protected SSH',host:'unused.invalid',os:'linux',defaultDirectory:'/tmp',identityFile:sshFile}))
 await toolbar.getByRole('button',{name:'删除所选'}).click();await dialog.getByRole('button',{name:'同时删除文件夹',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('SSH 文件')
 await expect(dialog).toHaveCount(1);assert.equal((await roster()).length,2);assert.ok(fs.existsSync(extra.cwd))
 await dialog.getByRole('button',{name:'保留文件夹',exact:true}).click();await expect(dialog).toHaveCount(0);assert.equal((await roster()).length,0);assert.ok(fs.existsSync(sshFile)&&fs.existsSync(extra.cwd))
 await toolbar.getByRole('button',{name:'退出编辑'}).click();await expect(edit).toHaveAttribute('aria-pressed','false');await expect(toolbar).toHaveCount(0);await expect(page.locator('.team-select-toggle,.employee-select-toggle')).toHaveCount(0)
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 console.log('PASS hidden batch-edit UI: sidebar placement, employee/Team multi-select, mode reset, one confirmation per batch, cancel, keep-files, remove-files, whole-Team cleanup and actionable protected-folder error without a second dialog')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
