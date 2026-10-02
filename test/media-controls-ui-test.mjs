// Actual React audio card with deterministic metadata responses; no Core or model calls.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'

const root=path.resolve(import.meta.dirname,'..'),renderer=path.join(root,'src/renderer/src'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-media-controls-'))
let browser
try{
 await build({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {MessageAudio} from './chat/MessageAudio';import {AudioPlaybackContext,audioKey} from './chat/AudioPlayback';import {setInterfaceLanguage} from './i18n';setInterfaceLanguage('en');window.setLanguage=setInterfaceLanguage;
 const initialTrack={conversation:'group:fixture',messageId:'first',path:'first.wav',name:'First.wav'};
 const listeners=new Set(),action=(name,value)=>window.actions.push({name,value});let player={state:{active:audioKey(initialTrack),duration:0,current:0,buffered:0,playing:false,loading:false,error:'',queue:[],rate:1,volume:1,muted:false},seek:value=>action('seek',value),volume:value=>action('volume',value),speed:()=>action('speed'),mute:()=>action('mute'),toggle:()=>action('toggle'),choose:item=>action('choose',item.path),retry:()=>action('retry'),add:(item,next)=>action(next?'next':'queue',item.path)};const source={getSnapshot:()=>player,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)}};window.setAudio=patch=>{player={...player,state:{...player.state,...patch}};for(const listener of listeners)listener()};
 function Fixture(){const [track,setTrack]=useState(initialTrack);window.setTrack=setTrack;return <AudioPlaybackContext.Provider value={source}><MessageAudio track={track}/></AudioPlaybackContext.Provider>};createRoot(document.getElementById('root')).render(<Fixture/>);`,resolveDir:renderer,loader:'tsx'},bundle:true,outfile:path.join(temp,'app.js'),jsx:'automatic',logLevel:'silent'})
 browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})})
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.route('https://media-controls.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'}));await page.goto('https://media-controls.test/')
 await page.evaluate(()=>{
  window.actions=[];window.requests=[];window.closedGrants=[];window.previews=[]
  window.agents={call:(cmd,args)=>{if(cmd==='messenger.media-close'){window.closedGrants.push(args.id);return Promise.resolve({})}if(cmd==='messenger.media-open')return new Promise((resolve,reject)=>window.requests.push({path:args.path,resolve,reject}));throw Error(cmd)},onEvent:()=>()=>{}}
  const create=document.createElement.bind(document)
  document.createElement=(tag,...args)=>{const element=create(tag,...args);if(tag==='audio'){window.previews.push(element);element.load=()=>{};Object.defineProperty(element,'src',{configurable:true,get:()=>element.dataset.source??'',set:value=>element.dataset.source=value})}return element}
  window.metadata=(index,duration)=>{const audio=window.previews[index];Object.defineProperty(audio,'duration',{configurable:true,value:duration});audio.onloadedmetadata?.(new Event('loadedmetadata'))}
 })
 await page.addScriptTag({content:fs.readFileSync(path.join(temp,'app.js'),'utf8')})
 const card=page.getByRole('region',{name:'Media player for First.wav'}),duration=()=>page.getByLabel('Media duration',{exact:true})
 await expect(card).toBeVisible();assert.equal(await page.evaluate(()=>window.requests.length),0,'active audio does not open a second metadata source')
 await page.evaluate(()=>window.setAudio({active:null}));await expect.poll(()=>page.evaluate(()=>window.requests.length)).toBe(1)
 await page.evaluate(()=>window.requests[0].resolve({id:'metadata-first'}));await expect.poll(()=>page.evaluate(()=>window.previews.some(audio=>audio.dataset.source))).toBe(true)
 await page.evaluate(()=>window.metadata(window.previews.findIndex(audio=>audio.dataset.source),12));await expect(duration()).toHaveText('0:12');assert.ok((await page.evaluate(()=>window.closedGrants)).includes('metadata-first'))
 // Existing metadata should survive active/inactive transitions without another range read.
 await page.evaluate(()=>window.setAudio({active:JSON.stringify(['group:fixture','first','first.wav']),duration:12,current:3,buffered:8}));await expect(card.getByLabel('Playback position',{exact:true})).toBeEnabled()
 const setRange=async(locator,value)=>locator.evaluate((input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))},value)
 await setRange(card.getByLabel('Playback position',{exact:true}),6);await setRange(card.getByLabel('Media volume',{exact:true}),.25);await card.getByRole('button',{name:'Playback speed 1×'}).click();await card.getByRole('button',{name:'Mute media',exact:true}).click();await card.getByRole('button',{name:'Play media',exact:true}).click();await card.getByRole('button',{name:'Play First.wav next'}).click();await card.getByRole('button',{name:'Add First.wav to audio queue'}).click()
 assert.deepEqual(await page.evaluate(()=>window.actions),[{name:'seek',value:6},{name:'volume',value:.25},{name:'speed',value:undefined},{name:'mute',value:undefined},{name:'toggle',value:undefined},{name:'next',value:'first.wav'},{name:'queue',value:'first.wav'}])
 await page.evaluate(()=>window.setAudio({active:null}));await expect(card.getByLabel('Playback position',{exact:true})).toBeDisabled();assert.equal(await page.evaluate(()=>window.requests.length),1)
 // A reused card must immediately discard the previous source's duration and error.
 await page.evaluate(()=>window.setTrack({conversation:'group:fixture',messageId:'second',path:'second.wav',name:'Second.wav'}));await expect(duration()).toHaveText('—');await expect.poll(()=>page.evaluate(()=>window.requests.length)).toBe(2)
 await page.evaluate(()=>window.requests[1].reject(Error('damaged preview')));await expect(page.getByRole('alert')).toContainText('could not be played');await page.getByRole('button',{name:'Retry playback'}).click();assert.deepEqual(await page.evaluate(()=>window.actions.at(-1)),{name:'choose',value:'second.wav'})
 await page.evaluate(()=>window.setTrack({conversation:'group:fixture',messageId:'third',path:'third.wav',name:'Third.wav'}));await expect(page.getByRole('alert')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>window.requests.length)).toBe(3)
 // Playback takeover cancels an outstanding preview; its late response only closes its grant.
 await page.evaluate(()=>window.setAudio({active:JSON.stringify(['group:fixture','third','third.wav']),duration:8}));await expect(duration()).toHaveText('0:08')
 await page.evaluate(()=>window.requests[2].resolve({id:'metadata-stale'}));await expect.poll(()=>page.evaluate(()=>window.closedGrants.includes('metadata-stale'))).toBe(true);await expect(duration()).toHaveText('0:08')
 await page.evaluate(()=>window.setLanguage('zh-CN'));await expect(page.getByRole('button',{name:'静音',exact:true})).toBeVisible();await expect(page.getByLabel('播放进度',{exact:true})).toBeVisible()
 assert.deepEqual(errors,[])
 console.log('PASS media controls: active-to-inactive metadata recovery, known-duration cache, source identity reset, stale grant release, seeking/rate/volume/play/queue callbacks and Chinese labels; deterministic source fixture only')
}finally{await browser?.close();fs.rmSync(temp,{recursive:true,force:true})}
