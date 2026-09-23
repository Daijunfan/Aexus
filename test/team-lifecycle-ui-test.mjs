import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),project=path.resolve(import.meta.dirname,'..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-tui-'))),home=path.join(temp,'state'),work=path.join(temp,'work'),projects=path.join(temp,'projects'),external=path.join(temp,'Existing Project'),sub=path.join(work,'mini-notion-workspace','Bound Work')
for(const folder of [home,external,sub])fs.mkdirSync(folder,{recursive:true})
fs.writeFileSync(path.join(external,'keep.md'),'keep existing files')
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_WORKSPACES:work,AGENTS_COMPANY_PROJECTS:projects,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1100'};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[project],env}),page=await app.firstWindow();page.setDefaultTimeout(20000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[path.join(project,'bin/agents'),...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
let n=0;const ok=(value,label)=>{assert.ok(value,label);n++;console.log('PASS '+label)}
try{
 await page.locator('.infinite-canvas').waitFor()
 ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'test windows remain hidden')
 await page.locator('.add-team').click();await page.locator('input[name="team-name"]').fill('Existing Build')
 ok(await page.locator('[data-team-directory-mode]').count()===2&&await page.locator('[data-team-directory-mode="default"]').getAttribute('aria-pressed')==='true','Team creation exposes default generation and folder binding')
 await page.locator('[data-team-directory-mode="bind"]').click()
 await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]})},external)
 await page.getByRole('button',{name:'选择 Team 目录',exact:true}).click();await expect(page.locator('input[name="team-root"]')).toHaveValue(external)
 await page.locator('.save-team').click();await expect(page.locator('.office-panel')).toHaveCount(0)
 ok((await cli('session','list')).teamRoots['Existing Build']===external&&!fs.existsSync(path.join(projects,'Existing Build')),'UI binds the selected physical directory without making an extra project folder')
 await cli('view','open','team','--name','Existing Build');await expect(page.locator('[data-team-directory-mode="bind"]')).toHaveAttribute('aria-pressed','true')
 await expect(page.locator('input[name="team-name"]')).not.toBeEditable();await page.locator('.save-team').click();await expect(page.locator('.office-panel')).toHaveCount(0)
 ok((await cli('session','list')).teamRoots['Existing Build']===external&&fs.existsSync(path.join(external,'keep.md')),'bound Team settings reopen with a locked name and intact directory')
 await page.locator('.add-employee').click();await page.locator('input[name="title"]').fill('Writer')
 await expect(page.locator('[data-default-cwd]')).toHaveText(path.join(external,'Writer'));await page.locator('.save-employee').click();await expect(page.locator('.office-panel')).toHaveCount(0)
 await cli('card','create','--title','Reviewer','--group','Existing Build')
 await cli('view','open','team','--name','Existing Build');await page.getByRole('button',{name:'移除 Team',exact:true}).click()
 await expect(page.locator('.workspace-note').filter({hasText:'其中 2 名员工'})).toBeVisible()
 await page.getByRole('button',{name:'确认删除 Team 及全部会话',exact:true}).click();await expect(page.locator('.office-panel')).toHaveCount(0)
 const removed=await cli('session','list')
 ok(!removed.groups.includes('Existing Build')&&!removed.sessions.length&&fs.existsSync(path.join(external,'Writer'))&&fs.existsSync(path.join(external,'keep.md')),'UI confirmation removes a populated Team and employees while retaining their files')
 await page.locator('.add-team').click();await page.locator('[data-mode="work"]').click()
 await page.locator('select[name="team-plugin"]').locator('..').locator('.app-select-trigger').click()
 await expect(page.getByRole('listbox')).toBeVisible();await page.getByRole('option',{name:'MiniNotion'}).click()
 await expect(page.locator('select[name="team-plugin"]')).toHaveValue('mininotion')
 await page.locator('input[name="team-name"]').fill('Bound Work')
 await expect(page.locator('input[name="team-root"]')).toHaveValue(sub);await expect(page.locator('input[name="team-root"]')).not.toBeEditable();assert.equal(await page.locator('[data-team-directory-mode]').count(),0)
 await page.locator('.save-team').click();await expect(page.locator('.office-panel')).toHaveCount(0)
 ok((await cli('session','list')).teamRoots['Bound Work']===sub&&fs.existsSync(path.join(sub,'AGENTS.md')),'Work creation fixes the plugin-owned Team folder and prepares its CLI documentation')
 await page.locator('.add-employee').click();await page.locator('input[name="title"]').fill('Planner');await expect(page.locator('[data-default-cwd]')).toHaveText(path.join(sub,'Planner'));await page.locator('.panel-close').click()
 ok(true,'employee default workspace preview follows the fixed Work Team root')
 await page.screenshot({path:path.join(project,'artifacts/team-lifecycle-0.10.png')})
 ok(!errors.length,'no renderer exceptions: '+errors.join('; '));console.log(`PASS=${n} FAIL=0 — no model calls`)
}catch(error){console.error(error);if(!page.isClosed()){console.error(await page.locator('body').innerText());await page.screenshot({path:path.join(project,'artifacts/team-lifecycle-error.png')})}throw error}
finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
