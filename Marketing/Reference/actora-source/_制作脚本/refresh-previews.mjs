import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'

const root=path.resolve(import.meta.dirname,'..'),repo='https://github.com/Daijunfan/Agents-Company'
const posts=fs.readdirSync(root).filter(n=>/^\d{2}_/.test(n)&&fs.statSync(path.join(root,n)).isDirectory()).sort()
assert.equal(posts.length,10)
const images=posts.map(post=>fs.readdirSync(path.join(root,post)).filter(n=>n.endsWith('.png')).sort().map(n=>post+'/'+n))
assert.equal(images.flat().length,31)
const sheets=[{name:'00_十篇封面总览.jpg',title:'Agents Company · 十篇封面',rows:[images.slice(0,5).map(a=>a[0]),images.slice(5).map(a=>a[0])],columns:5}]
for(let i=0;i<10;i+=2)sheets.push({name:`预览_${String(i+1).padStart(2,'0')}-${String(i+2).padStart(2,'0')}.jpg`,title:`Agents Company · ${String(i+1).padStart(2,'0')} — ${String(i+2).padStart(2,'0')}`,rows:images.slice(i,i+2),columns:i===0?4:3})
const browser=await chromium.launch({channel:'chromium',headless:true})
try{
 for(const sheet of sheets){
  const width=2000,height=1560
  const html=`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;background:#eef3ef;font-family:-apple-system,sans-serif;color:#263b31}body{padding:40px 44px;position:relative}h1{font-size:38px;letter-spacing:2px;margin:0 0 25px}.row{display:grid;grid-template-columns:repeat(${sheet.columns},1fr);gap:24px;height:650px}figure{margin:0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center}figure img{width:100%;height:590px;object-fit:contain}figcaption{font-size:20px;line-height:1.5;max-width:100%;padding:10px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}footer{position:absolute;bottom:32px;width:calc(100% - 88px);text-align:center}.repo-link{font:600 42px/1.2 ui-monospace,SFMono-Regular,monospace;color:#374e49;text-decoration:none;white-space:nowrap}</style><h1>${sheet.title}</h1>${sheet.rows.map(row=>`<div class="row">${row.map(file=>`<figure><img src="${pathToFileURL(path.join(root,file)).href}"><figcaption>${file.replace('.png','')}</figcaption></figure>`).join('')}</div>`).join('')}<footer><a class="repo-link" href="${repo}">${repo}</a></footer>`
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});const source=path.join(import.meta.dirname,'html',sheet.name+'.html');fs.writeFileSync(source,html);await page.goto(pathToFileURL(source).href);await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0))
  assert.equal(await page.locator('.repo-link').innerText(),repo)
  const box=await page.locator('.repo-link').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.y+box.height<=height)
  await page.screenshot({path:path.join(root,sheet.name),type:'jpeg',quality:93});await page.close()
 }
 console.log('Verified 6 contact sheets with a readable repository URL.')
}finally{await browser.close()}
