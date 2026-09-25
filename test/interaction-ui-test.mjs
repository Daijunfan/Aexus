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
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-mui-'))),work=path.join(temp,'work','mini-notion-workspace','Planning'),build=path.join(temp,'projects','Build Studio'),home=path.join(temp,'state')
fs.mkdirSync(work,{recursive:true});fs.mkdirSync(build,{recursive:true});fs.mkdirSync(home)
const fixture=path.join(temp,'codex-fixture')
const markdown='Conversation is working.\n\n## 完成情况\n\n- **已完成** 一项工作\n- 使用 `agents status` 查看状态\n\n```sh\nagents status --json\n```\n\n| 项目 | 结果 |\n| --- | --- |\n| 文档 | 完成 |\n\n[参考资料](https://example.com/)\n\n<script>window.markdownUnsafe=true</script>'
fs.writeFileSync(fixture,`#!/usr/bin/env node
const args=process.argv.slice(2);if(!args.includes('gpt-5.6-luna')||!args.includes('model_reasoning_effort="low"'))process.exit(4);
process.stdin.resume();process.stdin.on('end',()=>{for(const event of [{type:'thread.started',thread_id:'fixture-thread'},{type:'turn.started'},{type:'item.completed',item:{id:'reply',type:'agent_message',text:${JSON.stringify(markdown)}}},{type:'turn.completed'}])process.stdout.write(JSON.stringify(event)+'\\n')});
`,{mode:0o755})
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:process.env.AGENTS_COMPANY_TEST_WIDTH||'1440',AGENTS_COMPANY_HEIGHT:'1100',CODEX_BIN:nativeFixture(fixture)};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[project],env})
const page=await app.firstWindow();page.setDefaultTimeout(20000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[path.join(project,'bin/agents'),...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const center=async name=>{const b=(await cli('room','layout',name)).bounds;await cli('canvas','set','--x',String(80-b.x*.8),'--y',String(150-b.y*.8),'--zoom','.8')}
let checks=0;const ok=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label)}
try{
  await page.locator('.infinite-canvas').waitFor();await page.emulateMedia({reducedMotion:'no-preference'})
  ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())),'all windows remain hidden')
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.44));await page.reload();await page.locator('.infinite-canvas').waitFor()
  await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())).toBe(1)
  const zoomBefore=(await cli('canvas','view')).zoom;await page.keyboard.press('Meta+=')
  await expect.poll(async()=>(await cli('settings','get')).pageZoom).toBeCloseTo(1.1)
  await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())).toBeCloseTo(1.1)
  ok((await cli('canvas','view')).zoom===zoomBefore,'saved browser zoom resets, then keyboard zoom changes the page without moving the canvas')
  await page.keyboard.press('Meta+-');await expect.poll(async()=>(await cli('settings','get')).pageZoom).toBe(1)
  ok((await page.locator('.company-header').boundingBox()).height===52&&(await page.locator('.plugin-directory').boundingBox()).width===64,'compact header and icon sidebar reserve more space for the canvas')
  const sidebarText=(await page.locator('.plugin-directory').innerText()).trim();ok(sidebarText.includes('M')&&sidebarText.includes('B')&&sidebarText.length<10,'home sidebar shows only plugin icons, without names or descriptions')
  await page.screenshot({path:path.join(project,'artifacts/compact-home-0.16.png')})
  await cli('group','add','Planning','--mode','work','--plugin','mininotion');await cli('group','add','Build')
  const fire=await cli('card','create','--title','Fire','--avatar','fireball','--color','#f8a52b','--group','Planning','--cwd','fire')
  const cat=await cli('card','create','--title','Cat','--avatar','cat','--group','Planning','--cwd','cat')
  await cli('card','create','--title','Other project','--group','Build')
  const opening=app.waitForEvent('window');await page.locator('[data-plugin="mininotion"]').click();const pluginPage=await opening;await pluginPage.locator('.sidebar').waitFor()
  const pluginURL=pluginPage.url()
  ok(await page.locator('.company-header').isVisible()&&await page.locator('iframe').count()===0,'plugin opens separately while the company header remains')
  ok(pluginPage!==page&&await pluginPage.locator('.app-shell').isVisible(),'plugin owns a separate native window')
  ok(await page.locator('.plugin-agent-row,.plugin-directory .mascot').count()===0,'main sidebar contains no duplicated plugin employees')
  await cli('view','open','conversation','--employee',fire.id);await expect(page.locator('.composer textarea')).toBeEnabled()
  const live=(await cli('session','list','--live')).find(s=>s.cardId===fire.id)
  await assert.rejects(()=>cli('session','rename',live.id,'项目策划'));await expect(page.locator('.session-heading')).toContainText('Fire')
  const opens=await Promise.all([cli('session','open',fire.id),cli('session','open',fire.id)])
  ok(opens.every(s=>s.sessionId===live.id)&&(await cli('session','list','--live')).length===1,'one employee keeps one live conversation across repeated opens and rejected rename')
  await assert.rejects(()=>cli('session','rename',fire.id,' '))
  await page.locator('.composer textarea').fill('keep my unsent message')
  await cli('view','open','conversation','--employee',cat.id);await expect(page.locator('.session-heading')).toContainText('Cat')
  await cli('view','open','conversation','--employee',fire.id);await expect(page.locator('.composer textarea')).toHaveValue('keep my unsent message')
  ok(true,'switching employees retains each conversation draft')
  const handle=page.getByRole('separator',{name:'调整侧栏宽度'}),r=await handle.boundingBox()
  await page.mouse.move(r.x+r.width/2,r.y+160);await page.mouse.down();await page.mouse.move(r.x+r.width/2+16,r.y+160,{steps:8})
  await expect.poll(()=>page.locator('.plugin-directory').evaluate(e=>e.getBoundingClientRect().width)).toBe(80)
  await page.mouse.up();await expect.poll(async()=>(await cli('settings','get')).sidebarWidth).toBe(80)
  ok(Math.abs((await page.locator('.infinite-canvas').boundingBox()).x-80)<1,'sidebar resizing persists and updates the company layout live')
  for(const theme of ['white','black']){
    await cli('settings','set','--theme',theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme)
    const colors=await page.locator('.composer textarea').evaluate(e=>({ink:getComputedStyle(e).color,paper:getComputedStyle(e.closest('.composer-box')).backgroundColor}))
    const l=c=>{const rgb=c.match(/[0-9.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722},a=l(colors.ink),b=l(colors.paper)
    assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,JSON.stringify(colors))
  }
  ok(true,'typed conversation text has readable contrast in white and black themes')
  await cli('settings','set','--theme','white');await page.locator('.employee-details').click()
  await expect(page.locator('select[name="kind"]')).toHaveValue('worker')
  await expect(page.locator('select[name="kind"] option')).toHaveCount(2)
  await expect(page.locator('.color-field')).toHaveCount(0)
  await page.locator('.save-employee').click();await expect(page.locator('.employee-inspector')).toHaveCount(0)
  ok((await cli('session','list')).sessions.find(c=>c.id===fire.id).color==='#f8a52b','employee details keep the existing avatar color without an editable color picker')
  await page.locator('.composer textarea').fill('hello');await page.locator('.send-btn').click();await expect(page.locator('.transcript')).toContainText('Conversation is working.')
  await expect(page.locator('.turn.assistant .markdown h2')).toHaveText('完成情况')
  await expect(page.locator('.turn.assistant .markdown li strong')).toHaveText('已完成')
  await expect(page.locator('.turn.assistant .markdown pre code')).toContainText('agents status --json')
  await expect(page.locator('.turn.assistant .markdown table td')).toContainText(['文档','完成'])
  await expect(page.locator('.turn.assistant .markdown a')).toHaveAttribute('href','https://example.com/')
  await page.locator('.turn.assistant .markdown a').click();await expect(page.locator('.conversation-dialog')).toBeVisible()
  await expect(page.locator('.turn.assistant .markdown script')).toHaveCount(0)
  ok(await page.evaluate(()=>!window.markdownUnsafe),'Markdown HTML is displayed as text, without executing scripts')
  ok((await cli('session','transcript',fire.id)).text.includes('## 完成情况'),'Markdown renders in the UI while the CLI retains its exact source text')
  await page.screenshot({path:path.join(project,'artifacts/plugin-session-0.8.png')})
  await page.locator('.back').click();await expect(page.locator('.conversation-dialog')).toHaveCount(0)
  ok((await cli('view','get')).kind==='home'&&pluginPage.url()===pluginURL&&!pluginPage.isClosed(),'closing a conversation leaves the independent plugin window open')
  await page.screenshot({path:path.join(project,'artifacts/plugin-layout-0.8.png')})
  await page.locator('.directory-home').click();await expect(page.locator('.company-header')).toBeVisible()
  await cli('room','bounds','Planning','--x','0','--y','0','--width','760','--height','840')
  await cli('canvas','set','--x','70','--y','150','--zoom','1');await expect(page.locator('.infinite-canvas')).toHaveAttribute('data-zoom','1.000')
  const pet=page.locator(`[data-card-id="${fire.id}"] .mascot`)
  await pet.hover();await expect(pet).toHaveAttribute('data-pose','pickup')
  const frame=await pet.getAttribute('data-frame');await expect.poll(()=>pet.getAttribute('data-frame')).not.toBe(frame)
  ok(await page.locator(`[data-card-id="${fire.id}"]`).evaluate(e=>getComputedStyle(e).cursor)==='pointer','hover uses a hand cursor and plays pickup animation without dragging')
  await page.mouse.move(900,35);await expect(pet).toHaveAttribute('data-pose',/sleep|yawn/,{timeout:4000})
  const z=pet.locator('.sleep-z').first();await expect(z).toHaveText('Z')
  ok(await z.evaluate(e=>parseFloat(getComputedStyle(e).opacity)>.3&&getComputedStyle(e).animationName!=='none'),'idle sleep has a visible animated capital Z')
  const sign=page.locator('[data-team="Planning"] strong'),badge=page.locator(`[data-card-id="${fire.id}"] .employee-name`)
  const signSize=await sign.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)),badgeSize=await badge.evaluate(e=>parseFloat(getComputedStyle(e).fontSize));ok(signSize>=24&&badgeSize>=16,`Team and employee names have larger readable type (${signSize}px / ${badgeSize}px)`)
  const floor=async()=>page.locator('[data-department="Planning"] .room-outline stop').first().evaluate(e=>getComputedStyle(e).stopColor)
  const lightFloor=await floor();await cli('settings','set','--theme','black');await expect(page.locator('html')).toHaveAttribute('data-theme','black');assert.notEqual(await floor(),lightFloor)
  ok(true,'Team floor colors follow the app theme')
  await cli('settings','set','--theme','white','--snap-employees','on')
  await cli('card','place',fire.id,'--x','48','--y','182','--snap','off')
  const position=async()=>(await cli('session','list')).sessions.find(c=>c.id===cat.id).position
  const dragTo=async(alt=false)=>{
    await cli('card','place',cat.id,'--x','420','--y','500','--snap','off')
    const target=page.locator(`[data-card-id="${cat.id}"]`)
    await expect.poll(()=>target.evaluate(e=>parseFloat(e.parentElement.style.left))).toBe(420)
    const b=await target.boundingBox();await page.mouse.move(b.x+90,b.y+85);if(alt)await page.keyboard.down('Alt');await page.mouse.down();await page.mouse.move(b.x+90-140,b.y+85-26,{steps:10});return async()=>{await page.mouse.up();if(alt)await page.keyboard.up('Alt')}
  }
  let drop=await dragTo();await expect(page.locator('.employee-snap-guide')).toHaveCount(1);await drop();await expect.poll(position).toEqual({x:273,y:467})
  ok(true,'nearby standard seats attract the employee with a temporary guide')
  await page.locator('.snap-toggle').click();await expect.poll(async()=>(await cli('settings','get')).snapEmployees).toBe(false)
  drop=await dragTo();await drop();await expect.poll(position).toEqual({x:280,y:474})
  ok(true,'turning snapping off preserves the exact freely dragged position')
  await page.locator('.snap-toggle').click();drop=await dragTo(true);await drop();await expect.poll(position).toEqual({x:280,y:474})
  ok((await cli('settings','get')).snapEmployees,'Option/Alt bypasses snapping without changing the saved setting')
  await page.mouse.move(900,35);await page.screenshot({path:path.join(project,'artifacts/office-0.8.png')})
  ok(errors.length===0,'no renderer exceptions: '+errors.join('; '))
  console.log(`PASS=${checks} FAIL=0 — hidden native pointer tests, no model calls`)
}catch(error){console.error(error);if(!page.isClosed()){console.error(await page.locator('body').innerText());await page.screenshot({path:path.join(project,'artifacts/interaction-error.png')})}throw error}
finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
