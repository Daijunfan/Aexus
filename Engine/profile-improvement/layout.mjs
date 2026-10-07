import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {execFile} from 'node:child_process'
import {DOMParser} from '@xmldom/xmldom'
const error=(code,message)=>Object.assign(new Error(message),{code})
const paths=(name)=>[...(process.env.PATH??'').split(path.delimiter).filter(p=>path.isAbsolute(p)).map(p=>path.join(p,name)),...['/opt/homebrew/bin','/usr/local/bin','/usr/bin'].map(p=>path.join(p,name))]
const find=values=>values.find(p=>p&&fs.existsSync(p)&&fs.statSync(p).isFile())
export function layoutTools(){
 const soffice=find([process.env.PROFILE_IMPROVEMENT_SOFFICE,'/Applications/LibreOffice.app/Contents/MacOS/soffice',process.env.ProgramFiles&&path.join(process.env.ProgramFiles,'LibreOffice/program/soffice.exe'),...paths('soffice')])
 const pdftotext=find([process.env.PROFILE_IMPROVEMENT_PDFTOTEXT,...paths(process.platform==='win32'?'pdftotext.exe':'pdftotext')])
 return {ready:!!soffice&&!!pdftotext,soffice,pdftotext}
}
export function requireLayoutTools(){const tools=layoutTools();if(!tools.ready)throw error('LAYOUT_TOOLS_MISSING','原版式验收需要 LibreOffice 和 pdftotext。请安装或设置 PROFILE_IMPROVEMENT_SOFFICE / PROFILE_IMPROVEMENT_PDFTOTEXT 后继续；未启动模型任务。');return tools}
function run(program,args,{signal,timeout=60000,maxBuffer=8*1024*1024}={}){
 return new Promise((resolve,reject)=>execFile(program,args,{signal,timeout,maxBuffer,windowsHide:true,env:{...process.env,SAL_USE_VCLPLUGIN:'gen'}},(failure,stdout,stderr)=>failure?reject(error(signal?.aborted?'CANCELLED':'LAYOUT_RENDER_FAILED',signal?.aborted?'任务已取消。':'原版式渲染失败：'+String(stderr||failure.message).slice(0,500))):resolve(stdout)))
}
const all=(node,name)=>Array.from(node.getElementsByTagName(name))
export function readGeometry(text){
 const doc=new DOMParser().parseFromString(text.replace(/<!DOCTYPE[^>]*>/g,''),'application/xml')
 const pages=all(doc,'page').map(page=>({width:Number(page.getAttribute('width')),height:Number(page.getAttribute('height')),readingText:all(page,'line').map(line=>all(line,'word').map(w=>w.textContent).join(' ')).join(' '),blocks:all(page,'block').map(block=>all(block,'word').map(w=>w.textContent).join(' ')),lines:all(page,'line').map(line=>({x:Number(line.getAttribute('xMin')),y:Number(line.getAttribute('yMin')),bottom:Number(line.getAttribute('yMax')),text:all(line,'word').map(w=>w.textContent).join(' ')})).filter(l=>l.text.trim()).sort((a,b)=>Math.abs(a.y-b.y)<.5?a.x-b.x:a.y-b.y)}))
 if(!pages.length||pages.some(p=>!Number.isFinite(p.width)||!Number.isFinite(p.height)||p.width<=0||p.height<=0||p.lines.some(l=>![l.x,l.y,l.bottom].every(Number.isFinite)||l.bottom<l.y))||!pages.some(p=>p.lines.length))throw error('LAYOUT_RENDER_FAILED','无法读取 Word 渲染后的分页信息。')
 return pages
}
const textKey=t=>String(t).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'')
export function compareGeometry(before,after,patches){
 const issues=[]
 if(before.length!==after.length)issues.push(`页数从 ${before.length} 变为 ${after.length}`)
 for(let page=0;page<Math.min(before.length,after.length);page++){
  const a=before[page],b=after[page]
  if(Math.abs(a.width-b.width)>.2||Math.abs(a.height-b.height)>.2)issues.push(`第 ${page+1} 页尺寸改变`)
  if(a.lines.length!==b.lines.length)issues.push(`第 ${page+1} 页文字行数从 ${a.lines.length} 变为 ${b.lines.length}`)
  else for(let line=0;line<a.lines.length;line++)if(Math.abs(a.lines[line].y-b.lines[line].y)>1.2||Math.abs(a.lines[line].bottom-b.lines[line].bottom)>1.2){issues.push(`第 ${page+1} 页第 ${line+1} 行垂直位置改变`);break}
 }
 const actual=[textKey(after.flatMap(p=>p.lines.map(l=>l.text)).join(' ')),textKey(after.map(p=>p.readingText??'').join(' ')),...after.flatMap(p=>(p.blocks??[]).map(textKey))]
 for(const patch of patches){const text=textKey(patch.after);if(text.length>=5&&!actual.some(value=>value.includes(text)))issues.push('改写文字未完整显示：'+patch.id)}
 return {passed:issues.length===0,mode:'rendered',renderer:'LibreOffice + Poppler',pages:after.length,originalPages:before.length,lines:after.map(p=>p.lines.length),issues:issues.slice(0,12)}
}
/** Only ephemeral Engine-owned files are touched; Infra workspaces/databases are not accessed. */
export async function verifyLayout(original,candidate,patches,{signal,tools=requireLayoutTools(),keepDirectory}={}){
 signal?.throwIfAborted();const root=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-profile-layout-'));fs.chmodSync(root,0o700)
 try{
  const results=[]
  for(const [label,bytes] of [['original',original],['optimized',candidate]]){
   const dir=path.join(root,label);fs.mkdirSync(dir);const source=path.join(dir,'resume.docx');fs.writeFileSync(source,bytes,{mode:0o600})
   await run(tools.soffice,['--headless','--nologo','--nodefault','--nolockcheck','--nofirststartwizard','-env:UserInstallation='+pathToFileURL(path.join(root,'office-profile')).href,'--convert-to','pdf','--outdir',dir,source],{signal})
   const pdf=path.join(dir,'resume.pdf');if(!fs.existsSync(pdf)||!fs.statSync(pdf).size)throw error('LAYOUT_RENDER_FAILED','Word 未成功渲染，已阻止交付未经检查的文件。')
   const text=await run(tools.pdftotext,['-bbox-layout','-enc','UTF-8',pdf,'-'],{signal});results.push(readGeometry(text))
  }
  const result=compareGeometry(results[0],results[1],patches)
  if(keepDirectory){fs.mkdirSync(keepDirectory,{recursive:true});for(const label of ['original','optimized'])for(const ext of ['docx','pdf'])fs.copyFileSync(path.join(root,label,'resume.'+ext),path.join(keepDirectory,label+'.'+ext));fs.writeFileSync(path.join(keepDirectory,'layout.json'),JSON.stringify(result,null,2))}
  return result
 }finally{fs.rmSync(root,{recursive:true,force:true})}
}
