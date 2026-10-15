// Real authenticated Core and real source UI in isolated web/hidden desktop fixtures. No paid models.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {profileApplication} from './fixtures/profile-application.mjs'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),native=process.argv.includes('--desktop'),mode=native?'desktop':'web',out=path.join(root,'artifacts/message-identity',mode),application=await profileApplication(),require=createRequire(import.meta.url)
fs.mkdirSync(out,{recursive:true});const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));let f,app,browser,page;const errors=[],checks=[]
try{
 f=await fixtureCore(native?{}:{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)},path.join(application.directory,'out/main/daemon.js'))
 const rpc=async(cmd,args={},token=null)=>{const r=await f.request(token,cmd,args);assert.ok(r.ok,r.error);return r.data},deny=async(cmd,args,token=null)=>assert.equal((await f.request(token,cmd,args)).ok,false)
 await rpc('settings.set',{language:'en',theme:'white'});await f.cli('group','add','Identity studio')
 const a=await f.create('Mira · Research','Identity studio'),b=await f.create('Rowan · Reviewer','Identity studio'),secretary=await f.create('Secretary','Identity studio','secretary'),agentToken=await f.token(a.id),secretaryToken=await f.token(secretary.id)
 await rpc('card.avatar',{id:a.id,avatar:'fireball'});await rpc('card.avatar',{id:b.id,avatar:'seedy'})
 const group=await rpc('chat.create',{name:'Research review · demo',members:[a.id,b.id]})
 const user=await rpc('chat.post',{id:group.id,text:'请分别给出研究结论与反方意见。先保留证据，再讨论下一步。',kind:'message',clientMessageId:'identity-user'})
 const agent=await rpc('chat.post',{id:group.id,text:'研究记录已整理：先比较原始资料，再记录结论与待验证的问题。',kind:'summary',replyTo:user.id,clientMessageId:'identity-agent'},agentToken)
 const reviewer=await rpc('chat.post',{id:group.id,text:'我会检查引用来源和结论之间的关系，把未验证的假设单独列出。',kind:'result',replyTo:user.id,clientMessageId:'identity-reviewer'},await f.token(b.id))
 const before=await rpc('chat.history',{id:group.id}),png=fs.readFileSync(path.join(root,'app_icon.png')),image={name:'personal.png',mimeType:'image/png',data:png.toString('base64')}
 const state=await f.cli('messenger','profile','--avatar','byte');assert.equal(state.profile.avatar,'byte')
 const uploaded=await rpc('messenger.profile',{image}),hash=uploaded.profile.image.sha256
 assert.equal((await rpc('messenger.profile-image',{sha256:hash})).data,image.data);assert.equal((await rpc('messenger.profile',{image})).revision,uploaded.revision)
 assert.ok(!JSON.stringify(await rpc('messenger.state')).includes(image.data),'profile bytes are separate from messenger state')
 for(const token of [agentToken,secretaryToken]){await deny('messenger.profile',{avatar:'seedy'},token);await deny('messenger.profile-image',{sha256:hash},token)}
 for(const value of [{image:{...image,mimeType:'image/jpeg'}},{image:{...image,data:'not-base64'}},{avatar:'unknown'},{avatar:'byte',image}])await deny('messenger.profile',value)
 assert.equal((await rpc('messenger.state')).profile.image.sha256,hash);assert.equal((await rpc('api.describe',{command:'messenger.profile-image'})).readOnly,true)
 await f.stop();await f.start();assert.equal((await rpc('messenger.profile-image',{sha256:hash})).data,image.data)
 checks.push('Profile ID and uploaded PNG persist, exact-hash reads reject stale data, invalid content cannot replace it, both ordinary and Secretary Agents are denied, and state excludes image bytes.')
 if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:require('electron'),args:[application.directory],env});page=await app.firstWindow()}
 else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
 page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await expect(page.locator('.infinite-canvas')).toBeVisible();await page.getByRole('button',{name:'Messages',exact:true}).click();await page.getByRole('button',{name:'Open group '+group.name,exact:true}).click()
 const row=id=>page.locator('[data-group-message="'+id+'"] ').locator('..'),profile=()=>page.getByRole('dialog',{name:'Your message profile',exact:true}),shot=async name=>page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'})
 await expect(row(user.id).locator('[data-user-avatar=image] img')).toBeVisible();assert.ok(await row(user.id).evaluate(el=>{const avatar=el.querySelector(':scope > .message-author-avatar'),bubble=el.querySelector(':scope > .group-message');return avatar&&bubble&&!bubble.contains(avatar)&&avatar.clientHeight>=30&&getComputedStyle(avatar).clipPath==='none'&&avatar.getBoundingClientRect().left>=bubble.getBoundingClientRect().right+8}),'the real user avatar is outside the bubble, visibly laid out on its right');await expect(row(agent.id).locator('[data-author-id="'+a.id+'"] [data-portrait=fireball]')).toBeVisible();await expect(row(reviewer.id).locator('[data-author-id="'+b.id+'"] [data-portrait=seedy]')).toBeVisible()
 await page.getByRole('button',{name:'Your message profile',exact:true}).click();await profile().getByRole('button',{name:'Use default image',exact:true}).click();await profile().getByRole('button',{name:'Save changes',exact:true}).click();await expect(profile()).toHaveCount(0);await expect(row(user.id).locator('[data-user-avatar=default]')).toBeVisible();await deny('messenger.profile-image',{sha256:hash})
 await page.getByRole('button',{name:'Your message profile',exact:true}).click();await profile().getByLabel('Upload your avatar',{exact:true}).setInputFiles({name:'own-photo.png',mimeType:'image/png',buffer:png});await expect(profile().locator('[data-user-avatar=image] img')).toBeVisible();await shot('01-profile-upload');await profile().getByRole('button',{name:'Save changes',exact:true}).click();await expect(profile()).toHaveCount(0);await expect(row(user.id).locator('[data-user-avatar=image] img')).toBeVisible();await shot('02-message-authors')
 await page.reload();await expect(page.getByRole('button',{name:'Messages',exact:true})).toBeVisible();await page.getByRole('button',{name:'Messages',exact:true}).click();await page.getByRole('button',{name:'Open group '+group.name,exact:true}).click();await expect(row(user.id).locator('[data-user-avatar=image] img')).toBeVisible()
 const history=await rpc('chat.history',{id:group.id});assert.deepEqual(history.messages.map(m=>[m.id,m.author,m.text]),before.messages.map(m=>[m.id,m.author,m.text]))
 await rpc('card.remove',{id:b.id});await expect(row(reviewer.id).locator('.message-former-avatar')).toBeVisible();await expect(row(agent.id).locator('[data-portrait=fireball]')).toBeVisible()
 checks.push('Real UI uploads, previews, saves and resets the personal image; reload preserves it; each Agent bubble resolves its real author; deleted authors retain a named fallback without changing message identity or text.')
 await rpc('settings.set',{language:'zh-CN'});await expect(page.getByRole('button',{name:'我的消息头像',exact:true})).toBeVisible();await shot('03-chinese-group')
 if(native){assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))}else{await page.setViewportSize({width:420,height:860});await page.getByRole('button',{name:'返回会话列表',exact:true}).click();await page.getByRole('button',{name:'我的消息头像',exact:true}).click();await expect(page.getByRole('dialog',{name:'我的消息头像',exact:true})).toBeVisible();assert.ok(await page.locator('.message-profile-editor').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await shot('04-mobile-profile')}
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,mode,checks,errors,paidModelCalls:0,productionDataUsed:false},null,2));console.log(checks.map(c=>'PASS '+c).join('\n'))
}catch(error){await page?.screenshot({path:path.join(out,'failure.png'),animations:'disabled'}).catch(()=>{});throw error}finally{await app?.close();await browser?.close();await f?.close();application.dispose()}
