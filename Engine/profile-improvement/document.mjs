import {Inflate,zipSync,strFromU8,strToU8} from 'fflate'
import {DOMParser} from '@xmldom/xmldom'

export const MAX_UPLOAD_BYTES=4*1024*1024
export const DOCX_MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const WORD='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const REL='http://schemas.openxmlformats.org/package/2006/relationships'
const fail=(code,message)=>{throw Object.assign(new Error(message),{code})}
const local=node=>node?.localName??node?.nodeName?.split(':').at(-1)
const children=(node,ns,name)=>Array.from(node.getElementsByTagNameNS(ns,name))
const ancestor=(node,name)=>{for(let p=node.parentNode;p;p=p.parentNode)if(p.namespaceURI===WORD&&local(p)===name)return p;return null}
const plain=node=>children(node,WORD,'t').map(t=>t.textContent??'').join('')
const crcTable=Uint32Array.from({length:256},(_,i)=>{for(let bit=0;bit<8;bit++)i=i&1?0xedb88320^(i>>>1):i>>>1;return i>>>0})
const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0}
const esc=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
export const normalize=text=>String(text??'').normalize('NFKC').replace(/\s+/g,' ').trim()
export function decodeBase64(text){
 if(typeof text!=='string'||!text.length||text.length>Math.ceil(MAX_UPLOAD_BYTES/3)*4||text.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))fail('RESUME_INVALID','简历内容无效或超过 4 MiB。请重新选择原始 .docx 文件。')
 try{if(typeof Buffer!=='undefined')return new Uint8Array(Buffer.from(text,'base64'));const raw=atob(text);return Uint8Array.from(raw,c=>c.charCodeAt(0))}catch{fail('RESUME_INVALID','简历文件无法解码。')}
}
export function encodeBase64(bytes){
 if(typeof Buffer!=='undefined')return Buffer.from(bytes).toString('base64')
 let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text)
}
function xml(text){
 if(/<!DOCTYPE|<!ENTITY/i.test(text))fail('DOCX_UNSAFE','此 Word 文件包含不支持的外部 XML 实体。')
 try{return new DOMParser({onError(level,message){if(level!=='warning')throw Error(message)}}).parseFromString(text,'application/xml')}catch{fail('DOCX_INVALID','Word 内部文档结构损坏，无法安全保留原格式。')}
}
/** Inspect the central directory before inflating any uploaded data. ZIP64 is unnecessary for a resume. */
function zipEntries(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length>MAX_UPLOAD_BYTES||bytes.length<22)fail('RESUME_INVALID','请上传不超过 4 MiB 的可编辑 .docx 简历。')
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
 let end=-1
 for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(view.getUint32(at,true)===0x06054b50&&at+22+view.getUint16(at+20,true)===bytes.length){end=at;break}
 if(end<0)fail('DOCX_INVALID','这不是有效的 .docx。PDF、图片和旧版 .doc 需要先取得 Word 原稿。')
 const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),start=view.getUint32(end+16,true)
 if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||count!==view.getUint16(end+8,true)||count>512||count===65535||start+size>end)fail('DOCX_INVALID','此文档的压缩结构不受支持。')
 const names=new Set(),entries=new Map(),spans=[];let pos=start,total=0
 for(let i=0;i<count;i++){
  if(pos+46>end||view.getUint32(pos,true)!==0x02014b50)fail('DOCX_INVALID','文档压缩目录损坏。')
  const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true),compressed=view.getUint32(pos+20,true),uncompressed=view.getUint32(pos+24,true),length=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),offset=view.getUint32(pos+42,true)
  if(flags&65||![0,8].includes(method)||compressed===0xffffffff||uncompressed===0xffffffff||pos+46+length+extra+comment>end||offset+30>start)fail('DOCX_INVALID','加密或特殊压缩文档不受支持，请保存为普通 .docx。')
  const name=strFromU8(bytes.subarray(pos+46,pos+46+length))
  if(!name||name.includes('\0')||['__proto__','constructor','prototype'].includes(name)||name.includes('\\')||name.startsWith('/')||name.split('/').some(p=>p==='..')||names.has(name))fail('DOCX_INVALID','文档包含无效或重复的内部文件路径。')
  if(view.getUint32(offset,true)!==0x04034b50||view.getUint16(offset+6,true)!==flags||view.getUint16(offset+8,true)!==method)fail('DOCX_INVALID','文档局部压缩头与目录不一致。')
  const localLength=view.getUint16(offset+26,true),localExtra=view.getUint16(offset+28,true),dataStart=offset+30+localLength+localExtra
  if(dataStart+compressed>start||localLength!==length||strFromU8(bytes.subarray(offset+30,offset+30+localLength))!==name||method===0&&compressed!==uncompressed)fail('DOCX_INVALID','文档内部文件长度或名称不一致。')
  if(!(flags&8)&&(view.getUint32(offset+18,true)!==compressed||view.getUint32(offset+22,true)!==uncompressed||view.getUint32(offset+14,true)!==view.getUint32(pos+16,true)))fail('DOCX_INVALID','文档局部压缩大小与目录不一致。')
  for(let at=pos+46+length;at<pos+46+length+extra;){if(at+4>pos+46+length+extra)fail('DOCX_INVALID','压缩扩展头损坏。');const tag=view.getUint16(at,true),n=view.getUint16(at+2,true);if(tag===1||at+4+n>pos+46+length+extra)fail('DOCX_INVALID','不支持ZIP64或损坏的扩展头。');at+=4+n}
  entries.set(name,{size:uncompressed,crc:view.getUint32(pos+16,true),compressed,method,start:dataStart});spans.push([offset,dataStart+compressed])
  names.add(name);total+=uncompressed
  if(total>32*1024*1024||/\.(xml|rels)$/i.test(name)&&uncompressed>4*1024*1024)fail('DOCX_TOO_LARGE','文档展开后过大，请移除无关大图后重试。')
  pos+=46+length+extra+comment
 }
 if(pos!==start+size)fail('DOCX_INVALID','文档压缩目录长度不匹配。')
 spans.sort((a,b)=>a[0]-b[0]);if(spans.some((span,i)=>i&&span[0]<spans[i-1][1]))fail('DOCX_INVALID','文档内部文件位置重叠。')
 return {names,entries}
}
function openPackage(bytes){
 const {names,entries}=zipEntries(bytes)
 if(!names.has('word/document.xml')||!names.has('[Content_Types].xml'))fail('DOCX_INVALID','请上传 .docx Word 简历；不支持通过改扩展名转换的文件。')
 if([...names].some(name=>/(?:vbaProject|activeX|embeddings|_xmlsignatures)/i.test(name)))fail('DOCX_UNSAFE','含宏、嵌入程序或数字签名的文件暂不支持，请另存为普通 Word 简历。')
 const files=Object.create(null)
 try{for(const [name,entry] of entries){
  const output=new Uint8Array(entry.size);let written=0
  if(entry.method===0){output.set(bytes.subarray(entry.start,entry.start+entry.compressed));written=entry.compressed}
  else{
   // Bound actual expansion as well as ZIP's declared size. Small compressed chunks
   // prevent a false central-directory size from allocating an unbounded buffer.
   const inflater=new Inflate(chunk=>{if(written+chunk.length>entry.size)throw Error('Actual size exceeds declared ZIP size');output.set(chunk,written);written+=chunk.length})
   if(!entry.compressed)inflater.push(new Uint8Array(),true)
   for(let offset=0;offset<entry.compressed;offset+=1024)inflater.push(bytes.subarray(entry.start+offset,entry.start+Math.min(offset+1024,entry.compressed)),offset+1024>=entry.compressed)
  }
  if(written!==entry.size)throw Error('Expanded size mismatch');files[name]=output
 }}catch{fail('DOCX_INVALID','Word 压缩数据损坏或实际展开大小不符，无法读取。')}
 if(Object.keys(files).length!==entries.size)fail('DOCX_INVALID','展开后的文档文件目录不一致。')
 for(const [name,data] of Object.entries(files)){const entry=entries.get(name);if(!entry||data.length!==entry.size||crc32(data)!==entry.crc)fail('DOCX_INVALID','文档内部文件完整性校验失败。');if(/\.xml$/i.test(name))xml(strFromU8(data))}
 const types=strFromU8(files['[Content_Types].xml']);if(!types.includes('wordprocessingml.document.main+xml'))fail('DOCX_INVALID','文档必须是普通 .docx，不能是启用宏的 Word 文件。')
 for(const [name,data] of Object.entries(files))if(/\.rels$/i.test(name)){
  const rels=xml(strFromU8(data))
  for(const rel of children(rels,REL,'Relationship'))if(rel.getAttribute('TargetMode')==='External'&&!rel.getAttribute('Type').endsWith('/hyperlink'))fail('DOCX_UNSAFE','简历含自动加载的外部内容。请先将图片等内容嵌入 Word 文件。')
 }
 const source=strFromU8(files['word/document.xml']),doc=xml(source)
 for(const [name,data] of Object.entries(files))if(/^word\/.*\.xml$/i.test(name)){
  const story=name==='word/document.xml'?doc:xml(strFromU8(data)),instructions=children(story,WORD,'instrText').map(n=>n.textContent).join('')+' '+children(story,WORD,'fldSimple').map(n=>n.getAttribute('w:instr')).join(' ')
  if(children(story,WORD,'altChunk').length||/DDE(?:AUTO)?|\bINCLUDETEXT\b|\bINCLUDEPICTURE\b/i.test(instructions))fail('DOCX_UNSAFE','简历含外部内容或自动执行字段，请先另存为普通文档。')
  if(['ins','del','moveFrom','moveTo'].some(name=>children(story,WORD,name).length))fail('DOCX_TRACKED_CHANGES','请先在 Word 中接受或拒绝已有修订，再上传定稿；原稿不会被更改。')
 }
 return {files,source,doc}
}
export function visualWidth(text){
 return Array.from(text).reduce((n,c)=>n+(/\s/.test(c)?.28:/[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(c)?1:/[MW@#%]/.test(c)?.85:/[ilI.,:;!'|]/.test(c)?.28:.55),0)
}
function parsed(bytes){
 const pack=openPackage(bytes),{source,doc}=pack,paragraphs=children(doc,WORD,'p'),texts=children(doc,WORD,'t')
 const paragraphsByNode=new Map(paragraphs.map((p,i)=>[p,{id:'p'+String(i+1).padStart(4,'0'),text:plain(p),table:!!ancestor(p,'tc'),textbox:!!ancestor(p,'txbxContent'),units:[]}]))
 const slots=[];const match=/<([A-Za-z_][\w.-]*):t\b(?![^>]*\/>)([^>]*?)>([\s\S]*?)<\/\1:t\s*>/g
 for(const item of source.matchAll(match))if(item[3].length)slots.push({tag:item[1]+':t',start:item.index+item[0].indexOf('>')+1,end:item.index+item[0].lastIndexOf('</')})
 let cursor=0;const units=[],nonempty=paragraphs.filter(p=>plain(p).trim()),first=nonempty[0]
 for(const [index,node] of texts.entries()){
  // Empty self-closing text nodes are immutable and need no byte replacement.
  const text=node.textContent??'',p=ancestor(node,'p'),paragraph=paragraphsByNode.get(p)
  if(!text){continue}
  while(cursor<slots.length&&slots[cursor].tag!==node.tagName)cursor++
  const slot=slots[cursor++];if(!slot)fail('DOCX_INVALID','无法安全定位原稿文字，请在 Word 中重新保存一次。')
  const id='t'+String(index+1).padStart(4,'0'),run=ancestor(node,'r'),props=run&&children(run,WORD,'rPr')[0],allBold=!!props&&(children(props,WORD,'b').length>0||children(props,WORD,'bCs').length>0)
  let locked=''
  if(!paragraph)locked='unsupported-context'
  else if(/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\d ()-]{7,}\d))/i.test(paragraph.text))locked='contact'
  else if(ancestor(node,'hyperlink'))locked='hyperlink'
  else if(ancestor(node,'fldSimple')||children(p,WORD,'fldChar').length||children(p,WORD,'instrText').length)locked='field'
  else if(ancestor(node,'sdt')||props&&(children(props,WORD,'vanish').length||children(props,WORD,'webHidden').length))locked='protected-content'
  else if(p===first&&normalize(paragraph.text).length<=70)locked='identity'
  else if(/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\d ()-]{7,}\d))/i.test(text))locked='contact'
  else if(/(?:19|20)\d{2}\s*(?:年|[./-])\s*\d{1,2}|(?:19|20)\d{2}\s*[-–—至~]\s*(?:19|20)\d{2}/.test(text))locked='date'
  else if(normalize(text).length<5||/[\r\n\t]/.test(text))locked='short-or-layout-text'
  else if(normalize(paragraph.text).length<32&&(allBold||children(p,WORD,'pStyle').some(s=>/heading|title|标题/i.test(s.getAttribute('w:val')))))locked='heading'
  const unit={id,paragraphId:paragraph?.id??'',text,context:paragraph?.text??text,table:paragraph?.table??false,textbox:paragraph?.textbox??false,editable:!locked,lockedReason:locked||undefined,bold:allBold,maxWidth:Math.round((visualWidth(text)+.5)*100)/100,maxCharacters:Math.ceil(text.length*1.08)+2}
  units.push({...unit,...slot});paragraph?.units.push(id)
 }
 if(!units.length||!units.some(u=>u.editable))fail('DOCX_NO_EDITABLE_TEXT','未找到可优化的正文文字。请上传文字可编辑的 Word 简历，而非放入 Word 的整页截图。')
 if(units.length>800||units.reduce((n,u)=>n+u.text.length,0)>30000)fail('RESUME_TOO_LONG','简历内容过长；请上传最多 30,000 字符的正式简历。')
 return {...pack,units,paragraphs:[...paragraphsByNode.values()].filter(p=>p.text.trim())}
}
export function inspectDocument(bytes,name='resume.docx'){
 if(typeof name!=='string'||!/\.docx$/i.test(name))fail('RESUME_FORMAT','为保留原版式，请上传 .docx Word 原稿。PDF、图片和旧版 .doc 暂不支持。')
 const p=parsed(bytes),fonts=p.files['word/fontTable.xml']?children(xml(strFromU8(p.files['word/fontTable.xml'])),WORD,'font').map(f=>f.getAttribute('w:name')).filter(Boolean):[]
 return {name:name.split(/[\\/]/).at(-1),bytes:bytes.length,characters:p.units.reduce((n,u)=>n+u.text.length,0),units:p.units.map(({start,end,tag,...u})=>u),paragraphs:p.paragraphs,fonts,tables:children(p.doc,WORD,'tbl').length,images:Object.keys(p.files).filter(name=>name.startsWith('word/media/')).length,editableUnits:p.units.filter(u=>u.editable).length}
}
export function validatePatches(document,patches,{protectedIds=[]}={}){
 if(!Array.isArray(patches)||patches.length>document.units.length)fail('PATCH_INVALID','优化结果中的修改列表无效。')
 const byId=new Map(document.units.map(u=>[u.id,u])),seen=new Set(),clean=[]
 for(const p of patches){
  if(!p||typeof p!=='object'||Object.keys(p).some(k=>!['id','before','after','reason','evidenceIds'].includes(k)))fail('PATCH_INVALID','优化结果含不支持的修改字段。')
  const unit=byId.get(p.id)
  if(!unit||seen.has(p.id)||!unit.editable||protectedIds.includes(p.id))fail('PATCH_PROTECTED','不能修改姓名、联系方式、标题、日期或核查员保护的事实字段：'+String(p.id))
  if(p.before!==unit.text||typeof p.after!=='string'||!p.after.trim()||/[\r\n\t\x00-\x08\x0b\x0c\x0e-\x1f]/.test(p.after))fail('PATCH_INVALID','原文对应关系或替换文字不正确：'+p.id)
  if(p.after===p.before)continue
  if(p.after.match(/^\s*/)[0]!==p.before.match(/^\s*/)[0]||p.after.match(/\s*$/)[0]!==p.before.match(/\s*$/)[0])fail('PATCH_LAYOUT','修改不能改变文字段首尾空格：'+p.id)
  if(p.after.length>unit.maxCharacters||visualWidth(p.after)>unit.maxWidth)fail('PATCH_LAYOUT','文字超出原段落版式预算，请精炼措辞：'+p.id)
  const numbers=s=>(s.match(/\d+(?:[.,]\d+)*(?:%|％)?/g)??[]).sort().join('|')
  if(numbers(p.after)!==numbers(p.before))fail('PATCH_FACT','不能增加、删除或修改原文数字、日期和量化结果：'+p.id)
  if(typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>500||!Array.isArray(p.evidenceIds)||!p.evidenceIds.length||p.evidenceIds.some(id=>!byId.has(id)))fail('PATCH_EVIDENCE','每项修改必须有理由与原简历中的证据位置。')
  seen.add(p.id);clean.push({id:p.id,before:p.before,after:p.after,reason:p.reason,evidenceIds:[...new Set(p.evidenceIds)]})
 }
 return clean
}
/** Patch only existing text-node character bytes. Every style, run, table, image and relationship is retained. */
export function applyPatches(bytes,patches,options={}){
 const p=parsed(bytes),clean=validatePatches({units:p.units},patches,options),map=new Map(p.units.map(u=>[u.id,u]))
 let source=p.source
 for(const edit of clean.map(e=>({...e,unit:map.get(e.id)})).sort((a,b)=>b.unit.start-a.unit.start))source=source.slice(0,edit.unit.start)+esc(edit.after)+source.slice(edit.unit.end)
 xml(source)
 const files={...p.files,'word/document.xml':strToU8(source)},result=zipSync(files,{level:6,mtime:new Date('2020-01-01T00:00:00Z')})
 const verified=parsed(result),output=new Map(verified.units.map(u=>[u.id,u]))
 for(const edit of clean)if(output.get(edit.id)?.text!==edit.after)fail('PATCH_VERIFY','Word 写入后的文字校验失败。')
 const strip=s=>s.replace(/(<([A-Za-z_][\w.-]*):t\b(?![^>]*\/>)[^>]*>)[\s\S]*?(<\/\2:t\s*>)/g,'$1$3')
 if(strip(source)!==strip(p.source))fail('PATCH_VERIFY','检测到原稿样式或结构发生改变，已阻止交付。')
 const changedParts=[]
 for(const [name,data] of Object.entries(verified.files))if(data.length!==p.files[name].length||data.some((b,i)=>b!==p.files[name][i]))changedParts.push(name)
 if(changedParts.some(name=>name!=='word/document.xml')||Object.keys(files).length!==Object.keys(verified.files).length)fail('PATCH_VERIFY','检测到非正文文件被修改，已阻止交付。')
 return {bytes:result,patches:clean,verification:{stylesPreserved:true,structurePreserved:true,unchangedParts:Object.keys(files).length-changedParts.length,changedParts,textNodes:verified.units.length}}
}
