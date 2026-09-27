import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'

const require=createRequire(import.meta.url),{_electron:electron,expect}=require('@playwright/test')
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-badge-icons-')))
const state=path.join(temp,'state');fs.mkdirSync(state)
const card=(id,group,engine,kind='worker',workEnvironment='team')=>({id,title:id,group,engine,kind,workEnvironment,cwd:group==='Cloud'?'/home/djf/'+id:path.join(temp,id),createdAt:Date.now(),position:{x:id==='native'?530:id==='mac-manager'?30:280,y:205}})
const sessions=[card('local-codex','Local','codex'),card('local-claude','Local','claude'),card('mac-manager','Cloud','codex','worker','local'),card('routed','Cloud','codex'),card('native','Cloud','claude','cloud-native-worker')]
sessions[0].position.x=30
sessions[0].managementRole='governor';sessions[2].managementRole='manager';sessions[4].createdBy={kind:'agent',employeeId:sessions[2].id}
const bounds=x=>({x,y:0,width:760,height:520,shape:'rounded',arrangement:'free',pinned:true})
fs.writeFileSync(path.join(state,'sessions.json'),JSON.stringify({groups:['Local','Cloud'],sessions,rooms:{Local:{bounds:bounds(0)},Cloud:{bounds:bounds(790)}},teamRoots:{Local:temp,Cloud:'/home/djf'},teamSettings:{Cloud:{mode:'cloud',remote:{host:'example.invalid',directory:'/home/djf',os:'linux'}}},preferences:{theme:'white'},viewport:{x:20,y:70,zoom:1}}))
const env={...process.env,AGENTS_COMPANY_HOME:state,AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1900',AGENTS_COMPANY_HEIGHT:'1000'}
delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env})
try{
 const page=await app.firstWindow();await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('.infinite-canvas').waitFor()
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 for(const [id,location,engine,workspace] of [['local-codex','local','codex','local'],['local-claude','local','claude','local'],['mac-manager','local','codex','local'],['routed','local','codex','cloud'],['native','cloud','claude','cloud']]){
   const badge=page.locator(`[data-card-id="${id}"] .employee-badge`)
   await expect(badge.locator('.badge-location')).toHaveAttribute('data-location',location)
   await expect(badge.locator('.badge-workspace')).toHaveAttribute('data-workspace',workspace)
   await expect(badge.locator('.badge-location small')).toHaveText('运行位置')
   await expect(badge.locator('.badge-location b')).toHaveText(location==='cloud'?'云端':'本地')
   await expect(badge.locator('.badge-workspace small')).toHaveText('工作环境')
   await expect(badge.locator('.badge-workspace b')).toHaveText(workspace==='cloud'?'云端':'本地')
   await expect(badge.locator('.badge-tool')).toHaveCount(0)
   if(engine==='codex')await expect(badge.locator('.badge-engine svg')).toHaveAttribute('aria-label','Codex')
   else assert.ok(await badge.locator('.badge-engine img').evaluate(image=>image.alt==='Claude'&&image.complete&&image.naturalWidth>0))
   await expect(badge.locator('.employee-role')).not.toContainText(/Worker|Codex|Claude Code/)
 }
 assert.ok(await page.locator('[data-card-id="local-codex"] .badge-location img').evaluate(image=>image.complete&&image.naturalWidth>0))
 await expect(page.locator('.badge-location[data-location=cloud] svg')).toHaveCount(1)
 const iconBox=await page.locator('[data-card-id="routed"] .badge-location img').boundingBox()
 assert.ok(iconBox&&iconBox.width>=18&&iconBox.height>=18)
 const cloud=await page.locator('[data-card-id="native"] .cloud-native-foot').boundingBox(),badge=await page.locator('[data-card-id="native"] .employee-badge').boundingBox();assert.ok(cloud&&badge&&cloud.y>=badge.y+badge.height+1,'native cloud remains below the entire badge');assert.ok(cloud.width>=badge.width*.95&&cloud.height>=38,'native cloud fills almost the full employee width with a full silhouette')
 const frames=await page.locator('.employee').evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect(),b=e.querySelector('.employee-badge').getBoundingClientRect(),s=getComputedStyle(e);return {kind:e.dataset.kind,frame:e.dataset.frame,r:{x:r.x,y:r.y,width:r.width,height:r.height},b:{x:b.x,y:b.y,width:b.width,height:b.height},radius:s.borderRadius,overflow:s.overflow}}));for(const f of frames){assert.equal(f.frame,'rectangle');assert.equal(f.radius,'0px');assert.equal(f.overflow,'hidden');assert.ok(Math.abs(f.r.width/f.r.height-190/250)<.001);assert.ok(f.b.x>=f.r.x-.1&&f.b.x+f.b.width<=f.r.x+f.r.width+.1&&f.b.y+f.b.height<=f.r.y+f.r.height+.1)}
 for(const f of frames){assert.equal(f.r.width,frames[0].r.width,'same outer width for all roles and execution locations');assert.equal(f.r.height,frames[0].r.height,'same outer height for all roles and execution locations')}
 assert.ok(await page.locator('[data-card-id="native"] .cloud-native-foot').evaluate(el=>el.getAnimations().length>0),'native cloud animation exists');
 for(const time of [0,950,1900,2850,3800]){await page.locator('[data-card-id="native"] .cloud-native-foot').evaluate((el,time)=>{for(const a of el.getAnimations()){a.pause();a.currentTime=time}},time);const c=await page.locator('[data-card-id="native"] .cloud-native-foot').boundingBox(),b=await page.locator('[data-card-id="native"] .employee-badge').boundingBox(),r=await page.locator('[data-card-id="native"]').boundingBox();assert.ok(c.y>=b.y+b.height,'floating cloud stays below badge at every animation phase');assert.ok(c.x>=r.x&&c.x+c.width<=r.x+r.width&&c.y+c.height<=r.y+r.height,'cloud stays inside the actor rectangle')}
 await expect(page.locator('[data-card-id="routed"] .cloud-native-foot')).toHaveCount(0);
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true})
 await page.screenshot({path:path.join(root,'artifacts/employee-badge-icons.png')});await page.locator('[data-card-id="native"]').screenshot({path:path.join(root,'artifacts/native-worker-rectangle.png')})
 await page.locator('.management-connection[data-employee="native"] .connector-segment-hit').first().press('Enter')
 await expect(page.locator('.connector-pin-hit')).toHaveCount(48)
 const nativeFrame=await page.locator('.connector-pin-group[data-end="target"] .connector-boundary').evaluate(el=>({width:el.width.baseVal.value,height:el.height.baseVal.value}))
 assert.deepEqual(nativeFrame,{width:190,height:250},'cloud-native connector frame uses the same complete footprint')
 for(const offset of [0,1])await expect(page.locator(`.connector-pin-group[data-end="target"] .connector-pin-hit[data-side="top"][data-offset="${offset}"]`)).toHaveCount(1)
 await page.screenshot({path:path.join(root,'artifacts/native-worker-connector-frame.png'),animations:'disabled'})
 console.log('PASS employee badges show Agent process location, not workspace location, plus Codex/Claude marks; standard 190x250 frame; native cloud stays below badge within the frame throughout animation')
}finally{await app.close();fs.rmSync(temp,{recursive:true,force:true})}
