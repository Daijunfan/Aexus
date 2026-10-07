import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve))
const f=await fixtureCore({AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)}),out=path.join(f.root,'.aexus/artifacts/company-messages')
fs.mkdirSync(out,{recursive:true});let browser
try{
 await f.cli('group','add','Product Studio')
 const a=await f.create('Aster','Product Studio'),b=await f.create('Rowan','Product Studio')
 await f.cli('card','avatar',a.id,'fate-saber-chibi');await f.cli('card','avatar',b.id,'byte')
 fs.writeFileSync(path.join(f.control,a.id+'.reply.txt'),'The new workspace is ready to explore.\n\n**Less noise. More room for good work.**\n\nI refined the spacing, softened the surfaces, and brought our conversations together.\n\n- A clear home for every conversation\n- Helpful details, right when you need them\n- The same context, wherever you work\n\nLet’s make the next detail just as thoughtful.')
 await f.cli('session','send','--employee',a.id,'--text','Let’s make every conversation feel considered.');await f.until(async()=>!(await f.status(a.id)).busy,'fixture reply')
 browser=await chromium.launch({...(process.env.AGENTS_BROWSER_CHANNEL?{channel:process.env.AGENTS_BROWSER_CHANNEL}:process.platform==='darwin'?{channel:'chrome'}:{}),headless:true})
 const context=await browser.newContext({viewport:{width:1440,height:980}}),page=await context.newPage(),errors=[]
 page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message))
 await page.goto('http://127.0.0.1:'+port);await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim());await page.getByRole('button',{name:'Enter workspace'}).click()
 const call=(cmd,args={})=>page.evaluate(([cmd,args])=>window.agents.call(cmd,args),[cmd,args])
 await expect(page.locator('.infinite-canvas')).toBeVisible();await call('settings.set',{theme:'white'})
 await page.getByRole('button',{name:'Company Views',exact:true}).click();await expect(page.locator('.company-view-menu')).toBeVisible();await page.locator('.infinite-canvas').click({position:{x:20,y:20}});await expect(page.locator('.company-view-menu')).toHaveCount(0)
 await page.getByRole('button',{name:'Messages',exact:true}).click();await page.getByRole('button',{name:'Message Aster',exact:true}).click()
 const transcript=page.locator('.transcript'),composer=page.locator('.composer textarea')
 await expect(transcript).toContainText('Less noise.')
 const rowMenu=page.getByRole('button',{name:'Actions for Aster',exact:true});await rowMenu.locator('..').hover();await rowMenu.click();await page.getByRole('menuitem',{name:'Pin conversation',exact:true}).click();await expect.poll(async()=>(await call('messenger.state')).conversations['employee:'+a.id]?.pinned).toBe(true)
 const second=await context.newPage();await second.goto('http://127.0.0.1:'+port);await expect(second.locator('.infinite-canvas')).toBeVisible();const secondCall=(cmd,args)=>second.evaluate(([cmd,args])=>window.agents.call(cmd,args),[cmd,args]);await secondCall('messenger.conversation',{conversations:['employee:'+b.id],patch:{archived:true}});await expect(page.getByRole('button',{name:'Message Rowan',exact:true})).toHaveCount(0);await secondCall('messenger.conversation',{conversations:['employee:'+b.id],patch:{archived:false}});await expect(page.getByRole('button',{name:'Message Rowan',exact:true})).toBeVisible();await second.close()
 const assistant=page.locator('.turn.assistant').last();await assistant.hover();await assistant.getByRole('button',{name:'Save message',exact:true}).click();await page.getByRole('button',{name:'Saved messages',exact:true}).click();await expect(page.locator('.message-library')).toContainText('Less noise.');await page.getByRole('button',{name:'Close message library'}).click()
 await expect(transcript).toContainText('Less noise.');await page.screenshot({animations:'disabled',path:path.join(out,'messages-web-desktop.png')})
 for(const width of [1440,1180,1024,900,800,720,600,540,390]){
  await page.setViewportSize({width,height:900})
  const bounds=await page.locator('.company-header').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,buttons:[...el.querySelectorAll('.app-view-button')].map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}})}))
  assert.ok(bounds.scroll<=bounds.width,'header fits at '+width);assert.ok(bounds.buttons.every(b=>b.left>=0&&b.right<=width),'navigation stays inside '+width)
  const stage=await page.locator('.message-stage').boundingBox();assert.ok(stage.x+stage.width<=width+1,'conversation fits '+width)
  if(width===390){await expect(page.locator('.message-back')).toBeVisible();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({animations:'disabled',path:path.join(out,'messages-web-mobile.png')})}
 }
 await composer.fill('A multilingual draft\n第二行：清楚、从容、有条理。\nThird line\nFourth line\nFifth line');assert.ok((await composer.boundingBox()).height>95,'composer expands for multiline drafts');await composer.fill('')
 await page.setViewportSize({width:1440,height:980})
 // Real image bytes are previewed and downloaded through the scoped workspace API.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');await call('workspace.write',{employee:a.id,path:'.agents-attachments/shared.png',contentBase64:png.toString('base64'),create:true});fs.writeFileSync(path.join(f.control,a.id+'.reply.txt'),'Photo received.');await call('session.send',{employee:a.id,text:'Inspect this photo.',images:['.agents-attachments/shared.png']});await expect(page.locator('.message-photo img')).toBeVisible();await page.locator('.message-photo').click();const download=page.waitForEvent('download');await page.getByRole('link',{name:'Download image',exact:true}).click();const item=await download,downloaded=path.join(f.temp,'downloaded.png');await item.saveAs(downloaded);assert.deepEqual(fs.readFileSync(downloaded),png);await page.getByRole('button',{name:'Close image preview'}).click();await f.until(async()=>!(await f.status(a.id)).busy,'image turn')
 // Find old messages without being pulled to the bottom by streaming content.
 fs.writeFileSync(path.join(f.control,a.id+'.reply.txt'),Array.from({length:45},(_,i)=>`Research note ${i}. A thoughtful conversation keeps the reader in control.`).join('\n\n'))
 await call('session.send',{employee:a.id,text:'Please expand the research notes.'});await expect(transcript).toContainText('Research note 44');await f.until(async()=>!(await f.status(a.id)).busy,'long fixture reply')
 await page.getByRole('button',{name:'Search conversation',exact:true}).click();await page.getByRole('textbox',{name:'Find in conversation'}).fill('every conversation');await expect(page.locator('.conversation-search [role=status]')).toHaveText('1 of 2');await page.getByRole('button',{name:'Close conversation search'}).click()
 await transcript.evaluate(el=>el.scrollTop=100);await expect(page.getByRole('button',{name:'Latest messages',exact:true})).toBeVisible()
 const hold=path.join(f.control,a.id+'.hold-user'),stream=path.join(f.control,a.id+'.stream.txt');fs.writeFileSync(hold,'');fs.writeFileSync(stream,'A new update is arriving.');const oldTop=await transcript.evaluate(el=>el.scrollTop)
 await call('session.send',{employee:a.id,text:'Keep working while I read.'});await expect(transcript).toContainText('A new update is arriving.');assert.ok(Math.abs((await transcript.evaluate(el=>el.scrollTop))-oldTop)<3,'streaming does not move history')
 fs.writeFileSync(stream,'A new update is arriving.\n\nAnother carefully considered update.');await expect(transcript).toContainText('Another carefully considered update.');assert.ok(Math.abs((await transcript.evaluate(el=>el.scrollTop))-oldTop)<3)
 await page.getByRole('button',{name:'Latest messages',exact:true}).click();await expect.poll(()=>transcript.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(5)
 fs.writeFileSync(path.join(f.control,a.id+'.reply.txt'),'The research is complete.');fs.unlinkSync(hold);await f.until(async()=>!(await f.status(a.id)).busy,'finish stream')
 await page.getByRole('button',{name:'Search conversation',exact:true}).click();await page.getByRole('textbox',{name:'Find in conversation'}).fill('research');await expect(page.locator('.conversation-search [role=status]')).toHaveText('1 of 3');await page.getByRole('button',{name:'Message Rowan',exact:true}).click();await expect(page.locator('.conversation-search')).toHaveCount(0);await expect(composer).toHaveValue('')
 assert.deepEqual(await call('terminal.list'),[],'reading and searching never opens a terminal');assert.deepEqual(errors,[])
 console.log('PASS Messages Web: authenticated shared Core, canvas outside dismissal, nine responsive widths down to 390px, multiline composer, scoped search, long-message reading during streaming, latest navigation, recipient isolation; no browser errors')
}finally{await browser?.close();await f.close()}
