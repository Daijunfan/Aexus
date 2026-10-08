import {parentPort,workerData} from 'node:worker_threads'
import {unzipSync,strFromU8} from 'fflate'
import {DOMParser} from '@xmldom/xmldom'
import path from 'node:path'

const {files,limits}=workerData
const local=node=>node.localName??node.nodeName?.split(':').at(-1)
const elements=(node,name)=>Array.from(node.getElementsByTagName('*')).filter(item=>local(item)===name)
const children=node=>Array.from(node.childNodes??[]).filter(item=>item.nodeType===1)
function xml(bytes){
 const text=strFromU8(bytes)
 if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('文档包含不支持的 DTD 或实体声明')
 return new DOMParser({onError:level=>{if(level==='error'||level==='fatalError')throw Error('文档 XML 格式无效')}}).parseFromString(text,'application/xml')
}
function archive(data){
 let total=0,count=0
 const parts=unzipSync(data,{filter:file=>{
  if(++count>6000)throw Error('文档 ZIP 部件过多')
  if(!/^(?:\[Content_Types\]\.xml|(?:word|xl|ppt)\/.*\.(?:xml|rels))$/.test(file.name))return false
  total+=file.originalSize
  if(file.originalSize>6*1024*1024||total>16*1024*1024)throw Error('文档展开后超过安全上限')
  return true
 }})
 if(!parts['[Content_Types].xml'])throw Error('不是有效的 Office Open XML 文档')
 return parts
}
function paragraph(node){
 if(local(node)==='del')return ''
 if(local(node)==='t')return node.textContent??''
 if(['tab','br','cr'].includes(local(node)))return ' '
 return children(node).map(paragraph).join('')
}
function docx(data){
 const parts=archive(data)
 if(!parts['word/document.xml'])throw Error('DOCX 缺少 document.xml')
 const doc=xml(parts['word/document.xml']),body=elements(doc,'body')[0],lines=[]
 for(const child of children(body)){
  if(local(child)==='p')lines.push(paragraph(child))
  if(local(child)==='tbl')for(const row of children(child).filter(n=>local(n)==='tr'))lines.push(children(row).filter(n=>local(n)==='tc').map(cell=>elements(cell,'p').map(paragraph).join(' ')).join(' | '))
 }
 for(const name of ['footnotes','endnotes'])if(parts['word/'+name+'.xml']){
  lines.push('\n['+name+']')
  lines.push(...elements(xml(parts['word/'+name+'.xml']),'p').map(paragraph))
 }
 return {text:lines.join('\n'),warnings:['提取正文、表格与脚注文字；未解读图片、批注或版面。']}
}
function relationshipMap(parts,name,folder){
 const result=new Map()
 if(!parts[name])return result
 for(const rel of elements(xml(parts[name]),'Relationship')){
  if(rel.getAttribute('TargetMode')==='External')continue
  const target=rel.getAttribute('Target')??''
  if(target.includes('\\'))continue
  const resolved=target.startsWith('/')?target.slice(1):path.posix.normalize(folder+'/'+target)
  if(resolved.startsWith(folder+'/'))result.set(rel.getAttribute('Id'),resolved)
 }
 return result
}
function xlsx(data){
 const parts=archive(data)
 if(!parts['xl/workbook.xml'])throw Error('XLSX 缺少 workbook.xml')
 const shared=parts['xl/sharedStrings.xml']?elements(xml(parts['xl/sharedStrings.xml']),'si').map(item=>elements(item,'t').map(t=>t.textContent??'').join('')):[]
 const rels=relationshipMap(parts,'xl/_rels/workbook.xml.rels','xl'),sheets=elements(xml(parts['xl/workbook.xml']),'sheet')
 if(sheets.length>30)throw Error('一次最多解析 30 张工作表')
 const lines=[],warnings=['表格仅使用文件中已保存的单元格结果；不运行公式、宏或外部数据连接。'];let rows=0
 for(const sheet of sheets){
  const target=rels.get(sheet.getAttribute('r:id'))
  if(!target?.startsWith('xl/worksheets/')||!parts[target])continue
  lines.push('\n[Sheet: '+sheet.getAttribute('name')+']')
  for(const row of elements(xml(parts[target]),'row')){
   if(++rows>12000)throw Error('表格超过 12,000 行；请上传所需范围')
   const cells=children(row).filter(n=>local(n)==='c').map(cell=>{
    const type=cell.getAttribute('t'),value=elements(cell,'v')[0]?.textContent??''
    const text=type==='s'?(shared[Number(value)]??''):type==='inlineStr'?elements(cell,'t').map(t=>t.textContent??'').join(''):type==='b'?(value==='1'?'TRUE':'FALSE'):value
    return cell.getAttribute('r')+'='+text
   })
   if(cells.length)lines.push(cells.join('\t'))
  }
 }
 return {text:lines.join('\n'),sheets:sheets.length,warnings}
}
function pptx(data){
 const parts=archive(data)
 if(!parts['ppt/presentation.xml'])throw Error('PPTX 缺少 presentation.xml')
 const rels=relationshipMap(parts,'ppt/_rels/presentation.xml.rels','ppt'),slides=elements(xml(parts['ppt/presentation.xml']),'sldId')
 if(slides.length>limits.pages)throw Error('演示文稿超过 200 页')
 const lines=[]
 slides.forEach((slide,i)=>{
  const target=rels.get(slide.getAttribute('r:id'))
  if(target?.startsWith('ppt/slides/')&&parts[target])lines.push('[Slide '+(i+1)+']\n'+elements(xml(parts[target]),'p').map(p=>elements(p,'t').map(t=>t.textContent??'').join('')).join('\n'))
 })
 return {text:lines.join('\n\n'),pages:slides.length,warnings:['仅提取幻灯片文字；未解读图表数值、图片或动画。']}
}
async function pdf(data){
 if(Buffer.from(data.subarray(0,5)).toString()!=='%PDF-')throw Error('PDF 文件标识无效')
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs')
 const loading=getDocument({data:new Uint8Array(data),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,disableAutoFetch:true,disableStream:true,stopAtErrors:true,verbosity:0})
 try{
  const doc=await loading.promise
  if(doc.numPages>limits.pages)throw Error('PDF 超过 200 页；请上传所需页码范围')
  const pages=[],empty=[]
  for(let i=1;i<=doc.numPages;i++){
   const page=await doc.getPage(i),content=await page.getTextContent()
   const text=content.items.map(item=>('str' in item?item.str+(item.hasEOL?'\n':' '):'')).join('').trim()
   pages.push({page:i,text})
   if(!text)empty.push(i)
   page.cleanup()
  }
  return {text:pages.map(p=>'[Page '+p.page+']\n'+p.text).join('\n\n'),pageTexts:pages,pages:doc.numPages,warnings:[...(empty.length?['以下页面没有可提取文字，未执行 OCR：'+empty.slice(0,30).join(', ')]:[]),'仅提取文本层；图表、公式版面与图片需另行核对。'],empty:empty.length===doc.numPages}
 }finally{await loading.destroy()}
}
async function parse(file){
 const ext=file.name.split('.').at(-1).toLowerCase()
 let parsed
 if(ext==='pdf')parsed=await pdf(file.data)
 else if(ext==='docx')parsed=docx(file.data)
 else if(ext==='xlsx')parsed=xlsx(file.data)
 else if(ext==='pptx')parsed=pptx(file.data)
 else{
  const text=new TextDecoder('utf-8',{fatal:true}).decode(file.data)
  if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))throw Error('参考材料不是有效的 UTF-8 文本')
  parsed={text,warnings:[]}
 }
 if(parsed.empty||!parsed.text.trim())throw Error(file.name+' 没有可读取文字；扫描件需要先转换为带文本层的 PDF')
 const truncated=parsed.text.length>limits.characters
 const text=parsed.text.slice(0,limits.characters).replace(/[\uD800-\uDBFF]$/,'')
 return {name:file.name,text,provenance:{format:ext,sha256:file.sha256,bytes:file.data.length,...(parsed.pages?{pages:parsed.pages}:{}),...(parsed.sheets?{sheets:parsed.sheets}:{}),characters:parsed.text.length,truncated,warnings:[...parsed.warnings,...(truncated?['文本超过 80,000 字符，只纳入前 80,000 字符。']:[])]}}
}
try{
 const materials=[];let count=0
 for(const file of files){const material=await parse(file);count+=material.text.length;if(count>limits.totalCharacters)throw Error('提取文字合计超过 200,000 字符；请减少材料');materials.push(material)}
 parentPort.postMessage({ok:true,materials})
}catch(error){parentPort.postMessage({ok:false,error:error.message??String(error)})}
