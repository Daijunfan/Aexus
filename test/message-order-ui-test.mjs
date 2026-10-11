// Real MessageView + authenticated temporary Core. Pointer/keyboard input in headless Web or hidden Electron.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {build as buildUi} from 'vite'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),renderer=path.join(root,'src/renderer/src'),native=process.argv.includes('--desktop'),mode=native?'desktop':'web',require=createRequire(import.meta.url),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-message-sort-ui-'))),out=path.join(root,'artifacts/message-order',mode)
fs.mkdirSync(out,{recursive:true});fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let f,browser,app,page
const checks=[],errors=[]
try{
 const entry=path.join(temp,'daemon.cjs');await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'});f=await fixtureCore({},entry)
 const rpc=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,result.error);return result.data}
 await f.cli('group','add','Newsroom');const employee=await f.create('Editor','Newsroom'),group=await rpc('chat.create',{name:'News team',members:[employee.id]})
 const channels=[]
 for(const [plugin,name] of [['telegram','Telegram'],['youtube','YouTube'],['x','X']]){const source=await rpc('channel.source-add',{plugin,locator:plugin==='youtube'?'@sortfixture':'sortfixture',name});channels.push((await rpc('channel.list')).find(item=>item.id===source.channelId))}
 for(let i=0;i<24;i++){const source=await rpc('channel.source-add',{plugin:'telegram',locator:'sort_extra_'+i,name:'Extra '+i});channels.push((await rpc('channel.list')).find(item=>item.id===source.channelId))}
 const mainKeys=[...channels.slice(0,3).map(item=>'channel:'+item.id),'employee:'+employee.id,'group:'+group.id],allKeys=[...mainKeys,...channels.slice(3).map(item=>'channel:'+item.id)]
 const inboxCategory=(await rpc('messenger.folder-save',{name:'Inbox',conversations:allKeys})).folders.find(folder=>folder.name==='Inbox'),inboxId=inboxCategory.id
 for(let i=0;i<12;i++)await rpc('messenger.folder-save',{name:['News','Work','Reading'][i]??'Category '+i,conversations:i===0?mainKeys:allKeys})
 await rpc('messenger.draft',{conversation:mainKeys[0],text:'Keep this draft',clientMessageId:'draft-sort'})
 await rpc('messenger.conversation',{conversations:[mainKeys[0]],patch:{unread:true,pinned:true,favorite:true}})
 const now=Date.now(),store=await rpc('session.list');store.sessions=store.sessions.map(card=>({...card,createdAt:now-3000}));channels.forEach((channel,index)=>channel.createdAt=now-(index<3?index:index+2)*1000);group.createdAt=now-4000
 const seed={store,groups:[group],channels,mainKeys,allKeys},styles=[...fs.readFileSync(path.join(renderer,'main.tsx'),'utf8').matchAll(/import\s+(['"])([^'"]+\.css)\1/g)].map(([,q,file])=>'import '+JSON.stringify(file.startsWith('.')?path.resolve(renderer,file):file)).join('\n')
 fs.writeFileSync(path.join(temp,'fixture.tsx'),`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{MessageView}from${JSON.stringify(renderer+'/components/MessageView')};import{MessengerContext,useMessengerState}from${JSON.stringify(renderer+'/components/useMessenger')};import{setInterfaceLanguage}from${JSON.stringify(renderer+'/i18n')};${styles}\nsetInterfaceLanguage('en');function Fixture(){const messenger=useMessengerState(true),[channels,setChannels]=useState(window.seed.channels),[selected,setSelected]=useState(''),[draft,setDraft]=useState('Unsaved editor content');window.sortFixture={language:setInterfaceLanguage,arrival:()=>setChannels(old=>old.map((channel,i)=>i===1?{...channel,lastPost:{id:'arrival',title:'New message',publishedAt:Date.now()+60000,sourceName:'News'}}:channel))};const open=id=>{window.opened.push(id);setSelected(id)};return <div className="app in-messages" style={{height:'100vh'}}><MessengerContext.Provider value={messenger}><MessageView store={window.seed.store} sessions={[]} groups={window.seed.groups} channels={channels} selectedId={selected} onOpen={card=>open(card.id)} onGroup={open} onChannel={open} onNew={()=>{}} drafts={{}}><textarea aria-label="Retained editor" value={draft} onChange={e=>setDraft(e.target.value)}/></MessageView></MessengerContext.Provider></div>}createRoot(document.getElementById('root')).render(<Fixture/>);`);fs.writeFileSync(path.join(temp,'index.html'),'<html data-theme="violet" data-presentation="messages"><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>');await buildUi({configFile:false,root:temp,publicDir:false,esbuild:{jsx:'automatic'},build:{outDir:path.join(temp,'dist'),reportCompressedSize:false},logLevel:'silent'})
 if(native){const main=path.join(temp,'electron.cjs');fs.writeFileSync(main,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(temp,'electron-profile'))});if(process.platform==='darwin')app.setActivationPolicy('prohibited');app.whenReady().then(()=>{const win=new BrowserWindow({show:false,width:1120,height:940,useContentSize:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});win.loadURL('about:blank')});app.on('window-all-closed',()=>app.quit());`);const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:require('electron'),args:[main],env});page=await app.firstWindow()}
 else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1120,height:940},hasTouch:true})}
 page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));await page.exposeFunction('sortRpc',rpc)
 const mount=async()=>{
  await page.route('https://sort-fixture.test/**',route=>route.fulfill({path:path.join(temp,'dist',new URL(route.request().url()).pathname.slice(1)||'index.html')}))
  await page.addInitScript(seed=>{window.seed=seed;window.opened=[];window.calls=[];window.motion=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.dataset?.sortKey)window.motion.push({key:this.dataset.sortKey,frames,ms:options?.duration});return animate.call(this,frames,options)};window.listeners=new Set();window.emitSort=()=>window.listeners.forEach(fn=>fn({channel:'messenger:changed',payload:{}}));window.agents={platform:'macos',onEvent:fn=>{window.listeners.add(fn);return()=>window.listeners.delete(fn)},call:async(cmd,args={})=>{window.calls.push({cmd,args});if(cmd==='messenger.reorder'&&window.failOrder){window.failOrder=false;throw Error('Fixture order save failed')}if(cmd==='messenger.reorder'&&window.holdOrder){window.holdOrder=false;await new Promise(resolve=>window.releaseOrder=resolve)}const result=await window.sortRpc(cmd,args);if(cmd.startsWith('messenger.')&&!['messenger.state','messenger.search'].includes(cmd))window.emitSort();if(cmd==='messenger.reorder'&&window.loseReply){window.loseReply=false;throw Error('Fixture response lost')}return result}}},seed)
  await page.goto('https://sort-fixture.test/');await expect(page.locator('.message-contact-wrap')).toHaveCount(allKeys.length);const inbox=page.locator('#message-folder-'+inboxId);if(await inbox.getAttribute('aria-selected')!=='true')await inbox.click()
 }
 await mount()
 const rows=page.locator('.message-contacts'),tabs=page.locator('.message-category-tabs'),row=key=>rows.locator('[data-sort-key="'+key+'"]'),keys=container=>container.locator(':scope > [data-sort-key]').evaluateAll(items=>items.map(item=>item.dataset.sortKey)),calls=()=>page.evaluate(()=>window.calls.filter(call=>call.cmd==='messenger.reorder')),idle=async()=>{await expect(rows).toHaveAttribute('aria-busy','false');await expect(tabs).toHaveAttribute('aria-busy','false');await page.waitForTimeout(260)}
 const drag=async(container,from,to,{cancel=false,outside=false,hold=false}={})=>{
  const source=container.locator('[data-sort-key="'+from+'"]'),target=container.locator('[data-sort-key="'+to+'"]');await source.scrollIntoViewIfNeeded();await idle()
  const a=await source.boundingBox(),b=await target.boundingBox();assert.ok(a&&b);const horizontal=await container.evaluate(node=>node.classList.contains('message-category-tabs')),x=a.x+Math.min(a.width/2,60),y=a.y+a.height/2,tx=horizontal?b.x+b.width*(a.x>b.x?.25:.75):x,ty=horizontal?y:b.y+b.height*(a.y>b.y?.25:.75)
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+(horizontal?8:0),y+(horizontal?0:8));await page.mouse.move(tx,ty,{steps:12});await expect(source).toHaveAttribute('data-sort-dragging','true')
  if(hold)return {source,x:tx,y:ty}
  if(cancel)await page.keyboard.press('Escape');if(outside)await page.mouse.move(1100,10);await page.mouse.up();await idle()
 }
 assert.deepEqual((await keys(rows)).slice(0,5),mainKeys)
 const originalState=await rpc('messenger.state'),folderIds=originalState.folders.filter(item=>item.id!==inboxId).map(item=>item.id)
 await drag(tabs,folderIds[1],inboxId);assert.deepEqual((await keys(tabs)).slice(0,3),[folderIds[1],inboxId,folderIds[0]])
 assert.deepEqual((await rpc('messenger.state')).orders.categories,await keys(tabs));assert.deepEqual(await page.evaluate(()=>window.opened),[]);await expect(page.getByRole('menu')).toHaveCount(0)
 await page.evaluate(()=>window.motion=[]);const beforeCalls=(await calls()).length;await drag(rows,mainKeys[2],mainKeys[0],{hold:true});assert.equal((await calls()).length,beforeCalls,'pointer moves never write')
 assert.ok(await page.locator('[data-sort-dragging=true]').evaluate(node=>getComputedStyle(node).boxShadow!=='none'))
 assert.ok(await page.evaluate(key=>window.motion.some(m=>m.key!==key&&m.ms===220&&m.frames.some(f=>f.transform&&f.transform!=='none')),mainKeys[2]),'neighbour rows animate into their new positions')
 await page.screenshot({path:path.join(out,'drag-lift.png')});await page.mouse.up();await idle();assert.ok(await page.evaluate(key=>window.motion.some(m=>m.key===key&&m.ms===220&&m.frames[0].opacity===.9),mainKeys[2]),'released row animates into its slot');await page.screenshot({path:path.join(out,'settled-wide.png')})
 assert.deepEqual((await keys(rows)).slice(0,5),[mainKeys[2],mainKeys[0],mainKeys[1],mainKeys[3],mainKeys[4]]);assert.equal((await calls()).length,beforeCalls+1)
 assert.deepEqual(await page.evaluate(()=>window.opened),[]);assert.deepEqual((await rpc('messenger.state')).drafts,originalState.drafts);assert.deepEqual((await rpc('messenger.state')).conversations,originalState.conversations)
 await page.evaluate(()=>window.sortFixture.arrival());await idle();assert.equal((await keys(rows))[0],mainKeys[2]);await expect(page.getByLabel('Retained editor')).toHaveValue('Unsaved editor content')
 checks.push('Mouse drag previews with lifted row, neighbour/landing animations, preserved editor/flags, one commit on release, no accidental open/menu/read and stable manual positions across new activity')
 const saved=await keys(rows),count=(await calls()).length;await drag(rows,mainKeys[1],mainKeys[2],{cancel:true});assert.deepEqual(await keys(rows),saved);await drag(rows,mainKeys[1],mainKeys[2],{outside:true});assert.deepEqual(await keys(rows),saved);assert.equal((await calls()).length,count)
 await page.evaluate(()=>window.failOrder=true);await drag(rows,mainKeys[1],mainKeys[2]);assert.deepEqual(await keys(rows),saved);await expect(page.getByRole('alert')).toContainText('Fixture order save failed')
 await page.evaluate(()=>window.loseReply=true);await drag(rows,mainKeys[1],mainKeys[2]);assert.deepEqual(await keys(rows),(await rpc('messenger.state')).orders[inboxId],'lost reply reconciles accepted Core order without a second write')
 checks.push('Escape/outside cancellation writes nothing; pre-write failures roll back; lost replies reconcile authoritative state')
 await page.locator('#message-folder-'+folderIds[0]).click();await expect(row(mainKeys[0])).toBeVisible();const allOrder=(await rpc('messenger.state')).orders[inboxId]
 await drag(rows,mainKeys[2],mainKeys[0]);assert.ok((await rpc('messenger.state')).orders[folderIds[0]]);assert.deepEqual((await rpc('messenger.state')).orders[inboxId],allOrder)
 await page.locator('#message-folder-'+inboxId).click();await idle();const preFilter=await keys(rows)
 await page.getByLabel('Search conversations',{exact:true}).fill('YouTube');await expect(rows.locator('[data-sort-key]')).toHaveCount(1);await page.getByLabel('Search conversations',{exact:true}).fill('');await idle();assert.deepEqual(await keys(rows),preFilter)
 // Rearrange a filtered subset without moving the hidden first five rows.
 await page.getByLabel('Search conversations',{exact:true}).fill('Extra');await idle();const extras=await keys(rows)
 await drag(rows,extras[2],extras[0]);await page.getByLabel('Search conversations',{exact:true}).fill('');await idle();const afterFilter=await keys(rows)
 assert.deepEqual(afterFilter.slice(0,5),preFilter.slice(0,5));assert.deepEqual(afterFilter.slice(5,8),[extras[2],extras[0],extras[1]])
 const keyboard=await keys(rows);await row(keyboard[1]).locator('[data-sort-start]').focus();await page.keyboard.press('Alt+ArrowUp');await idle();assert.equal((await keys(rows))[0],keyboard[1]);await expect(row(keyboard[1]).locator('[data-sort-start]')).toBeFocused()
 checks.push('Independent category order, filtered-subset drag preserves hidden slots, and keyboard reordering retains focus')
 // A stale drag must not overwrite a concurrent window's order.
 const concurrentBefore=(await rpc('messenger.state')).orders[inboxId];await drag(rows,(await keys(rows))[1],(await keys(rows))[0],{hold:true})
 const concurrent=[...concurrentBefore];[concurrent[2],concurrent[3]]=[concurrent[3],concurrent[2]];await rpc('messenger.reorder',{scope:inboxId,order:concurrent,expectedOrder:concurrentBefore});await page.mouse.up();await idle()
 assert.deepEqual(await keys(rows),concurrent);await expect(page.getByRole('alert')).toContainText('Order changed in another window')
 checks.push('Concurrent window reorder rejects stale drag and reloads saved positions')
 // Scroll an initially invisible destination into reach while holding the pointer still.
 await rows.evaluate(node=>node.scrollTop=0);await idle();const first=(await keys(rows))[0],source=row(first),a=await source.boundingBox(),box=await rows.boundingBox();await page.mouse.move(a.x+60,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+60,a.y+a.height/2+8);await page.mouse.move(a.x+60,box.y+box.height-8,{steps:10});await page.waitForTimeout(850);assert.ok(await rows.evaluate(node=>node.scrollTop>100));await page.mouse.up();await idle();assert.ok((await keys(rows)).indexOf(first)>4)
 await tabs.evaluate(node=>node.scrollLeft=0);const firstTab=(await keys(tabs))[0],tab=tabs.locator('[data-sort-key="'+firstTab+'"]'),ta=await tab.boundingBox(),tb=await tabs.boundingBox();await page.mouse.move(ta.x+ta.width/2,ta.y+ta.height/2);await page.mouse.down();await page.mouse.move(ta.x+ta.width/2+8,ta.y+ta.height/2);await page.mouse.move(tb.x+tb.width-5,ta.y+ta.height/2,{steps:8});await page.waitForTimeout(700);assert.ok(await tabs.evaluate(node=>node.scrollLeft>50));await page.keyboard.press('Escape');await page.mouse.up();await idle()
 checks.push('Horizontal category and vertical conversation edge autoscroll')
 // Re-mount against the same Core: no browser-local ordering is needed.
 const durable=await rpc('messenger.state');await mount();await idle();assert.deepEqual(await keys(rows),durable.orders[inboxId]);assert.deepEqual(await keys(tabs),durable.orders.categories)
 if(!native){
  await page.setViewportSize({width:390,height:900});await rows.evaluate(node=>node.scrollTop=0);await idle();const order=await keys(rows),aa=await row(order[0]).boundingBox(),bb=await row(order[1]).boundingBox(),cdp=await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:aa.x+80,y:aa.y+aa.height/2}]});await page.waitForTimeout(330)
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:bb.x+80,y:bb.y+bb.height/2+5}]});await page.waitForTimeout(80);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await idle();assert.equal((await keys(rows))[1],order[0]);// A quick swipe keeps native scrolling; it must not start a reorder.
  const touchWrites=(await calls()).length,area=await rows.boundingBox();await rows.evaluate(node=>node.scrollTop=0)
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:area.x+80,y:area.y+250}]})
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:area.x+80,y:area.y+170}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:area.x+80,y:area.y+90}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await idle();assert.equal((await calls()).length,touchWrites);await expect(page.locator('[data-sort-dragging]')).toHaveCount(0);assert.ok(await rows.evaluate(node=>node.scrollTop>0))
  await cdp.detach();checks.push('Real CDP long-press sorting and unmodified native swipe scrolling on 390px viewport')
 }
 if(native)await page.setViewportSize({width:390,height:900})
 await page.emulateMedia({reducedMotion:'reduce'});await rows.evaluate(node=>node.scrollTop=0);await idle();const reduced=await keys(rows);await drag(rows,reduced[1],reduced[0]);assert.equal((await keys(rows))[0],reduced[1]);assert.equal(await rows.evaluate(node=>node.getAnimations({subtree:true}).filter(animation=>animation.effect?.getTiming().duration===220).length),0)
 await page.evaluate(()=>window.sortFixture.language('zh-CN'));await page.screenshot({path:path.join(out,'compact-zh.png')});assert.ok(await page.locator('.message-sidebar').evaluate(node=>node.scrollWidth<=node.clientWidth+1))
 await page.evaluate(()=>window.sortFixture.language('en'));await page.getByRole('button',{name:'Conversation list options',exact:true}).click();await page.getByRole('menuitem',{name:'Restore recent conversation order',exact:true}).click();await idle();assert.equal((await rpc('messenger.state')).orders[inboxId],undefined)
 checks.push('Durability after remount, reduced-motion support, Chinese compact layout and restore automatic order')
 assert.deepEqual(errors,[]);assert.deepEqual((await rpc('session.transcript',{employee:employee.id})).items,[]);assert.deepEqual(await rpc('terminal.list'),[])
 if(native)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(win=>!win.isVisible())))
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,mode,checks,errors,providerCalls:0},null,2));console.log('PASS '+mode+' Message drag sorting: '+checks.join('; '))
}catch(error){await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:false,mode,checks,errors,error:error.message},null,2));throw error}
finally{await app?.close();await browser?.close();await f?.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
