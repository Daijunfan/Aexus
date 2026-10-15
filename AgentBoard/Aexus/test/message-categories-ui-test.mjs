// Actual category controls + authenticated Core in disposable data, Web and hidden Electron.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {profileApplication} from './fixtures/profile-application.mjs'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),native=process.argv.includes('--desktop'),mode=native?'desktop':'web',out=path.join(root,'artifacts/message-categories',mode);fs.mkdirSync(out,{recursive:true})
const application=await profileApplication(),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
let f,app,browser,page;const checks=[],errors=[],screens=[],metrics={}
try{
 f=await fixtureCore(native?{}:{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)},path.join(application.directory,'out/main/daemon.js'))
 const rpc=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,result.error);return result.data}
 await rpc('settings.set',{language:'en',theme:'white'});await f.cli('group','add','Studio');const a=await f.create('Alex','Studio'),b=await f.create('Blair','Studio')
 const room=await rpc('chat.create',{name:'Release room',members:[a.id,b.id]}),sources=[]
 for(const [plugin,locator,name] of [['x','@categoryalpha','Shared name'],['x','@categorybeta','Shared name'],['youtube','@categoryvideo','Video desk'],['telegram','categorynews','News desk']])sources.push(await rpc('channel.source-add',{plugin,locator,name}))
 const [alpha,beta,video,telegram]=sources,news=[]
 for(let i=0;i<31;i++)news.push(await rpc('channel.publish',{sourceId:alpha.id,externalId:'alpha-'+i,publishedAt:Date.now()-90000-i*1000,title:'Alpha research '+i,body:'Source alpha research notes '+i}))
 const peer=await rpc('channel.publish',{sourceId:beta.id,externalId:'beta',publishedAt:Date.now()-95000,title:'Only Beta',body:'This is not an Alpha article.'})
 if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:require('electron'),args:[application.directory],env});page=await app.firstWindow()}
 else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
 page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await expect(page.locator('.infinite-canvas')).toBeVisible();await page.getByRole('button',{name:'Messages',exact:true}).click()
 const rows=()=>page.locator('.message-contacts > .message-contact-wrap'),row=key=>page.locator('[data-conversation-key="'+key+'"]'),tabs=page.getByRole('tablist',{name:'Conversation categories'}),dialog=()=>page.getByRole('dialog',{name:/^(Create|Edit) category$/}),shot=async name=>{await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});screens.push(name)}
 await expect(rows()).toHaveCount(10);await expect(tabs.getByRole('tab',{name:'All',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Archived chats',exact:true})).toHaveCount(0)
 metrics.firstRowOffset=await rows().first().evaluate(el=>el.getBoundingClientRect().top-document.querySelector('.message-sidebar').getBoundingClientRect().top);assert.ok(metrics.firstRowOffset<225,JSON.stringify(metrics));await shot('01-compact-inbox')
 const create=async(preset,name,platform)=>{await page.getByRole('button',{name:'Create category',exact:true}).click();await dialog().getByRole('button',{name:preset,exact:true}).click();if(platform)await dialog().getByRole('combobox',{name:'Social platform',exact:true}).selectOption(platform);await dialog().locator('[name=conversation-folder-name]').fill(name)}
 const save=async()=>{await dialog().getByRole('button',{name:'Create category',exact:true}).click();await expect(dialog()).toHaveCount(0)}
 await create('All private chats','People');await expect(dialog().locator('input[type=checkbox]:checked')).toHaveCount(2);await save();await expect(rows()).toHaveCount(2)
 const people=(await rpc('messenger.state')).folders.find(c=>c.name==='People');const c=await f.create('Casey','Studio');await expect(rows()).toHaveCount(3)
 await create('All groups','Rooms');await expect(dialog().locator('input[type=checkbox]:checked')).toHaveCount(1);await save();await expect(row('group:'+room.id)).toBeVisible()
 const room2=await rpc('chat.create',{name:'Research room',members:[a.id]});await expect(rows()).toHaveCount(2)
 checks.push('No fixed All or empty Archive entry; private/group presets select all and automatically include later employees/groups')
 await create('Social platform','Research feeds','x');await expect(dialog().locator('input[type=checkbox]')).toHaveCount(2);await expect(dialog().locator('input[type=checkbox]:checked')).toHaveCount(2);await shot('02-platform-all')
 await dialog().getByRole('button',{name:'Deselect all',exact:true}).click();await expect(dialog().locator('input[type=checkbox]:checked')).toHaveCount(0)
 await dialog().locator('.folder-conversation-options label').filter({hasText:'@categoryalpha'}).getByRole('checkbox').check();await shot('03-author-subset');await save();await expect(rows()).toHaveCount(1);await expect(row('source:'+alpha.id)).toContainText('@categoryalpha')
 let curated=(await rpc('messenger.state')).folders.find(c=>c.name==='Research feeds');assert.deepEqual(curated.conversations,['source:'+alpha.id]);assert.equal(curated.include,undefined)
 await row('source:'+alpha.id).locator('.message-contact').click();await expect(page.locator('.channel-person strong')).toHaveText('Shared name');await expect(page.locator('.channel-news-item')).toHaveCount(24);await expect(page.locator('[data-news-id="'+peer.id+'"]')).toHaveCount(0)
 const navigation=await page.evaluate(()=>window.agents.call('view.get'));assert.equal(navigation.sourceId,alpha.id);assert.equal(navigation.channelId,alpha.channelId)
 await page.getByRole('button',{name:'Load earlier articles',exact:true}).click();await expect(page.locator('.channel-news-item')).toHaveCount(31)
 await rpc('channel.publish',{sourceId:beta.id,externalId:'new-beta',publishedAt:Date.now()-1000,title:'Unrelated incoming Beta',body:'Do not mix into Alpha.'});await page.waitForTimeout(350);await expect(page.locator('.channel-news-item')).toHaveCount(31)
 const incoming=await rpc('channel.publish',{sourceId:alpha.id,externalId:'new-alpha',publishedAt:Date.now()-500,title:'Fresh Alpha',body:'Belongs to selected source.'});await expect(page.locator('[data-news-id="'+incoming.id+'"]')).toBeVisible()
 assert.equal((await rpc('messenger.social')).find(s=>s.id===beta.id).unreadCount,2)
 const markRead=async()=>{await row('source:'+alpha.id).locator('.message-row-menu').click();await page.getByRole('menuitem',{name:'Mark as read',exact:true}).click()}
 if(app){
  await markRead();await expect(page.locator('.message-list-error')).toContainText('Activate this window');assert.equal((await rpc('messenger.social')).find(s=>s.id===alpha.id).unreadCount,32)
  // Keep the native window hidden. Only the isolated fixture's foreground predicate changes.
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];globalThis.restoreCategoryFocus=()=>{delete win.isVisible;delete win.isFocused;delete win.isMinimized;delete win.webContents.isFocused};win.isVisible=()=>true;win.isFocused=()=>true;win.isMinimized=()=>false;win.webContents.isFocused=()=>true})
 }
 await markRead()
 await expect.poll(async()=>(await rpc('messenger.social')).find(s=>s.id===alpha.id).unreadCount).toBe(0);assert.equal((await rpc('messenger.social')).find(s=>s.id===beta.id).unreadCount,2)
 await expect(row('source:'+alpha.id).locator('.message-contact')).not.toHaveAttribute('data-unread','true')
 await page.getByRole('button',{name:'Search channel',exact:true}).click();await page.getByRole('textbox',{name:'Search channel articles'}).fill('Only Beta');await expect(page.getByRole('heading',{name:'No matching articles',exact:true})).toBeVisible();await page.getByRole('button',{name:'Close search',exact:true}).click();await expect(page.locator('.channel-news-item')).toHaveCount(24);await shot('04-source-history')
 await page.getByRole('button',{name:'Open shared channel',exact:true}).click();await expect(page.locator('.channel-composer')).toBeVisible();assert.equal((await page.evaluate(()=>window.agents.call('view.get'))).sourceId,undefined)
 checks.push('Platform deselect-all/manual selection, duplicate-author identity, exact-source pagination/search/live updates and peer unread isolation work against real Core queries')
 await create('Social platform','All X','x');await save();await expect(rows()).toHaveCount(2)
 const x3=await rpc('channel.source-add',{plugin:'x',locator:'@categorygamma',name:'New author'});await expect(rows()).toHaveCount(3)
 await page.getByRole('textbox',{name:'Search conversations',exact:true}).fill('@categorybeta');await expect(rows()).toHaveCount(1);await expect(row('source:'+beta.id)).toBeVisible();await page.getByRole('button',{name:'Clear search',exact:true}).click();await expect(rows()).toHaveCount(3)
 await create('Social platform','Videos','youtube');await expect(dialog().locator('input[type=checkbox]')).toHaveCount(1);await save();await expect(row('source:'+video.id)).toBeVisible()
 await create('Social platform','Telegram notes','telegram');await expect(dialog().locator('input[type=checkbox]')).toHaveCount(1);await save();await expect(row('source:'+telegram.id)).toBeVisible()
 await create('Custom selection','Mixed desk');await dialog().locator('.folder-conversation-options label').filter({hasText:'Alex'}).first().getByRole('checkbox').check();await dialog().locator('.folder-conversation-options label').filter({hasText:'Release room'}).getByRole('checkbox').check();await dialog().locator('.folder-conversation-options label').filter({hasText:'@categorybeta'}).getByRole('checkbox').check();await save();await expect(rows()).toHaveCount(3)
 const mixed=(await rpc('messenger.state')).folders.find(c=>c.name==='Mixed desk');await rows().nth(1).locator('[data-sort-start]').focus();await page.keyboard.press('Alt+ArrowUp');await expect.poll(async()=>(await rpc('messenger.state')).orders?.[mixed.id]?.length??0).toBe(3)
 await shot('05-mixed-category')
 // Original private/group/channel preferences plus independent source all restore from one place.
 for(const key of ['employee:'+a.id,'group:'+room.id,'source:'+beta.id]){await row(key).locator('.message-row-menu').click();await page.getByRole('menuitem',{name:'Archive conversation',exact:true}).click();await expect(row(key)).toHaveCount(0)}
 await rpc('messenger.conversation',{conversations:['channel:'+video.channelId],patch:{archived:true}})
 await page.getByRole('button',{name:'Archived chats',exact:true}).click();await expect(rows()).toHaveCount(4);await shot('06-unified-archive')
 for(let i=0;i<4;i++)await page.locator('.message-restore-conversation').first().click()
 await expect(page.locator('.message-archive-entry,.message-archive-heading')).toHaveCount(0);assert.equal(Object.values((await rpc('messenger.state')).conversations).filter(p=>p.archived).length,0)
 checks.push('All three platforms list separate social elements; custom mixes and keyboard ordering persist; private/group/channel/source archive and Restore use one location, disappearing after the final restore')
 // User-created tabs, including the last, are deletable without destroying content.
 let folders=(await rpc('messenger.state')).folders
 for(const folder of folders){const tab=tabs.locator('#message-folder-'+folder.id);await tab.click({button:'right'});await page.getByRole('menuitem',{name:'Delete category',exact:true}).click();await expect(tab).toHaveCount(0)}
 assert.equal((await rpc('messenger.state')).folders.length,0);await expect(rows()).toHaveCount(13);await expect(tabs.getByRole('tab')).toHaveCount(0)
 assert.equal((await rpc('channel.post',{id:peer.id})).id,peer.id);assert.equal((await rpc('session.list')).sessions.length,3)
 await page.reload();await expect(rows()).toHaveCount(13);await expect(tabs.getByRole('tab')).toHaveCount(0)
 await create('Social platform','X','x');await save();await expect(rows()).toHaveCount(3)
 for(const theme of ['black','violet']){await rpc('settings.set',{theme});await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await shot('07-'+theme)}
 await page.setViewportSize({width:420,height:850});await page.getByRole('button',{name:'Back to conversations',exact:true}).click();await expect(page.locator('.message-sidebar')).toBeVisible();await expect(rows()).toHaveCount(3)
 assert.ok(await page.locator('.message-sidebar').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await create('Social platform','Mobile X','x');await shot('08-compact-picker');assert.ok(await dialog().evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1}));await dialog().getByRole('button',{name:'Close category editor',exact:true}).click()
 await rpc('settings.set',{language:'zh-CN'});await expect(page.getByRole('button',{name:'创建分类',exact:true})).toBeVisible();await shot('09-chinese-sidebar');assert.deepEqual(errors,[])
 if(app){await app.evaluate(()=>globalThis.restoreCategoryFocus?.());assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))}
 checks.push('Every category including last can be deleted; canonical posts remain; reload, dark/violet, 420px picker/sidebar and Chinese UI preserve layout with no renderer errors')
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,checks,metrics,screens,errors,mode,paidModelCalls:0,productionDataUsed:false},null,2));console.log(checks.map(s=>'PASS '+s).join('\n'))
}catch(error){await page?.screenshot({path:path.join(out,'failure.png'),animations:'disabled'}).catch(()=>{});throw error}finally{if(app)await app.evaluate(()=>globalThis.restoreCategoryFocus?.()).catch(()=>{});await app?.close();await browser?.close();await f?.close();application.dispose()}
