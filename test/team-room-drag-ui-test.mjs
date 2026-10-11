import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'

const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test')
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-team-drag-')))
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'960'}
delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env})
const page=await app.firstWindow(),run=promisify(execFile)
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const bounds=async name=>(await cli('room','layout',name)).bounds
try{
  await page.locator('.infinite-canvas').waitFor()
  await cli('group','add','A');await cli('group','add','B')
  await cli('room','bounds','A','--x','0','--y','0')
  await cli('room','bounds','B','--x','785','--y','0')
  assert.equal((await bounds('B')).x,785,'manual placement must not apply a clearance force')
  await cli('canvas','set','--x','120','--y','160','--zoom','0.8')
  await expect(page.locator('.infinite-canvas')).toHaveAttribute('data-zoom','0.800')
  await expect.poll(()=>page.locator('.canvas-world').getAttribute('style')).toContain('translate(120px, 160px)')
  const other=page.locator('.world-room[data-department="B"]'),original=await other.boundingBox()
  const title=await page.locator('.world-room[data-department="A"] .team-title').boundingBox()
  const x=title.x+title.width/2,y=title.y+title.height/2
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+32,y,{steps:8})
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  assert.equal(await other.evaluate(element=>parseFloat(element.style.left)),785,'neighbor must stay put during drag preview')
  await page.mouse.up()
  await expect.poll(async()=>(await bounds('A')).x).toBe(40)
  assert.equal((await bounds('B')).x,785,'neighbor must stay put after the drag is saved')
  assert.equal((await other.boundingBox()).x,original.x)
  await cli('room','bounds','A','--x','90')
  assert.equal((await bounds('B')).x,785,'even an intentional overlap cannot push another Team')
  assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
  console.log('PASS Team drag changes only the selected frame in preview and CLI; near and overlapping neighbors remain fixed')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
