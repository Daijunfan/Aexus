import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-management-ui-')))
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1100'};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message))
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
try{
 await page.locator('.infinite-canvas').waitFor();await cli('group','add','Team')
 const manager=await cli('card','create','--title','Manager','--group','Team'),worker=await cli('card','create','--title','Employee','--group','Team')
 await cli('view','open','employee','--employee',manager.id)
 const panel=page.getByRole('region',{name:'协同管理'})
 await panel.locator('select[aria-label="团队角色"]').selectOption('manager')
 await panel.locator('select[aria-label="选择被管理员工"]').selectOption(worker.id)
 await panel.getByRole('button',{name:'申请关系',exact:true}).click()
 await expect(panel).toContainText('待用户批准');await expect(page.locator('.management-edges [data-relation]')).toHaveCount(0)
 await panel.getByRole('button',{name:'批准',exact:true}).click()
 await expect(panel).toContainText('已生效');await expect(page.locator('.management-edges [data-relation]')).toHaveCount(1)
 const before=await page.locator('.management-edges [data-relation]').getAttribute('d')
 await cli('card','place',worker.id,'--x','430','--y','190','--snap','off')
 await expect.poll(()=>page.locator('.management-edges [data-relation]').getAttribute('d')).not.toBe(before)
 await cli('view','close')
 const filtered=await cli('team-view','create','--name','Other view','--teams','[]')
 await expect(page.locator('.management-edges [data-relation]')).toHaveCount(0)
 assert.equal((await cli('management','topology','--team','Team')).edges.length,1)
 await cli('team-view','select','all');await expect(page.locator('.management-edges [data-relation]')).toHaveCount(1)
 await page.screenshot({path:path.join(root,'artifacts/management-topology.png')})
 await cli('card','management-role',worker.id,'manager');await expect(page.locator('.management-edges [data-relation]')).toHaveCount(0)
 assert.equal((await cli('management','topology')).edges.length,0)
 await cli('management','global',manager.id,'on');await expect(page.locator(`[data-card-id="${manager.id}"] .employee-management`)).toHaveText('Agents Manager')
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 console.log('PASS hidden topology UI: role picker, pending approval, active SVG arrows, geometry updates, multi-view invariance and global badge')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
