// Real Core and UI, disposable employees/messages; no paid models or production state.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {profileApplication} from './fixtures/profile-application.mjs'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),native=process.argv.includes('--desktop'),mode=native?'desktop':'web',out=path.join(root,'artifacts/group-avatar-layout',mode),require=createRequire(import.meta.url)
fs.mkdirSync(out,{recursive:true})
const application=await profileApplication(),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
let f,app,browser,page;const errors=[],checks=[],measurements=[]
try{
 f=await fixtureCore(native?{}:{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)},path.join(application.directory,'out/main/daemon.js'))
 const rpc=async(cmd,args={},token=null)=>{console.log('RPC '+cmd);let timer;try{const r=await Promise.race([f.request(token,cmd,args),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Fixture request timed out: '+cmd)),12000)})]);assert.ok(r.ok,cmd+': '+r.error);return r.data}finally{clearTimeout(timer)}}
 await rpc('settings.set',{language:'en',viewAppearance:{messages:{theme:'white'}}});await f.cli('group','add','Design studio')
 const a=await f.create('Mira','Design studio'),b=await f.create('Rowan','Design studio'),c=await f.create('Lin · 资料与版本检查','Design studio')
 for(const [card,avatar] of [[a,'fireball'],[b,'seedy'],[c,'byte']])await rpc('card.avatar',{id:card.id,avatar})
 await rpc('messenger.profile',{image:{name:'my-photo.png',mimeType:'image/png',data:fs.readFileSync(path.join(root,'app_icon.png')).toString('base64')}})
 const group=await rpc('chat.create',{name:'Design review',members:[a.id,b.id,c.id]}),tokens=new Map(await Promise.all([a,b,c].map(async card=>[card.id,await f.token(card.id)])))
 const post=async(text,card,extra={})=>rpc('chat.post',{id:group.id,text,kind:card?'summary':'message',clientMessageId:crypto.randomUUID(),...extra},card?tokens.get(card.id):null)
 const first=await post('早上好，先看今天的设计稿。希望每个人都能直接看出谁在说话。')
 const answer=await post('头像和内容分开，阅读起来会更接近真实群聊。',a,{replyTo:first.id})
 const review=await post('同意。还要检查连续消息、长文和手机上的间距。',b,{replyTo:answer.id})
 const consecutive=await post('我来核对资料。',c),continued=await post('也会保留原有消息的引用关系和时间。',c)
 const long=await post('Implementation notes\n\n'+Array.from({length:24},(_,i)=>`Pass ${i+1} · Check author, reply, file and read-receipt identity.`).join('\n\n'),a)
 const own=await post('收到，接着讨论下一步。'),emoji=await post('👍')
 const before=(await rpc('chat.history',{id:group.id,limit:100})).messages.map(m=>[m.id,m.author,m.text])
 if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:require('electron'),args:[application.directory],env});page=await app.firstWindow()}
 else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
 page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'})
 await expect(page.locator('.infinite-canvas')).toBeVisible();await page.getByRole('button',{name:'Messages',exact:true}).click();await page.getByRole('button',{name:'Open group '+group.name,exact:true}).click()
 const bubble=id=>page.locator('[data-group-message="'+id+'"]'),row=id=>bubble(id).locator('..'),feed=page.locator('.group-conversation .group-transcript')
 const geometry=async id=>{
  await bubble(id).scrollIntoViewIfNeeded();await page.mouse.move(2,2);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
  const result=await bubble(id).evaluate(el=>{const owner=el.parentElement,avatar=owner.querySelector(':scope > .message-author-avatar'),area=el.closest('.group-transcript').getBoundingClientRect(),b=el.getBoundingClientRect(),a=avatar?.getBoundingClientRect();return {id:el.dataset.groupMessage,external:!el.querySelector('.message-author-avatar')&&!!avatar,outgoing:el.classList.contains('from-user'),bubble:{left:b.left,right:b.right,top:b.top,bottom:b.bottom},avatar:a?{left:a.left,right:a.right,top:a.top,bottom:a.bottom,width:a.width,height:a.height}:null,area:{left:area.left,right:area.right},overflow:el.closest('.group-transcript').scrollWidth-el.closest('.group-transcript').clientWidth,clipped:avatar?getComputedStyle(avatar).clipPath:null}})
  assert.ok(result.external,'Portrait must be a sibling outside the message bubble: '+JSON.stringify(result));assert.ok(result.avatar.width>=30&&result.avatar.height>=30,'Portrait remains legible')
  assert.ok(result.outgoing?result.avatar.left-result.bubble.right>=8:result.bubble.left-result.avatar.right>=8,'The avatar and tail need their own gap: '+JSON.stringify(result))
  assert.ok(Math.min(result.avatar.left,result.bubble.left)>=result.area.left-1&&Math.max(result.avatar.right,result.bubble.right)<=result.area.right+1,'Author and bubble fit their reading viewport')
  assert.ok(result.overflow<=1,'No horizontal overflow: '+JSON.stringify(result));measurements.push(result)
 }
 await expect(bubble(first.id)).toBeAttached();console.log('Checking bubble geometry');for(const id of [first.id,answer.id,review.id,consecutive.id,continued.id,long.id,own.id,emoji.id])await geometry(id)
 await expect(row(first.id).locator(':scope > .message-author-avatar [data-user-avatar=image] img')).toBeVisible()
 await expect(row(answer.id).locator(':scope > [data-author-id="'+a.id+'"] [data-portrait=fireball]')).toBeAttached()
 await expect(row(review.id).locator(':scope > [data-author-id="'+b.id+'"] [data-portrait=seedy]')).toBeAttached()
 await expect(bubble(consecutive.id)).toHaveAttribute('data-bubble-group','first');await expect(bubble(continued.id)).toHaveAttribute('data-bubble-group','last')
 await geometry(long.id);const longPortrait=await bubble(long.id).evaluate(el=>{const a=el.parentElement.querySelector(':scope > .message-author-avatar').getBoundingClientRect(),b=el.getBoundingClientRect(),v=el.closest('.group-transcript').getBoundingClientRect();return {tall:b.height>v.height,visible:a.top>=Math.max(b.top,v.top)-1&&a.bottom<=Math.min(b.bottom,v.bottom)+1}});assert.ok(longPortrait.tall,'Exercise a message taller than the viewport');assert.ok(longPortrait.visible,'A tall message keeps its own portrait in view, constrained to that message');await page.screenshot({path:path.join(out,'00-long-message.png'),animations:'disabled'})
 await feed.evaluate(el=>el.scrollTo(0,0));await page.screenshot({path:path.join(out,'01-group-light.png'),animations:'disabled'})
 checks.push('All three real author IDs and the uploaded user photo render outside the bubbles; incoming left/outgoing right, continuous messages and emoji keep their original grouping.')
 // Existing bubble controls still act on the message, not the portrait or another author.
 await bubble(answer.id).scrollIntoViewIfNeeded();await bubble(answer.id).hover();await bubble(answer.id).getByRole('button',{name:'Reply to message',exact:true}).click();await expect(page.locator('.group-replying')).toContainText('Mira');await page.getByRole('button',{name:'Cancel group reply',exact:true}).click()
 await bubble(answer.id).hover();await bubble(answer.id).getByRole('button',{name:'More message actions',exact:true}).click();await page.getByRole('menuitem',{name:'Select message',exact:true}).click();await expect(bubble(answer.id)).toHaveAttribute('data-selected','true')
 const choice=await bubble(answer.id).evaluate(el=>{const avatar=el.parentElement.querySelector(':scope > .message-author-avatar').getBoundingClientRect(),toggle=el.querySelector('.message-select-toggle').getBoundingClientRect();return {separate:toggle.right<=avatar.left||toggle.left>=avatar.right||toggle.bottom<=avatar.top||toggle.top>=avatar.bottom,left:toggle.left}})
 assert.ok(choice.separate&&choice.left>=0,'Selection control must not cover the portrait');await page.getByRole('button',{name:'Cancel message selection',exact:true}).click()
 checks.push('Reply targets the correct author, selection remains usable without covering the outside portrait, and message actions retain their existing scope.')
 for(const theme of ['black','violet']){await rpc('settings.set',{viewAppearance:{messages:{theme}}});await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await feed.evaluate(el=>el.scrollTo(0,0));await page.screenshot({path:path.join(out,'02-'+theme+'.png'),animations:'disabled'})}
 const resize=async(width,height)=>{if(app)await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setSize(width,height),{width,height});else await page.setViewportSize({width,height})}
 await resize(native?720:390,844);for(const id of [first.id,review.id,continued.id,own.id,emoji.id])await geometry(id)
 await feed.evaluate(el=>el.scrollTo(0,0));await page.screenshot({path:path.join(out,'03-compact.png'),animations:'disabled'})
 await rpc('settings.set',{language:'zh-CN'});await geometry(own.id);await page.screenshot({path:path.join(out,'04-chinese.png'),animations:'disabled'})
 await rpc('card.remove',{id:b.id});await expect(row(review.id).locator(':scope > .message-author-avatar .message-former-avatar')).toBeAttached();await geometry(review.id)
 assert.deepEqual((await rpc('chat.history',{id:group.id,limit:100})).messages.map(m=>[m.id,m.author,m.text]),before)
 checks.push('White/black/violet, narrow Web/hidden Electron and Chinese layouts retain geometry; deleted authors retain a named outside placeholder; no history or author identity is rewritten.')
 assert.deepEqual(errors,[]);if(app)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,mode,checks,measurements,errors,paidModelCalls:0,productionDataUsed:false},null,2));console.log(checks.map(c=>'PASS '+c).join('\n'))
}catch(error){await page?.screenshot({path:path.join(out,'failure.png'),animations:'disabled'}).catch(()=>{});throw error}finally{await app?.close();await browser?.close();await f?.close();application.dispose()}
