/** OOXML template round-trip: modify selected text/data/geometry; retain all other package parts. */
import JSZip from 'jszip';
import {NS,EMU,openPackage,xmlPart,parseXML,serialize,descendants as all,first,children,child,relationships,relPart,resolvePart,slideOrder,inspectPptx,sha256} from './archive.mjs';
import {STYLES,clone,round,xml,validateDeck,reconcileEdits} from './scene.mjs';
const val=(node,name,def='')=>node?.getAttribute(name)||def;
const inch=value=>Number(value||0)/EMU;
const attr=(node,key,n)=>node.setAttribute(key,String(n));
function color(node,theme,fallback='none'){
 const srgb=first(node,'a','srgbClr'),system=first(node,'a','sysClr'),scheme=first(node,'a','schemeClr');
 let result=srgb?val(srgb,'val'):system?val(system,'lastClr'):scheme?theme.scheme?.[val(scheme,'val')]:null;
 if(!result||!/^[0-9a-f]{6}$/i.test(result))return fallback;
 const item=srgb??system??scheme,tint=first(item,'a','tint'),shade=first(item,'a','shade');
 if(tint||shade){const ratio=Number(val(tint??shade,'val','100000'))/100000;result=result.match(/../g).map(n=>Math.round(tint?parseInt(n,16)+(255-parseInt(n,16))*ratio:parseInt(n,16)*ratio).toString(16).padStart(2,'0')).join('');}
 return result.toUpperCase();
}
function textBody(node){return child(node,'p','txBody')??child(node,'a','txBody');}
function paragraphText(p){return children(p).map(n=>n.localName==='br'?'\n':['r','fld'].includes(n.localName)?all(n,'a','t').map(t=>t.textContent).join(''):'').join('');}
function bodyText(body){return children(body,'a','p').map(paragraphText).join('\n');}
function idOf(node){return val(first(node,'p','cNvPr'),'id');}
function placeholder(node){const ph=first(node,'p','ph');return ph?{idx:val(ph,'idx','0'),type:val(ph,'type','body')}:null;}
function matching(doc,key){if(!doc||!key)return null;return all(doc,'p','sp').find(s=>{const p=placeholder(s);return p&&(p.idx===key.idx||p.type===key.type&&['title','ctrTitle'].includes(key.type));})??null;}
function xfrmOf(node){return child(child(node,'p','spPr'),'a','xfrm')??child(node,'p','xfrm')??child(child(node,'p','grpSpPr'),'a','xfrm');}
function geometry(node,fallback,transform){
 const xfrm=xfrmOf(node)??xfrmOf(fallback),off=child(xfrm,'a','off'),ext=child(xfrm,'a','ext'),x=inch(val(off,'x')),y=inch(val(off,'y')),w=inch(val(ext,'cx')),h=inch(val(ext,'cy'));
 return {x:round(transform.dx+x*transform.sx),y:round(transform.dy+y*transform.sy),w:round(w*transform.sx),h:round(h*transform.sy),rotation:Number(val(xfrm,'rot','0'))/60000};
}
function style(node,fallback,theme){
 const body=textBody(node),fb=textBody(fallback),p=child(body,'a','p')??child(fb,'a','p'),rp=first(p,'a','rPr')??first(p,'a','defRPr')??first(fb,'a','defRPr'),pp=child(p,'a','pPr'),bp=child(body,'a','bodyPr')??child(fb,'a','bodyPr'),font=val(first(rp,'a','latin'),'typeface',theme.font);
 return {fontSize:Math.max(6,Math.min(120,Number(val(rp,'sz',val(first(fb,'a','defRPr'),'sz','1800')))/100)),fontFamily:font.startsWith('+')?theme.font:font,color:color(child(rp,'a','solidFill'),theme,theme.ink),bold:val(rp,'b')==='1',italic:val(rp,'i')==='1',underline:!!val(rp,'u')&&val(rp,'u')!=='none',align:({ctr:'center',r:'right',just:'justify'}[val(pp,'algn')]??'left'),valign:({ctr:'middle',b:'bottom'}[val(bp,'anchor')]??'top'),lineHeight:1.2,padding:Math.max(0,inch(val(bp,'lIns','0')))};
}
async function readTheme(zip,masterPart){
 const rels=await relationships(zip,masterPart),path=[...rels.values()].find(r=>r.type.endsWith('/theme'))?.path??'ppt/theme/theme1.xml',doc=await xmlPart(zip,path),scheme={};
 for(const s of children(first(doc,'a','clrScheme')))scheme[s.localName]=val(first(s,'a','srgbClr'),'val',val(first(s,'a','sysClr'),'lastClr','172438'));
 scheme.tx1=scheme.dk1??'172438';scheme.tx2=scheme.dk2??'475569';scheme.bg1=scheme.lt1??'FFFFFF';scheme.bg2=scheme.lt2??'F1F5F9';
 const fonts=first(doc,'a','minorFont'),font=val(child(fonts,'a','latin'),'typeface','Arial');
 return {...clone(STYLES.executive),scheme,background:scheme.bg1,paper:scheme.bg1,ink:scheme.tx1,muted:scheme.tx2,accent:scheme.accent1??'315BE8',secondary:scheme.accent2??'138579',font};
}
async function addImage(zip,rel,assets){
 if(!rel?.path||rel.external)return null;const entry=zip.file(rel.path);if(!entry)return null;
 const extension=rel.path.split('.').at(-1).toLowerCase(),mime=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'})[extension];
 if(!mime)return null;
 const bytes=await entry.async('nodebuffer');if(bytes.length>4*1024*1024)return null;
 const key=sha256(bytes).slice(0,24);if(!assets[key])assets[key]={name:rel.path.split('/').at(-1),data:`data:${mime};base64,${bytes.toString('base64')}`};return key;
}
function points(cache){return all(cache,'c','pt').sort((a,b)=>Number(val(a,'idx'))-Number(val(b,'idx'))).map(p=>first(p,'c','v')?.textContent??'');}
async function readChart(zip,part){
 const doc=await xmlPart(zip,part),plot=first(doc,'c','plotArea'),type=children(plot).find(n=>['barChart','lineChart','doughnutChart','pieChart'].includes(n.localName));if(!type)return null;
 const series=[];let categories=null;const ranges=[];
 for(const ser of children(type,'c','ser')){
  const numRef=first(child(ser,'c','val'),'c','numRef'),cache=first(numRef,'c','numCache')??first(child(ser,'c','val'),'c','numLit'),values=points(cache).map(Number),cat=child(ser,'c','cat'),labels=points(first(cat,'c','strCache')??first(cat,'c','numCache')??first(cat,'c','strLit')??first(cat,'c','multiLvlStrCache'));
  if(!values.length||values.some(n=>!Number.isFinite(n))||labels.length!==values.length)return null;
  if(categories&&JSON.stringify(labels)!==JSON.stringify(categories))return null;categories=labels;
  const tx=child(ser,'c','tx'),name=points(first(tx,'c','strCache'))[0]??first(tx,'c','v')?.textContent??'Series '+(series.length+1);
  series.push({name,values});ranges.push(first(numRef,'c','f')?.textContent??null);
 }
 if(!series.length||series.length>6||categories.length>20)return null;
 const rels=await relationships(zip,part),external=first(doc,'c','externalData'),workbook=rels.get(external?.getAttributeNS(NS.r,'id'));
 return {chart:{type:type.localName.replace('Chart',''),categories,series,unit:''},native:{chartPart:part,workbookPart:workbook?.path??null,ranges},editable:!!workbook?.path&&ranges.every(r=>r&&parseRange(r)),warning:val(first(type,'c','barDir'),'val')==='bar'?'横向柱状图保留原PPTX外观；浏览器使用纵向数据预览':''};
}
export async function importTemplate(bytes,{name='template.pptx'}={}){
 const zip=await openPackage(bytes),order=await slideOrder(zip),deck={version:1,kind:'native',title:name.replace(/\.(pptx|potx)$/i,''),width:order.width,height:order.height,style:'template',theme:clone(STYLES.executive),assets:{},sources:[{id:'T1',name,kind:'template'}],slides:[],template:{name,sha256:sha256(bytes),warnings:[]}};
 for(const [index,entry] of order.slides.entries()){
  const doc=await xmlPart(zip,entry.path),slideRels=await relationships(zip,entry.path),layoutPart=[...slideRels.values()].find(r=>r.type.endsWith('/slideLayout'))?.path,layoutDoc=layoutPart?await xmlPart(zip,layoutPart):null,layoutRels=layoutPart?await relationships(zip,layoutPart):new Map(),masterPart=[...layoutRels.values()].find(r=>r.type.endsWith('/slideMaster'))?.path,masterDoc=masterPart?await xmlPart(zip,masterPart):null,theme=masterPart?await readTheme(zip,masterPart):clone(STYLES.executive);
  if(index===0)deck.theme=theme;
  const bg=first(child(doc.documentElement,'p','cSld'),'p','bg')??first(child(layoutDoc?.documentElement,'p','cSld'),'p','bg')??first(child(masterDoc?.documentElement,'p','cSld'),'p','bg'),slide={id:'native-'+entry.presentationId,title:'第 '+(index+1)+' 页',background:color(child(first(bg,'p','bgPr'),'a','solidFill'),theme,theme.background),notes:'',sourceIds:[],origin:clone(entry),elements:[]};
  const transform={sx:1,sy:1,dx:0,dy:0,grouped:false};
  async function walk(tree,part,rels,inherited,tr=transform){
   for(const node of children(tree,'p')){
    if(['nvGrpSpPr','grpSpPr','extLst'].includes(node.localName))continue;
    if(node.localName==='grpSp'){
     const xf=xfrmOf(node),off=child(xf,'a','off'),ext=child(xf,'a','ext'),co=child(xf,'a','chOff'),ce=child(xf,'a','chExt'),sx=Number(val(ext,'cx','1'))/Number(val(ce,'cx',val(ext,'cx','1'))),sy=Number(val(ext,'cy','1'))/Number(val(ce,'cy',val(ext,'cy','1')));
     if(!Number.isFinite(sx)||!Number.isFinite(sy))continue;
     if(val(xf,'rot')||val(xf,'flipH')==='1'||val(xf,'flipV')==='1')deck.template.warnings.push('第 '+(index+1)+' 页包含组合旋转/翻转；浏览器预览可能简化，原PPTX保留。');
     await walk(node,part,rels,inherited,{sx:tr.sx*sx,sy:tr.sy*sy,dx:tr.dx+inch(val(off,'x'))*tr.sx-inch(val(co,'x'))*tr.sx*sx,dy:tr.dy+inch(val(off,'y'))*tr.sy-inch(val(co,'y'))*tr.sy*sy,grouped:true});continue;
    }
    const ph=placeholder(node);if(inherited&&ph)continue;
    const fallback=matching(layoutDoc,ph)??matching(masterDoc,ph),shapeId=idOf(node)||'unknown-'+slide.elements.length,g=geometry(node,fallback,tr),origin={part,shapeId,grouped:tr.grouped},id=slide.id+'-'+(inherited?part.replace(/[^a-zA-Z0-9]/g,'')+'-':'')+shapeId;
    if(g.w<=0||g.h<=0){if(node.localName!=='cxnSp')continue;g.w=Math.max(.01,g.w);g.h=Math.max(.01,g.h);}
    const sp=child(node,'p','spPr'),fill=child(sp,'a','noFill')?'none':color(child(sp,'a','solidFill'),theme),stroke=color(child(first(sp,'a','ln'),'a','solidFill'),theme),geom=val(first(sp,'a','prstGeom'),'prst','rect'),body=textBody(node);
    if(node.localName==='sp'||node.localName==='cxnSp'){
     const supported=['rect','roundRect','ellipse','line','triangle'].includes(geom);
     if(fill!=='none'||stroke!=='none'||!body){
      slide.elements.push({id:id+'-shape',type:supported?'shape':'preserved',...g,shape:geom,fill,stroke,strokeWidth:Number(val(first(sp,'a','ln'),'w','12700'))/12700,origin:{...origin,kind:'shape'},locked:inherited||!supported,decorative:true,...(!supported?{label:val(first(node,'p','cNvPr'),'name','复杂形状'),reason:'复杂几何保留在PPTX，浏览器只显示对象范围'}:{})});
     }
     if(body){const text=bodyText(body),st=style(node,fallback,theme),e={id:id+'-text',type:'text',...g,...st,text,origin:{...origin,kind:'text'},locked:inherited,role:['title','ctrTitle'].includes(ph?.type)?'title':'body'};slide.elements.push(e);if(e.role==='title'&&text.trim())slide.title=text;}
     if(child(sp,'a','gradFill')||children(first(sp,'a','effectLst')).length)deck.template.warnings.push('第 '+(index+1)+' 页包含渐变或效果；PPTX保留，浏览器预览简化。');
    }else if(node.localName==='pic'){
     const blip=first(node,'a','blip'),assetId=await addImage(zip,rels.get(blip?.getAttributeNS(NS.r,'embed')),deck.assets);
     slide.elements.push({id:id+'-image',type:assetId?'image':'preserved',...g,...(assetId?{assetId,fit:'contain'}:{label:'原生图片',reason:'此图片格式或外部链接未在浏览器渲染，原件保留'}),origin:{...origin,kind:'image'},locked:inherited||!assetId});
     const crop=first(node,'a','srcRect');if(crop&&['l','t','r','b'].some(k=>Number(val(crop,k))))deck.template.warnings.push('第 '+(index+1)+' 页有裁剪图片；导出保留原裁剪，浏览器可能显示完整图。');
    }else if(node.localName==='graphicFrame'){
     const tbl=first(node,'a','tbl'),ch=first(node,'c','chart');
     if(tbl){const rows=children(tbl,'a','tr').map(r=>children(r,'a','tc').map(c=>bodyText(child(c,'a','txBody'))));if(rows.length&&rows.length<=20&&rows[0].length<=10&&rows.every(r=>r.length===rows[0].length))slide.elements.push({id:id+'-table',type:'table',...g,rows,fontSize:Math.max(10,Math.min(18,style(children(children(tbl,'a','tr')[0],'a','tc')[0],null,theme).fontSize)),header:true,headerFill:theme.accent,headerColor:'FFFFFF',color:theme.ink,fill:theme.paper,stroke:'CBD5E1',origin:{...origin,kind:'table'},locked:inherited});else slide.elements.push({id:id+'-table',type:'preserved',...g,label:'原生复杂表格',reason:'表格过大或有复杂结构；原PPTX保留',origin:{...origin,kind:'opaque'},locked:true});}
     else if(ch){const rel=rels.get(ch.getAttributeNS(NS.r,'id')),parsed=rel?.path?await readChart(zip,rel.path):null;if(parsed){slide.elements.push({id:id+'-chart',type:'chart',...g,chart:parsed.chart,colors:[theme.accent,theme.secondary,'8D98AD','B87346'],color:theme.ink,origin:{...origin,kind:'chart',...parsed.native},locked:inherited||!parsed.editable});if(parsed.warning)deck.template.warnings.push(parsed.warning);}else slide.elements.push({id:id+'-chart',type:'preserved',...g,label:'原生图表',reason:'该图表类型只在原PPTX中完整保留',origin:{...origin,kind:'opaque'},locked:true});}
     else slide.elements.push({id:id+'-native',type:'preserved',...g,label:'原生对象',reason:'SmartArt/嵌入对象在原PPTX中保留，浏览器仅显示范围',origin:{...origin,kind:'opaque'},locked:true});
    }
   }
  }
  if(masterDoc&&val(doc.documentElement,'showMasterSp','1')!=='0')await walk(first(masterDoc,'p','spTree'),masterPart,await relationships(zip,masterPart),true);
  if(layoutDoc)await walk(first(layoutDoc,'p','spTree'),layoutPart,layoutRels,true);
  await walk(first(doc,'p','spTree'),entry.path,slideRels,false);
  const notesRel=[...slideRels.values()].find(r=>r.type.endsWith('/notesSlide'));if(notesRel?.path){const notes=await xmlPart(zip,notesRel.path),body=all(notes,'p','sp').find(s=>val(first(s,'p','ph'),'type')==='body');slide.notes=body?bodyText(textBody(body)):'';slide.origin.notesPart=notesRel.path;}
  for(const e of slide.elements)if(e.type==='text'&&e.y>deck.height-.65)e.role='footer';
  if(slide.title.startsWith('第 ')){const main=slide.elements.filter(e=>e.type==='text'&&!e.locked&&e.text.trim()&&e.role!=='footer').sort((a,b)=>b.fontSize-a.fontSize)[0];if(main){slide.title=main.text;main.role='title';}}
  deck.slides.push(slide);
 }
 const chartParts=new Map();for(const s of deck.slides)for(const e of s.elements)if(e.origin?.chartPart)chartParts.set(e.origin.chartPart,(chartParts.get(e.origin.chartPart)??0)+1);
 for(const s of deck.slides)for(const e of s.elements)if(e.origin?.chartPart&&chartParts.get(e.origin.chartPart)>1){e.locked=true;deck.template.warnings.push('多页共用同一图表数据：浏览器保留只读，防止单页修改影响其他页面。');}
 deck.template.warnings=[...new Set(deck.template.warnings)];
 if(JSON.stringify(deck.assets).length>6*1024*1024)throw Error('模板中的图片预览超过6MiB，请压缩图片后重试');
 validateDeck(deck);return deck;
}
function elementById(doc,id){return [...all(doc,'p','sp'),...all(doc,'p','pic'),...all(doc,'p','cxnSp'),...all(doc,'p','graphicFrame')].find(s=>idOf(s)===id);}
function create(doc,ns,name){return doc.createElementNS(NS[ns],ns+':'+name);}
function ensure(parent,ns,name){let n=child(parent,ns,name);if(!n){n=create(parent.ownerDocument,ns,name);parent.appendChild(n);}return n;}
/** Preserve unchanged runs and paragraph properties. New text uses the edited paragraph's original style. */
function setParagraph(p,text){
 const doc=p.ownerDocument,runs=children(p).filter(n=>['r','fld'].includes(n.localName)),old=paragraphText(p);if(old===text)return;
 if(!text.includes('\n')&&runs.length&&children(p,'a','br').length===0){
  let prefix=0;while(prefix<old.length&&prefix<text.length&&old[prefix]===text[prefix])prefix++;
  let suffix=0;while(suffix<old.length-prefix&&suffix<text.length-prefix&&old[old.length-1-suffix]===text[text.length-1-suffix])suffix++;
  const begin=prefix,end=old.length-suffix,insert=text.slice(prefix,text.length-suffix);let at=0,inserted=false;
  for(const run of runs){const t=first(run,'a','t');if(!t)continue;const original=t.textContent??'',lo=at,hi=at+original.length;let result=original.slice(0,Math.max(0,Math.min(original.length,begin-lo)));
   if(!inserted&&begin<=hi){result+=insert;inserted=true;}
   result+=original.slice(Math.max(0,Math.min(original.length,end-lo)));t.textContent=result;at=hi;
  }
  if(!inserted){const t=first(runs.at(-1),'a','t');if(t)t.textContent+=insert;}
  return;
 }
 const props=first(p,'a','rPr')?.cloneNode(true);for(const n of children(p))if(n.localName!=='pPr'&&n.localName!=='endParaRPr')p.removeChild(n);
 const end=child(p,'a','endParaRPr'),lines=text.split('\n');lines.forEach((line,i)=>{if(i)p.insertBefore(create(doc,'a','br'),end);const run=create(doc,'a','r');if(props)run.appendChild(props.cloneNode(true));const t=create(doc,'a','t');t.textContent=line;run.appendChild(t);p.insertBefore(run,end);});
}
function setBody(body,text){
 const values=String(text).replace(/\r\n?/g,'\n').split('\n'),paragraphs=children(body,'a','p'),doc=body.ownerDocument;
 for(let i=0;i<values.length;i++){
  let p=paragraphs[i];if(!p){p=(paragraphs.at(-1)??create(doc,'a','p')).cloneNode(true);body.appendChild(p);}setParagraph(p,values[i]);
 }
 for(let i=values.length;i<paragraphs.length;i++)body.removeChild(paragraphs[i]);
}
function setGeometry(node,e,old){
 if(!['x','y','w','h','rotation'].some(k=>e[k]!==old[k]))return;
 if(e.origin?.grouped)throw Error('组合对象坐标只能在PowerPoint中调整');
 let xf=xfrmOf(node);if(!xf){const parent=node.localName==='graphicFrame'?node:ensure(node,'p','spPr');xf=create(node.ownerDocument,node.localName==='graphicFrame'?'p':'a','xfrm');parent.insertBefore(xf,parent.firstChild);}
 const off=ensure(xf,'a','off'),ext=ensure(xf,'a','ext');attr(off,'x',Math.round(e.x*EMU));attr(off,'y',Math.round(e.y*EMU));attr(ext,'cx',Math.round(e.w*EMU));attr(ext,'cy',Math.round(e.h*EMU));if(e.rotation!==old.rotation)attr(xf,'rot',Math.round((e.rotation??0)*60000));
}
function setTextStyle(node,e,old){
 const changed=['fontSize','fontFamily','color','bold','italic','underline','align','valign'].filter(k=>e[k]!==old[k]);if(!changed.length)return;
 const body=textBody(node);if(!body)return;
 for(const p of children(body,'a','p')){
  const pPr=ensure(p,'a','pPr');if(p.firstChild!==pPr)p.insertBefore(pPr,p.firstChild);
  if(changed.includes('align'))attr(pPr,'algn',({left:'l',center:'ctr',right:'r',justify:'just'}[e.align]??'l'));
  let runs=children(p).filter(n=>['r','fld'].includes(n.localName));if(!runs.length){const r=create(node.ownerDocument,'a','r');r.appendChild(create(node.ownerDocument,'a','t'));p.appendChild(r);runs=[r];}
  for(const run of runs){const rp=ensure(run,'a','rPr');if(run.firstChild!==rp)run.insertBefore(rp,run.firstChild);
   if(changed.includes('fontSize'))attr(rp,'sz',Math.round(e.fontSize*100));
   for(const [key,a] of [['bold','b'],['italic','i']])if(changed.includes(key))attr(rp,a,e[key]?1:0);
   if(changed.includes('underline'))attr(rp,'u',e.underline?'sng':'none');
   if(changed.includes('fontFamily')){attr(ensure(rp,'a','latin'),'typeface',e.fontFamily);attr(ensure(rp,'a','ea'),'typeface',e.fontFamily);}
   if(changed.includes('color')){for(const fill of children(rp).filter(n=>['solidFill','gradFill','noFill'].includes(n.localName)))rp.removeChild(fill);const fill=create(node.ownerDocument,'a','solidFill'),rgb=create(node.ownerDocument,'a','srgbClr');attr(rgb,'val',e.color);fill.appendChild(rgb);rp.insertBefore(fill,rp.firstChild);}
  }
 }
 if(changed.includes('valign'))attr(ensure(body,'a','bodyPr'),'anchor',({middle:'ctr',bottom:'b'}[e.valign]??'t'));
}
function setShapeStyle(node,e,old){
 const sp=ensure(node,'p','spPr');
 if(e.fill!==old.fill){for(const f of children(sp).filter(n=>['solidFill','noFill','gradFill','blipFill','pattFill','grpFill'].includes(n.localName)))sp.removeChild(f);const fill=create(node.ownerDocument,'a',e.fill==='none'?'noFill':'solidFill');if(e.fill!=='none'){const rgb=create(node.ownerDocument,'a','srgbClr');rgb.setAttribute('val',e.fill);fill.appendChild(rgb);}sp.appendChild(fill);}
 if(e.stroke!==old.stroke||e.strokeWidth!==old.strokeWidth){const ln=ensure(sp,'a','ln');attr(ln,'w',Math.round((e.strokeWidth??1)*12700));for(const f of children(ln).filter(n=>['solidFill','noFill','gradFill','pattFill'].includes(n.localName)))ln.removeChild(f);const fill=create(node.ownerDocument,'a',e.stroke==='none'?'noFill':'solidFill');if(e.stroke!=='none'){const rgb=create(node.ownerDocument,'a','srgbClr');attr(rgb,'val',e.stroke);fill.appendChild(rgb);}ln.insertBefore(fill,ln.firstChild);}
}
function parseRange(value){
 const m=/^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(value??'');
 if(!m||m[3]!== (m[5]??m[3])||Number(m[6]??m[4])<Number(m[4])||m[1]?.includes('[')||m[2]?.includes('['))return null;
 return {sheet:(m[1]??m[2]).replace(/''/g,"'"),column:m[3],start:Number(m[4]),end:Number(m[6]??m[4])};
}
async function updateWorkbook(zip,path,ranges,series){
 const file=zip.file(path);if(!file)throw Error('图表缺少内嵌数据工作簿');const w=await JSZip.loadAsync(await file.async('nodebuffer'));
 let expanded=0;for(const f of Object.values(w.files)){expanded+=f._data?.uncompressedSize??0;if(expanded>32*1024*1024)throw Error('图表内嵌工作簿过大');}
 const workbook=await xmlPart(w,'xl/workbook.xml'),rels=await relationships(w,'xl/workbook.xml');
 for(let i=0;i<ranges.length;i++){
  const range=parseRange(ranges[i]);if(!range||range.end-range.start+1!==series[i].values.length)throw Error('图表数据公式超出可编辑范围');
  const sheet=all(workbook,'s','sheet').find(s=>val(s,'name')===range.sheet),part=rels.get(sheet?.getAttributeNS(NS.r,'id'))?.path;if(!part)throw Error('图表工作表关系缺失');
  const doc=await xmlPart(w,part),data=first(doc,'s','sheetData');
  for(let n=0;n<series[i].values.length;n++){
   const rowNumber=range.start+n,ref=range.column+rowNumber;let row=children(data,'s','row').find(r=>Number(val(r,'r'))===rowNumber);
   if(!row){row=create(doc,'s','row');attr(row,'r',rowNumber);const next=children(data,'s','row').find(r=>Number(val(r,'r'))>rowNumber);data.insertBefore(row,next??null);}
   let cell=children(row,'s','c').find(c=>val(c,'r')===ref);if(!cell){cell=create(doc,'s','c');attr(cell,'r',ref);row.appendChild(cell);}
   cell.removeAttribute('t');for(const c of children(cell).filter(c=>['v','is','f'].includes(c.localName)))cell.removeChild(c);const v=create(doc,'s','v');v.textContent=String(series[i].values[n]);cell.appendChild(v);
  }
  w.file(part,serialize(doc));
 }
 zip.file(path,await w.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
}
async function patchChart(zip,e){
 const origin=e.origin,doc=await xmlPart(zip,origin.chartPart),series=all(doc,'c','ser');if(series.length!==e.chart.series.length)throw Error('模板图表系列数量不一致');
 for(let i=0;i<series.length;i++){
  const cache=first(child(series[i],'c','val'),'c','numCache')??first(child(series[i],'c','val'),'c','numLit'),pts=children(cache,'c','pt').sort((a,b)=>Number(val(a,'idx'))-Number(val(b,'idx')));
  if(pts.length!==e.chart.series[i].values.length)throw Error('模板图表数据数量不一致');
  pts.forEach((p,n)=>{first(p,'c','v').textContent=String(e.chart.series[i].values[n]);});
 }
 await updateWorkbook(zip,origin.workbookPart,origin.ranges,e.chart.series);zip.file(origin.chartPart,serialize(doc));
}
async function appendRelationship(zip,part,type,target){
 const path=relPart(part),doc=await xmlPart(zip,path)??parseXML(`<Relationships xmlns="${NS.rel}"/>`),used=new Set(all(doc,'rel','Relationship').map(r=>val(r,'Id')));let n=1;while(used.has('rId'+n))n++;
 const r=doc.createElementNS(NS.rel,'Relationship');r.setAttribute('Id','rId'+n);r.setAttribute('Type',NS.r+'/'+type);r.setAttribute('Target',target);doc.documentElement.appendChild(r);zip.file(path,serialize(doc));return 'rId'+n;
}
async function override(zip,part,type){const doc=await xmlPart(zip,'[Content_Types].xml');if(!all(doc,'ct','Override').some(n=>val(n,'PartName')==='/'+part)){const n=doc.createElementNS(NS.ct,'Override');n.setAttribute('PartName','/'+part);n.setAttribute('ContentType',type);doc.documentElement.appendChild(n);zip.file('[Content_Types].xml',serialize(doc));}}
const emptyTree='<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
async function patchNotes(zip,slide,notes){
 if(slide.origin.notesPart){const doc=await xmlPart(zip,slide.origin.notesPart),sp=all(doc,'p','sp').find(s=>val(first(s,'p','ph'),'type')==='body');if(!sp)throw Error('原备注结构无法安全编辑');setBody(textBody(sp),notes);zip.file(slide.origin.notesPart,serialize(doc));return;}
 const presentation=await xmlPart(zip,'ppt/presentation.xml');let masterPart=[...await relationships(zip,'ppt/presentation.xml')].map(([,r])=>r).find(r=>r.type.endsWith('/notesMaster'))?.path;
 if(!masterPart){masterPart='ppt/notesMasters/notesMaster-pptmaker.xml';zip.file(masterPart,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notesMaster xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld><p:spTree>${emptyTree}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle/></p:notesMaster>`);const theme=Object.keys(zip.files).find(p=>/^ppt\/theme\/theme[^/]*\.xml$/.test(p));if(theme)await appendRelationship(zip,masterPart,'theme',posixRelative(masterPart,theme));await override(zip,masterPart,'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml');const rid=await appendRelationship(zip,'ppt/presentation.xml','notesMaster',posixRelative('ppt/presentation.xml',masterPart));let list=first(presentation,'p','notesMasterIdLst');if(!list){list=create(presentation,'p','notesMasterIdLst');presentation.documentElement.insertBefore(list,first(presentation,'p','sldIdLst'));}const id=create(presentation,'p','notesMasterId');id.setAttributeNS(NS.r,'r:id',rid);list.appendChild(id);zip.file('ppt/presentation.xml',serialize(presentation));}
 let n=1;while(zip.file(`ppt/notesSlides/notesSlide-pptmaker-${n}.xml`))n++;const path=`ppt/notesSlides/notesSlide-pptmaker-${n}.xml`;
 const paragraphs=notes.split('\n').map(s=>`<a:p><a:r><a:rPr lang="zh-CN" sz="1200"/><a:t>${xml(s)}</a:t></a:r><a:endParaRPr lang="zh-CN"/></a:p>`).join('');
 zip.file(path,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:cSld><p:spTree>${emptyTree}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`);
 await appendRelationship(zip,path,'notesMaster',posixRelative(path,masterPart));await appendRelationship(zip,path,'slide',posixRelative(path,slide.origin.path));await appendRelationship(zip,slide.origin.path,'notesSlide',posixRelative(slide.origin.path,path));await override(zip,path,'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml');
}
function posixRelative(from,to){const a=from.split('/').slice(0,-1),b=to.split('/');while(a.length&&b.length&&a[0]===b[0]){a.shift();b.shift();}return '../'.repeat(a.length)+b.join('/');}
export async function exportNative(bytes,base,edited){
 const deck=reconcileEdits(base,edited),zip=await openPackage(bytes),touched=new Set(),docs=new Map();
 if(deck.slides.length!==base.slides.length)throw Error('模板保真编辑保留原页数；需要增删页时请新建自由设计演示');
 const get=async path=>{if(!docs.has(path))docs.set(path,await xmlPart(zip,path));return docs.get(path);};
 const originals=new Map(base.slides.map(s=>[s.id,s]));
 for(const slide of deck.slides){
  const prior=originals.get(slide.id);if(!prior)throw Error('模板页面身份不存在');
  const before=new Map(prior.elements.map(e=>[e.id,e]));
  for(const e of slide.elements){
   const old=before.get(e.id);if(JSON.stringify(e)===JSON.stringify(old))continue;
   if(!e.origin||e.locked||e.origin.part!==slide.origin.path)throw Error('不能修改模板继承或只读对象');
   const doc=await get(e.origin.part),node=elementById(doc,e.origin.shapeId);if(!node)throw Error('模板原生对象已不存在');
   if(e.type==='text'){if(e.text!==old.text)setBody(textBody(node),e.text);setTextStyle(node,e,old);setGeometry(node,e,old);}
   else if(e.type==='shape'){setShapeStyle(node,e,old);setGeometry(node,e,old);}
   else if(e.type==='table'){const cells=children(first(node,'a','tbl'),'a','tr').map(r=>children(r,'a','tc'));for(let r=0;r<e.rows.length;r++)for(let c=0;c<e.rows[r].length;c++)if(e.rows[r][c]!==old.rows[r][c])setBody(child(cells[r][c],'a','txBody'),e.rows[r][c]);setGeometry(node,e,old);}
   else if(e.type==='chart'){if(JSON.stringify(e.chart)!==JSON.stringify(old.chart))await patchChart(zip,e);setGeometry(node,e,old);}
   else if(e.type==='image')setGeometry(node,e,old);
   touched.add(e.origin.part);
  }
  if(slide.background!==prior.background){const doc=await get(slide.origin.path),cs=child(doc.documentElement,'p','cSld');let bg=child(cs,'p','bg');if(bg)cs.removeChild(bg);bg=create(doc,'p','bg');const bp=create(doc,'p','bgPr'),fill=create(doc,'a','solidFill'),rgb=create(doc,'a','srgbClr');rgb.setAttribute('val',slide.background);fill.appendChild(rgb);bp.appendChild(fill);bp.appendChild(create(doc,'a','effectLst'));bg.appendChild(bp);cs.insertBefore(bg,cs.firstChild);touched.add(slide.origin.path);}
 }
 for(const part of touched)zip.file(part,serialize(docs.get(part)));
 if(deck.slides.some((s,i)=>s.id!==base.slides[i].id)){
  const doc=await xmlPart(zip,'ppt/presentation.xml'),list=first(doc,'p','sldIdLst'),byId=new Map(children(list,'p','sldId').map(s=>[val(s,'id'),s]));for(const n of children(list,'p','sldId'))list.removeChild(n);for(const s of deck.slides)list.appendChild(byId.get(s.origin.presentationId));zip.file('ppt/presentation.xml',serialize(doc));
 }
 for(const slide of deck.slides)if(slide.notes!==originals.get(slide.id).notes)await patchNotes(zip,slide,slide.notes);
 const types=await xmlPart(zip,'[Content_Types].xml');let converted=false;for(const n of all(types,'ct','Override'))if(val(n,'PartName')==='/ppt/presentation.xml'&&val(n,'ContentType').includes('template.main')){n.setAttribute('ContentType','application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml');converted=true;}if(converted)zip.file('[Content_Types].xml',serialize(types));
 const unchanged=JSON.stringify(deck)===JSON.stringify(base)&&!converted;
 const output=unchanged?Buffer.from(bytes):await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),validation=await inspectPptx(output);
 return {bytes:output,validation,templatePreservation:{unchangedArchive:unchanged,modifiedSlideParts:[...touched],mastersPreserved:true,layoutsPreserved:true,mode:'selective-native-OOXML'}};
}
export function templateSlots(deck){
 return deck.slides.map(s=>({id:s.id,title:s.title,notes:s.notes,slots:s.elements.filter(e=>e.type==='text'&&!e.locked&&e.role!=='footer').map(e=>({id:e.id,text:e.text,maxCharacters:Math.max(12,Math.min(500,Math.floor(e.w*e.h*72*72/(e.fontSize*e.fontSize*1.3)))),fontSize:e.fontSize,role:e.role}))}));
}
