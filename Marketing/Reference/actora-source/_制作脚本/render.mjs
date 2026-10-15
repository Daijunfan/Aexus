import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const run=promisify(execFile)
import {posts} from './campaign.mjs'
const require=createRequire(import.meta.url),{_electron:electron}=require('@playwright/test')
const output=path.resolve(import.meta.dirname,'..'),root=path.resolve(output,'..'),raw=path.join(output,'_原始截图'),htmlRoot=path.join(import.meta.dirname,'html')
fs.mkdirSync(htmlRoot,{recursive:true})
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
const imageSize=file=>{const b=fs.readFileSync(file);assert.equal(b.subarray(1,4).toString(),'PNG');return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)}}
const repository='https://github.com/Daijunfan/Agents-Company'
const footer='界面实拍 · 示例工作区<br>任务与连接状态为演示数据'
const photo=(slide,maxW=1296,maxH=1150)=>{
 const file=path.join(raw,slide.image+'.png'),{width,height}=imageSize(file),[x,y,w,h]=slide.crop??[0,0,1,1],scale=Math.min(maxW/(width*w),maxH/(height*h))
 const cw=width*w*scale,ch=height*h*scale
 return `<div class="photo" style="width:${cw}px;height:${ch}px"><img alt="实际应用截图" src="${pathToFileURL(file)}" style="width:${width*scale}px;height:${height*scale}px;left:${-x*width*scale}px;top:${-y*height*scale}px"/></div>`
}
const poster=(post,slide,index)=>`<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>${esc(post.name)} ${index+1}</title><style>
*{box-sizing:border-box}html,body{margin:0;width:1440px;height:1920px;overflow:hidden}body{font-family:"PingFang SC","SF Pro Display",-apple-system,BlinkMacSystemFont,sans-serif;color:#202638;background:${post.paper};-webkit-font-smoothing:antialiased}.poster{width:1440px;height:1920px;padding:66px 72px;position:relative;isolation:isolate;overflow:hidden}.poster:before{content:"";position:absolute;z-index:-1;top:250px;right:-220px;width:850px;height:1100px;background:radial-gradient(ellipse,${post.accent}10,transparent 65%);transform:rotate(-12deg)}.mast{display:flex;align-items:center;justify-content:space-between;gap:40px;font-size:20px;font-weight:600;letter-spacing:2.5px;color:${post.accent};height:30px}.series{display:flex;gap:16px;align-items:center}.series .line{height:1px;width:52px;background:${post.accent};opacity:.45}.page{font-size:22px;color:#6a7080;letter-spacing:1px}.headline{margin:36px 0 0;font-size:${index===0?'108':'94'}px;font-weight:750;line-height:1.13;letter-spacing:-3.5px;word-break:keep-all}.headline span{display:block}.headline span:last-child{color:${post.accent}}.sub{margin:23px 0 0;font-size:29px;line-height:1.5;font-weight:450;color:#606a7a;letter-spacing:.2px}.stage{position:absolute;left:72px;right:72px;top:${slide.layout==='scene'?'335':slide.head.length===1?'390':'485'}px;height:${slide.layout==='scene'?'1325':slide.layout==='focus'?'965':'1165'}px;display:flex;align-items:center;justify-content:center}.stacked{width:1296px;display:flex;flex-direction:column;gap:72px}.stack-section h3{font-size:34px;font-weight:550;color:#48645e;margin:0 0 24px}.stack-section .photo{border-radius:18px}.side-screen{width:570px;display:flex;justify-content:center}.side-copy{flex:1;padding-left:45px;color:#303849}.side-copy small{display:block;font-size:23px;letter-spacing:2px;color:#6f788a;margin-bottom:35px}.side-copy strong{display:block;font-size:58px;line-height:1.65;letter-spacing:-1px;font-weight:650}.side-copy p{font-size:29px;line-height:1.6;margin-top:32px;color:#738091}.photo{position:relative;flex:none;overflow:hidden;border-radius:24px;background:#fff;outline:1px solid #20263c15;box-shadow:0 24px 65px #22263c17,0 3px 10px #22263c0b}.photo img{position:absolute;max-width:none;display:block}.note{margin:0;position:absolute;left:88px;right:88px;top:${slide.layout==='focus'?'1510':'1706'}px;font-size:${slide.layout==='focus'?'44':'32'}px;font-weight:550;line-height:1.5;text-align:center;letter-spacing:-.5px;color:#343c50}.footer{position:absolute;left:72px;right:72px;bottom:58px;padding-top:22px;border-top:1px solid #22263c1c;display:flex;align-items:center;justify-content:space-between;gap:40px}.brand{display:flex;align-items:center;gap:16px;font-size:24px;font-weight:650;letter-spacing:-.5px}.brand img{width:42px;height:42px;border-radius:10px}.brand small{display:block;font-size:18px;line-height:1.5;color:#78808f;font-weight:450;letter-spacing:1px}.disclosure{font-size:20px;line-height:1.5;color:#6c7482;text-align:right;font-weight:450;letter-spacing:.2px}
.repo-link{position:absolute;left:72px;right:72px;bottom:10px;text-align:center;font:600 32px/1.25 ui-monospace,SFMono-Regular,monospace;letter-spacing:-.4px;color:#374e49;text-decoration:none;white-space:nowrap}
</style><div class="poster"><div class="mast"><div class="series">${esc(post.tag)}<span class="line"></span></div><span class="page">${post.id} / 10 &nbsp;·&nbsp; ${String(index+1).padStart(2,'0')}</span></div><h1 class="headline">${slide.head.map(line=>`<span>${esc(line)}</span>`).join('')}</h1><p class="sub">${esc(slide.sub)}</p><main class="stage">${slide.layout==='stack'?`<div class="stacked">${slide.sections.map(section=>`<section class="stack-section"><h3>${esc(section.label)}</h3>${photo({...slide,crop:section.crop},1296,430)}</section>`).join('')}</div>`:slide.layout==='side'?`<div class="side-screen">${photo(slide,570,1080)}</div><aside class="side-copy"><small>TXT / MARKDOWN</small><strong>打开文件。<br>顺手补两句。<br>直接保存。</strong><p>把工作继续留在<br>当前这张桌面上。</p></aside>`:photo(slide,slide.layout==='scene'?1344:1296,slide.layout==='scene'?1310:slide.layout==='focus'?900:1150)}</main><p class="note">${esc(slide.note)}</p><footer class="footer"><div class="brand"><img src="${pathToFileURL(path.join(root,'app_icon.png'))}"/><div>Agents Company<small>开源 AI 工作台</small></div></div><div class="disclosure">${post.disclosure?esc(post.disclosure)+'<br>示例工作区 / 非实时执行':footer}</div></footer><a class="repo-link" href="${repository}">${repository}</a></div></html>`
const referencedPhotos=posts.flatMap(post=>post.slides.flatMap(slide=>[slide.image,...(slide.images??[])]));assert.equal(new Set(referencedPhotos).size,referencedPhotos.length,'Do not reuse a raw screenshot across posters or montage inputs')
const previousManifest=path.join(import.meta.dirname,'成品清单.json'),previousExports=fs.existsSync(previousManifest)?JSON.parse(fs.readFileSync(previousManifest,'utf8')):[]
const selectedPost=process.argv.includes('--post')?process.argv[process.argv.indexOf('--post')+1]:undefined
if(selectedPost)assert.ok(posts.some(p=>p.id===selectedPost),'Unknown post')
const exports=[]
for(const post of posts){
 if(selectedPost&&post.id!==selectedPost){const retained=previousExports.filter(e=>e.post===post.id);assert.equal(retained.length,3,'Missing previous export');exports.push(...retained.map(e=>({...e,file:path.resolve(output,e.file),html:path.resolve(output,e.html)})));continue}
 const dir=path.join(output,post.id+'_'+post.name);fs.mkdirSync(dir,{recursive:true})
 assert.ok([...post.title].length<=22,'post title too long: '+post.title)
 for(let index=0;index<post.slides.length;index++){
  const slide=post.slides[index],name=index===0?'01_封面':`${String(index+1).padStart(2,'0')}_${slide.head.join('').replace(/[？?，,]/g,'')}`,file=path.join(dir,name+'.png'),html=path.join(htmlRoot,post.id+'-'+(index+1)+'.html')
  fs.writeFileSync(html,poster(post,slide,index));exports.push({post:post.id,index:index+1,file,html,source:slide.image,crop:slide.crop})
 }
 const disclosure=(post.id==='01'?'本篇所有连线均由实际 App 根据员工关系和 API 交互渲染，没有额外画示意连接。':'')+'配图为实际应用界面；文案、任务与云主机连接状态采用隔离的演示数据，不代表实时模型执行结果。'
 const copy=`# ${post.title}\n\n${post.body}\n\n${disclosure}\n\n${post.tags.map(tag=>'#'+tag).join(' ')}\n\n---\n\n备用标题：\n\n${post.alt.map(title=>'- '+title).join('\n')}\n\n发布顺序：按图片编号 01 → 03。每张 1440 × 1920，3:4 竖版，PNG。\n\n开源地址：请在发布时填写你的真实仓库链接（本地 Git 未配置 origin，未代填链接）。\n`
 fs.writeFileSync(path.join(dir,'发布文案.md'),copy)
}
for(const previous of previousExports){const file=path.resolve(output,previous.file);if(file.startsWith(output+path.sep)&&!exports.some(item=>item.file===file))fs.rmSync(file,{force:true})}
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ac-poster-render-')),env={...process.env,PROMO_RENDER_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:require('electron'),args:[path.join(import.meta.dirname,'poster-electron.cjs'),exports[0].html],env}),page=await app.firstWindow()
page.setDefaultTimeout(15000)
const render=async(html,file,options={})=>{
 await page.goto(pathToFileURL(html).href);await page.evaluate(()=>Promise.all([document.fonts.ready,...[...document.images].map(image=>image.decode())]))
 const overflow=await page.locator('.headline,.sub,.note,.footer').evaluateAll(elements=>elements.filter(e=>e.scrollWidth>e.clientWidth+2||e.getBoundingClientRect().bottom>1910).map(e=>e.textContent))
 assert.deepEqual(overflow,[],`Typography overflow in ${html}`)
 await page.screenshot({path:file,fullPage:true,scale:'css',...options})
}
try{
 for(const item of exports){if(selectedPost&&item.post!==selectedPost)continue;await render(item.html,item.file);if(imageSize(item.file).width!==1440)await run('/usr/bin/sips',['-z','1920','1440',item.file]);const size=imageSize(item.file);assert.deepEqual(size,{width:1440,height:1920});console.log('EXPORT '+path.relative(output,item.file))}
 const contact=async(name,items,columns)=>{
  const cards=items.map(item=>`<div class="tile"><img src="${pathToFileURL(item.file)}"/><p>${esc(path.basename(path.dirname(item.file)))} · ${item.index}</p></div>`).join('')
  const html=path.join(htmlRoot,name+'.html'),height=Math.ceil(items.length/columns)*450+100
  fs.writeFileSync(html,`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:1800px;background:#eef0f5;font-family:"PingFang SC",sans-serif}.grid{padding:40px;display:grid;grid-template-columns:repeat(${columns},1fr);gap:26px}.tile{min-width:0}.tile img{width:100%;display:block;box-shadow:0 6px 18px #19203c15}.tile p{font-size:18px;text-align:center;margin:12px 0;color:#4d566a}</style><div class="grid">${cards}</div>`)
  await render(html,path.join(output,name+'.jpg'),{type:'jpeg',quality:90});await run('/usr/bin/sips',['--resampleWidth','1800',path.join(output,name+'.jpg')])
 }
 await contact('00_十篇封面总览',exports.filter(item=>item.index===1),5)
 for(let i=0;i<5;i++)await contact(`预览_${String(i*2+1).padStart(2,'0')}-${String(i*2+2).padStart(2,'0')}`,exports.slice(i*6,i*6+6),3)
 assert.ok(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible())))
 fs.writeFileSync(path.join(import.meta.dirname,'成品清单.json'),JSON.stringify(exports.map(({html,file,...item})=>({...item,file:path.relative(output,file),html:path.relative(output,html),width:1440,height:1920})),null,2))
 const overview=['# 小红书首发 10 篇','','每篇 3 张图，共 30 张。图片为 1440 × 1920 的浅色竖版 PNG。','',...posts.map(post=>`- **${post.id} · ${post.title}**\n  对应文件夹：${post.id}_${post.name}`),'','建议先发 01、02、03，先建立“AI 办公室”的视觉记忆；之后穿插笔记、项目与插件场景。不要一次连续发布十篇。','', '01 已更新为中央 Governor → 四个方框 Team / Manager → 3、4、5、3 位 Employee。Ubuntu、Windows、macOS；云端原生、本地运行操作云端、纯本地三类员工齐全。17 位工作、3 位休息，只突出一条绿色交互。所有线条均为实际应用的计算结果。当前 App 的“宣传场景”视图已保留对应的 5 个 Team、20 名员工，可继续微调；具体说明见 工作场景/README.md。','', '每篇文件夹中的 `发布文案.md` 可直接复制正文与话题。标题提供两个备选，图片按 01 → 03 上传。','', 'Git 当前未配置 origin，因此所有文案没有编造下载地址、仓库地址、Star 数量、性能数据或用户评价。发布时填入你的真实开源链接。','', '本次删掉重复的截图和同画面裁切页，保留十篇各三张、共三十张。每张都有独立的展示目的，原始截图及拼图输入也不跨成品复用。只上传编号 01 → 03 的正式图片；总览图用于挑选，不当作帖子配图。','', '所有示例任务与云主机状态都已在图片和正文中标注为演示数据。不要删掉这条说明后，把配图当作一次真实多模型运行或真实云主机连接的证据。',''].join('\n')
 fs.writeFileSync(path.join(output,'README_先看这里.md'),overview)
 fs.writeFileSync(path.join(output,'10篇文案合集.md'),posts.map(post=>fs.readFileSync(path.join(output,post.id+'_'+post.name,'发布文案.md'),'utf8')).join('\n\n---\n\n'))
 fs.writeFileSync(path.join(output,'内容去重清单.md'),['# 三十张图片的独立展示目的','',...posts.flatMap(post=>['## '+post.id+' · '+post.title,'',...post.slides.map((slide,i)=>`${i+1}. **${slide.head.join('')}**：${slide.sub}\n   来源：${[slide.image,...(slide.images??[])].join(' / ')}`),'']),'校验：每张原始截图只用于一张正式成品，包括封面拼图中的素材。未用裁切、换标题或换背景复制同一帧。',''].join('\n'))
 console.log('COMPLETE: '+(selectedPost?'post '+selectedPost+' refreshed; other posters retained':'30 posters')+', 10 post drafts, 6 contact sheets')
}finally{await app.close();fs.rmSync(profile,{recursive:true,force:true})}
