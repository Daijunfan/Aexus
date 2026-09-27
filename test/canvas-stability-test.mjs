// Reproduce competing IPC snapshots without model calls or user data.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test')
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-canvas-stability-'))
fs.cpSync('out/renderer',path.join(temp,'renderer'),{recursive:true})
const html=path.join(temp,'renderer/index.html')
fs.writeFileSync(html,fs.readFileSync(html,'utf8').replace('<head>','<head><script src="./fixture.js"></script>'))
fs.writeFileSync(path.join(temp,'renderer/fixture.js'),`
const state={groups:['Studio'],sessions:[{id:'pet',title:'Fire',engine:'codex',group:'Studio',cwd:'/fixture',avatar:'fireball',position:{x:80,y:100}}],rooms:{Studio:{bounds:{x:0,y:0,width:760,height:500,pinned:true}}},viewport:{x:70,y:100,zoom:1}};
let listeners=[],reads=0,racing=false;
window.test={samples:[],mutations:0,pulse(){listeners.forEach(fn=>fn({channel:'session:changed',payload:{}}))}};
window.agents={rendererReady(){},onUiRequest(){return()=>{}},answerUi(){},onEvent(fn){listeners.push(fn);return()=>{listeners=listeners.filter(f=>f!==fn)}},async call(cmd,args={}){
 if(cmd==='view.get')return {kind:'home',revision:0};
 if(cmd==='plugin.list')return [];
 if(cmd==='session.list'){
  if(args.live)return [];
  const snapshot=structuredClone(state),delay=racing?(++reads===1?90:280):0;
  await new Promise(r=>setTimeout(r,delay));return snapshot;
 }
 if(cmd==='canvas.set'||cmd==='room.bounds'||cmd==='card.place'){
  if(cmd==='canvas.set')state.viewport=args;
  if(cmd==='room.bounds')Object.assign(state.rooms.Studio.bounds,args.bounds);
  if(cmd==='card.place')state.sessions[0].position={x:args.x,y:args.y};
  racing=true;reads=0;window.test.mutations++;
  listeners.forEach(fn=>fn({channel:'store:changed',payload:{}}));return structuredClone(state);
 }
 return {};
}};
const sample=()=>{const room=document.querySelector('.world-room'),pet=document.querySelector('.employee-location'),world=document.querySelector('.canvas-world');if(room)window.test.samples.push({room:room.style.left,pet:pet.style.left,world:world.style.transform,mutations:window.test.mutations});requestAnimationFrame(sample)};requestAnimationFrame(sample);
`)
fs.writeFileSync(path.join(temp,'main.cjs'),`const {app,BrowserWindow}=require('electron');if(process.platform==='darwin')app.setActivationPolicy('prohibited');app.setPath('userData',${JSON.stringify(path.join(temp,'state'))});app.whenReady().then(()=>{const w=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{backgroundThrottling:false,offscreen:process.env.AGENTS_COMPANY_OFFSCREEN==='1'}});w.loadFile(${JSON.stringify(html)})});`)
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:require('electron'),args:[path.join(temp,'main.cjs')],env})
try{
 const page=await app.firstWindow();await page.locator('.employee-location').waitFor()
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 const room=page.locator('.world-room'),b=await room.boundingBox()
 await page.mouse.move(b.x+500,b.y+350);await page.mouse.down();await page.mouse.move(b.x+620,b.y+350,{steps:8})
 await expect(room).toHaveCSS('left','120px');await page.evaluate(()=>window.test.samples=[]);await page.mouse.up()
 await page.waitForTimeout(550)
 const roomSamples=await page.evaluate(()=>window.test.samples.map(s=>s.room))
 assert.ok(roomSamples.every(x=>x==='120px'),'Team jumps to old position while save refresh is superseded: '+JSON.stringify([...new Set(roomSamples)]))
 const pet=page.locator('.employee-location'),p=await pet.boundingBox()
 await page.mouse.move(p.x+90,p.y+85);await page.mouse.down();await page.mouse.move(p.x+150,p.y+85,{steps:8})
 const dropped=await pet.evaluate(e=>e.style.left);await page.evaluate(()=>window.test.samples=[]);await page.mouse.up();await page.waitForTimeout(550)
 assert.ok((await page.evaluate(()=>window.test.samples.map(s=>s.pet))).every(x=>x===dropped),'employee drop flashes an old seat')
 await page.evaluate(()=>{window.test.samples=[];document.querySelector('.infinite-canvas').dispatchEvent(new WheelEvent('wheel',{deltaX:80,deltaY:0,bubbles:true,cancelable:true}))})
 await page.waitForTimeout(850)
 const transforms=await page.evaluate(()=>window.test.samples.map(s=>s.world))
 const firstPan=transforms.indexOf('translate(-10px, 100px) scale(1)')
 // RAF may expose the old position until the first paint; no later frame may jump back.
 assert.ok(firstPan>=0&&transforms.slice(0,firstPan).every(s=>s==='translate(70px, 100px) scale(1)')&&transforms.slice(firstPan).every(s=>s==='translate(-10px, 100px) scale(1)'),'camera jumps to old viewport after save: '+JSON.stringify([...new Set(transforms)]))
 await page.evaluate(()=>{window.test.nodes=[document.querySelector('.world-room'),document.querySelector('.employee-location'),document.querySelector('.official-frame')];window.test.samples=[]})
 for(let i=0;i<16;i++){await page.evaluate(()=>window.test.pulse());await page.waitForTimeout(45)}
 await page.waitForTimeout(350)
 assert.ok(await page.evaluate(()=>window.test.nodes.every(n=>n.isConnected)),'live updates must preserve room and pet DOM')
 assert.ok((await page.evaluate(()=>window.test.samples)).every(s=>s.room==='120px'&&s.pet===dropped&&s.world==='translate(-10px, 100px) scale(1)'), 'live updates move the idle board')
 // Zoom, including a new gesture while the previous save is still pending.
 await page.evaluate(()=>window.test.samples=[])
 for(let i=0;i<3;i++){await page.locator('.infinite-canvas').dispatchEvent('wheel',{deltaY:-30,ctrlKey:true,clientX:600,clientY:400});await page.waitForTimeout(300)}
 await page.waitForTimeout(700)
 const zooms=await page.evaluate(()=>window.test.samples.map(s=>Number(s.world.match(/scale\(([^)]+)\)/)[1])))
 assert.ok(zooms.every((z,i)=>!i||z>=zooms[i-1]),'zoom must not jump backwards between saves')
 assert.deepEqual(errors,[])
 fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/canvas-stability.png'})
 console.log('PASS delayed competing snapshots: Team/employee drop, pan, overlapping zoom saves and streaming updates never jump backwards; hidden production renderer, no model calls')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
