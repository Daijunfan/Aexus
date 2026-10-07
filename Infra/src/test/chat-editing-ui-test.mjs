// Group text/caption correction through the actual renderer and isolated Core.
// The only native turn is a deterministic local protocol fixture; no paid models.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'

const native=process.argv.includes('--desktop'),require=createRequire(import.meta.url),probe=net.createServer()
await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve))
const f=await fixtureCore(native?{}:{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)}),out=path.join(f.root,'.aexus/artifacts/chat-editing'),mode=native?'desktop':'web'
fs.mkdirSync(out,{recursive:true})
let browser,context,app,page
const invariant=message=>{const {text,editedAt,editRevision,...identity}=message;return JSON.parse(JSON.stringify(identity))}
const draftContent=draft=>draft?Object.fromEntries(Object.entries(draft).filter(([key])=>key!=='updatedAt')):undefined
try{
 if(native){
  await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE
  app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[f.root],env});page=await app.firstWindow()
 }else{
  browser=await chromium.launch({...(process.platform==='darwin'?{channel:'chrome'}:{}),headless:true});context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage()
  await page.addInitScript(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false}))
  await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()
 }
 page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message))
 // Editing must not be confused with a visible-reply acknowledgement in this fixture.
 await page.addInitScript(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false}))
 await page.evaluate(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false}))
 const call=(cmd,args={})=>page.evaluate(([cmd,args])=>window.agents.call(cmd,args),[cmd,args])
 const other=async(cmd,args,token=null)=>{const reply=await f.request(token,cmd,args);assert.ok(reply.ok,reply.error);return reply.data}
 await page.locator('.infinite-canvas').waitFor();await call('settings.set',{language:'en',theme:'violet'});await f.cli('group','add','Editing Studio')
 const a=await f.create('Aster','Editing Studio'),b=await f.create('Rowan','Editing Studio'),group=await call('chat.create',{name:'Public corrections',members:[a.id,b.id]}),second=await call('chat.create',{name:'Other draft',members:[a.id]})
 const conversation='group:'+group.id,history=()=>call('chat.history',{id:group.id}),message=async id=>(await history()).messages.find(value=>value.id===id),readDraft=async()=>draftContent((await call('messenger.state')).drafts[conversation])
 const delivery=(value,employeeId)=>value.deliveries.find(item=>item.employeeId===employeeId)
 const settled=id=>f.until(async()=>{const value=await message(id);for(const item of value.deliveries)assert.ok(!['failed','interrupted'].includes(item.status),JSON.stringify(item));return value.deliveries.every(item=>item.status==='completed'&&item.readAt!==undefined)&&value},'shared context acknowledged')
 let first=await settled((await call('chat.post',{kind:'message',id:group.id,text:'Original public wording, before correction.',clientMessageId:'editing-first'})).id)
 await page.getByRole('button',{name:'Messages',exact:true}).click();await page.getByRole('button',{name:'Open group Public corrections',exact:true}).click()
 const composer=page.getByRole('textbox',{name:'Group message',exact:true}),row=id=>page.locator(`.group-message[data-group-message="${id}"]`),editor=page.locator('.message-edit-composer'),editText=page.getByRole('textbox',{name:'Edit message text',exact:true}),menu=page.getByRole('menu',{name:'Message options',exact:true})
 const openMenu=async id=>{await row(id).hover();await row(id).getByRole('button',{name:'More message actions',exact:true}).click();await expect(menu).toBeVisible()}
 const edit=async id=>{await openMenu(id);await menu.getByRole('menuitem',{name:'Edit message',exact:true}).click();await expect(editor).toBeVisible();await expect(editText).toBeFocused()}
 const save=async()=>{await editor.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor).toHaveCount(0);await expect(composer).toBeFocused()}
 const textFile=name=>({name,mimeType:'text/plain',buffer:Buffer.from('Keep this file byte-for-byte.\n')})
 const imageBytes=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#d8c9ee';ctx.fillRect(0,0,96,64);return canvas.toDataURL('image/png').split(',')[1]}),'base64')
 const imageFile=name=>({name,mimeType:'image/png',buffer:imageBytes})
 await page.getByLabel('Choose attachments',{exact:true}).setInputFiles([textFile('Caption notes.txt'),imageFile('Caption palette.png')]);await expect(page.getByLabel('Attachment transfers',{exact:true})).toHaveCount(0);await expect(page.locator('.group-composer .message-attachment-draft .message-photo img')).toBeVisible()
 await composer.fill('Original caption for unchanged attachments.');await page.getByRole('button',{name:'Send group message',exact:true}).click();await expect(composer).toHaveValue('')
 const captionId=(await history()).messages.at(-1).id;await f.until(async()=>(await message(captionId)).deliveries.every(delivery=>delivery.status==='completed'&&delivery.readAt),'user caption broadcast completed');const caption=await message(captionId);assert.equal(caption.attachments.length,2);assert.equal(caption.broadcast,true);assert.deepEqual(caption.deliveries.map(delivery=>delivery.employeeId),[a.id,b.id]);const bTranscript=(await call('session.transcript',{employee:b.id})).items,bNative=fs.readFileSync(path.join(f.control,b.id+'-user.json'),'utf8')
 const agentPost=await settled((await other('chat.post',{id:group.id,text:'An employee-authored result is not user-editable.',kind:'result',replyTo:first.id,clientMessageId:'editing-agent'},await f.token(a.id))).id)
 // This real reply adds the actor's public acknowledgment to first; only then freeze its edit baseline.
 first=await message(first.id);assert.equal(delivery(first,a.id).ackMessageId,agentPost.id)
 await expect(row(agentPost.id)).toBeVisible();await openMenu(agentPost.id);await expect(menu.getByRole('menuitem',{name:'Edit message',exact:true})).toHaveCount(0);await page.keyboard.press('Escape')
 const unreadBefore=await call('chat.get',{id:group.id});assert.equal(unreadBefore.unread,true)
 assert.equal((await call('session.transcript',{employee:a.id})).items.filter(item=>item.role==='user').length,1,'the explicit user caption send broadcasts exactly once')

 // Build a complete normal draft, then verify the edit buffer never mutates it.
 await row(first.id).hover();await row(first.id).getByRole('button',{name:'Reply to message',exact:true}).click();await composer.fill('@As');await page.getByRole('option',{name:/^Aster\b/}).click();await composer.fill('Unsent normal draft stays with its reply and recipient.')
 await page.getByLabel('Choose attachments',{exact:true}).setInputFiles([textFile('Draft notes.txt'),imageFile('Draft palette.png')]);await expect(page.getByLabel('Attachment transfers',{exact:true})).toHaveCount(0)
 await expect.poll(async()=>{const draft=await readDraft();return draft?.images?.length===1&&draft?.files?.length===1&&draft?.mentions?.[0]===a.id&&draft?.replyTo===first.id}).toBe(true)
 const draft=await readDraft(),assertDraft=async()=>{await expect(composer).toHaveValue(draft.text);await expect(page.locator('.group-recipient-chips')).toContainText('@Aster');await expect(page.getByRole('button',{name:'Cancel group reply',exact:true})).toBeVisible();await expect(page.locator('.group-composer .message-attachment-draft .message-file')).toContainText('Draft notes.txt');await expect(page.locator('.group-composer .message-attachment-draft .message-photo img')).toBeVisible();assert.deepEqual(await readDraft(),draft)}
 await composer.press('ArrowUp');await expect(editor).toHaveCount(0)
 await edit(first.id);await expect(editText).toHaveValue(first.text);await editText.fill('Cancelled correction must not become a draft or a public message.');assert.deepEqual(await readDraft(),draft);await editText.press('Escape');await expect(editor).toHaveCount(0);await expect(composer).toBeFocused();await assertDraft();assert.equal((await message(first.id)).text,first.text)
 await edit(first.id);await editText.fill('Corrected public wording.');await save();const corrected=await message(first.id);assert.equal(corrected.text,'Corrected public wording.');assert.equal(corrected.editRevision,1);assert.ok(corrected.editedAt>=first.createdAt);assert.deepEqual(invariant(corrected),invariant(first));await expect(row(first.id).getByText('Edited',{exact:true})).toBeVisible();await assertDraft()
 await edit(caption.id);await editText.fill('A corrected caption; the files are unchanged.');await save();let currentCaption=await message(caption.id);assert.deepEqual(invariant(currentCaption),invariant(caption));assert.equal(currentCaption.editRevision,1);await expect(row(caption.id).locator('.message-photo img')).toBeVisible();await assertDraft()
 await edit(first.id);await editText.fill('Unsaved correction discarded on conversation switch.');await page.getByRole('button',{name:'Open group Other draft',exact:true}).click();await expect(editor).toHaveCount(0);await composer.fill('Other conversation draft');await page.getByRole('button',{name:'Open group Public corrections',exact:true}).click();await expect(editor).toHaveCount(0);await assertDraft();assert.equal((await message(first.id)).text,corrected.text)

 // ArrowUp requires a completely empty normal draft, not merely empty visible text.
 await composer.fill('');await composer.press('ArrowUp');await expect(editor).toHaveCount(0)
 await page.getByRole('button',{name:'Cancel group reply',exact:true}).click();await page.getByRole('button',{name:'Remove mention Aster',exact:true}).click();await page.getByRole('button',{name:'Remove attachment Draft notes.txt',exact:true}).click();await page.getByRole('button',{name:'Remove attachment Draft palette.png',exact:true}).click()
 await composer.fill(' ');await composer.press('ArrowUp');await expect(editor).toHaveCount(0);await composer.fill('');await composer.press('ArrowUp');await expect(editText).toHaveValue(currentCaption.text);await editText.press('Escape');await expect(composer).toBeFocused()
 await edit(first.id);await editText.fill('  ');await expect(editor.getByRole('button',{name:'Save changes',exact:true})).toBeDisabled();await editText.press('Escape')
 await edit(caption.id);await editText.fill('');await save();currentCaption=await message(caption.id);assert.equal(currentCaption.text,'');assert.deepEqual(invariant(currentCaption),invariant(caption));await expect(row(caption.id).locator('.message-photo img')).toBeVisible()

 // Editing keeps incompatible reply actions hidden; Escape restores draft and then cancels a reply.
 await composer.fill('Normal text survives an edit-to-reply switch.');await edit(first.id);await editText.fill('This abandoned edit is not saved.');await expect(row(caption.id).getByRole('button',{name:'Reply to message',exact:true})).toHaveCount(0);await editText.press('Escape');await row(caption.id).hover();await row(caption.id).getByRole('button',{name:'Reply to message',exact:true}).click();await expect(editor).toHaveCount(0);await expect(composer).toHaveValue('Normal text survives an edit-to-reply switch.');await expect(page.getByRole('button',{name:'Cancel group reply',exact:true})).toBeVisible();await composer.press('Escape');await expect(page.getByRole('button',{name:'Cancel group reply',exact:true})).toHaveCount(0);await expect(composer).toBeFocused();await expect(page.locator('.group-title')).toContainText('Public corrections');assert.equal((await message(first.id)).text,corrected.text);await composer.fill('')

 // A public correction cannot rewrite or re-run work already routed to an employee.
 fs.writeFileSync(path.join(f.control,a.id+'.hold-user'),'');fs.writeFileSync(path.join(f.control,a.id+'.reply.txt'),'Completed the original accepted task.')
 const routedArgs={id:group.id,text:'Run this original accepted task exactly once.',mentions:[a.id],clientMessageId:'editing-routed'},routed=await call('chat.send',routedArgs)
 await f.until(async()=>{const value=await message(routed.id),work=delivery(value,a.id);return fs.existsSync(path.join(f.control,a.id+'-user.json'))&&work?.mode==='work'&&work.status==='running'&&work.readAt!==undefined&&value.deliveries.filter(item=>item.employeeId!==a.id).every(item=>item.mode==='awareness'&&item.status==='completed'&&item.readAt!==undefined)},'deterministic routed work running after real read acknowledgment')
 const nativeRequest=fs.readFileSync(path.join(f.control,a.id+'-user.json'),'utf8'),running=await message(routed.id);assert.ok(JSON.parse(nativeRequest).text.includes(routedArgs.text))
 await edit(routed.id);await editText.fill('Public clarification only; the accepted task stays original.');await save();const routedCorrection=await message(routed.id);assert.deepEqual(invariant(routedCorrection),invariant(running));assert.equal(fs.readFileSync(path.join(f.control,a.id+'-user.json'),'utf8'),nativeRequest)
 const duplicate=await call('chat.send',routedArgs);assert.equal(duplicate.id,routed.id);assert.equal(duplicate.text,routedCorrection.text);assert.equal(fs.readFileSync(path.join(f.control,a.id+'-user.json'),'utf8'),nativeRequest)
 fs.unlinkSync(path.join(f.control,a.id+'.hold-user'));await f.until(async()=>!(await f.status(a.id)).busy&&delivery(await message(routed.id),a.id)?.status==='completed','original task completed')
 const originalTranscript=await call('session.transcript',{employee:a.id});assert.ok(originalTranscript.text.includes(routedArgs.text));assert.ok(!originalTranscript.text.includes(routedCorrection.text));assert.equal((await f.status(a.id)).lastReply.readAt,undefined)

 // A separate authenticated socket client changes the same message during editing.
 const beforeConflict=await message(first.id);await edit(first.id);await editText.fill('My retained correction after a concurrent change.')
 await other('chat.edit',{id:group.id,messageId:first.id,text:'A different client changed this message.',expectedRevision:beforeConflict.editRevision??0})
 await expect(row(first.id)).toContainText('A different client changed this message.');await expect(editText).toHaveValue('My retained correction after a concurrent change.');await editor.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor.getByRole('alert')).toBeVisible();await expect(editText).toHaveValue('My retained correction after a concurrent change.')
 await expect(editor.locator('blockquote')).toContainText('A different client changed this message.');await page.screenshot({animations:'disabled',path:path.join(out,mode+'-conflict.png')});
 await editor.getByRole('button',{name:'Save my version',exact:true}).click();await expect(editor).toHaveCount(0);const ownVersion=await message(first.id);assert.equal(ownVersion.text,'My retained correction after a concurrent change.');assert.equal(ownVersion.editRevision,beforeConflict.editRevision+2)
 await edit(first.id);await editText.fill('Another local unsaved change.');await other('chat.edit',{id:group.id,messageId:first.id,text:'Latest explicit remote version.',expectedRevision:ownVersion.editRevision});await expect(row(first.id)).toContainText('Latest explicit remote version.');await editor.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor.getByRole('button',{name:'Load latest',exact:true})).toBeVisible();await editor.getByRole('button',{name:'Load latest',exact:true}).click();await expect(editText).toHaveValue('Latest explicit remote version.');await editor.getByRole('button',{name:'Cancel editing',exact:true}).click();await expect(composer).toBeFocused()

 // A response lost after commit is retried with the original optimistic revision.
 const retryBase=await message(first.id),retryText='One committed correction despite a lost response.'
 if(!native){
  let dropped=false;await page.route('**/api/rpc',async route=>{const request=route.request().postDataJSON();if(request.cmd==='chat.edit'&&request.args.messageId===first.id&&!dropped){dropped=true;const response=await route.fetch();assert.equal((await response.json()).ok,true);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'The edit response was lost after commit.'})});return}await route.continue()})
  await edit(first.id);await editText.fill(retryText);await editor.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('lost after commit');await expect(editText).toHaveValue(retryText);const committed=await message(first.id);assert.equal(committed.editRevision,retryBase.editRevision+1)
  await editor.getByRole('button',{name:'Retry save',exact:true}).click();await expect(editor).toHaveCount(0);assert.deepEqual(await message(first.id),committed);await page.unroute('**/api/rpc')
 }else{await edit(first.id);await editText.fill(retryText);await save();const committed=await message(first.id);assert.deepEqual(await call('chat.edit',{id:group.id,messageId:first.id,text:retryText,expectedRevision:retryBase.editRevision}),committed)}
 assert.deepEqual(invariant(await message(first.id)),invariant(first));await expect(row(first.id).getByText('Edited',{exact:true})).toBeVisible()
 const search=await call('messenger.search',{conversation,query:retryText});assert.equal(search.messages[0].id,first.id);assert.equal(search.messages[0].text,retryText)
 await page.screenshot({animations:'disabled',path:path.join(out,mode+'-edited.png')})

 // The newest editable own message can be older than the currently loaded 100 entries.
 const agentToken=await f.token(a.id)
 let lastIncoming;for(let i=0;i<105;i++)lastIncoming=await other('chat.post',{id:group.id,text:'Incoming employee update '+i,kind:'summary',clientMessageId:'older-edit-'+i},agentToken)
 await settled(lastIncoming.id)
 await page.getByRole('button',{name:'Open group Other draft',exact:true}).click();await page.getByRole('button',{name:'Open group Public corrections',exact:true}).click();await expect(row(lastIncoming.id)).toHaveCount(1);await expect(page.locator('.group-message')).toHaveCount(100);await expect(row(routed.id)).toHaveCount(0);await expect(composer).toHaveValue('')
 await composer.press('ArrowUp');await expect(editText).toHaveValue(routedCorrection.text);await editText.press('Escape');await expect(editor).toHaveCount(0);await expect(row(routed.id)).toHaveCount(0)
 if(!native){
  let held=false,release;const gate=new Promise(resolve=>release=resolve)
  await page.route('**/api/rpc',async route=>{const request=route.request().postDataJSON();if(request.cmd==='messenger.search'&&request.args.author==='you'){held=true;await gate}await route.continue()})
  const response=page.waitForResponse(response=>{try{const request=response.request().postDataJSON();return request?.cmd==='messenger.search'&&request.args.author==='you'}catch{return false}})
  await composer.press('ArrowUp');await expect.poll(()=>held).toBe(true);await composer.fill('A new normal draft wins over the late lookup.');release();await (await response).finished();await expect.poll(async()=>(await readDraft())?.text).toBe('A new normal draft wins over the late lookup.');await expect(composer).toHaveValue('A new normal draft wins over the late lookup.');await expect(editor).toHaveCount(0);await page.unroute('**/api/rpc')
 }
 await page.getByRole('button',{name:'Load earlier messages',exact:true}).click();await expect(row(routed.id)).toHaveCount(1);await other('chat.edit',{id:group.id,messageId:routed.id,text:'Remote correction of a loaded older message.',expectedRevision:routedCorrection.editRevision});await expect(row(routed.id)).toContainText('Remote correction of a loaded older message.');
 await composer.fill('');await composer.press('ArrowUp');await expect(editor).toBeVisible();await call('settings.set',{language:'zh-CN'});if(!native)await page.setViewportSize({width:390,height:900});await expect(page.getByRole('textbox',{name:'编辑消息文字',exact:true})).toBeVisible();await expect(editor.getByRole('button',{name:'保存修改',exact:true})).toBeVisible();await page.screenshot({animations:'disabled',path:path.join(out,mode+'-edit-zh.png')});assert.ok(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.keyboard.press('Escape');await expect(editor).toHaveCount(0);await call('settings.set',{language:'en'});if(!native)await page.setViewportSize({width:1440,height:1000});
 assert.equal((await call('chat.get',{id:group.id})).readSequence,unreadBefore.readSequence,'editing and lookups do not acknowledge unread posts')
 assert.deepEqual((await call('session.transcript',{employee:a.id})).items,originalTranscript.items);assert.equal(fs.readFileSync(path.join(f.control,a.id+'-user.json'),'utf8'),nativeRequest);assert.deepEqual((await call('session.transcript',{employee:b.id})).items,bTranscript);assert.equal(fs.readFileSync(path.join(f.control,b.id+'-user.json'),'utf8'),bNative);assert.deepEqual(await call('terminal.list'),[])
 assert.deepEqual(errors,[]);if(native)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 fs.writeFileSync(path.join(out,mode+'-verification.json'),JSON.stringify({passed:true,platform:native?'hidden Electron on macOS':'headless Chrome on macOS',checks:['operator text/caption editing and marker','employee edit action absent','full normal draft preserved on cancel/save/switch','empty composer ArrowUp and Escape focus','caption may become empty without dropping files','original routed task and send fingerprint unchanged','separate-client conflict with explicit overwrite/load latest','same-content retry idempotence',...(!native?['lost response after real Core commit','late full-history lookup ignored after typing']:[]),'full-history ArrowUp beyond 100 incoming posts','caption broadcast dispatches once; edits add no native turns, terminals or operator read acknowledgement'],untested:['other operating systems',...(native?['native IPC response-loss injection']:[])]},null,2))
 console.log('PASS group editing '+mode+': draft isolation, text/caption correction, conflict recovery, idempotent retry, full-history shortcut and unchanged native task/read state')
}catch(error){await page?.screenshot({animations:'disabled',path:path.join(out,mode+'-failure.png')}).catch(()=>{});throw error}finally{await app?.close();await browser?.close();await f.close()}
