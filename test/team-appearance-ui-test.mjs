import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),project=path.resolve(import.meta.dirname,'..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-tui-'))),home=path.join(temp,'state'),work=path.join(temp,'work'),projects=path.join(temp,'projects'),external=path.join(temp,'Existing Project'),sub=path.join(work,'mini-notion-workspace','Department')
for(const folder of [home,external,sub])fs.mkdirSync(folder,{recursive:true})
fs.writeFileSync(path.join(external,'keep.md'),'keep existing files')
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_WORKSPACES:work,AGENTS_COMPANY_PROJECTS:projects,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1100'};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[project],env}),page=await app.firstWindow();page.setDefaultTimeout(20000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[path.join(project,'bin/agents'),...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
let n=0;const ok=(value,label)=>{assert.ok(value,label);n++;console.log('PASS '+label)}
try{
 await page.locator('.infinite-canvas').waitFor();ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'windows remain hidden')
 await cli('group','add','Studio');await cli('room','bounds','Studio','--x','0','--y','0','--width','760','--height','700')
 const first=await cli('card','create','--title','Alice','--group','Studio'),second=await cli('card','create','--title','Bob','--group','Studio')
 await cli('canvas','set','--x','80','--y','120','--zoom','.8');await expect(page.locator('.infinite-canvas')).toHaveAttribute('data-zoom','0.800')
 await cli('view','open','team','--name','Studio');await expect(page.locator('input[name="team-name"]')).not.toBeEditable();await assert.rejects(()=>cli('ui','type','input[name="team-name"]','Renamed'))
 await expect(page.locator('.appearance-settings')).toBeVisible()
 await page.locator('input[aria-label="Team 背景颜色"]').fill('#d8e9f3');await page.locator('select[name="pattern"]').selectOption('grid');await page.locator('input[name="scenery"]').uncheck()
 await page.locator('input[name="subtitle"]').fill('DESIGN & BUILD');await page.locator('.save-team').click();await expect(page.locator('.office-panel')).toHaveCount(0)
 const room=page.locator('[data-department="Studio"]'),layout=()=>cli('room','layout','Studio')
 await expect.poll(()=>room.evaluate(e=>e.style.getPropertyValue('--room-floor-top'))).toBe('#d8e9f3')
 ok(await room.locator('.room-scenery').count()===0&&(await cli('session','list')).rooms.Studio.design.pattern==='grid','custom background color, texture and scene visibility are saved through the CLI')
 await cli('view','open','employee','--employee',first.id);await expect(page.locator('input[name="title"]')).not.toBeEditable();await page.locator('input[name="role"]').fill('Product designer');await page.locator('.save-employee').click();await expect(page.locator('.office-panel')).toHaveCount(0)
 ok((await cli('session','list')).sessions.find(c=>c.id===first.id).role==='Product designer','employee name is locked while other profile fields remain editable')
 await expect(room.locator('.room-resize-handle,.department-sign')).toHaveCount(0);await expect(room.locator('.team-title')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 const beforeMove=(await layout()).bounds,rbox=await room.boundingBox(),blank={x:rbox.x+30*.8,y:rbox.y+480*.8};await page.mouse.move(blank.x,blank.y);await page.mouse.down();await page.mouse.move(blank.x+40,blank.y+24,{steps:10});await page.mouse.up();await expect.poll(async()=>(await layout()).bounds.x).toBe(beforeMove.x+50);await expect(page.locator('.team-workspace,.conversation-dialog')).toHaveCount(0);ok(true,'team interior drags the whole Team without opening a page; title has no plaque and no corner button');
 const initial=await layout(),pet=page.locator(`[data-card-id="${first.id}"]`),p=await pet.boundingBox()
 await cli('settings','set','--snap-employees','off');await page.mouse.move(p.x+95,p.y+85);await page.mouse.down();await page.mouse.move(p.x+95+610,p.y+85+25,{steps:15});await page.mouse.up()
 await expect.poll(async()=>(await cli('session','list')).sessions.find(c=>c.id===first.id).position?.x).toBeLessThanOrEqual(760-190-18)
 assert.deepEqual((await layout()).bounds,{...initial.bounds,arrangement:'free'});ok(true,'dragging an employee beyond the room is confined and leaves frame dimensions unchanged')
 const edgeDrag=async(rx,ry,dx,dy,edge)=>{
  const before=(await layout()).bounds,b=await room.boundingBox(),x=b.x+b.width*rx,y=b.y+b.height*ry
  await page.mouse.move(x,y);const cursor=await page.evaluate(({x,y})=>getComputedStyle(document.elementFromPoint(x,y)).cursor,{x,y});assert.equal(cursor,edge+'-resize')
  await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:12});await page.mouse.up()
  await expect.poll(async()=>{const after=(await layout()).bounds;return after.width!==before.width||after.height!==before.height}).toBe(true)
  const after=(await layout()).bounds;await expect.poll(()=>room.evaluate(e=>parseFloat(e.style.width))).toBeCloseTo(after.width,3);return {before,after}
 }
 let resized=await edgeDrag(.994,.5,80,0,'e');assert.ok(Math.abs(resized.after.width-resized.before.width-100)<.001);assert.equal(resized.after.x,resized.before.x)
 resized=await edgeDrag(.005,.5,-40,0,'w');assert.ok(Math.abs(resized.after.width-resized.before.width-50)<.001);assert.equal(resized.after.x+resized.after.width,resized.before.x+resized.before.width)
 resized=await edgeDrag(.72,.006,0,-32,'n');assert.equal(resized.after.height,resized.before.height+40);assert.equal(resized.after.y+resized.after.height,resized.before.y+resized.before.height)
 resized=await edgeDrag(.5,.994,0,48,'s');assert.equal(resized.after.height,resized.before.height+60)
 ok(true,'all four edges show resize cursors and drag from the correct anchored side at canvas zoom')
 for(const shape of ['ellipse','hexagon','custom']){
  await cli('room','bounds','Studio','--shape',shape);await expect(room).toHaveAttribute('data-shape',shape)
  resized=await edgeDrag(shape==='custom'?1:.993,shape==='custom'?.26:.5,40,0,'e');assert.ok(Math.abs(resized.after.width-resized.before.width-50)<.001)
 }
 ok(true,'ellipse, hexagon and custom polygon resize directly from their actual outline')
 await cli('room','bounds','Studio','--shape','rounded','--width','1040','--height','760');await cli('card','place',first.id,'--x','210','--y','190','--snap','off');await cli('card','place',second.id,'--x','540','--y','190','--snap','off')
 await expect.poll(()=>page.locator(`[data-card-id="${second.id}"]`).evaluate(e=>parseFloat(e.parentElement.style.left))).toBe(540)
 await page.screenshot({path:path.join(project,'artifacts/team-appearance-0.11.png')})
 await cli('view','open','team','--name','Studio');await expect(page.locator('input[aria-label="Team 背景颜色"]')).toHaveValue('#d8e9f3');await expect(page.locator('select[name="pattern"]')).toHaveValue('grid');await expect(page.locator('input[name="width"]')).toHaveValue('1040')
 await page.locator('.appearance-settings').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(project,'artifacts/team-settings-0.11.png')});await page.locator('.panel-close').click()
 ok(true,'background settings and manually resized dimensions reopen correctly')
 ok(!errors.length,'no renderer exceptions: '+errors.join('; '));console.log(`PASS=${n} FAIL=0 — hidden native pointer tests, no model calls`)
}catch(error){console.error(error);if(!page.isClosed()){console.error(await page.locator('body').innerText());await page.screenshot({path:path.join(project,'artifacts/team-appearance-error.png')})}throw error}
finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
