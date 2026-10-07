// Actual Employee/CanvasRoom source with decorative Mascot artwork omitted; no Core or engines.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
const root=path.resolve(import.meta.dirname,'../../..'),renderer=path.join(root,'Infra/src/renderer/src'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-employee-language-')),out=path.join(root,'.aexus/artifacts/interface-language')
const styles=[...fs.readFileSync(path.join(renderer,'main.tsx'),'utf8').matchAll(/import\s+(['"])([^'"]+\.css)\1/g)].map(([,quote,file])=>`import ${JSON.stringify(file.startsWith('.')?path.resolve(renderer,file):file)}`).join('\n')
let browser
try{
 await build({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {CanvasRoom} from './office/CanvasRoom';import {setInterfaceLanguage} from './i18n';${styles}
 window.setLanguage=setInterfaceLanguage;
 function Fixture(){const [state,setState]=useState('resting'),[empty,setEmpty]=useState(false);window.setCardState=setState;window.setEmptyTeam=setEmpty;const local={id:'local',title:'Messages 原名',group:'Team 原名',cwd:'/fixture/原始路径',engine:'codex',kind:'worker',workEnvironment:'local',createdAt:1,initialization:state==='initializing'?{status:'pending'}:state==='failed'?{status:'failed'}:undefined},cloud={...local,id:'cloud',title:'Native 原名',kind:'cloud-native-worker',workEnvironment:'team'};return <div className="app in-office"><div className="infinite-canvas"><CanvasRoom room={{name:empty?'':'Team 原名',bounds:{x:35,y:30,width:760,height:540,shape:'rounded',arrangement:'free'},employees:[{card:local,position:{x:30,y:200}},{card:cloud,position:{x:270,y:200}}]}} index={0} design={{scenery:false,pattern:'plain'}} root="/fixture/原始路径" mode="cloud" remote={{host:'fixture.invalid',os:'linux'}} health={{connected:false,checkedAt:1790812800000,error:'remote refused 原始错误'}} interactions={state==='communicating'?[{managerId:'local',employeeId:'cloud'}]:[]} crossRoutes={[{status:'hidden',managerId:'local',employeeId:'outside',targetTeam:'Remote 原团',targetName:'Target 原名'}]} activities={{}} busyIds={new Set(state==='working'?['local','cloud']:[])} disconnectedIds={new Set(state==='disconnected'?['local','cloud']:[])} visible={{x:0,y:0,width:1000,height:800}} onOpen={()=>{}} onEdit={()=>{}} onStart={()=>{}}/></div></div>}createRoot(document.getElementById('root')).render(<Fixture/>);`,resolveDir:renderer,loader:'tsx'},bundle:true,outfile:path.join(temp,'app.js'),jsx:'automatic',loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl','.svg':'dataurl','.png':'dataurl','.webp':'dataurl'},plugins:[{name:'decorative-mascot',setup(build){build.onResolve({filter:/^\.\/Mascot$/},()=>({path:'mascot',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const Mascot=()=>null',loader:'js'}))}}],logLevel:'silent'})
 browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});const page=await browser.newPage({viewport:{width:1000,height:800},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.route('https://employee-fixture.test/**',route=>route.fulfill({contentType:'text/html',body:'<html data-theme="blue"><body><div id="root"></div></body></html>'}));await page.goto('https://employee-fixture.test/')
 await page.evaluate(()=>{window.agents={platform:'macos',call:async()=>{throw Error('No backend calls expected')},onEvent:()=>()=>{}}})
 await page.addStyleTag({content:fs.readFileSync(path.join(temp,'app.css'),'utf8')});await page.addScriptTag({content:fs.readFileSync(path.join(temp,'app.js'),'utf8')})
 const local=page.locator('.employee[data-card-id="local"]'),cloud=page.locator('.employee[data-card-id="cloud"]')
 fs.mkdirSync(out,{recursive:true})
 for(const [language,location,environment,localValue,cloudValue,health,hint] of [['en','Execution location','Work environment','Local (Core host)','Cloud','Disconnected at last check','Across views'],['zh-CN','运行位置','工作环境','Core 本地','云端','上次检查未连接','跨视图']]){
  await page.evaluate(language=>window.setLanguage(language),language)
  await expect(local.locator('.badge-location small')).toHaveText(location);await expect(local.locator('.badge-workspace small')).toHaveText(environment)
  await expect(local.locator('.badge-location')).toHaveAttribute('title',location+(language==='en'?': ':'：')+localValue)
  await expect(cloud.locator('.badge-location')).toHaveAttribute('title',location+(language==='en'?': ':'：')+cloudValue)
  await expect(page.locator('.team-health')).toHaveAttribute('title',new RegExp(health));await expect(page.locator('.team-health')).toHaveAttribute('title',/remote refused 原始错误/)
  await expect(page.locator('.cross-team-hint')).toHaveText(hint+' · Remote 原团 / Target 原名')
  for(const [state,en,zh] of [['resting','Resting','休息中'],['working','Working','工作中'],['communicating','Collaborating','协作中'],['disconnected','Connection or execution failed','连接／执行失败'],['initializing','Initializing','正在初始化'],['failed','Initialization failed','初始化失败']]){await page.evaluate(state=>window.setCardState(state),state);await expect(local.locator('.employee-state')).toHaveText(language==='en'?en:zh);await expect(local).toHaveAttribute('aria-label',new RegExp(language==='en'?en:zh))}
  await page.evaluate(()=>window.setCardState('resting'));await expect(local).toHaveAttribute('aria-label',language==='en'?'Open conversation with Messages 原名 · Resting':'打开 Messages 原名 的会话 · 休息中')
  await expect(local.locator('.employee-name')).toHaveText('Messages 原名');await expect(page.locator('.team-root-label')).toContainText('/fixture/原始路径');await expect(local.locator('.badge-location')).toHaveAttribute('data-location','local');await expect(cloud.locator('.badge-location')).toHaveAttribute('data-location','cloud');await expect(cloud.locator('.badge-workspace')).toHaveAttribute('data-workspace','cloud')
  const labels=await page.locator('.badge-place small').evaluateAll(labels=>labels.map(label=>{const box=label.parentElement.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(label);return {text:label.textContent,left:box.left,right:box.right,lines:[...range.getClientRects()].map(rect=>({left:rect.left,right:rect.right}))}}))
  for(const label of labels)assert.ok(label.lines.every(line=>line.left>=label.left-.5&&line.right<=label.right+.5),`${language} label stays within its column: ${label.text}`)
  const geometry=await cloud.evaluate(employee=>{const frame=employee.getBoundingClientRect(),badge=employee.querySelector('.employee-badge').getBoundingClientRect(),cloud=employee.querySelector('.cloud-native-foot').getBoundingClientRect();return {height:frame.height,width:frame.width,badgeBottom:badge.bottom,cloudTop:cloud.top,cloudBottom:cloud.bottom,frameBottom:frame.bottom}})
  assert.equal(geometry.width,190);assert.equal(geometry.height,250);assert.ok(geometry.cloudTop>=geometry.badgeBottom&&geometry.cloudBottom<=geometry.frameBottom,'native cloud remains below the full badge within its unchanged frame')
  await page.screenshot({animations:'disabled',path:path.join(out,'employee-source-'+language+'.png')})
 }
 await page.evaluate(()=>{window.setLanguage('en');window.setEmptyTeam(true)});await expect(page.locator('.team-title')).toHaveAttribute('aria-label','Open Team Unassigned employees')
 assert.deepEqual(errors,[])
 console.log('PASS actual Employee/CanvasRoom bilingual source: location/environment/state/accessibility/host/cross-view copy switches with nonoverlapping label columns, while employee names, paths, errors and protocol location values remain unchanged; no Core or engine calls')
}finally{await browser?.close();fs.rmSync(temp,{recursive:true,force:true})}
