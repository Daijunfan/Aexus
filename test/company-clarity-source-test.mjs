// Actual Company/OfficeCanvas, routing and official sprite source; isolated browser only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
const root=path.resolve(import.meta.dirname,'..'),renderer=path.join(root,'src/renderer/src'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-company-clarity-')),out=path.join(root,'artifacts/company-clarity')
const css=[...new Set(['main.tsx','App.tsx'].flatMap(file=>[...fs.readFileSync(path.join(renderer,file),'utf8').matchAll(/import\s+(['"])([^'"]+\.css)\1/g)].map(([,q,value])=>value.startsWith('.')?path.resolve(renderer,value):value)))]
let browser
try{
 const contents=[
  "import React,{useState} from 'react';import {createRoot} from 'react-dom/client';",
  "import {HomeView} from './components/HomeView';import {setInterfaceLanguage} from './i18n';import {DEFAULT_PREFERENCES} from '../../shared/preferences';",
  ...css.map(file=>'import '+JSON.stringify(file)),
  "setInterfaceLanguage('en');",
  "const names=['Research','Engineering','Cloud operations','Custom studio'],avatars=['codex','dewey','fireball','rocky','seedy','stacky','bsod','hoots','byte','woodi','marmalade','voltcoin'];",
  "const sessions=names.flatMap((group,t)=>Array.from({length:3},(_,i)=>({id:'e'+(t*3+i),title:['Lead','Builder','Analyst'][i]+' '+(t+1),group,createdAt:t*3+i+1,engine:t===2?'codex':['codex','claude','cline','pi'][t],kind:t===2&&i>0?'cloud-native-worker':'worker',workEnvironment:t===2&&i>0?'team':'local',cwd:'/workspace/'+group.toLowerCase().replaceAll(' ','-')+'/employee-'+i,managementRole:t===0&&i===0?'governor':i===0?'manager':'employee',avatar:avatars[t*3+i],position:{x:30+i*210,y:210},...(t===3&&i>0?{initialization:{status:i===1?'pending':'failed'}}:{}),...(t===1&&i===2?{lastReply:{id:'reply',itemId:'answer',text:'A finished reply is waiting.',createdAt:1}}:{})})));",
  "const relations=[['e0','e1'],['e0','e2'],['e3','e4'],['e3','e5'],['e6','e7'],['e6','e8'],['e0','e3']].map(([managerId,employeeId],i)=>({id:'relation-'+i,managerId,employeeId,state:'active',requestedBy:{kind:'operator'},createdAt:1,updatedAt:1}));",
  "const initial={version:2,revision:1,groups:names,sessions,teamRoots:Object.fromEntries(names.map(n=>[n,'/workspace/'+n.toLowerCase().replaceAll(' ','-')])),teamSettings:Object.fromEntries(names.map((n,i)=>[n,i===2?{mode:'cloud',hostId:'fixture-host',remote:{host:'fixture.invalid',os:'linux',directory:'/srv/operations'}}:{mode:'build'}])),rooms:Object.fromEntries(names.map((n,i)=>[n,{bounds:{x:i%2*760,y:Math.floor(i/2)*620,width:670,height:540,shape:'rounded',arrangement:'free',pinned:true},...(i===2?{design:{background:'#254b43',pattern:'dots',scenery:true,theme:'ocean'}}:i===3?{design:{background:'#fff2cc',pattern:'plain',scenery:false,theme:'amber'}}:{})}])),access:{version:2,revision:1,globalManagerIds:['e0'],relations,bindings:[]},preferences:{...DEFAULT_PREFERENCES,showTeamOverview:false},viewport:{x:45,y:22,zoom:.72}};",
  "const interactions=[{managerId:'e0',employeeId:'e1',command:'session.send',requestId:'active',startedAt:1,kind:'task',highlighted:true},{managerId:'e0',employeeId:'e5',command:'session.send',requestId:'temporary',startedAt:1,kind:'request',highlighted:true}];",
  "function Fixture(){const [store,setStore]=useState(initial),[view,setView]=useState({kind:'home'});window.companyFixture={state:()=>store,view:(value)=>setStore(old=>({...old,viewport:value})),design:(name,design)=>setStore(old=>({...old,rooms:{...old.rooms,[name]:{...old.rooms[name],design}}}))};const act=async(cmd,args={})=>{window.calls.push({cmd,args});if(cmd==='canvas.set')setStore(old=>({...old,viewport:{x:args.x,y:args.y,zoom:args.zoom}}));if(cmd==='view.open')setView(args);if(cmd==='view.close')setView({kind:'home'});return {}};return <div className='app in-office'><HomeView store={store} view={view} busyIds={new Set(['e1','e10'])} disconnectedIds={new Set(['e8'])} activities={{}} interactions={interactions} act={act} onOpen={card=>window.opened.push(card.id)} onResize={()=>{}}/></div>}createRoot(document.getElementById('root')).render(<Fixture/>);"
 ].join('\n')
 await build({stdin:{contents,resolveDir:renderer,loader:'tsx'},bundle:true,outfile:path.join(temp,'app.js'),jsx:'automatic',loader:{'.woff':'file','.woff2':'file','.ttf':'file','.svg':'file','.png':'file','.webp':'file'},plugins:[{name:'unused-fate-catalog',setup(build){build.onResolve({filter:/\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));build.onLoad({filter:/.*/,namespace:'raw'},args=>({contents:fs.readFileSync(args.path,'utf8'),loader:'text'}));build.onLoad({filter:/\/FatePet\.tsx$/},args=>({contents:fs.readFileSync(args.path,'utf8').replace(/^const sheets=.*$/m,'const sheets:Record<string,string>={}').replace(/^const previews=.*$/m,'const previews:Record<string,string>={}'),loader:'tsx',resolveDir:path.dirname(args.path)}))}}],logLevel:'silent'})
 browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})})
 const page=await browser.newPage({viewport:{width:1580,height:1040},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('https://company-clarity.test/**',route=>{
  const name=decodeURIComponent(new URL(route.request().url()).pathname.slice(1))
  if(!name)return route.fulfill({contentType:'text/html',body:'<html data-theme="white" data-presentation="company"><body><div id="root"></div></body></html>'})
  const file=path.resolve(temp,name);if(!file.startsWith(temp+path.sep)||!fs.existsSync(file))return route.fulfill({status:404})
  return route.fulfill({path:file,contentType:({'.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'})[path.extname(file)]})
 })
 await page.goto('https://company-clarity.test/')
 await page.evaluate(()=>{window.calls=[];window.opened=[];window.agents={platform:'macos',call:async(cmd,args)=>{window.calls.push({cmd,args});if(cmd==='plugin.list')return [];if(cmd==='host.list')return [{id:'fixture-host',status:{connected:false,checkedAt:1}}];return {}},onEvent:()=>()=>{}}})
 await page.addStyleTag({url:'https://company-clarity.test/app.css'})
 await page.addScriptTag({url:'https://company-clarity.test/app.js'})
 await expect(page.locator('.world-room')).toHaveCount(4);await expect(page.locator('.employee')).toHaveCount(12)
 await page.evaluate(()=>document.fonts.ready)
 const geometry=()=>page.evaluate(()=>({rooms:[...document.querySelectorAll('.world-room')].map(el=>({name:el.getAttribute('data-department'),left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height})),employees:[...document.querySelectorAll('.employee-location')].map(el=>({left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height})),edges:[...document.querySelectorAll('.management-line')].map(el=>({path:el.getAttribute('d'),relation:el.getAttribute('data-relation'),active:el.parentElement.getAttribute('data-active'),temporary:el.parentElement.getAttribute('data-temporary')}))}))
 const before=await geometry(),checks=[]
 assert.ok(before.edges.some(edge=>edge.active==='true'));assert.ok(before.edges.some(edge=>edge.active==='false'&&edge.relation));assert.ok(before.edges.some(edge=>edge.temporary==='true'))
 fs.mkdirSync(out,{recursive:true})
 for(const theme of ['white','space','black','blue']){
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme},theme)
  const visual=await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d'),color=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3)},light=c=>{const v=c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*v[0]+.7152*v[1]+.0722*v[2]},ratio=(a,b)=>{a=light(color(a));b=light(color(b));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)}
   const badge=document.querySelector('.employee-badge'),name=badge.querySelector('.employee-name'),header=document.querySelector('.team-header'),title=header.querySelector('.team-title'),normal=document.querySelector('.management-connection[data-active=false]'),active=document.querySelector('.management-connection[data-active=true]'),floor=document.querySelector('[data-department=Research] .room-outline stop'),scene=document.querySelector('.infinite-canvas')
   return {canvas:getComputedStyle(scene).backgroundColor,canvasImage:getComputedStyle(scene).backgroundImage,grid:getComputedStyle(document.querySelector('.canvas-grid')).backgroundImage,nameContrast:ratio(getComputedStyle(name).color,getComputedStyle(badge).backgroundColor),headerContrast:ratio(getComputedStyle(title).color,getComputedStyle(header).backgroundColor),pathContrast:[...document.querySelectorAll('.team-header .team-root-label')].map(el=>ratio(getComputedStyle(el).color,getComputedStyle(el.closest('.team-header')).backgroundColor)),roleContrast:[...document.querySelectorAll('.employee-management')].map(el=>ratio(getComputedStyle(el).color,getComputedStyle(el).backgroundColor)),line:getComputedStyle(normal).color,activeLine:getComputedStyle(active).color,lineContrast:ratio(getComputedStyle(normal).color,getComputedStyle(floor).stopColor),activeContrast:ratio(getComputedStyle(active).color,getComputedStyle(floor).stopColor),defaultFloor:getComputedStyle(floor).stopColor,customDark:getComputedStyle(document.querySelector('[data-department=\"Cloud operations\"] .room-outline stop')).stopColor,customLight:getComputedStyle(document.querySelector('[data-department=\"Custom studio\"] .room-outline stop')).stopColor,states:[...document.querySelectorAll('.employee')].map(el=>[el.getAttribute('data-card-id'),el.getAttribute('data-state')]),lamps:Object.fromEntries([...document.querySelectorAll('.employee')].map(el=>[el.getAttribute('data-card-id'),getComputedStyle(el.querySelector('.badge-light')).backgroundColor]))}
  })
  assert.equal(visual.canvasImage,'none');assert.match(visual.grid,/linear-gradient/);assert.ok(visual.nameContrast>=7,theme+' employee title contrast');assert.ok(visual.headerContrast>=7,theme+' Team title contrast');assert.ok(visual.pathContrast.every(value=>value>=4.5),theme+' workspace path contrast '+visual.pathContrast);assert.ok(visual.roleContrast.every(value=>value>=4.5),theme+' role contrast '+visual.roleContrast);assert.ok(visual.lineContrast>=3,theme+' permanent connection contrast');assert.ok(visual.activeContrast>=3,theme+' active connection contrast');assert.notEqual(visual.line,visual.activeLine)
  assert.equal(visual.customDark,'rgb(37, 75, 67)');assert.equal(visual.customLight,'rgb(255, 242, 204)')
  assert.deepEqual(await geometry(),before,'colors do not alter room/actor/connector geometry')
  assert.equal(visual.states.find(([id])=>id==='e1')[1],'working');assert.equal(visual.states.find(([id])=>id==='e8')[1],'disconnected');assert.equal(visual.states.find(([id])=>id==='e9')[1],'sleeping');assert.equal(visual.states.find(([id])=>id==='e10')[1],'initializing');assert.equal(visual.states.find(([id])=>id==='e11')[1],'initialization-failed');assert.notEqual(visual.lamps.e10,visual.lamps.e1,'initialization stays amber even while busy');assert.equal(visual.lamps.e11,visual.lamps.e8,'both real error states stay red');assert.notEqual(visual.lamps.e9,visual.lamps.e1)
  await page.screenshot({path:path.join(out,theme+'-dense.png'),animations:'disabled'});checks.push({theme,...visual})
 }
 // A real saved 22% overview omits minor lines instead of compressing them into visual noise.
 await page.evaluate(()=>{document.documentElement.dataset.theme='white';window.companyFixture.view({x:45,y:22,zoom:.22})})
 await expect(page.locator('.infinite-canvas')).toHaveAttribute('data-zoom','0.220')
 const overview=await page.locator('.canvas-grid').evaluate(el=>({size:getComputedStyle(el).backgroundSize,position:getComputedStyle(el).backgroundPosition,opacity:getComputedStyle(el).opacity,transform:document.querySelector('.canvas-world').style.transform,viewport:window.companyFixture.state().viewport}))
 const spacing=overview.size.split(',').map(layer=>layer.trim().split(' ').map(parseFloat));for(const layer of spacing){assert.deepEqual(layer,[28.16,28.16]);assert.ok(layer.every(value=>value>=24&&value<48))}assert.ok(overview.position.split(',').every(layer=>layer.trim()==='45px 22px'));assert.equal(overview.opacity,'0.5');assert.equal(overview.transform,'translate(45px, 22px) scale(0.22)');assert.deepEqual(overview.viewport,{x:45,y:22,zoom:.22})
 assert.deepEqual(await geometry(),before,'overview grid does not move world-space rooms, employees or connection paths')
 await page.screenshot({path:path.join(out,'white-overview-22.png'),animations:'disabled'})
 await page.evaluate(()=>window.companyFixture.design('Research',{theme:'rose',background:'',pattern:'dots',scenery:false}))
 await expect(page.locator('[data-department=Research]')).toHaveClass(/theme-rose/)
 await expect(page.locator('[data-department=Research] .room-outline pattern circle')).toHaveCount(1)
 await expect(page.locator('[data-department=Research] .room-scenery')).toHaveCount(0)
 const paletteFloor=await page.locator('[data-department=Research] .room-outline stop').first().evaluate(el=>getComputedStyle(el).stopColor)
 await page.evaluate(()=>document.documentElement.dataset.presentation='messages')
 assert.equal(await page.locator('[data-department=Research] .room-outline stop').first().evaluate(el=>getComputedStyle(el).stopColor),paletteFloor,'a deliberately saved room palette remains identical')
 await page.evaluate(()=>{document.documentElement.dataset.presentation='company';window.companyFixture.design('Research',undefined)})
 await page.evaluate(()=>{document.documentElement.dataset.theme='white';window.companyFixture.view({x:40,y:10,zoom:1})})
 await expect(page.locator('.infinite-canvas')).toHaveAttribute('data-zoom','1.000')
 const card=page.locator('.employee[data-card-id=e0]');await card.focus();await page.keyboard.press('Enter');assert.deepEqual(await page.evaluate(()=>window.opened),['e0'])
 const line=page.locator('.management-connection[data-active=false] .connector-segment-hit').first();await line.focus();await page.keyboard.press('Enter');await expect(page.locator('.connector-editor')).toBeVisible();await expect(page.locator('.connector-names')).toContainText('Lead');await expect(page.locator('.connector-end-label')).toHaveText(['Source','Target endpoint'])
 await page.screenshot({path:path.join(out,'white-detail-connection.png'),animations:'disabled'});await page.keyboard.press('Escape')
 // Company-specific surfaces must not recolor Message or Plan presentations.
 const companyFloor=await page.locator('[data-department=Research] .room-outline stop').first().evaluate(el=>getComputedStyle(el).stopColor)
 for(const presentation of ['messages','plan']){
  await page.evaluate(presentation=>{document.documentElement.dataset.presentation=presentation;document.documentElement.dataset.theme='blue'},presentation)
  const external=await page.locator('.infinite-canvas').evaluate(el=>({background:getComputedStyle(el).backgroundColor,grid:getComputedStyle(document.querySelector('.canvas-grid')).backgroundImage,opacity:getComputedStyle(document.querySelector('.canvas-grid')).opacity}))
  assert.match(external.grid,/radial-gradient/);assert.equal(external.opacity,'0.48');assert.notEqual(external.background,checks.find(row=>row.theme==='blue').canvas)
 }
 assert.ok(!(await page.evaluate(()=>window.calls)).some(call=>['host.check','remote.check','room.bounds','card.place','connector.set'].includes(call.cmd)))
 assert.deepEqual(errors,[])
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,platform:'headless Chrome on macOS',checks,overview,geometryPreserved:true,customRoomBackgroundsPreserved:true,savedRoomPalettePreserved:true,realCoreCalls:0,unusedFateCatalogOmitted:true},null,2))
 console.log('PASS Company source: white/dark/black/blue neutral surfaces, dense Team/employee/edge contrast, legible 22% overview grid, custom materials, real state semantics and unchanged geometry/navigation')
}finally{await browser?.close();fs.rmSync(temp,{recursive:true,force:true})}
