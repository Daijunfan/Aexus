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
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-team-header-')))
const home=path.join(temp,'state'),tunnel=path.join(temp,'tunnel'),checks=path.join(temp,'checks.jsonl'),reachability=path.join(temp,'reachable')
fs.mkdirSync(home);fs.mkdirSync(tunnel)
for(const directory of ['local','plugin'])fs.mkdirSync(path.join(temp,directory))
const store={groups:['Local Team','Plugin Team','Kali Team','Windows Team'],sessions:[],rooms:{},teamRoots:{'Local Team':path.join(temp,'local'),'Plugin Team':path.join(temp,'plugin'),'Kali Team':'/home/kali/team','Windows Team':'C:\\Users\\user\\Team'},teamSettings:{'Plugin Team':{mode:'work',pluginId:'mininotion'},'Kali Team':{mode:'cloud',remote:{host:'kali.example',directory:'/home/kali/team',os:'linux',distribution:'kali'}},'Windows Team':{mode:'cloud',remote:{host:'windows.example',directory:'C:\\Users\\user\\Team',os:'windows'}}}}
store.groups.push('Ubuntu Team');store.teamRoots['Ubuntu Team']='/home/ubuntu/team';store.teamSettings['Ubuntu Team']={mode:'cloud',remote:{host:'ubuntu.example',directory:'/home/ubuntu/team',os:'linux',distribution:'ubuntu'}}
for(const [name,pluginId] of [['Reader Team','margin-reader'],['Hosts Team','cloud-hosts']]){const directory=path.join(temp,pluginId);fs.mkdirSync(directory);store.groups.push(name);store.teamRoots[name]=directory;store.teamSettings[name]={mode:'work',pluginId}}
store.viewport={x:30,y:40,zoom:.4}
fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify(store))
fs.writeFileSync(reachability,'online')
await build({entryPoints:[root+'/Infra/src/shared/remote.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(temp,'remote.cjs'),logLevel:'silent'})
const {remoteTarget}=require(path.join(temp,'remote.cjs'))
assert.equal(remoteTarget({host:'kali.example',directory:'/home/kali/team',os:'linux',distribution:'KALI'}).distribution,'kali')
assert.throws(()=>remoteTarget({host:'windows.example',directory:'C:\\Users\\user\\Team',os:'windows',distribution:'kali'}))
fs.writeFileSync(path.join(tunnel,'bridge.py'),`import json,sys\nfrom pathlib import Path\nrequest=json.load(sys.stdin)\nwith open(${JSON.stringify(checks)},'a') as log:log.write(json.dumps(request)+'\\n')\nif request['target']['host']=='kali.example' and Path(${JSON.stringify(reachability)}).read_text()=='online':\n if sys.argv[1]=='ping':print(json.dumps({'connected':True}))\n elif sys.argv[1]=='check':print(json.dumps({'info':'Working environment: Kali','environment':{'os':'Linux','distribution':'kali','distributionName':'Kali GNU/Linux Rolling'}}))\nelse:\n print('SSH unavailable',file=sys.stderr);sys.exit(1)\n`)
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_TUNNEL_DIR:tunnel,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'1100'}
delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env})
const cli=async(...args)=>JSON.parse((await run(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env,timeout:10000})).stdout)
try{
 const page=await app.firstWindow();await page.locator('.infinite-canvas').waitFor()
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())))
 for(const [name,label] of [['Local Team','Local'],['Plugin Team','Plugin'],['Kali Team','Cloud'],['Windows Team','Cloud']])await expect(page.locator(`[data-department="${name}"] .team-header .team-kind`)).toHaveText(label)
 await expect(page.locator('[data-department="Local Team"] .team-os-apple')).toHaveCSS('width','64px')
 assert.ok(await page.locator('[data-department="Local Team"] .team-os-apple').evaluate(icon=>getComputedStyle(icon).maskImage!=='none'))
 await expect(page.locator('[data-department="Ubuntu Team"] .team-os')).toHaveAttribute('data-os','ubuntu')
 await expect(page.locator('[data-department="Plugin Team"] .team-plugin-icon')).toHaveAttribute('data-plugin','mininotion')
 await expect(page.locator('[data-department="Plugin Team"] .team-plugin-icon .plugin-monogram')).toHaveText('N')
 await expect(page.locator('[data-department="Plugin Team"] .team-plugin-icon .plugin-monogram')).toHaveCSS('width','50px')
 for(const [name,id] of [['Reader Team','margin-reader'],['Hosts Team','cloud-hosts']]){
  const sidebarIcon=page.locator(`.plugin-directory-button[data-plugin="${id}"] .plugin-image`),headerIcon=page.locator(`[data-department="${name}"] .team-plugin-icon .plugin-image`)
  for(const icon of [sidebarIcon,headerIcon])await expect.poll(()=>icon.evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true)
  assert.equal(await sidebarIcon.getAttribute('src'),await headerIcon.getAttribute('src'),'sidebar and Team header share the same artwork')
  await expect(page.locator(`.plugin-directory-button[data-plugin="${id}"] .plugin-monogram`)).toHaveCount(0)
  await expect(sidebarIcon).toHaveCSS('width','40px');await expect(headerIcon).toHaveCSS('width','62px')
 }
 await expect(page.locator('.plugin-directory-button[data-plugin="mininotion"] .plugin-monogram')).toHaveText('N')
 await page.locator('.plugin-icons').screenshot({path:path.join(root,'.aexus/artifacts/plugin-icons-dark.png')})
 await expect(page.locator('.team-os small')).toHaveCount(0)
 assert.deepEqual(await page.locator('[data-department="Ubuntu Team"] .team-os').evaluate(element=>{const style=getComputedStyle(element);return [style.borderTopWidth,style.backgroundColor]}),['0px','rgba(0, 0, 0, 0)'])
 const iconGeometry=async(name,selector)=>page.locator(`[data-department="${name}"] .team-os`).evaluate((wrapper,selector)=>{const outer=wrapper.getBoundingClientRect(),inner=wrapper.querySelector(selector).getBoundingClientRect();return {size:parseFloat(getComputedStyle(wrapper).width),offsetX:(inner.left+inner.width/2)-(outer.left+outer.width/2),offsetY:(inner.top+inner.height/2)-(outer.top+outer.height/2)}},selector)
 for(const [name,selector] of [['Local Team','.team-os-apple'],['Windows Team','svg'],['Ubuntu Team','svg'],['Kali Team','img']]){const icon=await iconGeometry(name,selector);assert.equal(icon.size,64);assert.ok(Math.abs(icon.offsetX)<1&&Math.abs(icon.offsetY)<1,`${name} icon is off center: ${JSON.stringify(icon)}`)}
 await expect(page.locator('[data-department="Kali Team"] .team-os img')).toHaveCSS('border-radius','50%')
 for(const [name,selector] of [['Local Team','.team-os-apple'],['Windows Team','svg'],['Ubuntu Team','svg'],['Kali Team','img']]){const icon=page.locator(`[data-department="${name}"] .team-os ${selector}`);await expect(icon).toHaveCSS('width','64px');await expect(icon).toHaveCSS('height','64px')}
 const checkCount=()=>fs.existsSync(checks)?fs.readFileSync(checks,'utf8').trim().split('\n').length:0
 const refresh=page.getByRole('button',{name:'刷新主机状态',exact:true})
 await expect(refresh).toBeVisible()
 assert.equal(checkCount(),0,'page startup must not probe SSH')
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await page.waitForTimeout(11000)
 assert.equal(checkCount(),0,'waiting and focusing the window must not probe SSH')
 const button=await refresh.boundingBox(),sidebar=await page.locator('.plugin-directory').boundingBox();assert.ok(button.y>sidebar.y+sidebar.height*.75,'refresh lives at the bottom of the left toolbar')
 await refresh.click()
 await expect.poll(checkCount).toBe(3)
 await expect(refresh).toBeEnabled()

 const kali=page.locator('[data-department="Kali Team"] .team-header'),windows=page.locator('[data-department="Windows Team"] .team-header')
 await expect(kali.locator('.team-health')).toHaveAttribute('data-connected','true')
 await expect(kali.locator('.team-os')).toHaveAttribute('data-os','kali')
 await expect(windows.locator('.team-health')).toHaveAttribute('data-connected','false')
 await expect(windows.locator('.team-os')).toHaveAttribute('data-os','windows')
 const countBeforeReload=checkCount()
 await page.reload();await page.locator('.infinite-canvas').waitFor()
 await expect(kali.locator('.team-health')).toHaveAttribute('data-connected','true')
 await expect(kali.locator('.team-health')).toHaveAttribute('title',/last check/)
 assert.equal(checkCount(),countBeforeReload,'reload reads saved status without SSH')
 const onlyKali=(await cli('team-view','create','--name','Only Kali','--teams',JSON.stringify(['Kali Team']))).data
 await expect(page.locator('[data-department="Windows Team"]')).toHaveCount(0)
 await cli('team-view','select','all');await expect(windows).toBeVisible()
 assert.equal(checkCount(),countBeforeReload,'view changes do not probe SSH')
 fs.writeFileSync(reachability,'offline')
 await refresh.click()
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
 await expect(page.locator('.team-form .workspace-contract code')).toHaveText('/home/kali/team')
 await expect(page.locator('select[name="cloud-host-id"]')).toHaveCount(0)
 await expect(page.locator('input[name="remote-host"],select[name="remote-distribution"]')).toHaveCount(0)
 await cli('view','close')
 await cli('view','open','team','--name','Windows Team')
 await expect(page.locator('select[name="remote-distribution"]')).toHaveCount(0)
 await cli('view','close')
 fs.mkdirSync(path.join(root,'.aexus/artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'.aexus/artifacts/team-header-preview.png')})
 await cli('settings','set','--theme','white');await expect(page.locator('html')).toHaveAttribute('data-theme','white')
 await page.locator('.plugin-icons').screenshot({path:path.join(root,'.aexus/artifacts/plugin-icons-white.png')})
 await page.screenshot({path:path.join(root,'.aexus/artifacts/team-header-white-preview.png')})
 const bounds=(await cli('room','layout','Kali Team')).data.bounds
 await cli('canvas','set','--x',String(160-bounds.x*.8),'--y',String(160-bounds.y*.8),'--zoom','.8')
 await expect(page.locator('[data-department="Kali Team"] .team-os')).toHaveAttribute('data-os','kali')
 const kaliIcon=await iconGeometry('Kali Team','img');assert.ok(Math.abs(kaliIcon.offsetX)<1&&Math.abs(kaliIcon.offsetY)<1)
 await expect.poll(async()=>{const box=await page.locator('[data-department="Kali Team"]').boundingBox();return !!box&&box.x>=80&&box.x<500&&box.y>=80&&box.y<500}).toBe(true)
 await page.screenshot({path:path.join(root,'.aexus/artifacts/kali-header-preview.png')})
 console.log('PASS manual refresh only: no SSH on startup, focus, idle timer, reload or view changes; cached status and timestamps; bottom-left refresh; Team headers show the matching Plugin icon beside Plugin, plus plugin artwork and equal-sized Apple, Ubuntu, round Kali and Windows identities')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
