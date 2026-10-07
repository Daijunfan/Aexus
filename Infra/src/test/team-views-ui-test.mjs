import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'

const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),root=path.resolve(import.meta.dirname,'../../..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-team-views-ui-')))
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'960'};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow()
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const showMenu=async()=>{const button=page.getByRole('button',{name:'Company Views',exact:true});if(await button.getAttribute('aria-expanded')!=='true'){await button.focus();await page.keyboard.press('ArrowDown')}}
const editCurrent=async()=>{await showMenu();const name=(await page.locator('.company-view-trigger').getAttribute('title')).replace('Company Views · ','');await page.getByRole('button',{name:'Edit '+name,exact:true}).click()}
const errors=[];page.on('pageerror',error=>errors.push(error.message))
try{
 await page.locator('.infinite-canvas').waitFor()
 for(const name of ['Alpha','Beta'])await cli('group','add',name)
 const member=await cli('card','create','--title','Member','--group','Alpha','--engine','codex','--model','gpt-6-luna','--effort','low');fs.writeFileSync(path.join(member.cwd,'keep.txt'),'preserve when removed from a view')
 await expect(page.locator('.company-view-trigger')).toHaveAttribute('title','Company Views · All Team')
 await expect(page.getByRole('button',{name:'编辑当前视图'})).toHaveCount(0)
 // A canvas pointer handler stops bubbling. Outside dismissal still observes it.
 await showMenu();await page.locator('.infinite-canvas').click({position:{x:700,y:450}});await expect(page.locator('.company-view-menu')).toHaveCount(0)
 await showMenu();await page.getByRole('button',{name:'Add Team',exact:true}).focus();await expect(page.locator('.company-view-menu')).toHaveCount(0)
 await showMenu();await page.keyboard.press('Escape');await expect(page.locator('.company-view-menu')).toHaveCount(0);await expect(page.locator('.company-view-trigger')).toBeFocused()
 const nav=await page.locator('.application-layers').boundingBox();assert.ok(Math.abs(nav.x+nav.width/2-720)<1,'Engine and Infra stay centered on the window');await expect(page.locator('.infra-toolbar .company-navigation')).toBeVisible()
 await showMenu();await page.getByRole('menuitem',{name:'New view',exact:true}).click()
 const dialog=page.getByRole('dialog',{name:'New company view'});await expect(dialog).toBeVisible()
 await dialog.getByLabel('View name').fill('Focus')
 await dialog.locator('label').filter({hasText:'Alpha'}).locator('input[type=checkbox]').check()
 await dialog.getByRole('button',{name:'Save view'}).click()
 await expect(page.locator('.company-view-trigger')).toHaveAttribute('title','Company Views · Focus')
 await expect(page.locator('[data-department="Alpha"]')).toHaveCount(1)
 await expect(page.locator('[data-department="Beta"]')).toHaveCount(0)
 await showMenu();await page.locator('.company-view-menu').getByRole('menuitemradio',{name:/^All Team\b/}).click()
 await expect(page.locator('[data-department="Beta"]')).toHaveCount(1)
 await showMenu();await page.locator('.company-view-menu').getByRole('menuitemradio',{name:/^Focus\b/}).click();await expect(page.locator('.company-view-trigger')).toHaveAttribute('title','Company Views · Focus')
 await editCurrent()
 const edit=page.getByRole('dialog',{name:'Edit company view'})
 await edit.getByLabel('View name').fill('Focus Two')
 await edit.locator('label').filter({hasText:'Beta'}).locator('input[type=checkbox]').check()
 await edit.getByRole('button',{name:'Save view'}).click()
 await expect(page.locator('.company-view-trigger')).toHaveAttribute('title','Company Views · Focus Two')
 await expect(page.locator('[data-department="Beta"]')).toHaveCount(1)
 await page.screenshot({path:path.join(root,'.aexus/artifacts/team-views.png')})
 const views=await cli('team-view','list');assert.deepEqual(views.views[1].teams,['Alpha','Beta'])
 await editCurrent()
 await edit.locator('label').filter({hasText:'Alpha'}).locator('input[type=checkbox]').uncheck();await edit.getByRole('button',{name:'Save view'}).click()
 await expect(page.locator('[data-department="Alpha"]')).toHaveCount(0);await expect(page.locator('[data-department="Beta"]')).toHaveCount(1)
 assert.deepEqual(await cli('group','list'),['Alpha','Beta']);assert.ok((await cli('session','list')).sessions.some(c=>c.id===member.id));assert.equal(fs.readFileSync(path.join(member.cwd,'keep.txt'),'utf8'),'preserve when removed from a view')
 await editCurrent();await edit.locator('label').filter({hasText:'Beta'}).locator('input[type=checkbox]').uncheck();await edit.getByRole('button',{name:'Save view'}).click()
 await expect(page.locator('.canvas-empty')).toContainText('No teams in this view yet');await page.reload();await expect(page.locator('.canvas-empty')).toContainText('then choose existing teams from All Team')
 await editCurrent();for(const name of ['Alpha','Beta'])await edit.locator('label').filter({hasText:name}).locator('input[type=checkbox]').check();await edit.getByRole('button',{name:'Save view'}).click()
 // Many saved views stay inside one bounded, keyboard-accessible menu.
 const extra=[];for(let i=0;i<12;i++)extra.push(await cli('team-view','create','--name','Long View '+i))
 await cli('team-view','select',views.views[1].id);await expect(page.locator('.company-view-trigger')).toHaveAttribute('title','Company Views · Focus Two')
 await showMenu();await expect(page.getByRole('button',{name:'Edit Focus Two',exact:true})).toBeVisible();const box=await page.locator('.company-view-menu').boundingBox();assert.ok(box.x>=0&&box.x+box.width<1440&&box.height<600);await page.locator('.company-view-menu').screenshot({path:path.join(root,'.aexus/artifacts/company-messages/company-views.png')});await page.keyboard.press('Escape');await expect(page.locator('.company-view-menu')).toHaveCount(0)
 await editCurrent();await expect(edit).toContainText('Your teams, employees and workspaces stay intact');await edit.getByRole('button',{name:'Cancel',exact:true}).click()
 await page.screenshot({path:path.join(root,'.aexus/artifacts/team-view-inline-edit.png')})
 for(const view of extra)await cli('team-view','remove',view.id)
 const later=await cli('team-view','create','--name','Later'),last=await cli('team-view','create','--name','Last')
 await showMenu();await expect(page.locator('.company-view-menu button.reorderable')).toHaveCount(3)
 await showMenu();await page.locator('.company-view-menu').getByRole('menuitemradio',{name:/^Last\b/}).dragTo(page.locator('.company-view-menu').getByRole('menuitemradio',{name:/^All Team\b/}))
 await expect.poll(async()=> (await cli('team-view','list')).views.map(view=>view.id)).toEqual(['all',last.id,views.views[1].id,later.id])
 await showMenu();assert.equal(await page.locator('.company-view-menu').getByRole('menuitemradio',{name:/^All Team\b/}).getAttribute('draggable'),'false')
 await showMenu();await page.locator('.company-view-menu').getByRole('menuitemradio',{name:/^Focus Two\b/}).click();await expect(page.locator('.company-view-trigger')).toHaveAttribute('title','Company Views · Focus Two')
 await editCurrent()
 await page.getByRole('dialog',{name:'Edit company view'}).getByRole('button',{name:'Delete view'}).click()
 await expect(page.locator('.company-view-trigger')).toHaveAttribute('title','Company Views · All Team')
 assert.deepEqual(await cli('group','list'),['Alpha','Beta'])
 assert.equal(Math.round((await page.locator('.company-header').boundingBox()).height),72)
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 assert.deepEqual(errors,[])
 console.log('PASS hidden Team-view UI: compact dropdown creation, drag reordering, Team filtering, editing, removal and All Team fallback; no model calls')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
