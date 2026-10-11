// Isolated real application, deterministic local publications, no native Agent/model calls.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'electron-vite'
import {chromium,_electron as electron,expect} from '@playwright/test'
import sharp from 'sharp'
import {fixtureCore} from './fixtures/headless-core.mjs'

const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url),progress=path.join(root,'progress/Agents-company1.md')
// The MCP terminal can start as root. Restore only files created by this task,
// then drop to the repository owner's identity before builds or browsers run.
if(process.getuid?.()===0){
 const {uid,gid}=fs.statSync(root)
 for(const file of ['progress/Agents-company1.md','share_chat/Agents-company1-channel-views.md','src/renderer/src/components/ChannelPostFeed.tsx','src/renderer/src/components/channel-post-model.ts','src/renderer/src/styles/channel-posts.css','test/channel-post-model-test.mjs','test/channel-post-views-ui-test.mjs'])fs.chownSync(path.join(root,file),uid,gid)
 process.setgroups([gid]);process.setgid(gid);process.setuid(uid)
 const user=os.userInfo();Object.assign(process.env,{HOME:user.homedir,USER:user.username,LOGNAME:user.username,TMPDIR:'/tmp'})
}
const out=path.join(root,'artifacts/channel-post-views'),application=path.join(out,'application')
fs.mkdirSync(out,{recursive:true})
const note=text=>{console.log(text);fs.appendFileSync(progress,'\n- ['+new Date().toISOString()+'] '+text+'\n')}
if(!process.argv.includes('--skip-build')){
 note('开始隔离构建：artifacts/channel-post-views/application；不覆盖项目 out/。')
 fs.mkdirSync(application,{recursive:true})
 fs.writeFileSync(path.join(application,'package.json'),fs.readFileSync(path.join(root,'package.json')))
 for(const name of ['node_modules','bin','docs','Agents-Managers','Modules','build','src','API.md','ARCHITECTURE.md','AGENTS.md','PERMISSIONS.md','PLUGIN_SPEC.md','README.md','engine-downloads.json']){
  const target=path.join(application,name)
  if(!fs.existsSync(target)&&fs.existsSync(path.join(root,name)))fs.symlinkSync(path.join(root,name),target)
 }
 const config=path.join(out,'build.config.mjs')
 fs.writeFileSync(config,`import original from ${JSON.stringify(path.join(root,'electron.vite.config.ts'))};\nexport default Object.fromEntries(Object.entries(original).map(([part,value])=>[part,{...value,build:{...value.build,outDir:${JSON.stringify(application)}+'/out/'+part,emptyOutDir:true}}]));\n`)
 await build({configFile:config,logLevel:'warn'})
 note('PASS：隔离 Electron main / preload / renderer 构建。')
}

const bytes=await Promise.all(['#386b65','#426da6','#966344','#79569c'].map(async(color,index)=>sharp(Buffer.from(`<svg width="720" height="900" xmlns="http://www.w3.org/2000/svg"><rect width="720" height="900" fill="${color}"/><circle cx="550" cy="200" r="240" fill="#ffffff" opacity=".12"/><rect x="50" y="470" width="620" height="350" rx="30" fill="#f7f3e9"/><path d="M90 730L210 600L320 690L470 550L620 730" fill="none" stroke="${color}" stroke-width="20"/><text x="55" y="95" fill="#ffffff" font-family="sans-serif" font-size="25">FIELD NOTES / 0${index+1}</text><text x="55" y="245" fill="#ffffff" font-family="sans-serif" font-size="62" font-weight="bold">Small ideas,</text><text x="55" y="320" fill="#ffffff" font-family="sans-serif" font-size="62" font-weight="bold">clear stories.</text></svg>`)).png().toBuffer()))

async function run(native){
 const mode=native?'desktop':'web',probe=net.createServer()
 await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve))
 const fixture=await fixtureCore(native?{}:{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)},path.join(application,'out/main/daemon.js'))
 let browser,app,page
 const rpc=async(cmd,args={})=>{const result=await fixture.request(null,cmd,args);assert.ok(result.ok,result.error);return result.data}
 const errors=[],calls=[]
 try{
  note('开始 '+mode+' UI 验证：独立临时状态，无真实员工或订阅调用。')
  await rpc('settings.set',{language:'en',theme:'violet'})
  const sources=[]
  for(const [plugin,locator,name] of [['telegram','post_view_telegram','Field notes'],['x','@postviewone','Research studio'],['youtube','https://www.youtube.com/@PostViewFixture','Video journal'],['x','@postviewtwo','Research studio']])sources.push(await rpc('channel.source-add',{plugin,locator,name}))
  const posts=[],base=Date.now()-60000
  for(let i=0;i<8;i++)for(let s=0;s<sources.length;s++){
   const source=sources[s],publishedAt=base-i*60000-s*1000,externalId='post-view-'+s+'-'+i,mediaIds=[]
   if(![1,2].includes(i))for(let image=0;image<(i===3?3:1);image++){
    const value=await rpc('channel.media-put',{sourceId:source.id,externalId,publishedAt,mediaKey:'photo-'+image,name:'Field note '+(image+1)+'.png',mimeType:'image/png',data:bytes[(s+image)%bytes.length].toString('base64')});mediaIds.push(value.media.id)
   }
   const title=i===0?'':i===2?'A title without a description':'Note '+i+' · '+source.name
   const body=i===0||i===2?'':'A useful idea deserves a little space.\n\n**Read the complete story.** The original context stays in the conversation. '+(i===1?'Thoughtful reading, without a cover image. '.repeat(8):'')
   const value=await rpc('channel.publish',{sourceId:source.id,externalId,publishedAt,title,body,authorName:source.name,url:'https://example.invalid/post-view/'+s+'/'+i,mediaIds,...(i===3?{avatarMediaId:mediaIds[0]}:{})})
   posts.push({...value,source,i,mediaIds})
  }
  const saved=posts.find(post=>post.source.id===sources[0].id&&post.i===3)
  await rpc('channel.save',{id:saved.id,saved:true})
  if(native){
   await fixture.stop();const env={...fixture.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE
   app=await electron.launch({executablePath:require('electron'),args:[application],env});page=await app.firstWindow()
  }else{
   browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}})
   await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(fixture.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace',exact:true}).click()
  }
  page.setDefaultTimeout(15000);await page.emulateMedia({reducedMotion:'reduce'})
  page.on('pageerror',error=>errors.push(error.message))
  page.on('request',request=>{if(request.url().endsWith('/api/rpc')){try{calls.push(request.postDataJSON().cmd)}catch{}}})
  await expect(page.locator('.infinite-canvas')).toBeVisible()
  await page.getByRole('button',{name:'Messages',exact:true}).click()
  const conversation=page.locator('.channel-conversation'),feed=conversation.locator('.channel-feed'),cards=conversation.locator('.channel-post-card')
  const switchTo=async view=>{await conversation.getByRole('button',{name:view==='posts'?'Post view':'Channel view',exact:true}).click();await expect(conversation).toHaveAttribute('data-feed-view',view)}
  const open=async id=>{await page.locator('.message-contact[data-channel="'+id+'"]').click();await expect(feed).toHaveAttribute('aria-busy','false')}
  const geometry=async()=>conversation.evaluate(section=>{
   const area=section.querySelector('.channel-feed').getBoundingClientRect(),header=section.querySelector('.message-thread-header').getBoundingClientRect(),rects=[...section.querySelectorAll('.channel-post-open')].map(card=>card.getBoundingClientRect())
   let overlap=0;for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++)if(Math.min(rects[i].right,rects[j].right)-Math.max(rects[i].left,rects[j].left)>1&&Math.min(rects[i].bottom,rects[j].bottom)-Math.max(rects[i].top,rects[j].top)>1)overlap++
   const controls=[...section.querySelector('.message-thread-header').children].filter(el=>el.getBoundingClientRect().width).map(el=>el.getBoundingClientRect());let controlOverlap=0
   for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++)if(Math.min(controls[i].right,controls[j].right)-Math.max(controls[i].left,controls[j].left)>1&&Math.min(controls[i].bottom,controls[j].bottom)-Math.max(controls[i].top,controls[j].top)>1)controlOverlap++
   return {columns:getComputedStyle(section.querySelector('.channel-post-grid')).gridTemplateColumns.split(' ').length,overlap,controlOverlap,visible:rects.filter(rect=>rect.top<area.bottom&&rect.bottom>area.top).length,horizontalOverflow:section.scrollWidth>section.clientWidth+1,headerInside:header.left>=-1&&header.right<=innerWidth+1,cardsInside:rects.every(rect=>rect.left>=area.left-1&&rect.right<=area.right+1)}
  })
  for(const source of sources.slice(0,3)){
   await open(source.channelId);await expect(conversation.getByRole('button',{name:'Channel view',exact:true})).toHaveAttribute('aria-pressed','true')
   await expect(conversation.locator('.channel-news-card').first()).toBeAttached()
   await switchTo('posts');await expect(cards).toHaveCount(source.plugin==='x'?16:8)
   await expect(conversation.locator('[data-channel-read]')).toHaveCount(0)
   await expect(conversation.locator('.channel-composer')).toBeHidden()
   await expect(cards.locator('.channel-post-cover img').first()).toBeVisible()
   assert.ok((await geometry()).columns>=3)
  }
  note('PASS '+mode+'：Telegram / X / YouTube 共用切换，旧聊天保留，帖子模式没有全文已读标记。')
  // One mixed reading channel exercises author identity, source routing and pagination.
  for(const source of sources.slice(1))await rpc('channel.source-update',{id:source.id,patch:{channelId:sources[0].channelId}})
  await open(sources[0].channelId);await switchTo('posts');await expect(cards).toHaveCount(24)
  await conversation.getByRole('button',{name:'Load earlier articles',exact:true}).click();await expect(cards).toHaveCount(32)
  await feed.evaluate(el=>el.scrollTo(0,0));await expect.poll(async()=>(await geometry()).overlap).toBe(0)
  const wide=await geometry();assert.ok(wide.columns>=3&&wide.visible>=6);assert.equal(wide.controlOverlap,0);assert.equal(wide.horizontalOverflow,false);assert.equal(wide.cardsInside,true)
  await page.screenshot({animations:'disabled',path:path.join(out,mode+'-posts-wide.png')})
  const storedBefore=await page.evaluate(()=>JSON.stringify(Object.entries(localStorage).sort())),configBefore=await rpc('channel.collector-config')
  calls.length=0
  for(const source of [sources[1],sources[3],sources[2]]){
   await conversation.locator('.channel-post-sources button[data-source-key="'+source.plugin+':'+source.id+'"]').click();await expect(cards).toHaveCount(8)
   assert.ok((await cards.evaluateAll(elements=>elements.map(el=>el.dataset.sourceKey))).every(key=>key===source.plugin+':'+source.id))
  }
  await conversation.locator('.channel-post-sources button').first().click();await expect(cards).toHaveCount(32)
  await page.waitForTimeout(800)
  assert.deepEqual(calls.filter(cmd=>['channel.acknowledge','channel.save','channel.delete','channel.source-update','channel.message-send','settings.set'].includes(cmd)),[],'render-only interactions never mutate retained data or reading state')
  assert.equal(await page.evaluate(()=>JSON.stringify(Object.entries(localStorage).sort())),storedBefore,'view/source preferences stay in memory')
  assert.deepEqual(await rpc('channel.collector-config'),configBefore)
  await expect(cards.filter({has:page.locator('.channel-post-saved')})).toHaveCount(1)
  const album=cards.locator('.channel-post-album').first();await expect(album).toHaveText('2')
  await expect(cards.locator('.channel-post-cover.is-text')).toHaveCount(8)
  note('PASS '+mode+'：同名博主独立筛选、32 条分页、图片/纯文字/标题/多图、无新增持久化或写操作。')
  // Each view has its own scroll position, and the composer stays mounted.
  await switchTo('conversation');await expect(feed).toHaveAttribute('aria-busy','false')
  const composer=conversation.getByRole('textbox',{name:'Channel message',exact:true});await composer.fill('Draft survives layout switches')
  await feed.evaluate(el=>el.scrollTo(0,420));await page.waitForTimeout(120);const chatScroll=await feed.evaluate(el=>el.scrollTop)
  await switchTo('posts');await feed.evaluate(el=>el.scrollTo(0,500));await page.waitForTimeout(120);const postScroll=await feed.evaluate(el=>el.scrollTop)
  await switchTo('conversation');await expect(composer).toHaveValue('Draft survives layout switches');assert.ok(Math.abs(await feed.evaluate(el=>el.scrollTop)-chatScroll)<3)
  await switchTo('posts');assert.ok(Math.abs(await feed.evaluate(el=>el.scrollTop)-postScroll)<3)
  const target=posts.find(post=>post.source.id===sources[2].id&&post.i===4)
  await conversation.locator('.channel-post-card[data-news-id="'+target.id+'"] .channel-post-open').click()
  await expect(conversation).toHaveAttribute('data-feed-view','posts')
  const detail=page.getByRole('dialog',{name:'Post details',exact:true})
  await expect(detail.locator('.channel-news-card[data-news-id="'+target.id+'"]')).toBeVisible()
  await detail.getByRole('button',{name:'Close post',exact:true}).click()
  await expect(detail).toHaveCount(0);await expect(conversation).toHaveAttribute('data-feed-view','posts')
  await switchTo('conversation');await expect(composer).toHaveValue('Draft survives layout switches')
  await composer.fill('')
  await switchTo('posts');await conversation.getByRole('button',{name:'Search channel',exact:true}).click()
  const search=conversation.getByRole('textbox',{name:'Search channel articles',exact:true})
  await search.fill('Note 4');await expect(cards).toHaveCount(4);await search.fill('no-such-post-view-fixture');await expect(cards).toHaveCount(0);await expect(conversation.locator('.channel-feed-empty')).toContainText('No matching articles')
  await conversation.getByRole('button',{name:'Close search',exact:true}).click();await expect(cards).toHaveCount(24)
  await conversation.getByRole('button',{name:'Saved articles',exact:true}).click();await expect(cards).toHaveCount(1);await expect(cards.first()).toHaveAttribute('data-news-id',saved.id)
  await conversation.getByRole('button',{name:'Saved articles',exact:true}).click();await expect(cards).toHaveCount(24)
  note('PASS '+mode+'：双视图独立滚动、草稿保留、点击留白详情浮层、搜索空状态、收藏过滤。')
  // Live publication refreshes the projection without jumping away from reading.
  await feed.evaluate(el=>el.scrollTo(0,0))
  const live=await rpc('channel.publish',{sourceId:sources[0].id,externalId:'post-view-live',publishedAt:Date.now()-1000,title:'A new story arrives',body:'The same live data, another way to read.'})
  await expect(conversation.locator('.channel-post-card[data-news-id="'+live.id+'"]')).toBeVisible();await expect(cards.first()).toHaveAttribute('data-news-id',live.id)
  await rpc('settings.set',{language:'zh-CN',theme:'blue'});await expect(conversation.getByRole('button',{name:'帖子视图',exact:true})).toHaveAttribute('aria-pressed','true')
  await page.screenshot({animations:'disabled',path:path.join(out,mode+'-posts-zh.png')})
  if(native)await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(720,900));else await page.setViewportSize({width:390,height:844})
  await feed.evaluate(el=>el.scrollTo(0,0));await expect.poll(async()=>(await geometry()).overlap).toBe(0)
  const compact=await geometry();assert.equal(compact.horizontalOverflow,false);assert.equal(compact.headerInside,true);assert.equal(compact.controlOverlap,0);assert.equal(compact.cardsInside,true);if(!native)assert.equal(compact.columns,2)
  await expect(conversation.getByRole('button',{name:'频道视图',exact:true})).toBeVisible();await expect(conversation.getByRole('button',{name:'帖子视图',exact:true})).toBeVisible()
  await page.screenshot({animations:'disabled',path:path.join(out,mode+'-posts-compact.png')})
  await rpc('settings.set',{theme:'midnight'});await expect(page.locator('html')).toHaveAttribute('data-theme','midnight');await page.screenshot({animations:'disabled',path:path.join(out,mode+'-posts-dark.png')})
  assert.deepEqual(errors,[]);assert.deepEqual(await rpc('terminal.list'),[])
  if(native)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(win=>!win.isVisible())))
  const result={passed:true,mode,platform:process.platform,wide,compact,checks:['three platforms','same-name source identity','masonry bounds','pagination','text/title/image-only and albums','no storage or read writes','independent scroll','draft preservation','open detail without navigation','search and saved filters','live updates','bilingual themes','hidden/headless isolated state']}
  fs.writeFileSync(path.join(out,mode+'-verification.json'),JSON.stringify(result,null,2));note('PASS '+mode+'：实时更新、中英文/主题/窄窗口、无重叠；验证报告和截图已保存。')
 }catch(error){
  await page?.screenshot({animations:'disabled',path:path.join(out,mode+'-failure.png')}).catch(()=>{})
  note('FAIL '+mode+'：'+error.message);throw error
 }finally{await app?.close();await browser?.close();await fixture.close()}
}
for(const native of process.argv.includes('--web-only')?[false]:process.argv.includes('--desktop-only')?[true]:[false,true])await run(native)
note('频道双视图 UI 验证执行结束。')
