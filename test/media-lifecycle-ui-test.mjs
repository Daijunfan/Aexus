// Actual media component with delayed Core responses and controlled decoder teardown events.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-media-lifecycle-')),out=path.join(root,'artifacts/slimming-complete'),checks=[]
let browser,page
try{
 const bundle=path.join(temp,'app.js')
 await build({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{MessageMedia}from'./src/renderer/src/chat/MessageMedia';import{setInterfaceLanguage}from'./src/renderer/src/i18n';setInterfaceLanguage('en');function App(){const [name,setName]=useState('first.mp4'),[show,setShow]=useState(true);window.mediaFixture={path:setName,show:setShow};return <div className="group-transcript" style={{height:300,overflow:'auto',width:560}}>{show&&<MessageMedia key={name} conversation="group:fixture" path={name} name={name} kind="video"/>}<div style={{height:1600}}/></div>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:root,loader:'tsx'},outfile:bundle,bundle:true,jsx:'automatic',loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl'},logLevel:'silent'})
 browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({viewport:{width:1000,height:700}});page.setDefaultTimeout(10000)
 await page.route('https://media-lifecycle.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'}));await page.goto('https://media-lifecycle.test/')
 await page.evaluate(()=>{
  const listeners=new Set();window.requests=[];window.closedGrants=[];window.held=new Map();window.holdNext=true;let sequence=0
  window.authentication=value=>listeners.forEach(fn=>fn({channel:'client:authentication',payload:{authenticated:value}}))
  window.agents={mode:'web',onEvent:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},call:async(cmd,args)=>{
   if(cmd==='messenger.media-close'){window.closedGrants.push(args.id);return {closed:true}}
   if(cmd!=='messenger.media-open')throw Error('Unexpected '+cmd)
   const id='grant-'+(++sequence);window.requests.push({id,...args});if(window.holdNext){window.holdNext=false;await new Promise(resolve=>window.held.set(id,resolve))}
   return {id,kind:'video',mimeType:'video/mp4',name:args.path,bytes:100}
  }}
  const nativeRemove=Element.prototype.removeAttribute
  Element.prototype.removeAttribute=function(name){if(name==='src'&&this instanceof HTMLMediaElement)this.fixtureSrc='';return nativeRemove.call(this,name)}
  Object.defineProperties(HTMLMediaElement.prototype,{src:{configurable:true,get(){return this.fixtureSrc??''},set(value){this.fixtureSrc=value}},currentTime:{configurable:true,get(){return this.fixtureTime??0},set(value){this.fixtureTime=value}},duration:{configurable:true,get:()=>120},readyState:{configurable:true,get:()=>4},paused:{configurable:true,get(){return !this.fixturePlaying}}})
  HTMLMediaElement.prototype.load=function(){this.fixtureTime=0;queueMicrotask(()=>{this.dispatchEvent(new Event('timeupdate'));this.dispatchEvent(new Event('loadedmetadata'));this.dispatchEvent(new Event('loadeddata'))})}
  HTMLMediaElement.prototype.play=async function(){this.fixturePlaying=true;this.dispatchEvent(new Event('play'));this.dispatchEvent(new Event('playing'))}
  HTMLMediaElement.prototype.pause=function(){if(this.fixturePlaying){this.fixturePlaying=false;this.dispatchEvent(new Event('pause'))}}
 })
 if(fs.existsSync(path.join(temp,'app.css')))await page.addStyleTag({content:fs.readFileSync(path.join(temp,'app.css'),'utf8')})
 await page.addStyleTag({content:'.message-media{height:220px}.message-media video{height:120px;width:220px}.message-video-placeholder{display:none}'})
 await page.addScriptTag({content:fs.readFileSync(bundle,'utf8')})
 await expect.poll(()=>page.evaluate(()=>window.requests.length)).toBe(1)
 await page.evaluate(()=>{window.authentication(false);window.held.get('grant-1')()})
 await expect.poll(()=>page.evaluate(()=>window.closedGrants.includes('grant-1'))).toBe(true)
 assert.equal(await page.locator('video').evaluate(el=>el.src),'')
 await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.requests.length),1)
 checks.push('Logout while opening rejects the late media grant and cannot auto-reopen its source')
 await page.evaluate(()=>window.authentication(true));const play=page.getByRole('button',{name:'Play video',exact:true})
 await play.click();await expect(page.locator('.message-media')).toHaveAttribute('data-playing','true');await page.getByRole('button',{name:'Pause media',exact:true}).click()
 const slider=page.getByRole('slider',{name:'Playback position',exact:true})
 await slider.evaluate(input=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'37');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))})
 await expect(slider).toHaveValue('37');await page.evaluate(()=>document.querySelector('.group-transcript').scrollTop=1500)
 await expect.poll(()=>page.locator('video').evaluate(el=>el.src)).toBe('')
 await page.evaluate(()=>document.querySelector('.group-transcript').scrollTop=0)
 await expect.poll(()=>page.locator('video').evaluate(el=>el.currentTime)).toBe(37)
 await expect(slider).toHaveValue('37')
 checks.push('A paused preview releases off-screen and restores 37 seconds even when teardown emits a zero-time update')
 await page.evaluate(()=>{window.holdNext=true;window.mediaFixture.path('second.mp4')})
 await expect.poll(()=>page.evaluate(()=>window.requests.some(r=>r.path==='second.mp4'))).toBe(true)
 const old=await page.evaluate(()=>window.requests.find(r=>r.path==='second.mp4').id)
 await page.evaluate(()=>window.mediaFixture.path('third.mp4'))
 await expect.poll(()=>page.evaluate(()=>window.requests.some(r=>r.path==='third.mp4'))).toBe(true)
 const latest=await page.locator('video').evaluate(el=>el.src)
 await page.evaluate(id=>window.held.get(id)(),old);await expect.poll(()=>page.evaluate(id=>window.closedGrants.includes(id),old)).toBe(true)
 assert.equal(await page.locator('video').evaluate(el=>el.src),latest);assert.ok(latest)
 await page.evaluate(()=>window.authentication(false));await expect.poll(()=>page.locator('video').evaluate(el=>el.src)).toBe('')
 await page.evaluate(()=>window.authentication(true));await play.click();await expect(page.locator('.message-media')).toHaveAttribute('data-playing','true')
 await page.evaluate(()=>{window.detachedVideo=document.querySelector('video');window.mediaFixture.show(false)})
 await expect(page.locator('video')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>window.detachedVideo.paused&&window.detachedVideo.src==='')).toBe(true)
 checks.push('Unmounting a playing row pauses and clears the detached DOM element after its React ref is cleared')
 checks.push('Changing a media identity closes its late old response without replacing the new source; attached logout also unloads')
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'media-lifecycle.json'),JSON.stringify({passed:true,checks,scope:'Real source component, controlled decoder events; actual codecs covered by media-playback-ui'},null,2));console.log('PASS '+checks.join('; '))
}catch(error){await page?.screenshot({path:path.join(out,'media-lifecycle-failure.png')}).catch(()=>{});throw error}finally{await browser?.close();fs.rmSync(temp,{recursive:true,force:true})}
