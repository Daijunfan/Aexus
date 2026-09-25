// Hidden native UI: the Team header reflects the shared CLI SSH probe and remote OS.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import assert from 'node:assert/strict'

const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test'),run=promisify(execFile)
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-team-header-')))
const home=path.join(temp,'state'),tunnel=path.join(temp,'tunnel'),checks=path.join(temp,'checks.jsonl'),reachability=path.join(temp,'reachable')
fs.mkdirSync(home);fs.mkdirSync(tunnel)
for(const directory of ['local','plugin'])fs.mkdirSync(path.join(temp,directory))
const store={groups:['Local Team','Plugin Team','Kali Team','Windows Team'],sessions:[],rooms:{},teamRoots:{'Local Team':path.join(temp,'local'),'Plugin Team':path.join(temp,'plugin'),'Kali Team':'/home/kali/team','Windows Team':'C:\\Users\\djf\\Team'},teamSettings:{'Plugin Team':{mode:'work',pluginId:'mininotion'},'Kali Team':{mode:'cloud',remote:{host:'kali.example',directory:'/home/kali/team',os:'linux',distribution:'kali'}},'Windows Team':{mode:'cloud',remote:{host:'windows.example',directory:'C:\\Users\\djf\\Team',os:'windows'}}}}
fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify(store))
fs.writeFileSync(reachability,'online')
await build({entryPoints:[root+'/src/shared/remote.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(temp,'remote.cjs'),logLevel:'silent'})
const {remoteTarget}=require(path.join(temp,'remote.cjs'))
assert.equal(remoteTarget({host:'kali.example',directory:'/home/kali/team',os:'linux',distribution:'KALI'}).distribution,'kali')
assert.throws(()=>remoteTarget({host:'windows.example',directory:'C:\\Users\\djf\\Team',os:'windows',distribution:'kali'}))
fs.writeFileSync(path.join(tunnel,'bridge.py'),`import json,sys\nfrom pathlib import Path\nrequest=json.load(sys.stdin)\nwith open(${JSON.stringify(checks)},'a') as log:log.write(json.dumps(request)+'\\n')\nif request['target']['host']=='kali.example' and Path(${JSON.stringify(reachability)}).read_text()=='online':\n if sys.argv[1]=='ping':print(json.dumps({'connected':True}))\n elif sys.argv[1]=='check':print(json.dumps({'info':'Working environment: Kali','environment':{'os':'Linux','distribution':'kali','distributionName':'Kali GNU/Linux Rolling'}}))\nelse:\n print('SSH unavailable',file=sys.stderr);sys.exit(1)\n`)
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_TUNNEL_DIR:tunnel,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1100'}
delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env})
const cli=async(...args)=>JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:10000})).stdout)
try{
 const page=await app.firstWindow();await page.locator('.infinite-canvas').waitFor()
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 for(const [name,label] of [['Local Team','Local'],['Plugin Team','Plugin'],['Kali Team','Cloud'],['Windows Team','Cloud']])await expect(page.locator(`[data-department="${name}"] .team-header .team-kind`)).toHaveText(label)
 await expect.poll(()=>fs.existsSync(checks)?fs.readFileSync(checks,'utf8').trim().split('\n').length:0).toBeGreaterThanOrEqual(2)
 const kali=page.locator('[data-department="Kali Team"] .team-header'),windows=page.locator('[data-department="Windows Team"] .team-header')
 await expect(kali.locator('.team-health')).toHaveAttribute('data-connected','true')
 await expect(kali.locator('.team-os')).toHaveAttribute('data-os','kali')
 await expect(windows.locator('.team-health')).toHaveAttribute('data-connected','false')
 await expect(windows.locator('.team-os')).toHaveAttribute('data-os','windows')
 fs.writeFileSync(reachability,'offline')
 await expect(kali.locator('.team-health')).toHaveAttribute('data-connected','false',{timeout:20000})
 fs.writeFileSync(reachability,'online')
 const kaliHost=(await cli('host','list')).data.find(host=>host.host==='kali.example')
 assert.equal((await cli('host','check',kaliHost.id)).data.connected,true)
 await expect(kali.locator('.team-health')).toHaveAttribute('data-connected','true')
 assert.ok(await kali.locator('.team-os img').evaluate(image=>image.complete&&image.naturalWidth>0))
 assert.equal(await kali.locator('.team-health i').evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(36, 185, 109)')
 assert.equal(await windows.locator('.team-health i').evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(223, 85, 88)')
 const badges=async()=>kali.evaluate(header=>{
   const title=header.querySelector('.team-title').getBoundingClientRect(),row=header.querySelector('.team-badges').getBoundingClientRect()
   return {center:Math.abs(title.x+title.width/2-row.x-row.width/2),width:row.width,kindFont:getComputedStyle(header.querySelector('.team-kind')).fontSize,healthFont:getComputedStyle(header.querySelector('.team-health')).fontSize,icon:header.querySelector('.team-os img').getBoundingClientRect().width}
 })
 await cli('room','bounds','Kali Team','--width','800')
 await expect.poll(async()=>kali.evaluate(header=>Math.round(parseFloat(getComputedStyle(header.closest('.world-room')).width)))).toBe(800)
 const wide=await badges()
 await cli('room','bounds','Kali Team','--width','500')
 await expect.poll(async()=>kali.evaluate(header=>Math.round(parseFloat(getComputedStyle(header.closest('.world-room')).width)))).toBe(500)
 const narrow=await badges()
 assert.ok(wide.center<2&&narrow.center<2,'Team badges stay centered directly below the title')
 assert.equal(wide.width,narrow.width,'Team badges keep their width when Team bounds change')
 assert.equal(wide.kindFont,narrow.kindFont);assert.equal(wide.healthFont,narrow.healthFont);assert.equal(wide.icon,narrow.icon)
 const result=await cli('remote','check','--team','Kali Team');assert.equal(result.data.environment.distribution,'kali')
 await assert.rejects(()=>cli('remote','check','--team','Windows Team'))
 await cli('view','open','team','--name','Kali Team')
 await expect(page.locator('select[name="cloud-host-id"]')).toBeVisible()
 await expect(page.locator('input[name="remote-host"],select[name="remote-distribution"]')).toHaveCount(0)
 await cli('view','close')
 await cli('view','open','team','--name','Windows Team')
 await expect(page.locator('select[name="remote-distribution"]')).toHaveCount(0)
 await cli('view','close')
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts/team-header-preview.png')})
 await cli('settings','set','--theme','white');await expect(page.locator('html')).toHaveAttribute('data-theme','white')
 await page.screenshot({path:path.join(root,'artifacts/team-header-white-preview.png')})
 const bounds=(await cli('room','layout','Kali Team')).data.bounds
 await cli('canvas','set','--x',String(160-bounds.x*.8),'--y',String(160-bounds.y*.8),'--zoom','.8')
 await expect(page.locator('[data-department="Kali Team"] .team-os')).toHaveAttribute('data-os','kali')
 await expect.poll(async()=>{const box=await page.locator('[data-department="Kali Team"]').boundingBox();return !!box&&box.x>=80&&box.x<500&&box.y>=80&&box.y<500}).toBe(true)
 await page.screenshot({path:path.join(root,'artifacts/kali-header-preview.png')})
 console.log('PASS Plugin/Local/Cloud labels, live green/red SSH lamps and Kali/Windows OS images stay inside each Team header through the CLI probe')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
