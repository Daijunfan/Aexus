// Real disposable Core, browser and hidden Electron. All engine/SSH calls use deterministic fixtures.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import os from 'node:os'
import assert from 'node:assert/strict'
import {createHash,randomBytes} from 'node:crypto'
import {createRequire} from 'node:module'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {profileApplication} from './fixtures/profile-application.mjs'
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'artifacts/message-collaboration'),require=createRequire(import.meta.url),built=await profileApplication()
fs.mkdirSync(out,{recursive:true})
async function run(native){
 const mode=native?'desktop':'web',temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-collaboration-ui-'))),cloud=path.join(temp,'cloud'),bin=path.join(temp,'bin')
 fs.mkdirSync(cloud);fs.mkdirSync(bin);fs.writeFileSync(path.join(bin,'ssh'),"#!/usr/bin/env python3\nimport os,sys\nos.execv('/bin/sh',['sh','-c',sys.argv[-1]])\n",{mode:0o755})
 const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve))
 const f=await fixtureCore({PATH:bin+':'+process.env.PATH,...(native?{}:{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)})},path.join(built.directory,'out/main/daemon.js'))
 const rpc=async(cmd,args={})=>{const value=await f.request(null,cmd,args);assert.ok(value.ok,cmd+': '+value.error);return value.data}
 const report={passed:false,mode,checks:[],errors:[],paidModelCalls:0,productionDataUsed:false},pass=text=>{report.checks.push(text);console.log('PASS '+mode+' '+text)};let app,browser,page
 try{
  await rpc('settings.set',{language:'en',viewAppearance:{messages:{theme:'teal'}}});await rpc('group.add',{name:'Editorial'})
  const owner=await f.create('Aster','Editorial'),reader=await f.create('Reader','Editorial'),secretary=await f.create('Mira','Editorial','secretary')
  const source=await rpc('channel.source-add',{plugin:'telegram',targetId:'ui-periodical-'+mode,locator:'periodical-fixture',name:'English periodicals'}),channelId=source.channelId,conversation='channel:'+channelId
  const host=await rpc('host.create',{name:'UI document fixture',host:'fixture',os:'linux',defaultDirectory:cloud})
  await rpc('channel.update',{id:channelId,engine:{kind:'external',location:'remote',name:'Fixture collector',host:'fixture',endpoint:'http://127.0.0.1:5152/api/channels/collector',fileStorage:{hostId:host.id,directory:cloud}}})
  if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:require('electron'),args:[built.directory],env});page=await app.firstWindow()}
  else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
  page.setDefaultTimeout(15000);page.on('pageerror',error=>report.errors.push(error.message));await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.infinite-canvas')).toBeVisible()
  const ui=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args}),dialog=page.locator('.conversation-controls-dialog'),button=name=>dialog.getByRole('button',{name,exact:true}),row=id=>dialog.locator('[data-conversation-member="'+id+'"]'),shot=name=>page.screenshot({path:path.join(out,mode+'-'+name+'.png'),animations:'disabled'})
  await ui('view.open',{kind:'messages',channelId});await page.getByRole('button',{name:'Conversation administration',exact:true}).click()
  for(const card of [owner,reader,secretary]){await dialog.getByRole('combobox',{name:'Choose an Agent member',exact:true}).selectOption(card.id);await button('Add member').click();await expect(row(card.id)).toBeVisible()}
  await row(owner.id).locator('select').selectOption('owner');await button('Confirm').click();await expect(row(owner.id).locator('select')).toHaveValue('owner');await expect(row(owner.id).locator('select')).toBeDisabled()
  await row(reader.id).locator('select').selectOption('admin');await expect(row(reader.id).locator('select')).toHaveValue('admin');await row(reader.id).locator('select').selectOption('member');await expect(row(reader.id)).toContainText('Member');await expect(page.locator('.channel-person')).toContainText('3 members')
  await button('Mute Reader').click();await expect(row(reader.id)).toContainText('Muted');await button('Unmute Reader').click();await expect(row(reader.id)).not.toContainText('Muted');await shot('channel-roles')
  await button('Remove member Mira').click();await button('Confirm').click();await expect(row(secretary.id)).toHaveCount(0)
  await dialog.getByRole('combobox',{name:'Choose an Agent member'}).selectOption(secretary.id);await button('Add member').click();await expect(row(secretary.id)).toContainText('Member')
  pass('Channel membership add/remove, independent Owner/Admin/Member promotion/demotion, Owner protection and speaking controls work through the real GUI APIs.')
  await button('Post counts').click();const ruleRow=id=>dialog.locator('[data-post-rule-employee="'+id+'"]')
  for(const [card,count,prompt] of [[reader,2,'UI_READER_BATCH: summarize these posts.'],[secretary,3,'UI_MIRA_BATCH: extract important vocabulary.']]){
   await ruleRow(card.id).getByRole('button',{name:'Configure',exact:true}).click();await dialog.locator('[name=post-count-threshold]').fill(String(count));await dialog.locator('[name=post-count-prompt]').fill(prompt);await dialog.locator('[name=post-count-enabled]').check();await button('Save count rule').click();await expect(ruleRow(card.id)).toContainText('Every '+count+' new posts')
  }
  await shot('independent-rules');await button('Close conversation administration').click()
  const pdf=Buffer.concat([Buffer.from('%PDF-1.7\n'),randomBytes(530000)]),sha256=createHash('sha256').update(pdf).digest('hex'),file=path.join(cloud,sha256.slice(0,2),sha256);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,pdf)
  const doc={id:'magazine',name:'English issue.pdf',mimeType:'application/pdf',bytes:pdf.length,sha256}
  const post=await rpc('channel.publish',{sourceId:source.id,externalId:'pdf-ui',publishedAt:Date.now(),title:'Magazine issue',body:'An English periodical for reading.',files:[doc]})
  await page.getByRole('button',{name:'Copy English issue.pdf to an Agent workspace',exact:true}).click();const copy=page.getByRole('dialog',{name:'Copy to Agent workspace',exact:true})
  await copy.getByRole('combobox',{name:'Agent member',exact:true}).selectOption(reader.id);await expect(copy.getByRole('combobox',{name:'Destination workspace'})).toHaveValue(conversation);await copy.getByRole('button',{name:'Copy document',exact:true}).click();await expect(copy.getByRole('button',{name:'Copied',exact:true})).toBeVisible({timeout:20000});await shot('download-member-workspace')
  const workspace=await rpc('conversation.workspace',{conversation,employee:reader.id});assert.ok(fs.readFileSync(path.join(workspace.memberPath,doc.name)).equals(pdf));assert.ok(!fs.existsSync(path.join(workspace.root,doc.name)));await copy.getByRole('button',{name:'Close',exact:true}).click()
  pass('Published PDF has an explicit employee/workspace destination; the UI streams exact bytes into the member folder and leaves channel originals unchanged.')
  for(let i=0;i<2;i++)await rpc('channel.publish',{sourceId:source.id,externalId:'more-'+i,publishedAt:Date.now(),title:'More '+i,body:'An additional source post.'})
  await f.until(async()=>{const runs=await rpc('channel.post-trigger-history',{id:channelId});return runs.rows.length===2&&runs.rows.every(row=>row.state==='completed')},'both native fixture batch tasks')
  await expect(page.locator('[data-post-batch]')).toHaveCount(2);await page.getByRole('button',{name:'Conversation administration',exact:true}).click();await button('Post counts').click();await dialog.locator('.conversation-notice-history summary').click();await expect(dialog.locator('.channel-post-history-row')).toHaveCount(2);await dialog.locator('.channel-post-history-row').first().click();await expect(dialog.locator('.channel-post-batch article')).toHaveCount(3);await shot('batch-history')
  await ruleRow(reader.id).getByRole('button',{name:'Pause',exact:true}).click();await expect(ruleRow(reader.id)).toContainText('Paused');await ruleRow(reader.id).getByRole('button',{name:'Edit rule',exact:true}).click();await dialog.locator('[name=post-count-prompt]').fill('Unsaved prompt');await button('Close conversation administration').click();await expect(dialog.locator('.conversation-control-confirm')).toContainText('Discard unsaved');await button('Keep editing').click();await expect(dialog.locator('[name=post-count-prompt]')).toHaveValue('Unsaved prompt');await button('Close conversation administration').click();await button('Discard changes').click();await expect(dialog.locator('.channel-post-rule-editor')).toHaveCount(0)
  await rpc('settings.set',{language:'zh-CN',viewAppearance:{messages:{theme:'midnight'}}});if(native)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(760,900));else await page.setViewportSize({width:390,height:844})
  await expect(dialog.getByRole('button',{name:'帖子计数',exact:true})).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-theme','midnight');await shot('rules-compact-dark');const geometry=await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return {inside:r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,overflow:el.scrollWidth>el.clientWidth+1}});assert.ok(geometry.inside);assert.equal(geometry.overflow,false)
  await dialog.getByRole('button',{name:'关闭会话管理'}).click();await ui('view.open',{kind:'plan'});await expect(page.locator('.plan-view')).toBeVisible();assert.deepEqual(await rpc('schedule.list'),[]);assert.deepEqual(await rpc('schedule.history'),[]);assert.deepEqual(report.errors,[])
  if(app)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
  pass('Counted batches run the intended employees, render explicit provenance and exact source history; pause, dirty-prompt protection, Chinese/dark/compact layouts and empty Plan were verified.')
  report.passed=true
 }catch(error){report.error=error.stack;await page?.screenshot({path:path.join(out,mode+'-failure.png')}).catch(()=>{});throw error}finally{await app?.close();await browser?.close();await f.close();fs.writeFileSync(path.join(out,mode+'-verification.json'),JSON.stringify(report,null,2));fs.rmSync(temp,{recursive:true,force:true})}
}
try{await run(false);if(process.platform!=='linux')await run(true)}finally{built.dispose()}
