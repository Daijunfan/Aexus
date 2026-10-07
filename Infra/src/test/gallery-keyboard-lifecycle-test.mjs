// The preview is visible at commit: keyboard navigation must already be subscribed.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-gallery-keys-')),out=path.join(root,'.aexus/artifacts/aexus-architecture/acceptance')
let browser,page
try{
 const file=path.join(temp,'fixture.js')
 await build({stdin:{resolveDir:root,loader:'tsx',contents:`import React,{useState,useLayoutEffect} from 'react';import {createRoot} from 'react-dom/client';import {MessageImageViewer} from './Infra/src/renderer/src/chat/MessageImageViewer';import {setInterfaceLanguage} from './Infra/src/renderer/src/i18n';setInterfaceLanguage('en');const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=';function Fixture(){const [opened,open]=useState(false);useLayoutEffect(()=>{if(opened)window.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))},[opened]);return <><button onClick={()=>open(true)}>Open preview</button>{opened&&<MessageImageViewer items={window.photos.slice(2)} initialIndex={1} initialSrc={image} history={{conversation:'group:test'}} origin={()=>document.querySelector('button')} onClose={()=>open(false)} readImage={async()=>image}/>}</>}createRoot(document.getElementById('root')).render(<Fixture/>);`},bundle:true,format:'iife',platform:'browser',outfile:file,jsx:'automatic',logLevel:'silent'})
 browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage();await page.emulateMedia({reducedMotion:'reduce'})
 await page.route('https://gallery-keyboard.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'}));await page.goto('https://gallery-keyboard.test/')
 await page.evaluate(()=>{
  window.photos=Array.from({length:4},(_,i)=>({group:'test',messageId:'message-'+i,path:'photo-'+i+'.png',caption:'Photo '+(i+1)}));window.galleryRequests=[]
  window.agents={mode:'web',onEvent:()=>()=>{},call:async(command,args)=>{
   if(command!=='messenger.gallery')throw Error('Unexpected operation '+command)
   window.galleryRequests.push(args);const start=args.direction==='first'?0:2
   return {images:window.photos.slice(start,start+2),index:start===0?0:1,offset:start,total:4,through:{conversation:'group:test',messageId:'message-3',path:'photo-3.png'}}
  }}
 })
 await page.addScriptTag({content:fs.readFileSync(file,'utf8')})
 for(let cycle=0;cycle<3;cycle++){
  await page.getByRole('button',{name:'Open preview',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Image preview',exact:true})
  await expect(dialog.getByLabel('Image position')).toHaveText('Image 1 of 4',{timeout:4000})
  await expect(dialog.locator('.message-gallery-caption')).toHaveText('Photo 1')
  await page.keyboard.press('End');await expect(dialog.getByLabel('Image position')).toHaveText('Image 4 of 4')
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0)
 }
 const requests=await page.evaluate(()=>window.galleryRequests);assert.equal(requests.filter(r=>r.direction==='first').length,3)
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'gallery-keyboard.json'),JSON.stringify({passed:true,cycles:3,scope:'Real gallery component; Home dispatched as soon as its visible DOM is committed, followed by actual End/Escape input',requests},null,2));console.log('PASS Gallery keyboard handlers are available at visible commit and are released before reopening; first/last requests remain bounded')
}finally{await browser?.close();fs.rmSync(temp,{recursive:true,force:true})}
