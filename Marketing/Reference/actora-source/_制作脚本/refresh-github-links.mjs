// Re-export editable layouts with an exact repository footer; source screenshots stay untouched.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';import {chromium} from '@playwright/test'
const output=path.resolve(import.meta.dirname,'..'),root=path.resolve(output,'..'),repo='https://github.com/Daijunfan/Agents-Company',art=path.join(root,'artifacts/brand-github-update'),backup=path.join(art,'originals'),htmlRoot=path.join(import.meta.dirname,'html'),icon=pathToFileURL(path.join(root,'app_icon.png')).href
const original=JSON.parse(fs.readFileSync(path.join(art,'posters-before.json'))),manifest=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'成品清单.json'))),checks=[]
const browser=await chromium.launch({channel:'chromium',headless:true})
try{
 for(const item of original){
  if(item.file.endsWith('01_我给AI开了家公司/01_封面.png'))continue
  const matched=manifest.find(m=>m.file===item.file),scale=item.file.startsWith('01_')?2:1,width=item.width/scale,height=item.height/scale
  let html
  if(matched)html=path.join(output,matched.html)
  else{
   html=path.join(htmlRoot,'github-'+path.basename(item.file,'.png')+'.html')
   fs.writeFileSync(html,`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;background:#fff;font-family:-apple-system,sans-serif}body{position:relative}.capture{position:absolute;inset:0 0 100px;display:flex;align-items:center;justify-content:center}.capture img{width:100%;height:100%;object-fit:contain}.repo-footer{position:absolute;bottom:20px;left:60px;right:60px;display:flex;align-items:center;justify-content:center;gap:24px;height:64px;color:#374e49}.repo-footer img{width:56px;height:56px;border-radius:12px}.repo-link{font:600 48px/1.2 ui-monospace,SFMono-Regular,monospace;white-space:nowrap;text-decoration:none;color:inherit}.disclosure{position:absolute;right:0;bottom:0;font-size:24px;color:#77817a}</style><div class="capture"><img src="${pathToFileURL(path.join(backup,item.file))}"></div><footer class="repo-footer"><img src="${icon}" alt=""><a class="repo-link" href="${repo}">${repo}</a><span class="disclosure">演示画面</span></footer>`)
  }
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:scale});await page.goto(pathToFileURL(html).href);await page.evaluate(()=>Promise.all([document.fonts.ready,...[...document.images].map(i=>i.decode())]))
  const link=page.locator('.repo-link');assert.equal(await link.count(),1);assert.equal(await link.innerText(),repo);const box=await link.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height,item.file+' footer overflow');assert.ok(await link.isVisible())
  const target=path.join(output,item.file);await page.screenshot({path:target});const bytes=fs.readFileSync(target);assert.equal(bytes.readUInt32BE(16),item.width);assert.equal(bytes.readUInt32BE(20),item.height)
  checks.push({...item,url:repo,html:path.relative(output,html),urlBounds:box});await page.close()
 }
 fs.writeFileSync(path.join(art,'poster-link-checks.json'),JSON.stringify(checks,null,2));console.log('Verified repository footer and original dimensions for '+checks.length+' images; main cover exported separately.')
}finally{await browser.close()}
