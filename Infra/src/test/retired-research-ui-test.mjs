// Standalone Plan panel: actual React/CSS, deterministic authenticated-like API.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-retired-ui-'))
const out=path.join(root,'.aexus/artifacts/launcher-retired/research-panel')
fs.mkdirSync(out,{recursive:true})
let browser,page;const errors=[]
try{
 const source=`import React from 'react';import{createRoot}from'react-dom/client';import{ResearchTaskManager}from'./Infra/src/renderer/src/components/ResearchTaskManager';createRoot(document.getElementById('root')).render(<ResearchTaskManager/>);`
 await build({stdin:{contents:source,resolveDir:root,loader:'tsx'},outfile:path.join(temp,'bundle.js'),bundle:true,jsx:'automatic',logLevel:'silent',plugins:[{name:'api-stub',setup(b){b.onResolve({filter:/\/api$/},args=>args.importer.endsWith('ResearchTaskManager.tsx')?{path:'transport',namespace:'test-mock'}:undefined);b.onLoad({filter:/.*/,namespace:'test-mock'},()=>({loader:'js',contents:'export const api={call:(command,args)=>window.fixtureCall(command,args),onEvent:listener=>window.fixtureOnEvent(listener)}'}))}}]})
 browser=await chromium.launch({headless:true,channel:process.platform==='darwin'?'chrome':undefined})
 page=await browser.newPage({viewport:{width:1050,height:750}})
 page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message))
 await page.route('https://aexus-retired.test/**',route=>route.fulfill({contentType:'text/html',body:'<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}))
 await page.goto('https://aexus-retired.test/')
 await page.evaluate(()=>{
  window.researchList=[{id:'wf_11111111-1111-4111-8111-111111111111',status:'waiting',summary:{title:'Prior evidence study'},revision:1,updatedAt:Date.now()},
   {id:'wf_22222222-2222-4222-8222-222222222222',status:'cancelled',summary:{title:'Old stopped study'},revision:2,updatedAt:Date.now()}]
  window.listeners=new Set();window.fixtureOnEvent=listener=>{window.listeners.add(listener);return()=>window.listeners.delete(listener)}
  window.fireWorkflow=()=>{for(const listener of window.listeners)listener({channel:'workflow:changed',payload:{engineId:'deep-research'}})}
  window.listDelay=0;window.listInFlight=0;window.peakListInFlight=0
  window.calls=[];window.fixtureCall=async(cmd,args={})=>{
   window.calls.push({cmd,args})
   if(cmd==='workflow.list'){
    window.listInFlight++;window.peakListInFlight=Math.max(window.peakListInFlight,window.listInFlight)
    const list=window.researchList.map(item=>({...item,summary:{...item.summary}}))
    try{if(window.listDelay)await new Promise(resolve=>setTimeout(resolve,window.listDelay))}
    finally{window.listInFlight--}
    return {jobs:list.slice(args.offset??0,(args.offset??0)+(args.limit??100)),total:list.length,hasMore:false}
   }
   if(cmd==='workflow.cancel'){const item=window.researchList.find(v=>v.id===args.id);if(!item)throw Error('missing');item.status='cancelled';return {...item}}
   if(cmd==='workflow.delete'){window.researchList=window.researchList.filter(v=>v.id!==args.id);return {id:args.id,deleted:true,archived:true}}
   throw Error('Unexpected '+cmd)
  }
 })
 await page.addStyleTag({content:':root{--bg:#fff;--bg-elev:#f7f9fe;--fg:#1b2940;--fg-dim:#647288;--border:#dce5ef;--border-soft:#e1e9f0;--accent:#536fba}*{box-sizing:border-box}body{margin:0;background:#eaf0f9;color:#1b2940;font:14px system-ui}'})
 await page.addStyleTag({path:path.join(temp,'bundle.css')})
 await page.addScriptTag({path:path.join(temp,'bundle.js')})
 const panel=page.getByRole('region',{name:'历史研究任务管理'})
 await expect(panel.getByText('Prior evidence study',{exact:true})).toBeVisible()
 await expect(panel.getByText('Old stopped study',{exact:true})).toBeVisible()
 assert.ok((await page.evaluate(()=>window.calls.filter(call=>call.cmd==='workflow.list'))).every(call=>call.args.brief===true),'history rows must use the lightweight Contract projection')
 await page.evaluate(()=>{
  window.calls.length=0;window.listDelay=120;window.peakListInFlight=0
  window.researchList[1].summary.title='Updated evidence study'
  for(let i=0;i<40;i++)window.fireWorkflow()
 })
 await expect(panel.getByText('Updated evidence study',{exact:true})).toBeVisible()
 await page.waitForTimeout(300)
 const burst=await page.evaluate(()=>({reads:window.calls.filter(c=>c.cmd==='workflow.list').length,maxConcurrent:window.peakListInFlight,brief:window.calls.filter(c=>c.cmd==='workflow.list').every(c=>c.args.brief===true)}))
 assert.ok(burst.reads<=2,JSON.stringify(burst))
 assert.equal(burst.maxConcurrent,1,'burst invalidations should not spawn parallel list requests')
 assert.equal(burst.brief,true)
 await page.evaluate(()=>{
  window.calls.length=0;window.peakListInFlight=0
  window.researchList[1].summary.title='Intermediate evidence study'
  window.fireWorkflow()
 })
 await page.waitForFunction(()=>window.listInFlight===1)
 await page.evaluate(()=>{window.researchList[1].summary.title='Latest evidence study';window.fireWorkflow()})
 await expect(panel.getByText('Latest evidence study',{exact:true})).toBeVisible()
 const overlapping=await page.evaluate(()=>({reads:window.calls.filter(c=>c.cmd==='workflow.list').length,maxConcurrent:window.peakListInFlight}))
 assert.ok(overlapping.reads>=2&&overlapping.reads<=3,JSON.stringify(overlapping))
 assert.equal(overlapping.maxConcurrent,1,'an event arriving mid-read must queue exactly one later refresh')
 await page.evaluate(()=>{window.listDelay=0;window.researchList[1].summary.title='Old stopped study';window.fireWorkflow()})
 await expect(panel.getByText('Old stopped study',{exact:true})).toBeVisible()
 const id='wf_11111111-1111-4111-8111-111111111111'
 await panel.getByRole('button',{name:'删除研究 '+id}).click()
 const dialog=page.getByRole('alertdialog')
 await expect(dialog.getByText('删除这条研究任务？',{exact:true})).toBeVisible()
 assert.equal((await page.evaluate(()=>window.calls.filter(c=>c.cmd==='workflow.delete').length)),0)
 await dialog.getByRole('button',{name:'返回'}).click()
 await expect(dialog).toHaveCount(0)
 await panel.getByRole('button',{name:'停止研究 '+id}).click()
 await expect(panel.locator('[data-status=cancelled]')).toHaveCount(2)
 assert.equal((await page.evaluate(()=>window.calls.filter(c=>c.cmd==='workflow.cancel').length)),1)
 await panel.getByRole('button',{name:'删除研究 '+id}).click()
 await dialog.getByRole('button',{name:'确认停止并删除'}).click()
 await expect(dialog).toHaveCount(0)
 await expect(panel.getByText('Prior evidence study',{exact:true})).toHaveCount(0)
 assert.equal(await page.evaluate(()=>window.researchList.length),1)
 assert.equal((await page.evaluate(()=>window.calls.filter(c=>c.cmd==='workflow.delete').length)),1)
 for(const viewport of [{width:1050,height:750},{width:390,height:650}]){
  await page.setViewportSize(viewport)
  const r=await panel.boundingBox()
  assert.ok(r&&r.x>=0&&r.x+r.width<=viewport.width+1,JSON.stringify({viewport,r}))
  await page.screenshot({path:path.join(out,'research-manager-'+viewport.width+'.png'),animations:'disabled'})
 }
 assert.deepEqual(errors,[])
 console.log('PASS Historical workflow manager renders owner-scoped rows and statuses, stop button, explicit delete confirmation and compact layout')
}catch(e){await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw e}finally{await browser?.close();fs.rmSync(temp,{recursive:true,force:true})}
