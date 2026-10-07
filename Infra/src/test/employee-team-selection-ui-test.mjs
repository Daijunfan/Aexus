import {createReady,readyEmployee,acceptedMessage} from './fixtures/ui-contracts.mjs'
// Isolated hidden desktop; view membership and deletion never use real user data/models.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {_electron as electron,expect} from '@playwright/test'
const root=process.cwd(),require=createRequire(import.meta.url),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-team-choice-')))
const env={...process.env,AGENTS_COMPANY_HOME:temp+'/state',AGENTS_COMPANY_PROJECTS:temp+'/projects',AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1100',CODEX_BIN:root+'/Infra/src/test/fixtures/initialization-codex.cjs',CODEX_HOME:temp+'/codex',AC_INIT_FIXTURE:temp+'/fixture'};fs.mkdirSync(env.AC_INIT_FIXTURE);fs.writeFileSync(path.join(env.AC_INIT_FIXTURE,'release-all'),'');delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[]
page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message))
const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
const team=page.locator('select[name="group"]'),save=page.locator('.save-employee')
const choices=()=>team.locator('option').evaluateAll(options=>options.map(o=>o.value).filter(Boolean))
try{
 await page.locator('.infinite-canvas').waitFor();await call('settings.set',{language:'en'})
 const all=['Hidden A','Hidden B','Hidden C','Visible A','Visible B','Visible C']
 for(const name of all)await call('group.add',{name})
 const hidden=await createReady(call,{title:'Preserved employee',group:'Hidden A',engine:'codex',avatar:'fate-gilgamesh-chibi'})
 const focus=await call('team-view.create',{name:'Three teams',teams:all.slice(3)})
 await expect(page.locator('.company-view-trigger')).toHaveAttribute('title','Company Views · Three teams')
 await page.locator('.add-employee').click()
 await expect.poll(choices).toEqual(all.slice(3));await expect(team).toHaveValue('Visible A')
 await expect(page.locator('.office-panel .workspace-note').first()).toContainText('仅列出「Three teams」')
 await team.locator('..').locator('.app-select-trigger').click()
 await expect(page.getByRole('listbox').getByRole('option')).toHaveText(['Choose Team',...all.slice(3)])
 fs.mkdirSync(root+'/.aexus/artifacts/deleted-teams',{recursive:true});await page.screenshot({path:root+'/.aexus/artifacts/deleted-teams/three-team-picker.png'})
 await page.getByRole('listbox').getByRole('option',{name:'Visible A',exact:true}).click()
 // Rename invalidates an open selection, instead of submitting the previous name.
 await call('group.rename',{name:'Visible A',nextName:'Renamed A'})
 await expect.poll(choices).toEqual(['Renamed A','Visible B','Visible C']);await expect(team).toHaveValue('');await expect(save).toBeDisabled()
 await team.selectOption('Visible B');await page.locator('input[name="title"]').fill('New colleague');await save.click();await expect(page.locator('.employee-form')).toHaveCount(0)
 const created=(await call('session.list')).sessions.find(c=>c.title==='New colleague');assert.equal(created.group,'Visible B')
 await call('group.rename',{name:'Visible B',nextName:'Renamed B'});assert.equal((await call('session.list')).lastEmployeeTemplate.group,'Renamed B')
 await page.locator('.add-employee').click();await expect(team).toHaveValue('Renamed B')
 await page.locator('input[name="title"]').fill('Draft preserved')
 await call('group.remove',{name:'Renamed B'})
 await expect.poll(choices).toEqual(['Renamed A','Visible C']);await expect(team).toHaveValue('');await expect(save).toBeDisabled();await expect(page.locator('input[name="title"]')).toHaveValue('Draft preserved')
 await expect(page.locator('[data-default-cwd]')).not.toContainText(created.cwd)
 const removed=await call('session.list');assert.equal(removed.lastEmployeeTemplate.group,undefined);assert.equal(removed.lastEmployeeTemplate.avatar,'fate-gilgamesh-chibi')
 for(const key of ['rooms','teamRoots','teamSettings'])assert.ok(!Object.hasOwn(removed[key],'Renamed B'))
 assert.ok(removed.teamViews.every(v=>!v.teams.includes('Renamed B')));assert.ok(fs.existsSync(created.cwd),'keep-files deletion preserves workspaces')
 // Removing a Team from a view clears selection but preserves the actual Team/member.
 await team.selectOption('Renamed A');await call('team-view.update',{id:focus.id,patch:{teams:['Visible C']}})
 await expect.poll(choices).toEqual(['Visible C']);await expect(team).toHaveValue('');await expect(save).toBeDisabled()
 await call('team-view.update',{id:focus.id,patch:{teams:[]}});await expect.poll(choices).toEqual([]);await expect(save).toBeDisabled();await expect(page.locator('.office-panel .workspace-note').first()).toContainText('This view has no teams')
 await call('team-view.select',{id:'all'});await expect.poll(choices).toEqual(['Hidden A','Hidden B','Hidden C','Renamed A','Visible C'])
 await team.selectOption('Hidden A');await save.click();await expect(page.locator('.employee-form')).toHaveCount(0)
 const store=await call('session.list');assert.ok(store.sessions.some(c=>c.id===hidden.id));assert.equal(store.sessions.find(c=>c.title==='Draft preserved').group,'Hidden A')
 await page.reload();await page.locator('.infinite-canvas').waitFor();await call('settings.set',{language:'en'});await page.locator('.add-employee').click();await expect.poll(choices).toEqual(['Hidden A','Hidden B','Hidden C','Renamed A','Visible C'])
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())));assert.deepEqual(errors,[])
 console.log('PASS 6 real Teams / 3 view choices, styled dropdown, hidden-template fallback, rename/delete cleanup, open-form invalidation, view-only removal, empty view, All Team creation and reload persistence; no model calls')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
