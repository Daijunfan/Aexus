// Source-only Message list: real artwork, controlled employee states, no Core/model calls.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'vite'
import {chromium,expect} from '@playwright/test'

const root=path.resolve(import.meta.dirname,'..'),renderer=path.join(root,'src/renderer/src'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-message-sidebar-'))),out=path.join(root,'artifacts/message-sidebar')
let browser
try{
 fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
 fs.writeFileSync(path.join(temp,'index.html'),'<html data-theme="violet"><body style="margin:0"><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>')
 const styles=[...fs.readFileSync(path.join(renderer,'main.tsx'),'utf8').matchAll(/import\s+(['"])([^'"]+\.css)\1/g)].map(([,quote,file])=>'import '+JSON.stringify(file.startsWith('.')?path.resolve(renderer,file):file)).join('\n')
 fs.writeFileSync(path.join(temp,'fixture.tsx'),'import '+JSON.stringify(path.join(root,'test/fixtures/message-sidebar.tsx'))+';\n'+styles)
 await build({configFile:false,root:temp,publicDir:false,esbuild:{jsx:'automatic'},build:{outDir:path.join(temp,'dist'),reportCompressedSize:false},logLevel:'silent'})
 browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})})
 const page=await browser.newPage({viewport:{width:1200,height:920}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.addInitScript(()=>{window.calls=[];window.fixtureInbox=[];window.frameMutations=0;window.agents={platform:'macos',call:async(cmd,args)=>{window.calls.push({cmd,args});return cmd==='session.inbox'?window.fixtureInbox:{}},onEvent:()=>()=>{}};new MutationObserver(changes=>window.frameMutations+=changes.length).observe(document,{subtree:true,attributes:true,attributeFilter:['data-frame']})})
 await page.route('https://sidebar-fixture.test/**',route=>route.fulfill({path:path.join(temp,'dist',new URL(route.request().url()).pathname.slice(1)||'index.html')}))
 await page.goto('https://sidebar-fixture.test/')
 const contacts=page.locator('.message-contacts'),live=()=>page.locator('.message-avatar-live').count()
 await expect(page.locator('.message-list-avatar')).toHaveCount(300)
 if(process.argv.includes('--preview')){
  const snippet=page.locator('[data-chat="studio"] .message-snippet')
  await page.evaluate(()=>window.sidebarFixture.preview('operator'));await expect(snippet).toHaveText('You: A new place for good ideas. ✨')
  await page.evaluate(()=>window.sidebarFixture.language('zh-CN'));await expect(snippet).toHaveText('我： A new place for good ideas. ✨')
  await page.evaluate(()=>window.sidebarFixture.preview('agent'));await expect(snippet).toHaveText('Aster: A new place for good ideas. ✨')
  await page.evaluate(()=>window.sidebarFixture.preview('legacy'));await expect(snippet).toHaveText('You: A new place for good ideas. ✨')
  assert.deepEqual(errors,[]);console.log('PASS group preview: explicit operator is localized; employee and legacy names remain unchanged')
 }else{
await expect(page.locator('[data-employee="employee-4"] .message-snippet')).toContainText('Draft:');await expect(page.locator('[data-chat="studio"] .message-snippet')).toContainText('Draft:');await expect.poll(live).toBeGreaterThan(0)
 const initial=await page.evaluate(()=>{const list=document.querySelector('.message-contacts').getBoundingClientRect();return {readyMs:Math.round(performance.now()),live:document.querySelectorAll('.message-avatar-live').length,limit:Math.ceil(list.height/80)+1,rows:document.querySelectorAll('.message-contact').length}})
 assert.ok(initial.live<=initial.limit,'only visible avatars animate: '+JSON.stringify(initial))
 await expect.poll(()=>page.evaluate(()=>window.frameMutations)).toBeGreaterThan(0)
 fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'desktop-active.png'),clip:{x:0,y:0,width:344,height:920}})
 await expect.poll(live,{timeout:4000}).toBe(0)
 const settledFrames=await page.evaluate(()=>window.frameMutations);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.frameMutations),settledFrames,'bounded clips settle without permanent frame updates')
 await page.evaluate(()=>window.sidebarFixture.phase('responding'));await expect.poll(live).toBeGreaterThan(0);await expect(page.locator('[data-employee="employee-0"] .message-snippet')).toContainText('Responding');await expect(page.locator('[data-employee="employee-2"] .message-snippet')).toContainText('approval');await expect(page.locator('[data-employee="employee-2"] .message-avatar-live')).toHaveCount(0)
 const cadence=await page.evaluate(()=>new Promise(resolve=>{const samples=[];let first=0,last=0;const frame=time=>{if(!first)first=time;if(last)samples.push(time-last);last=time;if(time-first<700){requestAnimationFrame(frame);return}samples.sort((a,b)=>a-b);resolve({samples:samples.length,medianMs:+samples[Math.floor(samples.length/2)].toFixed(2),p95Ms:+samples[Math.floor(samples.length*.95)].toFixed(2)})};requestAnimationFrame(frame)}))
 const row=page.locator('[data-employee="employee-0"]'),before=await row.boundingBox();await row.focus();const after=await row.boundingBox();assert.deepEqual(after,before,'focus never changes row geometry')
 await page.evaluate(()=>{document.querySelector('.message-contacts').scrollTop=8800});await expect(page.locator('[data-employee="employee-0"] .message-avatar-live')).toHaveCount(0);assert.ok(await live()<12,'offscreen employees have no sprite player')
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});await expect.poll(live).toBe(0)
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(live).toBe(0)
 await page.evaluate(()=>{document.querySelector('.message-contacts').scrollTop=0;window.sidebarFixture.phase('idle')});await row.focus();await expect.poll(live).toBe(0)
 await page.emulateMedia({reducedMotion:'no-preference'});await row.focus();await expect.poll(live).toBeGreaterThan(0);await expect.poll(live,{timeout:3000}).toBe(0)
 await page.getByRole('button',{name:'Actions for Aster',exact:true}).click();await expect(page.getByRole('menu',{name:'Conversation actions'})).toBeVisible();await page.keyboard.press('Escape')
 await page.evaluate(()=>window.sidebarFixture.selected(undefined));await page.setViewportSize({width:390,height:900});await expect(contacts).toBeVisible();assert.equal(await contacts.evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'mobile list has no horizontal overflow')
 await page.screenshot({path:path.join(out,'mobile-idle.png')});assert.deepEqual(errors,[]);assert.ok((await page.evaluate(()=>window.calls)).every(call=>call.cmd==='session.inbox'),'fixture never writes or starts tasks')
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,employees:300,initial,cadence,frameMutationsBeforeSettled:settledFrames,checks:['bounded actual atlas frames','offscreen/hidden/reduced suppression','working/responding/approval state accuracy','keyboard greeting and fixed row geometry','accessible row menu','mobile bounds'],untested:['native app performance','other operating systems']},null,2))
 await page.evaluate(()=>window.sidebarFixture.unmount());await expect.poll(live).toBe(0)
 console.log('PASS source-only Message sidebar:300 employees, bounded real avatar frames and visibility gates, stable controls and mobile layout')
 }
}finally{await browser?.close();fs.rmSync(temp,{recursive:true,force:true})}
