// Isolated renderer fixture: accepted/failed writes are controlled, never real user state.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'

const root=path.resolve(import.meta.dirname,'../../..'),renderer=path.join(root,'Infra/src/renderer/src'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-expression-motion-')),out=path.join(root,'.aexus/artifacts/message-expression-motion')
let browser
try{
 await build({stdin:{resolveDir:renderer,loader:'tsx',contents:`
 import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {MessageActions} from './chat/MessageActions';import {MessengerContext} from './components/useMessenger';import {messageKey} from '../../shared/messenger';import {setInterfaceLanguage} from './i18n';setInterfaceLanguage('en');
 import './styles/shared.css';import './styles/messages.css';import './styles/group-chat.css';import './styles/messenger.css';import './styles/message-surface.css';import './styles/themes.css';
 function Fixture(){const [preferences,setPreferences]=useState({reaction:'❤️'}),[mounted,setMounted]=useState(true),[emoji,setEmoji]=useState(true);window.fixture={mount:setMounted,emoji:setEmoji};
 const controller={state:{messages:{[messageKey('group:fixture','message')]:preferences}},message:async(conversation,id,patch)=>{window.writes.push({conversation,id,patch});const ok=await new Promise(resolve=>window.resolveMutation=resolve);window.resolveMutation=null;if(ok)setPreferences(previous=>({...previous,...patch}));return ok}};
 return <MessengerContext.Provider value={controller}><div className="message-view" style={{display:'block',height:600}}><div className="message-stage" style={{padding:'170px 120px 70px',height:'100%'}}>{mounted&&<div className="group-message from-user" data-chat-item="message" data-emoji-count={emoji?'1':undefined}><div className="markdown">{emoji?'🥰':'A real message'}</div><MessageActions conversation="group:fixture" id="message" text={emoji?'🥰':'A real message'}/></div>}</div></div></MessengerContext.Provider>}
 createRoot(document.getElementById('root')).render(<Fixture/>);
 `},bundle:true,outfile:path.join(temp,'app.js'),jsx:'automatic',loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl','.svg':'dataurl','.png':'dataurl'},logLevel:'silent'})
 browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})})
 const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('https://expression-fixture.test/**',route=>route.fulfill({contentType:'text/html',body:'<html data-theme="violet"><body><div id="root"></div></body></html>'}))
 await page.goto('https://expression-fixture.test/')
 await page.evaluate(()=>{window.writes=[];window.motion=[];window.holdFlight=true;window.agents={call:async()=>({}),onEvent:()=>()=>{}};const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){const animation=animate.call(this,frames,options);if(this.matches('.message-expression-flight,.message-reaction,.markdown')){window.motion.push({className:this.className,frames,options});if(this.matches('.message-expression-flight')&&window.holdFlight){animation.pause();animation.currentTime=0}}return animation}})
 await page.addStyleTag({content:fs.readFileSync(path.join(temp,'app.css'),'utf8')})
 await page.addScriptTag({content:fs.readFileSync(path.join(temp,'app.js'),'utf8')})
 const reaction=page.locator('.message-reaction'),flight=page.locator('.message-expression-flight'),menu=page.getByRole('menu',{name:'Message options',exact:true}),replay=page.getByRole('button',{name:'Replay emoji animation',exact:true})
 const count=()=>page.evaluate(()=>window.motion.length)
 const open=async()=>{const more=page.getByRole('button',{name:'More message actions',exact:true});await more.focus();await more.press('Enter');await expect(menu).toBeVisible()}
 const choose=async emoji=>{await open();await menu.getByRole('menuitemradio',{name:'React '+emoji,exact:true}).click();await expect.poll(()=>page.evaluate(()=>typeof window.resolveMutation)).toBe('function')}
 const resolve=async ok=>{await page.evaluate(value=>window.resolveMutation(value),ok);await expect.poll(()=>page.evaluate(()=>window.resolveMutation)).toBeNull()}
 await expect(reaction).toContainText('❤️');assert.equal(await count(),0,'restored history does not celebrate')
 await choose('🎉');assert.equal(await count(),0,'pending writes do not animate');await resolve(false);await expect(menu).toBeVisible();await expect(reaction).toContainText('❤️');assert.equal(await count(),0,'failed writes do not animate')
 await menu.getByRole('menuitemradio',{name:'React 🎉',exact:true}).click();await resolve(true);await expect(reaction).toContainText('🎉');await expect(menu).toHaveCount(0);await expect(flight).toHaveCount(1)
 for(const zoom of [1,1.25]){
  if(zoom!==1){await page.evaluate(()=>document.querySelector('.message-expression-flight').getAnimations()[0].finish());await expect(flight).toHaveCount(0);await page.evaluate(value=>document.documentElement.style.zoom=String(value),zoom);await choose('👀');await resolve(true);await expect(flight).toHaveCount(1)}
  const error=await page.evaluate(()=>{const glyph=document.querySelector('.message-expression-flight'),animation=glyph.getAnimations()[0];animation.currentTime=Number(animation.effect.getTiming().duration)*.9;const a=glyph.getBoundingClientRect(),b=document.querySelector('.message-reaction').getBoundingClientRect();return Math.hypot(a.left+a.width/2-b.left-b.width/2,a.top+a.height/2-b.top-b.height/2)})
  assert.ok(error<1,`reaction arrives at its actual pill at ${zoom*100}% zoom: ${error}px`)
 }
 fs.mkdirSync(out,{recursive:true});await flight.evaluate(el=>el.getAnimations()[0].currentTime=110);await page.screenshot({path:path.join(out,'reaction-flight.png')})
 await page.emulateMedia({reducedMotion:'reduce'});await expect(flight).toHaveCount(0);const reducedCount=await count();await choose('✅');await resolve(true);await expect(reaction).toContainText('✅');assert.equal(await count(),reducedCount,'reduced motion suppresses newly accepted gestures')
 await replay.focus();await page.keyboard.press('Enter');assert.equal(await count(),reducedCount,'keyboard replay also respects reduced motion')
 await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>document.documentElement.style.zoom='1');const writes=await page.evaluate(()=>window.writes.length);await replay.focus();await page.keyboard.press('Enter');await expect.poll(count).toBeGreaterThan(reducedCount);assert.equal(await page.evaluate(()=>window.writes.length),writes,'emoji replay is a local gesture, never a write')
 await expect.poll(()=>page.locator('.markdown').evaluate(el=>el.getAnimations().length)).toBe(0)
 await page.evaluate(()=>window.fixture.emoji(false));await expect(replay).toHaveCount(0);await page.evaluate(()=>window.fixture.emoji(true));await expect(replay).toHaveCount(1)
 await choose('💡');await resolve(true);await expect(flight).toHaveCount(1);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});await expect(flight).toHaveCount(0)
 const hiddenCount=await count();await choose('👍');await resolve(true);await expect(reaction).toContainText('👍');assert.equal(await count(),hiddenCount,'hidden windows do not animate accepted writes');await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))})
 await choose('❤️');await resolve(true);await expect(flight).toHaveCount(1);await page.evaluate(()=>window.fixture.mount(false));await expect(flight).toHaveCount(0)
 await page.evaluate(()=>window.fixture.mount(true));await expect(reaction).toContainText('❤️');const remountCount=await count();await choose('🎉');await page.evaluate(()=>window.fixture.mount(false));await expect(page.locator('.message-actions')).toHaveCount(0);await resolve(true);assert.equal(await count(),remountCount,'late completion after unmount does not animate')
 await page.evaluate(()=>window.fixture.mount(true));await expect(reaction).toContainText('🎉');assert.equal(await count(),remountCount,'new history mount does not replay the last acknowledgement');assert.deepEqual(errors,[])
 console.log('PASS expression motion: success-only reaction travel, real pill anchor at100/125%, keyboard-local replay, reduced/hidden/unmount cleanup and no history replay; controlled fixture, no Core/model calls')
}finally{await browser?.close();fs.rmSync(temp,{recursive:true,force:true})}
