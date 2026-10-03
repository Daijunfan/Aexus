import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'
import {vncFixture} from './fixtures/cloud-workbench.mjs'
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r))
const vnc=await vncFixture(),f=await fixtureCore({AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)})
let browser
try{
  assert.equal((await f.request(null,'host.create',{name:'Browser VNC',host:'fixture',os:'linux',defaultDirectory:'/tmp',desktop:{protocol:'vnc',address:'127.0.0.1',port:vnc.port}})).ok,true)
  browser=await chromium.launch({headless:true,...(process.env.AGENTS_BROWSER_CHANNEL?{channel:process.env.AGENTS_BROWSER_CHANNEL}:process.platform==='darwin'?{channel:'chrome'}:{})})
  const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:'+port)
  await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim())
  await page.getByRole('button',{name:'Enter workspace'}).click();await expect(page.locator('.infinite-canvas')).toBeVisible()
  await page.locator('.plugin-directory [data-plugin="cloud-hosts"]').click()
  const frame=page.frameLocator('.web-plugin-window iframe')
  await expect(frame.locator('.detail-heading h2')).toHaveText('Browser VNC')
  // Activate navigation without OS focus; real viewer mouse/key input is verified below.
  const desktopTab=frame.locator('[data-view="desktop"]');await desktopTab.dispatchEvent('click');await expect(desktopTab).toHaveClass(/active/)
  try{await frame.locator('#desktop-connect').click()}catch(error){throw Error(error.message+'; plugin body: '+await frame.locator('body').innerText()+'; renderer errors: '+JSON.stringify(errors))}
  await expect(frame.locator('#desktop-status')).toHaveText('桌面已连接',{timeout:15000})
  const canvas=frame.locator('#desktop-screen canvas');await expect(canvas).toBeVisible()
  await canvas.click({position:{x:110,y:110}});await page.keyboard.press('a')
  await expect.poll(()=>vnc.events.pointers.length).toBeGreaterThan(0)
  await expect.poll(()=>vnc.events.keys.length).toBeGreaterThan(0)
  assert.equal(vnc.events.frames,1)
  const output=path.join(f.root,'artifacts/opensource-tests-0.49.0');fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'web-vnc.png')})
  await frame.locator('#desktop-disconnect').click();await expect(frame.locator('#desktop-status')).toHaveText('已断开')
  assert.deepEqual(errors,[])
  console.log('PASS real noVNC iframe through authenticated Web gateway: handshake, frame, mouse, keyboard, disconnect and screenshot; protocol fixture only')
}finally{await browser?.close();await f.close();await vnc.close()}
