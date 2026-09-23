import {nativeFixture} from './native-fixture.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const {_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile),project=path.resolve(import.meta.dirname,'..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-mui-'))),work=path.join(temp,'work','mini-notion-workspace','Plugin'),build=path.join(temp,'projects','Build Studio'),home=path.join(temp,'state')
fs.mkdirSync(work,{recursive:true});fs.mkdirSync(build,{recursive:true});fs.mkdirSync(home)
const fixture=path.join(temp,'codex-fixture')
fs.writeFileSync(fixture,`#!/usr/bin/env node
const args=process.argv.slice(2);if(!args.includes('gpt-5.6-luna')||!args.includes('model_reasoning_effort="low"'))process.exit(4);
process.stdin.resume();process.stdin.on('end',()=>{for(const event of [{type:'thread.started',thread_id:'fixture-thread'},{type:'turn.started'},{type:'item.completed',item:{id:'reply',type:'agent_message',text:'Conversation is working.'}},{type:'turn.completed'}])process.stdout.write(JSON.stringify(event)+'\\n')});
`,{mode:0o755})
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:process.env.AGENTS_COMPANY_TEST_WIDTH||'1440',AGENTS_COMPANY_HEIGHT:'1100',CODEX_BIN:nativeFixture(fixture)};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[project],env})
const page=await app.firstWindow();page.setDefaultTimeout(20000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[path.join(project,'bin/agents'),...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const center=async name=>{const b=(await cli('room','layout',name)).bounds;await cli('canvas','set','--x',String(80-b.x*.8),'--y',String(150-b.y*.8),'--zoom','.8')}
let checks=0;const ok=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label)}
try{
  await page.locator('.infinite-canvas').waitFor()
  ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'test never opens a visible window')
  for(const [button,kind] of [['.add-team','team'],['.add-employee','employee']]){
    await page.locator(button).click();await expect(page.locator('.office-panel')).toBeVisible()
    ok((await cli('view','get')).kind===kind,'UI open uses the CLI-owned '+kind+' view')
    ok(await page.locator('.panel-close').evaluate(e=>getComputedStyle(e).webkitAppRegion)==='no-drag','close button explicitly excludes the native window drag region')
    await page.locator('.panel-close').click();await expect(page.locator('.office-panel')).toHaveCount(0)
    ok((await cli('view','get')).kind==='home','real pointer X closes '+kind+' details')
    await cli('view','open',kind);await expect(page.locator('.office-panel')).toBeVisible()
    await cli('view','close');await expect(page.locator('.office-panel')).toHaveCount(0)
  }
  await cli('group','add','First');await cli('group','add','Neighbor')
  await cli('canvas','set','--x','90','--y','150','--zoom','.65')
  await expect(page.locator('[data-team="First"]')).toBeVisible()
  const before=(await cli('room','layout','First')).bounds,neighbor=(await cli('room','layout','Neighbor')).bounds
  const sign=await page.locator('[data-team="First"]').boundingBox(),start={x:sign.x+sign.width/2,y:sign.y+sign.height/2}
  await page.mouse.move(start.x,start.y);await page.mouse.down()
  for(let step=1;step<=8;step++){
    const dx=step*12,dy=step*5
    await page.mouse.move(start.x+dx,start.y+dy)
    if(step===4)await cli('room','design','Neighbor','--theme','ocean')
    await expect.poll(()=>page.locator('[data-department="First"]').evaluate(e=>parseFloat(e.style.left))).toBeCloseTo(before.x+dx/.65,0)
    assert.equal(await page.locator('[data-department="Neighbor"]').evaluate(e=>parseFloat(e.style.left)),neighbor.x)
  }
  await page.mouse.up()
  await expect.poll(async()=>(await cli('room','layout','First')).bounds.x).toBeCloseTo(before.x+96/.65,0)
  ok((await cli('room','layout','Neighbor')).bounds.x===neighbor.x,'every drag frame follows the pointer; store events and drop never move the neighbor')
  // Reverse direction immediately, including a new drag while the prior update is settling.
  for(const dx of [-70,42,-22]){
    const b=await page.locator('[data-team="First"]').boundingBox(),previous=(await cli('room','layout','First')).bounds.x
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+18,{steps:5});await page.mouse.up()
    await expect.poll(async()=>(await cli('room','layout','First')).bounds.x).toBeCloseTo(previous+dx/.65,0)
  }
  ok(true,'repeated forward and reverse dragging retains committed geometry')
  await cli('group','add','Plugin','--mode','work','--plugin','mininotion')
  await page.locator('.add-employee').click();await page.locator('select[name="group"]').selectOption('Plugin')
  await page.locator('input[name="title"]').fill('Cloudy');await page.getByRole('button',{name:'选择魔方',exact:true}).click()
  fs.mkdirSync(path.join(work,'design/cloudy'),{recursive:true});await page.locator('[data-directory-mode="bind"]').click();await page.locator('input[name="cwd"]').fill('design/cloudy');await page.locator('.save-employee').click();await expect(page.locator('.office-panel')).toHaveCount(0)
  const card=(await cli('session','list')).sessions.find(c=>c.title==='Cloudy')
  ok(card.avatar==='wondercube'&&card.cwd===path.join(work,'design/cloudy'),'replacement sprite and nested folder save through card.create')
  await center('Plugin');const pet=page.locator(`[data-card-id="${card.id}"]`)
  await expect(pet.locator('.mascot')).toHaveAttribute('data-pose',/sleep|yawn/)
  ok(await pet.locator('.badge-light').evaluate(e=>getComputedStyle(e).boxShadow)==='none','idle badge lamp is off')
  // Existing selection uses a stubbed native chooser, so no system dialog is displayed.
  fs.mkdirSync(path.join(work,'existing'))
  await page.locator('.add-employee').click();await page.locator('select[name="group"]').selectOption('Plugin');await page.locator('input[name="title"]').fill('Existing')
  await page.locator('[data-directory-mode="bind"]').click()
  await app.evaluate(({dialog},selected)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[selected]})},path.join(work,'existing'))
  await page.getByRole('button',{name:'选择工作目录',exact:true}).click();await page.locator('.save-employee').click();await expect(page.locator('.office-panel')).toHaveCount(0)
  ok((await cli('session','list')).sessions.some(c=>c.title==='Existing'&&c.cwd===path.join(work,'existing')),'existing directory selection uses the chosen in-scope folder')
  await center('Plugin');await pet.locator('.mascot').click();await expect(page.locator('.composer textarea')).toBeEnabled()
  await page.locator('.employee-details').click();await expect(page.locator('.employee-inspector')).toBeVisible()
  ok((await cli('view','get')).details,'employee details toggles the CLI view state')
  await page.locator('.back').click();await expect(page.locator('.conversation-dialog')).toHaveCount(0)
  const live=(await cli('session','list','--live')).find(s=>s.cardId===card.id)
  ok(!!live,'closing employee details leaves its engine available')
  // Hold the fixture process to inspect working animation without paying for inference.
  fs.writeFileSync(fixture,`#!/usr/bin/env node
const args=process.argv.slice(2);if(!args.includes('gpt-5.6-luna')||!args.includes('model_reasoning_effort="low"'))process.exit(4);
process.stdin.resume();process.stdin.on('end',()=>{process.stdout.write(JSON.stringify({type:'turn.started'})+'\\n');setInterval(()=>{},1000)});
`,{mode:0o755})
  await cli('session','send',live.id,'animation fixture')
  await expect(pet).toHaveAttribute('data-state','working');await expect(pet.locator('.mascot')).toHaveAttribute('data-pose',/type|think|land|wave/)
  const lamp=await pet.locator('.badge-light').evaluate(e=>{const s=getComputedStyle(e);return {width:s.width,background:s.backgroundColor,shadow:s.boxShadow}})
  ok(parseFloat(lamp.width)>=13&&lamp.background==='rgb(111, 255, 155)'&&lamp.shadow!=='none','working lamp is larger, green and illuminated')
  await page.screenshot({path:path.join(project,'artifacts/cloud-working.png')})
  await cli('session','interrupt',live.id);await page.mouse.move(10,500)
  await expect(pet).toHaveAttribute('data-state','sleeping');await expect(pet.locator('.mascot')).toHaveAttribute('data-pose',/sleep|yawn/)
  await page.screenshot({path:path.join(project,'artifacts/cloud-sleeping.png')})
  ok(await pet.locator('.badge-light').evaluate(e=>getComputedStyle(e).boxShadow)==='none','stopping work turns the lamp off and returns to napping')
  ok(errors.length===0,'no renderer exceptions: '+errors.join('; '))
  console.log(`PASS=${checks} FAIL=0 — hidden native pointer tests, no model calls`)
}catch(error){console.error(error);if(!page.isClosed()){console.error(await page.locator('body').innerText());await page.screenshot({path:path.join(project,'artifacts/navigation-error.png')})}throw error}
finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
