import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {chromium,_electron as electron,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {profileApplication} from './fixtures/profile-application.mjs'
const root=path.resolve(import.meta.dirname,'..'),built=await profileApplication(),native=process.argv.includes('--desktop'),out=path.join(root,'artifacts/trunkietrunk',native?'desktop':'web'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-document-ui-'))),cloud=path.join(temp,'cloud'),bin=path.join(temp,'bin')
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(cloud);fs.mkdirSync(bin)
fs.writeFileSync(path.join(bin,'ssh'),"#!/usr/bin/env python3\nimport os,sys\nos.execv('/bin/sh',['sh','-c',sys.argv[-1]])\n",{mode:0o755})
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const f=await fixtureCore({PATH:bin+':'+process.env.PATH,...(native?{}:{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)})},path.join(built.directory,'out/main/daemon.js')),require=createRequire(import.meta.url),checks=[],errors=[]
const rpc=async(cmd,args={})=>{const value=await f.request(null,cmd,args);assert.ok(value.ok,value.error);return value.data}
let app,browser,page
try{
 await rpc('settings.set',{language:'zh-CN',viewAppearance:{messages:{theme:'white'}}})
 const host=await rpc('host.create',{name:'Cloud fixture',host:'fixture',os:'linux',defaultDirectory:cloud}),source=await rpc('channel.source-add',{plugin:'telegram',targetId:'trunkietrunk-ui',locator:'trunkietrunk',name:'🟣🟢 English Trunk | Английский язык'}),collector=await rpc('channel.collector-add',{name:'Cloud fixture',sourceIds:[source.id]})
 await rpc('channel.source-avatar-put',{sourceId:source.id,name:'original-channel.jpg',mimeType:'image/jpeg',data:fs.readFileSync(path.join(root,'artifacts/trunkietrunk/telegram-original-avatar.jpg')).toString('base64')})
 await rpc('channel.update',{id:source.channelId,engine:{kind:'external',location:'remote',name:'BUPT208 document collector',host:'fixture',endpoint:'http://127.0.0.1:5152',collectorId:collector.collector.id,fileStorage:{hostId:host.id,directory:cloud}}})
 const filename='The Week US_0910.pdf',bytes=Buffer.concat([Buffer.from('%PDF-1.7\n'),crypto.randomBytes(5*1024*1024)]),sha256=crypto.createHash('sha256').update(bytes).digest('hex'),file=path.join(cloud,sha256.slice(0,2),sha256)
 fs.mkdirSync(path.dirname(file));fs.writeFileSync(file,bytes)
 const timestamp=Date.now()-3600000,telegram={groupId:'14327791817345770',views:2700,subscriberCount:54017,reactions:[{emoji:'❤️',count:18},{emoji:'🔥',count:2}]}
 const post=await rpc('channel.publish',{sourceId:source.id,externalId:'23604',publishedAt:timestamp,title:filename,body:'',telegram,files:[{id:'file-0',name:filename,mimeType:'application/pdf',bytes:bytes.length,sha256}]})
 const preview=await rpc('channel.media-put',{sourceId:source.id,externalId:'23605',publishedAt:timestamp,mediaKey:'original-thumbnail',name:'original.jpg',mimeType:'image/jpeg',data:fs.readFileSync(path.join(root,'artifacts/trunkietrunk/telegram-original-thumb.jpg')).toString('base64')})
 await rpc('channel.publish',{sourceId:source.id,externalId:'23605',publishedAt:timestamp,title:'Techlife News_0310.pdf',body:'',telegram,mediaIds:[preview.media.id],files:[{id:'file-0',name:'Techlife News_0310.pdf',mimeType:'application/pdf',bytes:bytes.length,sha256,thumbnailMediaId:preview.media.id,thumbnailOrigin:'telegram'}]})
 await rpc('channel.publish',{sourceId:source.id,externalId:'23606',publishedAt:timestamp,title:'FT EU.pdf',body:'',telegram,files:[{id:'file-0',name:'FT EU.pdf',mimeType:'application/pdf',bytes:bytes.length,sha256}]})
 const workspace=await rpc('conversation.workspace',{conversation:'channel:'+source.channelId})
 if(native){await f.stop();const env={...f.env,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1000'};delete env.ELECTRON_RUN_AS_NODE;app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[built.directory],env});page=await app.firstWindow()}
 else{browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:/Enter workspace|进入工作区/}).click()}
 page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));await page.locator('.infinite-canvas').waitFor()
 await page.evaluate(channelId=>window.agents.call('view.open',{kind:'messages',channelId}),source.channelId)
 await expect(page.locator('.channel-document')).toHaveCount(3);await expect(page.locator('.channel-news-card')).toHaveCount(1);await expect(page.locator('.telegram-original-reactions')).toContainText('18');await expect(page.locator('.channel-person')).toContainText('54,017');await expect(page.locator('.channel-document .channel-local-image img')).toBeVisible();assert.deepEqual(await page.locator('.channel-document strong').allTextContents(),[filename,'Techlife News_0310.pdf','FT EU.pdf']);checks.push('original thumbnail, three-file album in native message order, subscriber count and reactions match Telegram metadata');
 const document=page.locator('.channel-document').filter({hasText:filename});await expect(document).toContainText(filename);await expect(document).toContainText('5.0MB');await expect(document).toContainText('存储在云端');assert.equal(fs.existsSync(path.join(workspace.root,filename)),false);checks.push('original file name and size render while document bytes remain on the cloud')
 assert.ok(await document.locator('strong').evaluate(node=>node.getBoundingClientRect().width>100),'original filename has readable space');
 await page.screenshot({path:path.join(out,'01-cloud-document.png'),animations:'disabled'})
 await document.getByRole('button',{name:'下载到频道',exact:true}).click();await expect(document).toHaveAttribute('data-state','completed',{timeout:30000});assert.ok(fs.readFileSync(path.join(workspace.root,filename)).equals(bytes));checks.push('download button transfers and verifies original bytes into the channel workspace')
 await document.getByRole('button',{name:'打开频道文件',exact:true}).click();await expect(page.locator('.conversation-workspace [data-file="'+filename+'"]')).toBeVisible();await page.screenshot({path:path.join(out,'02-local-channel-storage.png'),animations:'disabled'});checks.push('saved document opens in the same storage UI used by groups')
 await page.keyboard.press('Escape');await expect(page.locator('.conversation-workspace')).toHaveCount(0);await expect(document).toContainText('已保存到频道')
 await page.locator('.directory-shared').click();await expect(page.locator('.asset-browser')).toBeVisible();await page.locator('.asset-search input').fill('FT EU.pdf');const asset=page.locator('.asset-scroll [role=listitem]').filter({hasText:'FT EU.pdf'});await expect(asset).toHaveCount(1);await asset.dblclick();await expect(page.locator('.asset-workspace-overlay')).toBeVisible({timeout:30000});assert.ok(fs.readFileSync(path.join(workspace.root,'FT EU.pdf')).equals(bytes));await expect(page.locator('.asset-workspace-overlay .file-preview')).toContainText('FT EU.pdf');await page.locator('.asset-workspace-overlay .workspace-header>button').click();await page.locator('.asset-browser > header > button').last().click();checks.push('cloud document in flat assets downloads verified bytes and opens the same channel workspace')

 for(const theme of ['white','black']){await rpc('settings.set',{viewAppearance:{messages:{theme}}});await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await page.screenshot({path:path.join(out,'03-document-'+theme+'.png'),animations:'disabled'})}
 await page.setViewportSize({width:780,height:820});await page.screenshot({path:path.join(out,'04-narrow.png'),animations:'disabled'});const box=await document.boundingBox();assert.ok(box.width>0&&box.x>=0&&box.x+box.width<=780);checks.push('document card and controls fit the narrow viewport')
 fs.unlinkSync(file);await rpc('channel.delete',{id:post.id});assert.ok(fs.existsSync(path.join(workspace.root,filename)));checks.push('removing cloud bytes and the post never deletes the saved local document')
 assert.deepEqual(errors,[]);if(native)assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,surface:native?'hidden Electron':'headless Chrome',checks,errors,models:'not used'},null,2));console.log('PASS '+checks.length+' document UI checks on '+(native?'hidden Electron':'headless Chrome'))
}catch(error){console.error(error);if(page)console.log(JSON.stringify(await page.locator('.channel-document-info strong').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,color:getComputedStyle(node).color,display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility,opacity:getComputedStyle(node).opacity,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})))));await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error}
finally{await app?.close();await browser?.close();await f.close();built.dispose();fs.rmSync(temp,{recursive:true,force:true})}
