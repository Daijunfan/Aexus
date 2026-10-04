// Mixed engine publications and member discussions through a disposable Core and real renderer.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {profileApplication} from './fixtures/profile-application.mjs'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),native=process.argv.includes('--desktop'),mode=native?'desktop':'web',out=path.join(root,'artifacts/channel-discussion-avatars',mode),require=createRequire(import.meta.url)
fs.mkdirSync(out,{recursive:true})
const application=await profileApplication(),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
let f,app,browser,page;const checks=[],errors=[],measurements=[]
try{
 f=await fixtureCore(native?{}:{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)},path.join(application.directory,'out/main/daemon.js'))
 const rpc=async(cmd,args={},token=null)=>{let timer;try{const result=await Promise.race([f.request(token,cmd,args),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Fixture timeout: '+cmd)),15000)})]);assert.ok(result.ok,cmd+': '+result.error);return result.data}finally{clearTimeout(timer)}}
 await rpc('settings.set',{language:'en',viewAppearance:{messages:{theme:'white'}}});await f.cli('group','add','Editorial');await f.cli('group','add','Research')
 const publisher=await f.create('Atlas','Editorial'),member=await f.create('Mira','Research'),admin=await f.create('Rowan','Editorial')
 for(const [card,avatar] of [[publisher,'byte'],[member,'fireball'],[admin,'seedy']])await rpc('card.avatar',{id:card.id,avatar})
 const tokens=new Map(await Promise.all([publisher,member,admin].map(async card=>[card.id,await f.token(card.id)])))
 await rpc('messenger.profile',{image:{name:'my-photo.png',mimeType:'image/png',data:fs.readFileSync(path.join(root,'app_icon.png')).toString('base64')}})
 const channel=await rpc('channel.create',{name:'Field notes',engine:{kind:'employees',employeeIds:[publisher.id]}}),ref='channel:'+channel.id
 const now=Date.now(),image=await rpc('channel.media-put',{channelId:channel.id,externalId:'engine-article',publishedAt:now,mediaKey:'source-avatar',name:'atlas.png',mimeType:'image/png',data:fs.readFileSync(path.join(root,'app_icon.png')).toString('base64')},tokens.get(publisher.id))
 const news=await rpc('channel.publish',{channelId:channel.id,externalId:'engine-article',publishedAt:now,title:'Morning research briefing',body:'A publication from the channel engine. Its author portrait stays inside this article.',avatarMediaId:image.media.id},tokens.get(publisher.id))
 // Members are added after the publication. Their Company roles never determine message presentation.
 for(const card of [member,admin]){const policy=await rpc('conversation.policy',{conversation:ref});await rpc('conversation.member',{conversation:ref,employee:card.id,action:'add',expectedRevision:policy.revision})}
 const policy=await rpc('conversation.policy',{conversation:ref});await rpc('conversation.role',{conversation:ref,employee:admin.id,role:'admin',expectedRevision:policy.revision})
 const post=(text,card,extra={})=>rpc('channel.message-post',{id:channel.id,text,clientMessageId:crypto.randomUUID(),...extra},card?tokens.get(card.id):null)
 const user=await post('Good morning. Let us discuss this research together.',null,{replyTo:news.id})
 const answer=await post('I will review the sources and report what I find.',member,{replyTo:user.id})
 const review=await post('I will check the implementation details.',admin,{replyTo:answer.id})
 const engineReply=await post('This is my ordinary discussion reply, separate from the published article.',publisher,{replyTo:review.id})
 const long=await post('Review checklist\n\n'+Array.from({length:24},(_,i)=>`Step ${i+1} · Preserve the author, source and original context.`).join('\n\n'),member,{replyTo:user.id})
 const thanks=await post('Thanks. The next update can stay here.'),emoji=await post('👍')
 const before=(await rpc('channel.history',{id:channel.id,limit:100})).messages.map(m=>[m.id,m.author,m.text])
 const articleBefore=await rpc('channel.post',{id:news.id})
 if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:require('electron'),args:[application.directory],env});page=await app.firstWindow()}
 else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
 page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));await page.emulateMedia({reducedMotion:'reduce'})
 await expect(page.locator('.infinite-canvas')).toBeVisible();await page.evaluate(id=>window.agents.call('view.open',{kind:'messages',channelId:id}),channel.id)
 const feed=page.locator('.channel-feed'),bubble=id=>feed.locator('[data-chat-item="'+id+'"]'),row=id=>bubble(id).locator('..'),article=()=>bubble(news.id).locator('.channel-news-card')
 await expect(bubble(answer.id)).toBeAttached()
 const geometry=async id=>{
  await bubble(id).scrollIntoViewIfNeeded();await page.mouse.move(2,2);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
  const result=await bubble(id).evaluate(el=>{const a=el.parentElement.querySelector(':scope > .message-author-avatar'),b=el.getBoundingClientRect(),v=el.closest('.channel-feed'),ar=a?.getBoundingClientRect(),vr=v.getBoundingClientRect();return {id:el.dataset.chatItem,external:!el.querySelector('.message-author-avatar')&&!!a,outgoing:el.classList.contains('from-user'),avatar:ar?{left:ar.left,right:ar.right,top:ar.top,bottom:ar.bottom,width:ar.width,height:ar.height}:null,bubble:{left:b.left,right:b.right,top:b.top,bottom:b.bottom,height:b.height},viewport:{left:vr.left,right:vr.right,top:vr.top,bottom:vr.bottom,height:vr.height},overflow:v.scrollWidth-v.clientWidth}})
  assert.ok(result.external,'Discussion avatar must be outside its bubble: '+JSON.stringify(result));assert.ok(result.avatar.width>=30&&result.avatar.height>=30)
  assert.ok(result.outgoing?result.avatar.left-result.bubble.right>=8:result.bubble.left-result.avatar.right>=8,'Separate avatar column: '+JSON.stringify(result))
  assert.ok(Math.min(result.avatar.left,result.bubble.left)>=result.viewport.left-1&&Math.max(result.avatar.right,result.bubble.right)<=result.viewport.right+1,'Bubble and avatar fit the viewport');assert.ok(result.overflow<=1,'No horizontal scroll')
  measurements.push(result);return result
 }
 for(const m of [user,answer,review,engineReply,long,thanks,emoji])await geometry(m.id)
 await expect(row(answer.id).locator(':scope > [data-author-id="'+member.id+'"] [data-portrait=fireball]')).toBeAttached()
 await expect(row(review.id).locator(':scope > [data-author-id="'+admin.id+'"] [data-portrait=seedy]')).toBeAttached()
 await expect(row(user.id).locator(':scope > .message-author-avatar [data-user-avatar=image] img')).toBeAttached()
 await expect(bubble(answer.id).locator('.channel-admin-badge')).toHaveText('Member');await expect(bubble(review.id).locator('.channel-admin-badge')).toHaveText('Admin')
 await article().scrollIntoViewIfNeeded();await expect(article().locator('.channel-author-avatar')).toBeVisible();await expect.poll(()=>article().locator('.channel-author-avatar img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true)
 assert.equal(await bubble(news.id).evaluate(el=>!!el.closest('.group-message-row')),false)
 checks.push('Published engine article retains its internal source portrait; later-added Member/Admin and user messages have genuine external portraits, including the same publisher speaking in discussion mode.')
 await feed.evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,'01-mixed-timeline.png'),animations:'disabled'})
 const tall=await geometry(long.id);assert.ok(tall.bubble.height>tall.viewport.height);assert.ok(tall.avatar.top>=Math.max(tall.bubble.top,tall.viewport.top)-1&&tall.avatar.bottom<=Math.min(tall.bubble.bottom,tall.viewport.bottom)+1,'Tall message retains visible author bounded to its own row')
 await page.screenshot({path:path.join(out,'02-long-discussion.png'),animations:'disabled'})
 await bubble(answer.id).scrollIntoViewIfNeeded();await bubble(answer.id).hover();await bubble(answer.id).getByRole('button',{name:'Reply to message',exact:true}).click();await expect(page.locator('.channel-composer .group-replying')).toContainText('Mira')
 await page.getByRole('textbox',{name:'Channel message',exact:true}).press('Escape');await expect(page.locator('.channel-composer .group-replying')).toHaveCount(0)
 await bubble(answer.id).hover();await bubble(answer.id).getByRole('button',{name:'More message actions',exact:true}).click();await page.getByRole('menuitem',{name:'Select message',exact:true}).click();await expect(bubble(answer.id)).toHaveAttribute('data-selected','true')
 const separate=await bubble(answer.id).evaluate(el=>{const a=el.parentElement.querySelector(':scope > .message-author-avatar').getBoundingClientRect(),b=el.querySelector('.message-select-toggle').getBoundingClientRect();return b.left>=0&&(b.right<=a.left||b.left>=a.right||b.bottom<=a.top||b.top>=a.bottom)})
 assert.ok(separate,'Multi-select avoids the portrait');await page.getByRole('button',{name:'Cancel message selection',exact:true}).click()
 await page.evaluate(({conversation,id})=>window.agents.call('messenger.message',{conversation,id,patch:{hidden:true}}),{conversation:ref,id:review.id});await expect(bubble(review.id)).toHaveClass(/message-hidden/);await expect(bubble(review.id).locator('.message-author-avatar')).toHaveCount(0)
 await bubble(review.id).getByRole('button',{name:'Show message',exact:true}).click();await geometry(review.id)
 checks.push('Long messages retain a visible outside portrait; reply/selection/hide/restore continue targeting the original message.')
 await page.getByRole('button',{name:'Post view',exact:true}).click();await expect(page.locator('.channel-conversation')).toHaveAttribute('data-feed-view','posts');await expect(page.locator('.channel-discussion-message')).toHaveCount(0)
 await page.locator('.channel-post-card[data-news-id="'+news.id+'"] .channel-post-open').click();const detail=page.getByRole('dialog',{name:'Post details',exact:true});await expect(detail.locator('.channel-author-avatar')).toBeVisible();await detail.getByRole('button',{name:'Close post',exact:true}).click();await expect(page.locator('.channel-conversation')).toHaveAttribute('data-feed-view','posts')
 await page.getByRole('button',{name:'Channel view',exact:true}).click();await geometry(answer.id)
 checks.push('Posts mode and its enlarged-detail overlay keep the source avatar embedded and return to Posts; discussion layout only applies in the conversation feed.')
 const resize=async(width,height)=>{if(app)await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(size.width,size.height),{width,height});else await page.setViewportSize({width,height})}
 for(const theme of ['black','violet']){await rpc('settings.set',{viewAppearance:{messages:{theme}}});await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await feed.evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,'03-'+theme+'.png'),animations:'disabled'})}
 await resize(native?720:390,844);for(const m of [user,answer,review,thanks])await geometry(m.id);await bubble(answer.id).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'04-compact.png'),animations:'disabled'})
 await rpc('settings.set',{language:'zh-CN'});await geometry(thanks.id);await page.screenshot({path:path.join(out,'05-chinese.png'),animations:'disabled'})
 // Original authors survive leaving/removing an employee; no history or posted source content is rewritten.
 await rpc('card.remove',{id:admin.id});await expect(row(review.id).locator(':scope > .message-author-avatar .message-former-avatar')).toBeAttached();await geometry(review.id)
 assert.deepEqual((await rpc('channel.history',{id:channel.id,limit:100})).messages.map(m=>[m.id,m.author,m.text]),before)
 const after=await rpc('channel.post',{id:news.id});assert.deepEqual([after.title,after.body,after.sourceId,after.avatarMediaId,after.media],[articleBefore.title,articleBefore.body,articleBefore.sourceId,articleBefore.avatarMediaId,articleBefore.media])
 checks.push('White/black/violet, Chinese and compact layouts fit; a deleted member keeps a historical avatar placeholder; authors, messages, publication bytes and source identity remain intact.')
 assert.deepEqual(errors,[]);if(app)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,mode,checks,measurements,errors,paidModelCalls:0,productionDataUsed:false},null,2));console.log(checks.map(c=>'PASS '+c).join('\n'))
}catch(error){await page?.screenshot({path:path.join(out,'failure.png'),animations:'disabled'}).catch(()=>{});throw error}finally{await app?.close();await browser?.close();await f?.close();application.dispose()}
