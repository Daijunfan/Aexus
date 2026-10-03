import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {_electron as electron,expect} from '@playwright/test'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-groups-ui-'))),control=path.join(temp,'fixture'),output=path.join(root,'artifacts/group-chat')
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'');fs.mkdirSync(output,{recursive:true})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000',CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control}
for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_WEB_URL'].includes(key))delete env[key]
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env}),page=await app.firstWindow(),errors=[]
page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message))
const call=(cmd,args={})=>page.evaluate(({cmd,args})=>window.agents.call(cmd,args),{cmd,args})
const as=async(token,...args)=>{const result=JSON.parse((await promisify(execFile)(process.execPath,[root+'/bin/agents',...args,'--json'],{env:{...env,AGENTS_COMPANY_TOKEN:token},timeout:20000})).stdout);assert.ok(result.ok,result.error);return result.data}
const status=async id=>(await call('session.status',{employee:id}))[0]
const company=page.getByRole('button',{name:'Company Views',exact:true}),messages=page.getByRole('button',{name:'Messages',exact:true}),composer=page.getByRole('textbox',{name:'Group message'})
let restore=false
try{
 await page.locator('.infinite-canvas').waitFor();await call('settings.set',{theme:'white'})
 await call('group.add',{name:'Studio'});await call('group.add',{name:'Engineering'})
 const a=await call('card.create',{title:'Aster',group:'Studio',engine:'codex',model:'gpt-6-luna',avatar:'fate-saber-chibi'}),b=await call('card.create',{title:'Byte',group:'Studio',engine:'codex',model:'gpt-6-luna',avatar:'byte'}),c=await call('card.create',{title:'Mira',group:'Engineering',engine:'codex',model:'gpt-6-luna',avatar:'marmalade'})
 await expect.poll(async()=>(await call('session.status')).every(item=>item.initialization?.status==='ready')).toBe(true)
 fs.writeFileSync(path.join(control,a.id+'.reply.txt'),'Private details stay here.\n\nReady for review.')
 await call('session.send',{employee:a.id,text:'Private initial task'});await expect.poll(async()=>(await status(a.id)).busy).toBe(false)
 const firstReply=(await status(a.id)).lastReply,originalThread=(await call('session.list')).sessions.find(card=>card.id===a.id).threadId
 await messages.click();await expect(page.locator('.message-view')).toBeVisible();await company.click()
 await expect(page.locator('.infinite-canvas')).toBeVisible();await expect(page.locator('.company-view-menu')).toHaveCount(0);assert.equal((await call('team-view.list')).activeId,'all')
 await company.click();await expect(page.locator('.company-view-menu')).toBeVisible();await page.keyboard.press('Escape')
 const custom=await call('team-view.create',{name:'Engineering view',teams:['Engineering']})
 await expect(company).toHaveAttribute('title','Company Views · Engineering view');await company.click();await expect.poll(async()=>(await call('team-view.list')).activeId).toBe('all');await expect(page.locator('.company-view-menu')).toHaveCount(0)
 await company.click();await page.getByRole('menuitemradio',{name:/Engineering view/}).click();await expect.poll(async()=>(await call('team-view.list')).activeId).toBe(custom.id)
 for(const width of [1440,720]){await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,1000),width);const styles=await page.locator('.app-view-button').evaluateAll(nodes=>nodes.map(node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return [r.width,r.height,s.borderRadius,s.fontSize,s.fontWeight]}));assert.equal(styles.length,3);assert.deepEqual(styles[0],styles[2]);assert.deepEqual(styles[0],styles[1],'top-level buttons share identical bounds and typography; disclosure space is internal')}
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,1000));await messages.click()
 await expect(page.getByRole('tablist',{name:'Conversation categories'}).getByRole('tab')).toHaveCount(0)
 await expect(page.getByRole('tab',{name:'All',exact:true})).toHaveCount(0)
 const newGroup=page.getByRole('button',{name:'New group',exact:true});await expect(newGroup).toBeVisible();await expect(newGroup).toHaveText('New group')
 assert.ok((await newGroup.boundingBox()).width>50,'creation remains a visible labelled action')
 await newGroup.click();const editor=page.getByRole('dialog',{name:'New group',exact:true})
 await editor.locator('select[name=chat-team]').selectOption('Studio');await expect(editor.locator('input[type=checkbox]:checked')).toHaveCount(2)
 await editor.locator('label').filter({hasText:'Mira'}).locator('input[type=checkbox]').check();await editor.locator('input[name=chat-name]').fill('Launch room')
 await editor.getByRole('button',{name:'Create group',exact:true}).click();await expect(page.locator('.group-conversation')).toContainText('Launch room');await expect(page.locator('.group-title')).toContainText('3 members')
 const createdGroup=(await call('chat.list'))[0];await call('messenger.folder-save',{name:'Inbox',include:'private',conversations:['group:'+createdGroup.id]});await call('messenger.folder-save',{name:'Groups',conversations:['group:'+createdGroup.id]});await page.getByRole('tab',{name:'Groups',exact:true}).click();await expect(page.locator('.message-contact')).toHaveCount(1);await page.getByRole('tab',{name:'Inbox',exact:true}).click()
 const group=(await call('chat.list'))[0];assert.deepEqual(new Set(group.memberIds),new Set([a.id,b.id,c.id]));assert.deepEqual(await call('terminal.list'),[])
 await composer.fill('@As');await page.getByRole('option',{name:/Aster/}).click();await expect(page.locator('.group-recipient-chips')).toContainText('@Aster')
 await composer.fill('Inspect the release checklist.');await composer.press('Enter');await expect(page.locator('.group-message')).toHaveCount(1)
 await expect.poll(async()=>(await status(a.id)).busy).toBe(false);await page.locator('.group-message.from-user .message-receipt').first().click();await expect(page.getByRole('dialog',{name:'Message delivery details'}).locator('[data-task-state=completed]')).toHaveCount(3);await page.keyboard.press('Escape')
 assert.ok((await call('session.transcript',{id:a.id})).text.includes('Inspect the release checklist.'));assert.ok(!(await call('session.transcript',{id:b.id})).text.includes('Inspect the release checklist.'))
 assert.equal((await call('session.list')).sessions.find(card=>card.id===a.id).threadId,originalThread)
 // All is one chronology: private replies and group messages are interleaved by time.
 await expect(page.locator('.message-contact')).toHaveCount(4)
 const listIds=()=>page.locator('.message-contact').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-chat')??node.getAttribute('data-employee')))
 await expect.poll(async()=>{const inbox=await call('session.inbox'),groups=await call('chat.list'),cards=(await call('session.list')).sessions;const expected=[...cards.map(card=>({id:card.id,at:inbox.find(item=>item.employeeId===card.id)?.updatedAt??card.lastReply?.createdAt??card.createdAt})),...groups.map(group=>({id:group.id,at:group.lastMessage?.createdAt??group.createdAt}))].sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id)).map(item=>item.id);return JSON.stringify(await listIds())===JSON.stringify(expected)}).toBe(true)
 assert.ok((await listIds()).indexOf(a.id)<(await listIds()).indexOf(group.id),'a newer private reply comes before the older group request')
 await page.getByRole('button',{name:'@ All',exact:true}).click();await composer.fill('Confirm your part of the release.');await composer.press('Enter')
 await expect(page.locator('.group-message')).toHaveCount(2);await expect.poll(async()=>(await call('session.status')).every(item=>!item.busy)).toBe(true)
 await page.locator('.group-message.from-user .message-receipt').last().click();await expect(page.getByRole('dialog',{name:'Message delivery details'}).locator('[data-task-state=completed]')).toHaveCount(3);await page.keyboard.press('Escape')
 const text=(await call('chat.history',{id:group.id})).messages.find(item=>item.author.kind==='operator'&&item.text==='Confirm your part of the release.'),token=(await call('auth.agent-token',{id:a.id})).token
 const summary=await as(token,'chat','post',group.id,'--kind','result','--reply-to',text.id,'--text','Release checklist verified. All checks passed; implementation details are in my private conversation.')
 await expect(page.locator('.group-message.from-employee')).toHaveCount(1);const summaryRow=page.locator(`[data-group-message="${summary.id}"]`);await expect(summaryRow).toContainText('Aster')
 const sharedHistory=(await call('chat.history',{id:group.id})).messages;assert.equal(sharedHistory.length,3,'two requests and one explicit API result; reading does not publish bubbles');assert.ok(sharedHistory.filter(item=>item.author.kind==='operator').every(item=>item.deliveries.every(delivery=>delivery.readAt)));assert.equal(sharedHistory.flatMap(item=>item.deliveries).filter(delivery=>delivery.ackMessageId).length,1,'only the explicit result is a public reply reference')
 await page.getByRole('button',{name:'Search conversation',exact:true}).click();await page.getByRole('textbox',{name:'Find in conversation'}).fill('release');await expect(page.locator('.conversation-search [role=status]')).toHaveText('1 of 3');await page.getByRole('button',{name:'Next match'}).click();await expect(page.locator('.conversation-search [role=status]')).toHaveText('2 of 3');await page.keyboard.press('Escape');await expect(composer).toBeVisible()
 await summaryRow.evaluate(el=>{window.railFrames=[];let count=60;function sample(){const rail=el.querySelector('.message-action-rail'),bar=rail?.firstElementChild,bubble=el.querySelector('.markdown'),button=bar?.querySelector('.message-reply-action');window.railFrames.push({at:performance.now(),layout:rail?.dataset.layout,compact:rail?.dataset.compact,owner:el.getBoundingClientRect().toJSON(),bar:bar?.getBoundingClientRect().toJSON(),button:button?.getBoundingClientRect().toJSON(),contentHeight:bubble?.offsetHeight,scrollTop:el.closest('.group-transcript')?.scrollTop});if(--count)requestAnimationFrame(sample)}requestAnimationFrame(sample)});await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>new Set(window.railFrames.slice(15).map(frame=>JSON.stringify([frame.layout,frame.owner.width]))).size),1,'message controls settle instead of oscillating between layouts');fs.writeFileSync(path.join(root,'artifacts/slimming-final/rail-oscillation.json'),JSON.stringify(await page.evaluate(()=>window.railFrames),null,2));
 await summaryRow.hover();await summaryRow.getByRole('button',{name:'Reply to message',exact:true}).click();await expect(page.locator('.group-replying')).toContainText('Release checklist verified');await page.getByRole('button',{name:'Cancel group reply'}).click()
 for(const theme of ['white','black']){await call('settings.set',{theme});await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await page.screenshot({animations:'disabled',path:path.join(output,'group-'+theme+'.png')})}
 await call('settings.set',{theme:'white'});await page.getByRole('button',{name:'Manage group',exact:true}).click();const edit=page.getByRole('dialog',{name:'Edit group',exact:true})
 await edit.locator('label').filter({hasText:'Mira'}).locator('input[type=checkbox]').uncheck();await edit.getByRole('button',{name:'Save group',exact:true}).click();await expect(page.locator('.group-title')).toContainText('2 members')
 assert.equal((await call('session.list')).sessions.length,3)
 await composer.fill('Group draft survives view switches');await company.click();await messages.click();await page.getByRole('button',{name:'Open group Launch room',exact:true}).click();await expect(composer).toHaveValue('Group draft survives view switches');await composer.fill('')
 await page.locator('.group-message.from-user .message-receipt').first().click();await page.getByRole('dialog',{name:'Message delivery details'}).locator('.message-receipt-person button').first().click();await expect(page.locator('.employee-workbench')).toBeVisible();await call('view.close');await expect(page.locator('.group-conversation')).toBeVisible()
 // Foreground emulation is limited to this disposable hidden-window fixture, matching the existing receipt tests.
 assert.equal((await call('chat.get',{id:group.id})).unread,true);await page.waitForTimeout(750);assert.equal((await call('chat.get',{id:group.id})).unread,true)
 await page.evaluate(()=>{Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});window.dispatchEvent(new Event('focus'))})
 await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];globalThis.restoreReceiptWindow=()=>{delete win.isVisible;delete win.isFocused;delete win.isMinimized;delete win.webContents.isFocused};win.isVisible=()=>true;win.isFocused=()=>true;win.isMinimized=()=>false;win.webContents.isFocused=()=>true;win.webContents.send('api:event',{channel:'desktop:visibility',payload:{active:true}})});restore=true
 await page.locator('.group-transcript').evaluate(el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'))});await expect.poll(async()=>(await call('chat.get',{id:group.id})).unread).toBe(false)
 assert.deepEqual((await status(a.id)).lastReply,firstReply,'group work leaves the original private unread unchanged')
 await page.getByRole('button',{name:'Message Aster',exact:true}).click();await expect(page.locator('.message-thread-header')).toContainText('Aster')
 await expect.poll(async()=>!!(await status(a.id)).lastReply.readAt).toBe(true)
 await company.click();await expect(page.locator('.infinite-canvas')).toBeVisible();await expect(page.locator(`[data-card-id="${a.id}"] .unread-dot`)).toHaveCount(0);await expect(page.locator(`[data-card-id="${b.id}"] .unread-dot`)).toHaveCount(0)
 assert.equal((await call('session.inbox')).find(item=>item.employeeId===a.id).unread,false)
 assert.equal((await call('session.acknowledge',{employee:a.id,replyId:firstReply.id})).acknowledged,true)
 await app.evaluate(()=>globalThis.restoreReceiptWindow());restore=false
 await page.evaluate(()=>{Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false});window.dispatchEvent(new Event('blur'))})
 await messages.click();await page.getByRole('button',{name:'Open group Launch room',exact:true}).click();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(720,900));await expect(page.locator('.message-sidebar')).toBeHidden();await page.screenshot({animations:'disabled',path:path.join(output,'group-compact.png')})
 await page.getByRole('button',{name:'Back to conversations',exact:true}).click();await expect(page.locator('.message-sidebar')).toBeVisible()
 await expect(newGroup).toBeVisible();await expect(newGroup).toHaveText('New group')
 await call('messenger.conversation',{conversations:['employee:'+b.id],patch:{archived:true}});for(const scope of ['Favorites','Archived','Back to inbox']){await page.getByRole('button',{name:'Conversation list options',exact:true}).click();await page.getByRole('menuitem',{name:scope,exact:true}).click();await expect(newGroup).toBeVisible()}
 await page.getByRole('button',{name:'Archived chats',exact:true}).click();await page.getByRole('button',{name:'Restore Byte',exact:true}).click();await expect(page.locator('.message-archive-entry')).toHaveCount(0);await expect(page.locator('.message-contact')).toHaveCount(4)
 await newGroup.click();await expect(page.getByRole('dialog',{name:'New group',exact:true})).toBeVisible();await page.keyboard.press('Escape')
 assert.deepEqual(errors,[]);assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(win=>!win.isVisible())))
 console.log('PASS group UI: Company first-click All Team/second-click picker, equal navigation buttons, Team + cross-Team groups, member editing, mentions/all, existing private routing, concise posts, shared exact read receipts, scoped drafts, workbench roundtrip, legacy theme compatibility and compact layouts')
}finally{if(restore)await app.evaluate(()=>globalThis.restoreReceiptWindow());await app.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
