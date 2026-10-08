import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'

const require=createRequire(import.meta.url),{_electron:electron}=require('@playwright/test')
const root=path.resolve(import.meta.dirname,'../../..')
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'aexus-nav-centering-')))
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_HIDDEN:'1',AGENTS_COMPANY_WIDTH:'1440',AGENTS_COMPANY_HEIGHT:'900'}
delete env.ELECTRON_RUN_AS_NODE
let app
try{
 app=await electron.launch({executablePath:process.env.AGENTS_COMPANY_TEST_APP||require('electron'),args:process.env.AGENTS_COMPANY_TEST_APP?[]:[root],env})
 const page=await app.firstWindow()
 await page.locator('.el-card[data-engine-id="deep-research"]').click()
 await page.locator('.el-load').click()
 await page.getByRole('navigation',{name:'Application layers'}).getByRole('button',{name:'Infra'}).click()
 await page.locator('.infra-toolbar .company-navigation').waitFor({timeout:15000})
 const check=async(width)=>{
  await app.evaluate(({BrowserWindow},w)=>BrowserWindow.getAllWindows()[0]?.setSize(w,900),width)
  await page.waitForTimeout(200)
  const boxes=await page.evaluate(()=>{
   const surface=document.querySelector('.infra-toolbar'),nav=surface?.querySelector('.company-navigation')
   if(!surface||!nav)throw Error('Company navigation unavailable')
   const s=surface.getBoundingClientRect(),n=nav.getBoundingClientRect(),r=surface.closest('.aexus-home').getBoundingClientRect()
   const actions=surface.querySelector('.company-actions')?.getBoundingClientRect()
   return {windowCenter:r.x+r.width/2,navCenter:n.x+n.width/2,navLeft:n.left,navRight:n.right,toolbarLeft:s.left,toolbarRight:s.right,navWidth:n.width,alignment:surface.dataset.navigationAlignment,
    collision:!!actions&&n.right>actions.left&&n.bottom>actions.top&&n.left<actions.right,
    actualWidth:window.innerWidth,buttonCount:nav.querySelectorAll('.app-view-button').length,
    overflow:nav.scrollWidth>nav.clientWidth+1}
  })
  assert.equal(boxes.buttonCount,3,'Company navigation keeps three top actions')
  assert.ok(boxes.alignment==='available-space'||Math.abs(boxes.windowCenter-boxes.navCenter)<=2,
   'Company navigation aligned at '+width+': '+JSON.stringify(boxes))
  assert.ok(boxes.navLeft>=boxes.toolbarLeft-1&&boxes.navRight<=boxes.toolbarRight+1,
   'Company navigation must remain visible at '+width+': '+JSON.stringify(boxes))
  assert.ok(!boxes.collision&&!boxes.overflow,'no collisions or navigation overflow at '+width)
  return boxes
 }
 for(const width of [1440,1220,1100,980,820,700,600,480]){
  const result=await check(width)
  console.log('PASS centered '+width+' (actual '+result.actualWidth+', alignment '+result.alignment+', delta '+Math.round(result.navCenter-result.windowCenter)+'px)')
 }
}finally{
 if(app)await app.close()
 fs.rmSync(temp,{recursive:true,force:true})
}
