// Actual browser controls, isolated Core, real uploaded bytes and independent filesystem readback.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {chromium,_electron as electron,expect} from '@playwright/test'
const native=process.argv.includes('--desktop'),require=createRequire(import.meta.url)
import {fixtureCore} from './fixtures/headless-core.mjs'
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const f=await fixtureCore(native?{}:{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)}),out=path.resolve(process.env.AGENTS_COMPANY_TEST_ARTIFACTS||path.join(f.root,'artifacts/conversation-workspaces')),checks=[],errors=[]
fs.mkdirSync(out,{recursive:true})
let browser,app,page
const rpc=async(cmd,args={})=>{const value=await f.request(null,cmd,args);assert.ok(value.ok,value.error);return value.data}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=','base64')
try{
 await rpc('settings.set',{language:'en',theme:'white'});await f.cli('group','add','Product');await f.cli('group','add','Engineering')
 const a=await f.create('Alice','Product','manager'),b=await f.create('Bob','Engineering'),channel=await rpc('channel.create',{name:'Research channel',engine:{kind:'employees',employeeIds:[a.id,b.id]}})
 if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE;if(process.env.AGENTS_COMPANY_TEST_APP)delete env.AGENTS_COMPANY_BUILTIN_PLUGINS;app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[f.root],env});page=await app.firstWindow()}
 else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
 page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));await expect(page.locator('.infinite-canvas')).toBeVisible()
 for(const width of native?[1440,1000,720]:[1440,1000,720,400]){
  await page.setViewportSize({width,height:1000});const buttons=page.locator('.company-actions button');await expect(buttons).toHaveCount(2)
  assert.ok((await buttons.allTextContents()).every((text,index)=>text.includes(index?'Add Employee':'Add Team')))
  assert.ok(await buttons.evaluateAll((nodes,width)=>nodes.every(node=>{const box=node.getBoundingClientRect();return box.left>=0&&box.right<=width}),width))
  assert.ok(await buttons.evaluateAll(nodes=>nodes.every(node=>parseFloat(getComputedStyle(node).fontSize)>0&&node.scrollWidth<=node.clientWidth+1)))
  await page.screenshot({path:path.join(out,'company-header-'+width+'.png'),animations:'disabled'})
 }
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Messages',exact:true}).click();await expect(page.locator('.company-actions')).toHaveCount(0)
 await page.getByRole('button',{name:'Plan',exact:true}).click();await expect(page.locator('.plan-view')).toBeVisible();await expect(page.locator('.company-actions')).toHaveCount(0)
 await page.getByRole('button',{name:'Messages',exact:true}).click();await page.getByRole('button',{name:'New group',exact:true}).click()
 let dialog=page.getByRole('dialog',{name:'New group',exact:true});await dialog.locator('[name=chat-team]').selectOption('Product');await dialog.locator('.group-member-options label').filter({hasText:'Bob'}).getByRole('checkbox').check();await dialog.locator('[name=chat-name]').fill('Release room');await dialog.getByRole('button',{name:'Create group',exact:true}).click()
 const group=(await rpc('chat.list')).find(value=>value.name==='Release room'),ref='group:'+group.id,channelRef='channel:'+channel.id
 checks.push('Company alone has two labelled creation buttons at desktop, 1000px, 720px and 400px; Messages/Plan do not render them; existing New group still works')
 for(const title of ['Alice','Release room','Research channel']){await page.getByRole('button',{name:'Actions for '+title,exact:true}).click();await page.getByRole('menuitem',{name:'Archive conversation',exact:true}).click()}
 await page.getByRole('button',{name:'Archived chats',exact:true}).click();await expect(page.locator('.message-archive-heading')).toContainText('3')
 for(const title of ['Alice','Release room','Research channel'])await expect(page.getByRole('button',{name:'Restore '+title,exact:true})).toBeVisible()
 await page.screenshot({path:path.join(out,'archive-unified.png'),animations:'disabled'})
 for(const title of ['Alice','Release room','Research channel'])await page.getByRole('button',{name:'Restore '+title,exact:true}).click()
 await expect(page.locator('.message-restore-conversation')).toHaveCount(0);await expect(page.locator('.message-archive-entry,.message-archive-heading')).toHaveCount(0)
 for(const key of ['employee:'+a.id,ref,channelRef])assert.equal((await rpc('messenger.state')).conversations[key].archived,false)
 checks.push('Private employee, group and channel are archived using their real menus, appear together in Archived chats, and restore individually to the same inbox')
 await page.getByRole('button',{name:'Open group Release room',exact:true}).click()
 const input=page.locator('.group-conversation').getByRole('textbox',{name:'Group message',exact:true})
 await page.locator('.group-conversation input[type=file]').setInputFiles([{name:'diagram.png',mimeType:'image/png',buffer:png},{name:'reference.png',mimeType:'image/png',buffer:png},{name:'requirements.txt',mimeType:'text/plain',buffer:Buffer.from('User original requirements.')},{name:'context.md',mimeType:'text/markdown',buffer:Buffer.from('# User context')}])
 await expect.poll(async()=>Object.values((await rpc('messenger.state')).drafts).find(draft=>draft.images?.length===2&&draft.files?.length===2)?.files.length).toBe(2)
 await input.fill('Read all four uploaded files, then prepare a review.');await page.getByRole('button',{name:'Send group message',exact:true}).click();await expect(input).toHaveValue('')
 await expect(page.locator('.group-message')).toHaveCount(1)
 const settled=()=>f.until(async()=>{const history=await rpc('chat.history',{id:group.id});return history.messages.every(message=>message.deliveries.every(delivery=>delivery.status==='completed'))},'shared work completed')
 await settled();const published=(await rpc('chat.history',{id:group.id})).messages[0];assert.equal(published.attachments.length,4)
 await page.locator('.group-message .message-photo').first().click();await expect(page.locator('.message-image-dialog')).toBeVisible();await expect.poll(()=>page.locator('.message-image-viewport img').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);if(native)await page.getByRole('button',{name:'Close image preview',exact:true}).click();else await page.keyboard.press('Escape');await expect(page.locator('.message-image-dialog')).toHaveCount(0)
 await page.locator('.group-conversation .message-thread-header').getByRole('button',{name:'Shared workspace',exact:true}).click();dialog=page.getByRole('dialog',{name:'Shared workspace',exact:true})
 await expect(dialog.locator('.file-row[data-file="requirements.txt"]')).toBeVisible();await expect(dialog.locator('.file-row[data-file="Alice"]')).toBeVisible();await expect(dialog.locator('.file-row[data-file="Bob"]')).toBeVisible()
 await page.screenshot({path:path.join(out,'group-shared-root.png'),animations:'disabled'})
 const wa=await rpc('conversation.workspace',{conversation:ref,employee:a.id})
 await dialog.getByRole('combobox',{name:'Shared workspace folder',exact:true}).selectOption(wa.memberDirectory)
 await dialog.getByRole('button',{name:'＋ File',exact:true}).click();await dialog.locator('.file-list input').fill('review.md');await dialog.locator('.file-list input').press('Enter')
 const output=dialog.locator('.file-row[data-file="'+wa.memberDirectory+'/review.md"]');await expect(output).toBeVisible();await output.locator('.file-open').click();await dialog.locator('textarea').fill('# Review\nThe originals remain unchanged.')
 await dialog.getByRole('button',{name:'Close shared workspace',exact:true}).click();await expect(dialog).toHaveCount(0)
 assert.equal((await rpc('conversation.file',{conversation:ref,operation:'read',path:wa.memberDirectory+'/review.md'})).content,'# Review\nThe originals remain unchanged.')
 assert.equal(fs.readFileSync(path.join(wa.root,'requirements.txt'),'utf8'),'User original requirements.')
 for(const employee of [a,b]){const items=(await rpc('session.transcript',{employee:employee.id})).items.filter(item=>item.role==='user');assert.ok(items[0].text.includes('Read all four uploaded files'));assert.ok(items[0].text.includes('requirements.txt'));assert.equal(items[0].images?.length??0,0);assert.equal(items[0].files?.length??0,0)}
 checks.push('Four attachments uploaded through the actual group composer remain at the shared root; images preview; UI creates/edits Alice/review.md; native/private delivery contains text only')
 await page.getByRole('button',{name:'Message Alice',exact:true}).click();await page.getByRole('button',{name:'Open workspace',exact:true}).click();await expect(page.getByRole('combobox',{name:'Employee work folder',exact:true})).toBeVisible()
 await page.getByRole('combobox',{name:'Employee work folder',exact:true}).selectOption(ref);await expect(page.locator('.employee-workbench .file-row[data-file="'+wa.memberDirectory+'/review.md"]')).toBeVisible()
 await page.screenshot({path:path.join(out,'employee-shared-selection.png'),animations:'disabled'})
 await page.getByRole('combobox',{name:'Employee work folder',exact:true}).selectOption('');assert.equal((await rpc('session.list')).sessions.find(employee=>employee.id===a.id).cwd,a.cwd)
 checks.push('Company employee workbench switches between original personal files and the same group member folder without changing the employee workspace or native identity')
 await page.getByRole('button',{name:'Messages',exact:true}).click();await page.getByRole('button',{name:'Open channel Research channel',exact:true}).click()
 const composer=page.locator('.channel-composer');await composer.locator('input[type=file]').setInputFiles([{name:'channel-image.png',mimeType:'image/png',buffer:png},{name:'channel-note.txt',mimeType:'text/plain',buffer:Buffer.from('Persistent user channel file')}])
 await expect.poll(async()=>{const draft=(await rpc('messenger.state')).drafts[channelRef];return !!draft?.images?.length&&!!draft?.files?.length}).toBe(true)
 await composer.getByRole('textbox',{name:'Channel message',exact:true}).fill('Please review the channel files.');await composer.getByRole('button',{name:'Send channel message',exact:true}).click();await expect(composer.getByRole('textbox',{name:'Channel message',exact:true})).toHaveValue('')
 await expect(page.locator('.channel-discussion-message')).toHaveCount(1);await expect(page.locator('.channel-discussion-message .message-photo')).toBeVisible();await expect(page.locator('.channel-discussion-message')).toContainText('channel-note.txt')
 await page.locator('.channel-conversation .message-thread-header').getByRole('button',{name:'Shared workspace',exact:true}).click();dialog=page.getByRole('dialog',{name:'Shared workspace',exact:true});await expect(dialog.locator('.file-row[data-file="channel-note.txt"]')).toBeVisible();await page.screenshot({path:path.join(out,'channel-shared-root.png'),animations:'disabled'});await dialog.getByRole('button',{name:'Close shared workspace',exact:true}).click()
 await page.setViewportSize({width:720,height:900});await page.screenshot({path:path.join(out,'channel-attachments-compact.png'),animations:'disabled'})
 assert.equal((await rpc('channel.history',{id:channel.id})).messages[0].attachments.length,2);assert.deepEqual(errors,[])
 checks.push('Channel composer uploads a mixed image/file message, renders both, and opens the persistent named channel folder; compact view has no renderer exceptions')
 fs.writeFileSync(path.join(out,'ui-scenarios.json'),JSON.stringify({passed:true,checks,rendererErrors:errors,modelCalls:0,scope:native?'Actual hidden desktop executable with temporary Core state and deterministic native fixture':'Temporary real Core and headless browser, no production data'},null,2));console.log('PASS '+checks.join('\nPASS '))
}catch(error){await page?.screenshot({path:path.join(out,'ui-failure.png'),animations:'disabled'}).catch(()=>{});throw error}finally{await app?.close();await browser?.close();await f.close()}
