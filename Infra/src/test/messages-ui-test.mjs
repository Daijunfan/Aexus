import {createReady,readyEmployee,acceptedMessage} from './fixtures/ui-contracts.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {_electron as electron,expect} from '@playwright/test'
const root=path.resolve(import.meta.dirname,'../../..'),require=createRequire(import.meta.url),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-messages-ui-'))),control=path.join(temp,'fixture'),output=path.join(root,'.aexus/artifacts/company-messages')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'');fs.mkdirSync(output,{recursive:true})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000',CODEX_BIN:path.join(root,'Infra/src/test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control,CLINE_BIN:path.join(root,'Infra/src/test/fixtures/process-adapter.cjs')}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_WEB_URL'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[]
page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message))
const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='
const composer=page.locator('.composer textarea')

try{
 await page.locator('.infinite-canvas').waitFor();await call('settings.set',{theme:'white'})
 await call('group.add',{name:'Product Studio'});await call('group.add',{name:'Engineering'})
 const people=[]
 for(const [title,group,avatar,profession] of [['Aster','Product Studio','fate-saber-chibi','Product designer'],['Rowan','Engineering','byte','Software engineer'],['Nova','Product Studio','fate-gilgamesh-chibi','Research analyst'],['Mira','Engineering','marmalade','Code reviewer']])people.push(await createReady(call,{title,group,avatar,profession,engine:'codex',model:'gpt-6-luna'}))
 const [aster,rowan,nova]=people
 for(const [card,text,reply] of [[rowan,'How is the new workspace coming along?','The navigation is ready. I am checking the smaller screen layouts next.'],[nova,'Review the product notes.','I found three opportunities to simplify the onboarding. The notes are ready for you.'],[aster,'Let’s make the workspace feel a little more human.','Absolutely. I put together a calmer direction for the workspace.\n\n**A little more space. A lot more focus.**\n\nThe conversation stays at the center, with clear typography and a quieter background. Your employees keep their own character, and everything you already built stays connected.\n\nShall I refine the small-screen layout next?']]){
  fs.writeFileSync(path.join(control,card.id+'.reply.txt'),reply);await call('session.send',{employee:card.id,text});await expect.poll(async()=>(await call('session.status',{employee:card.id}))[0].busy).toBe(false)
 }
 const records=await call('session.list'),refs=records.sessions.map(c=>({id:c.id,cwd:c.cwd,engine:c.engine,threadId:c.threadId}))
 await page.getByRole('button',{name:'Messages',exact:true}).click();await expect(page.locator('.message-contact')).toHaveCount(4)
 await expect(page.locator('.message-welcome')).toContainText('Good work starts');await page.screenshot({animations:'disabled',path:path.join(output,'messages-welcome.png')})
 assert.deepEqual(await call('terminal.list'),[],'Messages home never opens a terminal')
 await page.getByRole('button',{name:'Message Aster',exact:true}).click();await expect(page.locator('.message-thread-header')).toContainText('Aster');await expect(composer).toBeEnabled();await expect(page.locator('.transcript')).toContainText('A lot more focus.')
 await expect(page.locator('.message-thread-header')).toContainText('Aster');assert.equal((await call('terminal.list')).length,0,'opening a direct message never starts a terminal')
 await expect(page.locator('.message-unread-dot')).toHaveCount(3)
 await page.getByRole('button',{name:'Search conversation',exact:true}).click();const find=page.getByRole('textbox',{name:'Find in conversation'});await find.fill('workspace');await expect(page.locator('.conversation-search [role=status]')).toHaveText('1 of 2')
 await find.press('Enter');await expect(page.locator('.conversation-search [role=status]')).toHaveText('2 of 2');await expect(page.locator('.turn.assistant[data-search-match=true]')).toBeVisible();await find.fill('missing-word-123');await expect(page.locator('.conversation-search [role=status]')).toHaveText('No results')
 await find.press('Escape');await expect(page.locator('.conversation-search')).toHaveCount(0);await expect(page.locator('.message-thread-header')).toContainText('Aster');await expect(page.getByRole('button',{name:'Latest messages',exact:true})).toHaveCount(0)
 await page.keyboard.press('Meta+f');await expect(find).toBeFocused();await page.getByRole('button',{name:'Close conversation search'}).click()
 await page.keyboard.press('Meta+k');await expect(page.getByRole('textbox',{name:'Search conversations'})).toBeFocused()
 // Exercise the renderer clipboard contract without replacing the user's clipboard.
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.testCopiedMessage=text}}}))
 const assistant=page.locator('.turn.assistant').last();await assistant.hover();await assistant.getByRole('button',{name:'Copy message',exact:true}).click();await expect(assistant.locator('[role=status]')).toHaveText('Copied')
 assert.ok((await page.evaluate(()=>window.testCopiedMessage)).includes('A lot more focus.'))
 await assistant.getByRole('button',{name:'Reply to message',exact:true}).click();await expect(page.getByRole('region',{name:'Conversation with Aster'}).getByLabel('Reply preview')).toContainText('Absolutely');await expect(composer).toHaveValue('');await expect(composer).toBeFocused();await page.getByRole('button',{name:'Cancel reply',exact:true}).click()
 await expect(page.locator('.message-date')).toContainText('Today')
 await composer.evaluate(el=>el.blur());await page.mouse.move(320,100)
 for(const theme of ['white','black']){await call('settings.set',{theme,viewAppearance:{company:{theme},messages:{theme},plan:{theme}}});await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({animations:'disabled',path:path.join(output,'messages-'+theme+'.png')})}
 await call('settings.set',{theme:'white'})
 await composer.fill('Aster draft stays here');await page.getByRole('button',{name:'Message Rowan',exact:true}).click();await expect(page.locator('.message-thread-header')).toContainText('Rowan');await expect(composer).toHaveValue('')
 await composer.fill('Rowan draft stays here');await page.getByRole('button',{name:'Message Aster',exact:true}).click();await expect(page.locator('.message-thread-header')).toContainText('Aster');await expect(composer).toHaveValue('Aster draft stays here')
 await page.getByRole('textbox',{name:'Search conversations'}).fill('Engineering');await expect(page.locator('.message-contact')).toHaveCount(2)
 await page.getByRole('button',{name:'Clear search'}).click();await expect(page.locator('.message-contact')).toHaveCount(4)
 await expect(page.locator('.message-contact[data-unread=true]')).toHaveCount(3);await expect(page.getByRole('tab',{name:'All',exact:true})).toHaveCount(0)
 await page.getByRole('button',{name:'Conversation settings',exact:true}).click();await expect(page.locator('.session-settings')).toBeVisible();await expect(page.locator('.session-settings')).toContainText('Reasoning')
 await page.getByRole('button',{name:'Conversation settings',exact:true}).click();await expect(page.locator('.session-settings')).toBeHidden()
 await page.getByRole('button',{name:'Employee details',exact:true}).click();await expect(page.getByRole('dialog',{name:'Employee information'})).toContainText('Product designer');await page.keyboard.press('Escape');await expect(page.locator('.message-profile')).toHaveCount(0)
 await composer.fill('A new message from the messenger');await composer.press('Enter');await expect.poll(async()=>(await call('session.status',{employee:aster.id}))[0].busy).toBe(false)
 await expect(page.locator('.transcript')).toContainText('A new message from the messenger')
 assert.ok((await call('session.transcript',{id:aster.id})).text.includes('A new message from the messenger'))
 await call('engine.configure',{engine:'cline',patch:{apiKey:'fixture-only-not-real'}})
 const cline=await createReady(call,{title:'Cline QA',group:'Engineering',engine:'cline',avatar:'hoots',model:'deepseek-flash'})
 await expect(page.locator('.message-contact')).toHaveCount(5);await page.getByRole('button',{name:'Message Cline QA',exact:true}).click();await expect(page.locator('.message-thread-header')).toContainText('Cline QA');await expect(composer).toBeEnabled()
 await composer.evaluate((element,base64)=>{const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],'screen.png',{type:'image/png'}));element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}))},png)
 await expect(page.locator('.attachment-chips button')).toHaveCount(1);await composer.fill('Inspect the screenshot');await composer.press('Enter')
 await expect(page.locator('.transcript')).toContainText('IMAGE_RECEIVED 1');await expect(page.locator('.transcript .message-photo img')).toBeVisible()
 await page.locator('.transcript .message-photo').click();const gallery=page.getByRole('dialog',{name:'Image preview'});await expect(gallery).toBeVisible();await gallery.getByRole('button',{name:'Zoom in',exact:true}).click();await expect(gallery.getByRole('status',{name:'Zoom level'})).toHaveText('150%');await page.keyboard.press(process.platform==='darwin'?'Meta+=':'Control+=');await expect(gallery.getByRole('status',{name:'Zoom level'})).toHaveText('200%');assert.equal((await call('settings.get')).pageZoom,1);await gallery.getByRole('button',{name:'Fit image',exact:true}).click();await expect(gallery.getByRole('status',{name:'Zoom level'})).toHaveText('100%');await page.getByRole('button',{name:'Close image preview'}).click();await expect(gallery).toHaveCount(0);await expect(page.locator('.transcript .message-photo')).toBeFocused()
 await composer.fill('WRITE_FIXTURE');await composer.press('Enter');await expect(page.locator('.approval')).toBeVisible();await page.getByRole('button',{name:'Allow once',exact:true}).click();await expect(page.locator('.approval')).toHaveCount(0)
 assert.equal(fs.readFileSync(path.join(cline.cwd,'approval.txt'),'utf8'),'approved')
 // Finish an image read after changing recipients; it must stay in its original draft.
 await page.evaluate(()=>{window.messageTestRead=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=async function(){const read=window.messageTestRead;await new Promise(resolve=>setTimeout(resolve,450));return read.call(this)}})
 await composer.evaluate((element,base64)=>{const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],'delayed.png',{type:'image/png'}));element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}))},png)
 await page.getByRole('button',{name:'Message Rowan',exact:true}).click();await expect(page.locator('.message-thread-header')).toContainText('Rowan')
 await expect.poll(()=>fs.readdirSync(path.join(cline.cwd,'.agents-attachments')).length).toBe(2)
 await expect(page.locator('.attachment-chips button')).toHaveCount(0);assert.equal(fs.existsSync(path.join(rowan.cwd,'.agents-attachments')),false)
 await page.evaluate(()=>{Blob.prototype.arrayBuffer=window.messageTestRead;delete window.messageTestRead})
 await page.getByRole('button',{name:'Message Cline QA',exact:true}).click();await expect(page.locator('.message-thread-header')).toContainText('Cline QA')
 await expect(page.locator('.attachment-chips button')).toHaveCount(1);await page.locator('.attachment-chips button').click()

 await page.getByRole('button',{name:'Message Aster',exact:true}).click();await expect(page.locator('.message-thread-header')).toContainText('Aster');await expect(composer).toBeEnabled()
 fs.writeFileSync(path.join(control,aster.id+'.hold-user'),'');await composer.fill('Hold this work');await composer.press('Enter');await expect(page.getByRole('button',{name:'■ Stop',exact:true})).toBeVisible()
 await composer.fill('Follow up after this');await page.getByRole('button',{name:'Queue',exact:true}).click();await expect(page.locator('.pending-messages')).toContainText('Follow up after this')
 await page.getByRole('button',{name:'Cancel queued message',exact:true}).click();await expect(page.locator('.pending-messages')).toHaveCount(0)
 await page.getByRole('button',{name:'■ Stop',exact:true}).click();await expect.poll(async()=>(await call('session.status',{employee:aster.id}))[0].busy).toBe(false)
 const nativeBefore=(await call('session.status',{employee:aster.id}))[0].threadId
 await page.getByRole('button',{name:'Open workspace',exact:true}).click();await expect(page.locator('.employee-workbench')).toBeVisible();await expect(page.locator('.transcript')).toContainText('A new message from the messenger')
 await call('view.close');await expect(page.locator('.message-view')).toBeVisible();assert.equal((await call('session.status',{employee:aster.id}))[0].threadId,nativeBefore)
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(720,900))
 await expect(page.locator('.message-back')).toBeVisible();await expect(page.locator('.message-sidebar')).toBeHidden();await page.screenshot({animations:'disabled',path:path.join(output,'messages-compact.png')})
 await page.getByRole('button',{name:'Back to conversations',exact:true}).click();await expect(page.locator('.message-sidebar')).toBeVisible();await expect(page.locator('.message-stage')).toBeHidden()
 for(const width of [540,720,1024,1440]){await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,1000),width);const fit=await page.locator('.company-header').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert.ok(fit.scroll<=fit.width,'header does not overflow at '+width)}
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,1000))
 await page.getByRole('button',{name:'Company Views',exact:true}).click();await expect(page.locator('.company-view-menu')).toHaveCount(0)
 await expect(page.locator('.infinite-canvas')).toBeVisible();await expect(page.locator('.message-view')).toHaveCount(0)
 await page.getByRole('button',{name:'Messages',exact:true}).click();await page.getByRole('button',{name:'Message Cline QA',exact:true}).click();await expect(page.locator('.message-thread-header')).toContainText('Cline QA');await expect(composer).toBeEnabled()
 await call('card.remove',{id:cline.id});await expect(page.locator('.message-contact')).toHaveCount(4);await expect(page.locator('.message-welcome')).toBeVisible()
 const after=await call('session.list');assert.deepEqual(after.sessions.map(c=>({id:c.id,cwd:c.cwd,engine:c.engine,threadId:c.threadId})),refs)
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 console.log('PASS Messages UI: original histories, one row per employee, scoped drafts, search/unread, real send/queue/stop/approval/photos, no automatic terminals, workspace roundtrip, responsive layouts and unchanged native identities')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
