/** Strict OOXML package IO used only for user-supplied/engine-generated files. */
import JSZip from 'jszip';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {createHash} from 'node:crypto';
import {posix} from 'node:path';
export const NS={p:'http://schemas.openxmlformats.org/presentationml/2006/main',a:'http://schemas.openxmlformats.org/drawingml/2006/main',r:'http://schemas.openxmlformats.org/officeDocument/2006/relationships',rel:'http://schemas.openxmlformats.org/package/2006/relationships',c:'http://schemas.openxmlformats.org/drawingml/2006/chart',s:'http://schemas.openxmlformats.org/spreadsheetml/2006/main',ct:'http://schemas.openxmlformats.org/package/2006/content-types'};
export const MIME='application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const EMU=914400;
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function decodeBase64(text,max=4*1024*1024){
 if(typeof text!=='string'||!text.length||text.length>Math.ceil(max/3)*4+4||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text))throw Error('文件编码无效或超过上传限制');
 const bytes=Buffer.from(text,'base64');if(bytes.length>max||bytes.toString('base64')!==text)throw Error('文件编码或大小无效');return bytes;
}
function centralDirectory(bytes){
 if(bytes.length<22||bytes.readUInt32LE(0)!==0x04034b50)throw Error('请选择有效的 .pptx/.potx 文件；不支持旧 .ppt 或加密文件');
 let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){eocd=i;break;}
 if(eocd<0)throw Error('PPTX ZIP 目录损坏');
 const count=bytes.readUInt16LE(eocd+10),start=bytes.readUInt32LE(eocd+16);if(count===65535||count>4096||start>=bytes.length)throw Error('PPTX 结构过大或不支持ZIP64');
 let at=start,total=0;const entries=[],names=new Set();
 for(let n=0;n<count;n++){
  if(at+46>bytes.length||bytes.readUInt32LE(at)!==0x02014b50)throw Error('PPTX ZIP 目录不完整');
  const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),size=bytes.readUInt32LE(at+24),nameLength=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),name=bytes.subarray(at+46,at+46+nameLength).toString('utf8');
  if(flags&1||![0,8].includes(method))throw Error('不支持加密或非标准压缩的PPTX');
  if(!name||name.includes('\\')||name.startsWith('/')||name.split('/').includes('..')||name.includes('\0')||names.has(name))throw Error('PPTX 包含重复或非法路径');
  names.add(name);total+=size;if(size>32*1024*1024||total>96*1024*1024)throw Error('解压后的PPTX超过96MiB安全上限');
  entries.push({name,size});at+=46+nameLength+extra+comment;
 }
 return entries;
}
export async function openPackage(input){
 const bytes=Buffer.isBuffer(input)?input:Buffer.from(input),entries=centralDirectory(bytes);
 if(entries.some(e=>/vbaProject|_xmlsignatures\//i.test(e.name)))throw Error('模板包含宏或数字签名，请先另存为不含宏/签名的 .pptx');
 const zip=await JSZip.loadAsync(bytes,{checkCRC32:true,createFolders:false});
 if(!zip.file('[Content_Types].xml')||!zip.file('ppt/presentation.xml'))throw Error('该文件不是PowerPoint演示文稿');
 return zip;
}
export function parseXML(value){
 if(/<!DOCTYPE|<!ENTITY/i.test(value))throw Error('XML外部实体与DOCTYPE不受支持');
 const errors=[];const doc=new DOMParser({onError:(level,message)=>{if(level!=='warning')errors.push(message);}}).parseFromString(value,'application/xml');
 if(errors.length||!doc.documentElement)throw Error('PPTX XML损坏：'+(errors[0]??'missing root'));
 return doc;
}
export const serialize=doc=>new XMLSerializer().serializeToString(doc);
export const descendants=(node,ns,name)=>Array.from(node?.getElementsByTagNameNS?.(NS[ns]??ns,name)??[]);
export const first=(node,ns,name)=>descendants(node,ns,name)[0]??null;
export const children=(node,ns,name)=>Array.from(node?.childNodes??[]).filter(c=>c.nodeType===1&&(!ns||c.namespaceURI===(NS[ns]??ns))&&(!name||c.localName===name));
export const child=(node,ns,name)=>children(node,ns,name)[0]??null;
export const relPart=part=>posix.join(posix.dirname(part),'_rels',posix.basename(part)+'.rels');
export function resolvePart(part,target){
 const value=target.startsWith('/')?target.slice(1):posix.normalize(posix.join(posix.dirname(part),target));
 if(value.startsWith('../')||value.includes('\\')||/^[a-z]+:/i.test(value))throw Error('PPTX内部关系目标无效');return value;
}
export async function xmlPart(zip,path){const f=zip.file(path);return f?parseXML(await f.async('string')):null;}
export async function relationships(zip,part){
 const doc=await xmlPart(zip,relPart(part));return new Map(descendants(doc,'rel','Relationship').map(r=>[r.getAttribute('Id'),{id:r.getAttribute('Id'),type:r.getAttribute('Type'),target:r.getAttribute('Target'),external:r.getAttribute('TargetMode')==='External',path:r.getAttribute('TargetMode')==='External'?null:resolvePart(part,r.getAttribute('Target'))}]));
}
export async function slideOrder(zip){
 const doc=await xmlPart(zip,'ppt/presentation.xml'),rels=await relationships(zip,'ppt/presentation.xml'),size=first(doc,'p','sldSz'),list=first(doc,'p','sldIdLst');
 if(!size||!list)throw Error('PPTX缺少画布或幻灯片列表');
 const slides=children(list,'p','sldId').map(s=>{const rid=s.getAttributeNS(NS.r,'id'),r=rels.get(rid);if(!r?.path||!zip.file(r.path))throw Error('PPTX包含缺失幻灯片');return {path:r.path,relId:rid,presentationId:s.getAttribute('id')};});
 if(!slides.length||slides.length>40)throw Error('模板支持1–40页');
 return {doc,width:Number(size.getAttribute('cx'))/EMU,height:Number(size.getAttribute('cy'))/EMU,slides};
}
export async function inspectPptx(bytes){
 const zip=await openPackage(bytes),order=await slideOrder(zip);let text=0,shapes=0,pictures=0,tables=0,charts=0,notes=0;
 const perSlide=[];
 for(const [i,s] of order.slides.entries()){
  const doc=await xmlPart(zip,s.path),t=descendants(doc,'a','t'),sp=descendants(doc,'p','sp'),pics=descendants(doc,'p','pic'),tbl=descendants(doc,'a','tbl'),ch=descendants(doc,'c','chart');
  text+=t.length;shapes+=sp.length;pictures+=pics.length;tables+=tbl.length;charts+=ch.length;
  perSlide.push({index:i+1,path:s.path,text:t.map(t=>t.textContent).join('\n'),textNodes:t.length,shapes:sp.length,tables:tbl.length,charts:ch.length,pictures:pics.length});
 }
 const missing=[];
 for(const path of Object.keys(zip.files)){
  if(path.startsWith('ppt/notesSlides/notesSlide')&&path.endsWith('.xml'))notes++;
  if(!path.endsWith('.rels'))continue;
  const part=path==='_rels/.rels'?'':posix.join(posix.dirname(posix.dirname(path)),posix.basename(path).slice(0,-5)),doc=await xmlPart(zip,path);
  for(const r of descendants(doc,'rel','Relationship'))if(r.getAttribute('TargetMode')!=='External'){
   const target=resolvePart(part,r.getAttribute('Target'));if(!zip.file(target))missing.push({part,target});
  }
 }
 if(missing.length)throw Error('PPTX存在缺失关系：'+missing.slice(0,3).map(v=>v.target).join(', '));
 const masters=Object.keys(zip.files).filter(p=>/^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(p)).length,layouts=Object.keys(zip.files).filter(p=>/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(p)).length,workbooks=Object.keys(zip.files).filter(p=>/^ppt\/embeddings\/.*\.xlsx$/.test(p)).length;
 return {valid:true,bytes:bytes.length,sha256:sha256(bytes),slides:order.slides.length,width:order.width,height:order.height,native:{textNodes:text,shapes,pictures,tables,charts,embeddedWorkbooks:workbooks,masters,layouts,notes},perSlide,missingRelationships:missing,scope:'OOXML包结构、关系和原生对象检查；未声明所有Office版本均已实机验证'};
}
export async function comparePackages(before,after){
 const a=await openPackage(before),b=await openPackage(after),changed=[],added=[],removed=[];
 for(const name of Object.keys(a.files).filter(n=>!a.files[n].dir)){
  if(!b.file(name)){removed.push(name);continue;}
  if(!Buffer.from(await a.file(name).async('uint8array')).equals(Buffer.from(await b.file(name).async('uint8array'))))changed.push(name);
 }
 for(const name of Object.keys(b.files).filter(n=>!b.files[n].dir))if(!a.file(name))added.push(name);
 return {changed,added,removed,unchanged:Object.keys(a.files).filter(n=>!a.files[n].dir).length-changed.length-removed.length};
}
