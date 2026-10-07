// Full source App and temporary Core. No network collectors, paid models or production state.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {chromium,_electron as electron,expect} from '@playwright/test'
import sharp from 'sharp'
import {profileApplication} from './fixtures/profile-application.mjs'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),require=createRequire(import.meta.url),native=process.argv.includes('--desktop'),mode=native?'desktop':'web',out=path.join(root,'.aexus/artifacts/channel-post-detail',mode)
fs.mkdirSync(out,{recursive:true});const application=await profileApplication(),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
let f,app,browser,page;const checks=[],errors=[],shots=[],geometry=[]
try{
 f=await fixtureCore(native?{}:{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)},path.join(application.directory,'.aexus/out/main/daemon.js'))
 const rpc=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,result.error);return result.data}
 await rpc('settings.set',{language:'en',theme:'white'})
 const a=await rpc('channel.source-add',{plugin:'x',locator:'@detail_north',name:'Field Journal'}),b=await rpc('channel.source-add',{plugin:'x',locator:'@detail_south',name:'Field Journal'}),posts=[]
 const png=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="660"><rect width="900" height="660" fill="#dbe8df"/><circle cx="680" cy="180" r="200" fill="#799b8c"/><path d="M0 570 L260 250 L470 490 L630 330 L900 630 V660 H0Z" fill="#33574f"/><text x="65" y="95" font-size="36" font-family="sans-serif" fill="#25463f">FIELD JOURNAL / DESIGN NOTES</text></svg>')).png().toBuffer()
 for(let i=0;i<29;i++){
  const source=i%2?b:a,externalId='detail-'+i,publishedAt=Date.now()-180000-i*1000,mediaIds=[]
  if(i===4)for(let j=0;j<2;j++)mediaIds.push((await rpc('channel.media-put',{sourceId:source.id,externalId,publishedAt,mediaKey:'photo-'+j,name:'Field image '+j+'.png',mimeType:'image/png',data:png.toString('base64')})).media.id)
  posts.push(await rpc('channel.publish',{sourceId:source.id,externalId,publishedAt,title:i===4?'Room for the complete story':'Reading note '+i,body:i===4?'**A closer look at the design.**\n\n'+Array.from({length:12},(_,n)=>'## Observation '+(n+1)+'\n\nKeep the original context, look closely, and return to the same place. Readable details matter.').join('\n\n'):'A short field note with a useful observation, shared without leaving your reading list.',mediaIds}))
 }
 if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:require('electron'),args:[application.directory],env});page=await app.firstWindow()}
 else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()}
 page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await expect(page.locator('.infinite-canvas')).toBeVisible()
 await page.getByRole('button',{name:'Messages',exact:true}).click();await page.locator('.message-contact[data-channel="'+a.channelId+'"]').click();const channel=page.locator('.channel-conversation'),feed=channel.locator('.channel-feed'),grid=channel.locator('.channel-post-grid'),detail=page.getByRole('dialog',{name:'Post details',exact:true})
 await channel.getByRole('button',{name:'Post view',exact:true}).click();await expect(grid.locator('.channel-post-card')).toHaveCount(24);await channel.getByRole('button',{name:'Load earlier articles',exact:true}).click();await expect(grid.locator('.channel-post-card')).toHaveCount(29)
 const button=id=>grid.locator('[data-news-id="'+id+'"] .channel-post-open'),close=()=>detail.getByRole('button',{name:'Close post',exact:true}),shot=async name=>{await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});shots.push(name)}
 await button(posts[4].id).scrollIntoViewIfNeeded();await button(posts[4].id).locator('img').first().waitFor();await page.waitForTimeout(250)
 await page.evaluate(()=>{window.postGrid=document.querySelector('.channel-post-grid');window.postScroll=document.querySelector('.channel-post-feed').scrollTop})
 await button(posts[4].id).click();await expect(channel).toHaveAttribute('data-feed-view','posts');await expect(detail).toBeVisible()
 await expect(detail.locator('.channel-news-card>h2')).toHaveText('Room for the complete story');await expect(detail.getByText('Observation 12',{exact:true})).toBeAttached();await expect(detail.locator('.channel-news-body.collapsed')).toHaveCount(0);await expect(detail.getByRole('button',{name:/Back/})).toHaveCount(0)
 const bounds=await detail.evaluate(el=>{const r=el.getBoundingClientRect(),a=el.closest('.channel-conversation').getBoundingClientRect(),s=getComputedStyle(el.parentElement);return {left:r.left-a.left,right:a.right-r.right,top:r.top-a.top,bottom:a.bottom-r.bottom,blur:s.backdropFilter}});geometry.push(bounds);assert.ok(bounds.left>=20&&bounds.right>=20&&bounds.top>=20&&bounds.bottom>=20,JSON.stringify(bounds));assert.match(bounds.blur,/blur/)
 await shot('01-glass-detail');await detail.locator('.channel-news-card>h2').click();await expect(detail).toBeVisible()
 const backgroundScroll=await feed.evaluate(el=>el.scrollTop);await detail.locator('.channel-post-detail-scroll').evaluate(el=>el.scrollTop=400);assert.equal(await feed.evaluate(el=>el.scrollTop),backgroundScroll)
 await page.locator('.channel-post-detail-overlay').click({position:{x:8,y:80}});await expect(detail).toHaveCount(0);await expect(channel).toHaveAttribute('data-feed-view','posts');assert.equal(await grid.evaluate(el=>el===window.postGrid),true);assert.equal(await feed.evaluate(el=>el.scrollTop),await page.evaluate(()=>window.postScroll))
 checks.push('Post cards open a full-text glass detail within the right pane; outside click restores the same mounted grid and scroll without switching view')
 await button(posts[4].id).click();await expect(detail).toBeVisible();await detail.locator('.channel-news-images button').first().click();await expect(page.getByRole('dialog',{name:'Image preview',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Image preview',exact:true})).toHaveCount(0);await expect(detail).toBeVisible()
 await detail.locator('.channel-post-detail-scroll').evaluate(el=>el.scrollTop=0);await detail.getByRole('button',{name:'Article actions',exact:true}).click();await expect(page.getByRole('menu',{name:'Article actions',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);await expect(detail).toBeVisible()
 await page.keyboard.press('Escape');await expect(detail).toHaveCount(0);await expect(button(posts[4].id)).toBeFocused();checks.push('Image preview and action menu close independently; Escape restores keyboard focus to the originating post')
 await button(posts[2].id).click();await detail.getByRole('button',{name:'Save article',exact:true}).click();await expect(detail.getByRole('button',{name:'Saved',exact:true})).toHaveAttribute('aria-pressed','true');assert.equal((await rpc('channel.post',{id:posts[2].id})).saved,true)
 await close().click();await expect(grid.locator('[data-news-id="'+posts[2].id+'"] .channel-post-saved')).toHaveCount(1)
 await button(posts[2].id).click();await rpc('channel.delete',{id:posts[2].id});await expect(detail.getByRole('alert')).toBeVisible();await expect(detail.locator('.channel-news-card')).toHaveCount(0);await close().click();await expect(grid.locator('[data-news-id="'+posts[2].id+'"]')).toHaveCount(0);await expect(channel.getByRole('button',{name:'Post view',exact:true})).toBeFocused();checks.push('Save updates the canonical record and card; external deletion removes stale content without changing the Posts view')
 await channel.locator('.channel-post-sources [data-source-key="x:'+a.id+'"]').click();await button(posts[4].id).click();await close().click();await expect(channel.locator('.channel-post-sources [data-source-key="x:'+a.id+'"]')).toHaveAttribute('aria-pressed','true')
 await channel.getByRole('button',{name:'Search channel',exact:true}).click();await channel.getByRole('textbox',{name:'Search channel articles'}).fill('Room for the complete story');await expect(grid.locator('.channel-post-card')).toHaveCount(1);await button(posts[4].id).click();await close().click();await expect(channel.getByRole('textbox',{name:'Search channel articles'})).toHaveValue('Room for the complete story');await channel.getByRole('button',{name:'Close search',exact:true}).click()
 checks.push('Source filters, pagination and search survive opening and closing the detail')
 // Full-text reading acknowledges only its visible end, never the underlying grid or peer posts.
 const receipts=async()=>Object.fromEntries((await rpc('channel.read-state',{id:a.channelId,entryIds:posts.filter(p=>p.id!==posts[2].id).map(p=>p.id)})).entries.map(e=>[e.id,e.state]))
 const unreadPost=await rpc('channel.publish',{sourceId:a.id,externalId:'unread-long',publishedAt:Date.now()-1000,title:'A genuinely unread long story',body:(await rpc('channel.post',{id:posts[4].id})).body});posts.push(unreadPost);await expect(button(unreadPost.id)).toBeAttached()
 const beforeReads=await receipts();assert.equal(beforeReads[unreadPost.id],'unread');await button(unreadPost.id).click();await expect(detail.locator('.channel-news-card>h2')).toBeVisible();await page.waitForTimeout(800)
 assert.deepEqual(await receipts(),beforeReads,'The top of a long post is not its read boundary')
 await detail.locator('.channel-post-detail-scroll').evaluate(el=>el.scrollTop=el.scrollHeight)
 if(!native){await page.bringToFront();await expect.poll(async()=>(await receipts())[unreadPost.id]).toBe('read')}
 else{await page.waitForTimeout(800);assert.deepEqual(await receipts(),beforeReads,'A genuinely hidden desktop still cannot acknowledge')}
 const afterReads=await receipts();for(const [id,state]of Object.entries(beforeReads))if(id!==unreadPost.id)assert.equal(afterReads[id],state)
 await close().click();checks.push('Only the selected, fully viewed post may become read; peers stay unchanged and the native hidden-window guard remains intact')
 // The Web boundary is replaceable for failure injection; native contextBridge remains immutable.
 if(!native){
 // Transient failure and a late response cannot switch mode or reopen a dismissed detail.
 await page.evaluate(()=>{window.detailApi=window.agents.call.bind(window.agents);window.failDetail=true;window.agents.call=async(cmd,args)=>{if(cmd==='channel.post'&&window.failDetail){window.failDetail=false;throw Error('Detail read interrupted')}return window.detailApi(cmd,args)}})
 await button(posts[6].id).click();await expect(detail.getByRole('alert')).toContainText('Detail read interrupted');await detail.getByRole('button',{name:'Retry',exact:true}).click();await expect(detail.locator('.channel-news-card')).toBeVisible();await close().click()
 await page.evaluate(()=>{window.agents.call=window.detailApi;window.delayDetail=true;window.agents.call=async(cmd,args)=>{if(cmd==='channel.post'&&window.delayDetail){window.delayDetail=false;await new Promise(resolve=>window.releaseDetail=resolve)}return window.detailApi(cmd,args)}})
 await button(posts[6].id).click();await expect.poll(()=>page.evaluate(()=>typeof window.releaseDetail)).toBe('function');await close().click();await page.evaluate(()=>window.releaseDetail());await page.waitForTimeout(120);await expect(detail).toHaveCount(0);await expect(channel).toHaveAttribute('data-feed-view','posts');await page.evaluate(()=>window.agents.call=window.detailApi)
 checks.push('Web: Retry preserves the current grid; late detail responses after dismissal cannot reopen it')
 }

 for(const theme of ['black','violet']){await rpc('settings.set',{theme});await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await button(posts[4].id).click();await shot('02-'+theme);await close().click()}
 await page.setViewportSize({width:420,height:650});await button(posts[4].id).click();await expect(detail).toBeVisible();const small=await detail.boundingBox();assert.ok(small.x>=12&&small.x+small.width<=409&&small.y>=12&&small.y+small.height<=639,JSON.stringify(small));assert.ok(await detail.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await shot('03-compact');await close().click()
 await page.emulateMedia({reducedMotion:'reduce'});await button(posts[6].id).click();await expect(detail).toBeVisible();await page.keyboard.press('Escape');await expect(detail).toHaveCount(0)
 assert.deepEqual(errors,[]);assert.deepEqual(await rpc('session.list',{live:true}),[]);assert.deepEqual(await rpc('terminal.list'),[])
 if(app)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 checks.push('Light/dark/violet and compact layouts keep surrounding space; reduced motion works without renderer errors or Agent work')
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,mode,checks,geometry,shots,errors,paidModelCalls:0,productionDataUsed:false},null,2));console.log(checks.map(s=>'PASS '+s).join('\n'))
}catch(error){await page?.screenshot({path:path.join(out,'failure.png'),animations:'disabled'}).catch(()=>{});throw error}finally{await app?.close();await browser?.close();await f?.close();application.dispose()}
