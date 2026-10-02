// Source-only browser fixture: navigation behavior and layout, without Core or model calls.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'

const root=path.resolve(import.meta.dirname,'..'),renderer=path.join(root,'src/renderer/src')
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-common-visual-')),out=path.join(root,'artifacts/common-visual')
const styles=[...fs.readFileSync(path.join(renderer,'main.tsx'),'utf8').matchAll(/import\s+(['"])([^'"]+\.css)\1/g)].map(([,quote,file])=>`import ${JSON.stringify(file.startsWith('.')?path.resolve(renderer,file):file)}`).join('\n')
let browser
try{
 await build({stdin:{contents:`
 import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
 import companyIcon from '../../../app_icon.png';import {TeamViews} from './components/TeamViews';import {setInterfaceLanguage} from './i18n';setInterfaceLanguage('en');${styles}
 const store={groups:['Studio','Engineering'],sessions:[],teamViews:Array.from({length:14},(_,i)=>({id:'view-'+i,name:i===0?'A very long saved company view name for clipping checks':'Saved view '+i,teams:['Studio']}))};
 function Fixture(){const [view,setView]=useState({kind:'home'});return <div className="app in-office"><div className="home office-home"><header className="company-header"><div className="company-brand"><img className="brand-symbol" src={companyIcon} alt=""/><span>Agents Company</span></div><TeamViews store={store} view={view} groupUnread={12} act={async(cmd,args)=>{window.calls.push({cmd,args});if(cmd==='view.select')setView({kind:args.id==='company'?'home':args.id})}}/><div className="company-actions"><button aria-label="Add Team"><span>＋</span> Add Team</button><button className="add-employee" aria-label="Add Employee"><span>＋</span> Add Employee</button></div></header><main className="fixture-canvas" style={{flex:1,background:'var(--canvas)'}} onPointerDown={event=>event.stopPropagation()}/></div></div>}
 createRoot(document.getElementById('root')).render(<Fixture/>);
 `,resolveDir:renderer,loader:'tsx'},bundle:true,outfile:path.join(temp,'app.js'),jsx:'automatic',loader:{'.woff':'dataurl','.woff2':'dataurl','.ttf':'dataurl','.svg':'dataurl','.png':'dataurl'},logLevel:'silent'})
 browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})})
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[]
 page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)})
 await page.route('https://common-fixture.test/**',route=>route.fulfill({contentType:'text/html',body:'<html data-theme="white"><body><div id="root"></div></body></html>'}))
 await page.goto('https://common-fixture.test/')
 await page.evaluate(()=>{window.calls=[];window.agents={call:async(cmd,args)=>{window.calls.push({cmd,args});return {}},onEvent:()=>()=>{}}})
 await page.addStyleTag({content:fs.readFileSync(path.join(temp,'app.css'),'utf8')})
 await page.addScriptTag({content:fs.readFileSync(path.join(temp,'app.js'),'utf8')})
 const trigger=page.getByRole('button',{name:'Company Views',exact:true}),menu=page.getByRole('menu',{name:'Company views',exact:true})
 const open=async()=>{await trigger.focus();await page.keyboard.press('ArrowDown');await expect(menu).toBeVisible()}
 await expect(trigger).toBeVisible()
 await open();await page.locator('.fixture-canvas').click({position:{x:20,y:20}});await expect(menu).toHaveCount(0)
 await open();await page.getByRole('button',{name:'Add Team',exact:true}).focus();await expect(menu).toHaveCount(0)
 await open();await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await expect(trigger).toBeFocused()
 await open();await page.keyboard.press('End');await expect(page.getByRole('menuitem',{name:'New view',exact:true})).toBeFocused()
 await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(trigger).toBeFocused()
 await open();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await expect(page.getByRole('button',{name:'Edit A very long saved company view name for clipping checks',exact:true})).toBeFocused()
 await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(trigger).toBeFocused()
 fs.mkdirSync(out,{recursive:true})
 for(const [width,height] of [[1440,900],[1024,768],[720,480],[600,360],[390,320]]){
  await page.setViewportSize({width,height});await open()
  const geometry=await page.evaluate(()=>{const nav=document.querySelector('.company-navigation').getBoundingClientRect(),menu=document.querySelector('.company-view-menu').getBoundingClientRect(),footer=document.querySelector('.company-view-menu footer').getBoundingClientRect(),actions=document.querySelector('.company-actions').getBoundingClientRect(),header=document.querySelector('.company-header').getBoundingClientRect(),list=document.querySelector('.company-view-list');return {center:nav.x+nav.width/2,nav:{left:nav.left,right:nav.right,top:nav.top,bottom:nav.bottom},menu:{left:menu.left,right:menu.right,top:menu.top,bottom:menu.bottom},footerBottom:footer.bottom,actions:{left:actions.left,top:actions.top,bottom:actions.bottom},headerBottom:header.bottom,scrolls:list.scrollHeight>list.clientHeight}})
  assert.ok(Math.abs(geometry.center-width/2)<1,`navigation remains centered at ${width}px`)
  assert.ok(geometry.nav.left>=0&&geometry.nav.right<=width,`navigation fits at ${width}px`)
  assert.ok(geometry.menu.left>=0&&geometry.menu.right<=width&&geometry.menu.bottom<=height,`menu stays in ${width}×${height}: ${JSON.stringify(geometry)}`)
  assert.ok(geometry.footerBottom<=height,`menu actions stay reachable at ${width}×${height}`)
  assert.ok(geometry.nav.bottom<=geometry.headerBottom+1,`navigation stays within the header at ${width}px`)
  assert.ok(geometry.actions.left>=geometry.nav.right||geometry.actions.bottom<=geometry.nav.top,`header actions do not overlap navigation at ${width}px`)
  assert.ok(geometry.scrolls,'long saved-view list scrolls inside the menu')
  await expect(trigger.locator('.codicon-chevron-down')).toBeVisible()
  assert.ok(await page.locator('.messages-view-trigger').evaluate(button=>{const badge=button.querySelector('.nav-unread').getBoundingClientRect(),label=button.querySelector('span:not(.codicon)').getBoundingClientRect();return badge.left>=label.right||badge.bottom<=label.top}),`unread count does not cover the label at ${width}px`)
  await page.screenshot({path:path.join(out,`company-${width}.png`)})
  await page.keyboard.press('Escape')
 }
 await page.setViewportSize({width:1440,height:900})
 for(const [label,kind] of [['Messages','messages'],['Plan','plan'],['Company Views','company']]){const button=page.getByRole('button',{name:label,exact:true});await button.click();await expect(button).toHaveAttribute('aria-pressed','true');assert.ok((await page.evaluate(()=>window.calls)).some(call=>call.cmd==='view.select'&&call.args.id===kind))}
 await expect(trigger).toHaveAttribute('aria-expanded','false')
 assert.deepEqual(errors,[])
 console.log('PASS source-only Common navigation: capture dismissal, focus dismissal, Escape, editor focus return, complete keyboard actions, centered responsive layout and bounded scrolling menu; no Core or model calls')
}finally{await browser?.close();fs.rmSync(temp,{recursive:true,force:true})}
