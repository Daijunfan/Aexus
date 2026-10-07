import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const f=await fixtureCore({AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port),CLAUDE_CONFIG_DIR:path.join(process.env.TMPDIR||'/tmp','agents-company-no-user-claude')})
const out=path.join(f.root,'.aexus','artifacts','opensource-tests-0.49.0');fs.mkdirSync(out,{recursive:true})
let browser,checks=0;const errors=[]
const pass=label=>{console.log('PASS '+label);checks++}
try{
  const engine=await f.cli('engine','list');assert.deepEqual(engine.map(item=>item.engine).sort(),['claude','cline','codex','pi'])
  await f.cli('group','add','Engineering');await f.cli('group','add','Research')
  const governor=await f.create('Governor','Engineering','governor'),worker=await f.create('Builder','Engineering')
  const url='http://127.0.0.1:'+port,token=fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim()
  browser=await chromium.launch({...(process.env.AGENTS_BROWSER_CHANNEL?{channel:process.env.AGENTS_BROWSER_CHANNEL}:process.platform==='darwin'?{channel:'chrome'}:{}),headless:true})
  const context=await browser.newContext({viewport:{width:1540,height:1050}}),page=await context.newPage()
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')console.log('BROWSER',message.text())})
  await page.goto(url);await page.locator('.web-login input').fill(token);await page.getByRole('button',{name:'Enter workspace'}).click()
  await expect(page.locator('.infinite-canvas')).toBeVisible();await expect(page.locator('.employee')).toHaveCount(2)
  await expect(page.locator('.web-login-overlay')).toHaveCount(0);pass('real browser renders existing office after authenticated login')
  assert.equal(await page.evaluate(()=>localStorage.getItem('agents-company-token')),null)
  const client=await page.evaluate(()=>sessionStorage.getItem('agents-company-client'));assert.ok(client)
  await page.screenshot({path:path.join(out,'web-office.png')})
  const rpc=(cmd,args)=>page.evaluate(([cmd,args])=>window.agents.call(cmd,args),[cmd,args])
  const views=await rpc('team-view.create',{name:'Focus Engineering',teams:['Engineering']})
  await expect(page.locator('[data-department="Research"]')).toHaveCount(0)
  const second=await context.newPage();await second.goto(url);await expect(second.locator('.infinite-canvas')).toBeVisible();await expect(second.locator('[data-department="Research"]')).toHaveCount(1);pass('second browser tab keeps an independent active Team view')
  await rpc('team-view.select',{id:'all'})
  await rpc('view.open',{kind:'conversation',employee:worker.id})
  await expect(page.locator('.conversation-dialog')).toBeVisible()
  await page.locator('.composer-box textarea').fill('Please report a fixture reply')
  await page.locator('.send-btn[title="Send message"]').click()
  await expect(page.locator('.transcript')).toContainText('VISIBLE_REPLY',{timeout:20000})
  assert.ok(!(await page.locator('.transcript').innerText()).includes('PRIVATE_INIT'));pass('browser chat uses the shared driver and keeps initialization private')
  await rpc('view.close')
  const incoming=await rpc('transfer.upload-begin',{to:{employee:worker.id,path:'.'},name:'browser-import.txt',bytes:5})
  await rpc('transfer.upload-chunk',{id:incoming.id,offset:0,data:'aGVsbG8='});await rpc('transfer.upload-commit',{id:incoming.id})
  assert.equal(fs.readFileSync(path.join(worker.cwd,'browser-import.txt'),'utf8'),'hello');pass('browser file upload goes to the selected backend workspace')
  await f.cli('group','add','Web Knowledge','--mode','work','--plugin','mininotion')
  const notionCall=(method,params={},scope=[])=>f.cli('plugin','call','mininotion',method,...scope,'--params',JSON.stringify(params))
  const notionPage=await notionCall('page.create',{title:'CLI-created Web knowledge',color:'white'},['--team','Web Knowledge'])
  const notionLocation=await notionCall('fs.path',{pageId:notionPage.id},['--team','Web Knowledge'])
  for(const id of ['cloud-hosts','mininotion','margin-reader']){
    await page.locator(`.plugin-directory [data-plugin="${id}"]`).click()
    const win=page.locator('.web-plugin-window').last();await expect(win).toBeVisible({timeout:25000})
    const frame=win.frameLocator('iframe');await expect(frame.locator('body')).not.toBeEmpty({timeout:25000})
    const frameHandle=await win.locator('iframe').elementHandle(),content=await frameHandle.contentFrame()
    const ready={
      'cloud-hosts':'#detail .view-tabs',mininotion:'.app-shell','margin-reader':'#library-view'
    }[id]
    await expect(content.locator(ready)).toBeVisible({timeout:25000})
    if(id==='mininotion'){
      assert.equal((await notionCall('fs.info')).root,path.join(f.env.AGENTS_COMPANY_WORKSPACES,'mini-notion-workspace'))
      await notionCall('page.open',{pageId:notionPage.id})
      await expect(content.getByRole('textbox',{name:'页面标题',exact:true})).toHaveValue(notionPage.title)
      await content.getByRole('textbox',{name:'页面标题',exact:true}).fill('Browser and CLI share the same page')
      await expect.poll(async()=>(await notionCall('page.get',{pageId:notionPage.id},['--team','Web Knowledge'])).title).toBe('Browser and CLI share the same page')
      assert.equal((await notionCall('fs.path',{pageId:notionPage.id})).absolutePath,notionLocation.absolutePath)
      const db=await notionCall('database.create',{parentId:notionPage.id,title:'Browser board',color:'white',view:'board'},['--team','Web Knowledge'])
      await notionCall('record.create',{databaseId:db.id,title:'CLI-created browser task',color:'white',values:{status:'进行中'}},['--team','Web Knowledge'])
      await notionCall('page.open',{pageId:db.id})
      await expect(content.locator('.database')).toContainText('CLI-created browser task')
      pass('MiniNotion authenticated Web edits, Team CLI and default collection share page files and board records')
    }
    const body=await content.locator('body').innerText();assert.ok(body.length>20,id+' content missing: '+body)
    console.log('PLUGIN',id,body.slice(0,160))
    await page.screenshot({path:path.join(out,'web-plugin-'+id+'.png')})
    await win.locator('header button').last().click();await expect(win).toHaveCount(0,{timeout:20000});pass(id+' loads in an isolated iframe and acknowledges save before close')
  }
  await rpc('view.open',{kind:'settings'});await expect(page.getByRole('dialog',{name:'Application settings'})).toBeVisible()
  const engines=page.locator('.settings-engines');if(!await engines.evaluate(el=>el.open))await engines.locator(':scope > summary').click();
  for(const id of ['codex','claude','cline','pi'])await expect(page.locator(`[data-engine-health="${id}"]`)).toBeVisible()
  await page.screenshot({path:path.join(out,'web-engine-settings.png')});pass('engine detection/configuration/install UI is available in the same settings page')
  await page.getByRole('button',{name:'Close settings',exact:true}).click()
  const choose=page.evaluate(()=>window.agents.call('workspace.choose',{}));await expect(page.getByRole('dialog',{name:'Choose a Core-host folder'})).toBeVisible();await page.getByRole('dialog',{name:'Choose a Core-host folder'}).getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await choose).path,null);pass('folder chooser explicitly browses Core-host paths')
  assert.deepEqual(errors,[])
  console.log(`WEB UI: ${checks} checks passed; screenshots in ${out}`)
}finally{await browser?.close();await f.close()}
