// Native-focus race with the real reading hook; deterministic API denial, no Core or model.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-channel-read-visibility-')),out=path.join(root,'.aexus/artifacts/channel-read-review');let browser
try{
 await build({stdin:{contents:`import {useRef} from 'react';import {createRoot} from 'react-dom/client';import {useChannelReading} from ${JSON.stringify(path.join(root,'Infra/src/renderer/src/components/useChannelReading.ts'))};function Fixture(){const root=useRef(null);useChannelReading('channel',root,['news'],true);return <div ref={root} style={{width:500,height:300,overflow:'auto'}}><span data-channel-read="news" style={{display:'block',width:100,height:12}}>Read marker</span></div>}createRoot(document.getElementById('root')).render(<Fixture/>);`,resolveDir:root,loader:'tsx'},bundle:true,jsx:'automatic',outfile:path.join(temp,'app.js'),logLevel:'silent'})
 browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});const page=await browser.newPage()
 await page.route('https://read-visibility.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://read-visibility.test/')
 await page.evaluate(()=>{
  window.receipts=[];window.nativeActive=false;const listeners=new Set()
  window.emitVisibility=active=>{window.nativeActive=active;window.shownAt=performance.now();for(const listener of listeners)listener({channel:'desktop:visibility',payload:{active,visible:active}})}
  Object.defineProperty(document,'hasFocus',{value:()=>true})
  window.agents={onEvent:listener=>{listeners.add(listener);return()=>listeners.delete(listener)},call:async cmd=>{
   if(cmd==='channel.read-state')return {id:'channel',entries:[{id:'news',state:'unread'}],unreadCount:1}
   if(cmd==='channel.acknowledge'){window.receipts.push({at:performance.now(),accepted:window.nativeActive});return {acknowledged:window.nativeActive,entryIds:['news']}}
   throw Error('Unexpected fixture call '+cmd)
  }}
 })
 await page.addScriptTag({content:fs.readFileSync(path.join(temp,'app.js'),'utf8')});await expect.poll(()=>page.evaluate(()=>window.receipts.length)).toBe(1)
 assert.equal(await page.evaluate(()=>window.receipts[0].accepted),false)
 await page.evaluate(()=>window.emitVisibility(true));await expect.poll(()=>page.evaluate(()=>window.receipts.some(receipt=>receipt.accepted))).toBe(true)
 const result=await page.evaluate(()=>({receipts:window.receipts,foregroundToAcceptedMs:window.receipts.find(receipt=>receipt.accepted).at-window.shownAt}))
 assert.ok(result.foregroundToAcceptedMs>=650,'a native-rejected dwell cannot carry into a newly foreground window: '+JSON.stringify(result))
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'dwell-after.json'),JSON.stringify({passed:true,...result},null,2));console.log('PASS rejected native receipt restarts the full visible dwell after foreground: '+result.foregroundToAcceptedMs.toFixed(1)+' ms')
}finally{await browser?.close();fs.rmSync(temp,{recursive:true,force:true})}
