'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PDFDocument,degrees,rgb}=require('pdf-lib');
const S=require('./safety.cjs'),D=require('./documents.cjs'),R=require('./page-reference.cjs');
const methods=new Set(['document.virtual.create','document.virtual.update','document.virtual.refresh','document.virtual.source']);
async function dependencies(store,state,recipe){
 const status=[];for(const id of new Set(recipe.pages.filter(p=>!p.blank).map(p=>p.documentId))){const doc=state.documents[id];let st=null;try{if(doc&&!doc.trashed)st=await S.exists(await S.safePath(store.workspace,doc.path));}catch{}
  status.push({id,path:doc?.path||null,available:Boolean(st?.isFile()),changed:!doc||doc.trashed||!st?.isFile()||S.version(st)!==doc.sourceVersion||recipe.pages.some(p=>p.documentId===id&&p.sourceHash!==doc.hash)});
 }return status;
}
async function status(store,doc){const state=await store.load();return dependencies(store,state,doc.virtual);}
async function normalize(store,state,input,{guard=false}={}){
 S.assert(input&&input.schema==='margin-reader.virtual/v1'&&Array.isArray(input.pages)&&input.pages.length>0&&input.pages.length<=2000,'INVALID_DOCUMENT','A virtual collection needs 1–2000 page references.');
 S.assert(input.includeAnnotations===undefined||typeof input.includeAnnotations==='boolean','INVALID_DOCUMENT','includeAnnotations must be boolean.');
 const title=String(input.title||'Virtual document').trim();S.assert(title&&title.length<=200,'INVALID_PARAMS','Virtual title needs 1–200 characters.');
 const pages=[],seen=new Set();
 for(const raw of input.pages){
  S.assert(raw&&typeof raw==='object'&&!Array.isArray(raw),'INVALID_PARAMS','Invalid page reference.');
  let id=typeof raw.id==='string'&&/^[0-9a-f-]{36}$/.test(raw.id)?raw.id:randomUUID();if(seen.has(id))id=randomUUID();seen.add(id);
  S.assert(raw.blank===undefined||raw.blank===true,'INVALID_PARAMS','blank must be true when supplied.');
  if(raw.blank){const width=raw.width||595.28,height=raw.height||841.89;S.assert(Number.isFinite(width)&&Number.isFinite(height)&&width>=100&&height>=100&&width<=3000&&height<=3000&&['plain','lined','grid','dots'].includes(raw.paper||'plain'),'INVALID_PARAMS','Invalid blank page specification.');pages.push({id,blank:true,width,height,paper:raw.paper||'plain'});continue;}
  const doc=D.findDocument(state,raw.documentId);S.assert(doc.kind==='pdf','INVALID_PARAMS','Virtual collections contain PDF pages.');
  if(guard)S.assert(raw.expectedSourceVersion===doc.sourceVersion,'SOURCE_CHANGED','Supply the latest version for every source document.');
  S.assert(!(await D.sourceStatus(store,doc)).changed,'SOURCE_CHANGED','Reopen the changed source before assembling it.');
  const parsed=await D.parsedDocument(store,doc);S.assert(Number.isInteger(raw.page)&&raw.page>=1&&raw.page<=parsed.pageCount,'INVALID_LOCATOR','Virtual source page is out of range.');
  const rotation=raw.rotation??0;S.assert([0,90,180,270].includes(rotation),'INVALID_PARAMS','Use 0, 90, 180 or 270 degree rotation.');
  let spec={id,documentId:doc.id,page:raw.page,crop:R.crop(raw.crop),rotation,sourceHash:doc.hash};
  if(doc.virtual){const parent=doc.virtual.pages[raw.page-1];if(parent.blank){S.assert(!raw.crop&&!rotation,'INVALID_PARAMS','Crop blank virtual paper after exporting it as a PDF.');pages.push({...parent,id});continue;}
    const c=R.bounds(R.corners(spec.crop).map(p=>R.toSource(p,parent)));spec={...parent,id,crop:c,rotation:((parent.rotation||0)+rotation)%360};
  }
  pages.push(spec);
 }
 return {schema:'margin-reader.virtual/v1',title,pages,includeAnnotations:input.includeAnnotations!==false};
}
async function render(store,state,recipe){
 const out=await PDFDocument.create(),loaded=new Map();out.setCreationDate(new Date('2000-01-01T00:00:00Z'));out.setModificationDate(new Date('2000-01-01T00:00:00Z'));out.setTitle(recipe.title);out.setProducer('Margin Reader virtual page renderer');
 const states=await dependencies(store,state,recipe);S.assert(states.every(s=>s.available&&!s.changed),'SOURCE_CHANGED','A referenced original changed or is unavailable. Refresh the virtual collection explicitly.');
 for(const spec of recipe.pages){
  if(spec.blank){const page=out.addPage([spec.width,spec.height]),w=spec.width,h=spec.height,ink=rgb(.82,.86,.9);
    if(['lined','grid'].includes(spec.paper))for(let y=24;y<h;y+=24)page.drawLine({start:{x:0,y},end:{x:w,y},thickness:.4,color:ink});
    if(spec.paper==='grid')for(let x=24;x<w;x+=24)page.drawLine({start:{x,y:0},end:{x,y:h},thickness:.4,color:ink});
    if(spec.paper==='dots')for(let y=20;y<h;y+=20)for(let x=20;x<w;x+=20)page.drawCircle({x,y,size:.65,color:ink});continue;
  }
  const doc=D.findDocument(state,spec.documentId);if(!loaded.has(doc.id))loaded.set(doc.id,await PDFDocument.load(await S.readBounded(await S.safePath(store.workspace,doc.path))));
  const original=loaded.get(doc.id);S.assert(spec.page>=1&&spec.page<=original.getPageCount(),'INVALID_LOCATOR','A referenced page was removed.');const [page]=await out.copyPages(original,[spec.page-1]);out.addPage(page);
  const box=page.getCropBox(),angle=(page.getRotation().angle%360+360)%360;
  const c=R.bounds(R.corners(spec.crop).map(point=>R.rotate(point,360-angle)));
  page.setCropBox(box.x+c.x*box.width,box.y+(1-c.y-c.height)*box.height,c.width*box.width,c.height*box.height);page.setRotation(degrees((angle+spec.rotation)%360));
 }
 S.assert((await dependencies(store,state,recipe)).every(s=>!s.changed),'SOURCE_CHANGED','Original changed during virtual rendering.');
 const bytes=Buffer.from(await out.save());S.assert(bytes.length<=256*1024*1024,'TOO_LARGE','Virtual PDF render exceeds 256 MiB. Select fewer pages.');return bytes;
}
async function bytes(store,state,doc){
 S.assert(doc.virtual,'INVALID_PARAMS','Choose a linked virtual document.');S.assert(!(await D.sourceStatus(store,doc)).changed,'SOURCE_CHANGED','Refresh this virtual document before reading it.');
 const file=await store.meta(`cache/${doc.cacheKey}.pdf`);let data=await S.readBounded(file,256*1024*1024).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(!data){data=await render(store,state,doc.virtual);await S.atomicWrite(file,data);}return data;
}
function layoutSnapshot(doc){return {recipe:structuredClone(doc.virtual),foldedPages:structuredClone(doc.foldedPages||[]),foldRegions:structuredClone(doc.foldRegions||[]),position:structuredClone(doc.position),hash:doc.hash};}
async function save(store,p,input,{create=false,history=true,action='replace',restoreLayout}={}){
 const rel=S.relative(p.path),file=await S.safePath(store.workspace,rel);S.assert(rel.toLowerCase().endsWith('.mrv'),'INVALID_PARAMS','Virtual reference files end in .mrv.');await require('./files.cjs').parentExists(store.workspace,rel);
 const initial=await store.load(),old=p.id?D.findDocument(initial,p.id):Object.values(initial.documents).find(d=>!d.trashed&&d.path===rel);if(p.id)S.assert(old.virtual,'INVALID_PARAMS','Choose a virtual document.');
 if(p.expectedRevision!==undefined)S.assert(old?.revision===p.expectedRevision,'CONFLICT','Virtual document changed. Refresh before editing.');
 const original=await S.exists(file);if(create)S.assert(!original,'ALREADY_EXISTS','Choose a new virtual document path.');else S.assert(original?.isFile(),'NOT_FOUND','Virtual reference file does not exist.');
 if(action==='undo'||action==='redo')S.assert((await dependencies(store,initial,input)).every(s=>!s.changed),'SOURCE_CHANGED','Historical source content changed; old page coordinates were not applied.');
 const recipe=await normalize(store,initial,input,{guard:create||p.guarded===true}),pdf=await render(store,initial,recipe),parsed=await require('./parse.cjs').parseInWorker(store,{bytes:pdf,filename:'virtual.pdf'});
 parsed.title=recipe.title;parsed.format='mrv';parsed.toc=recipe.pages.map((spec,i)=>({id:spec.id,parentId:null,title:spec.blank?`Blank ${i+1}`:`${D.findDocument(initial,spec.documentId).title} · ${spec.page}`,locator:{page:i+1},source:'original'}));
 const encoded=Buffer.from(JSON.stringify(recipe,null,2)),hash=S.digest(encoded),id=old?.id||randomUUID(),cacheKey=`${id}-${hash}`;
 return store.transaction(async(state,rollback)=>{
  const current=old?D.findDocument(state,old.id):null;if(old)S.assert(current.revision===old.revision,'CONFLICT','Virtual collection changed while rendering.');
  if(original)S.assert(S.version(await fs.stat(await S.safePath(store.workspace,rel)))===S.version(original),'CONFLICT','Virtual reference file changed during rendering.');
  S.assert((await dependencies(store,state,recipe)).every(s=>!s.changed),'SOURCE_CHANGED','A referenced source changed while preparing the collection.');
  if(create){await S.writeNew(file,encoded);rollback(()=>fs.rm(file,{force:true}));}
  else{const prior=await S.readBounded(file,4*1024*1024);if(!prior.equals(encoded)){await S.atomicWrite(file,encoded);rollback(()=>S.atomicWrite(file,prior));}}
  await S.atomicWrite(await store.meta(`cache/${cacheKey}.json`),JSON.stringify(parsed));await S.atomicWrite(await store.meta(`cache/${cacheKey}.pdf`),pdf);
  const now=new Date().toISOString();const doc={...current,id,path:rel,title:current?.customTitle?current.title:recipe.title,format:'mrv',kind:'pdf',hash,cacheKey,sourceVersion:S.version(await fs.stat(file)),revision:(current?.revision||0)+1,virtual:recipe,position:current?.position||{page:1},toc:current?.customOutline?current.toc:parsed.toc,customOutline:current?.customOutline||false,bookmarks:current?.bookmarks||[],foldedPages:[],foldRegions:[],createdAt:current?.createdAt||now,updatedAt:now};
  const priorLayout=restoreLayout||current;
  if(priorLayout){
    const oldRecipe=priorLayout.recipe||priorLayout.virtual,oldPages=oldRecipe?.pages||[],identity=spec=>JSON.stringify(Object.fromEntries(Object.entries(spec).filter(([key])=>key!=='id'))),positions=new Map();
    oldPages.forEach((oldPage,i)=>{const index=recipe.pages.findIndex(next=>next.id===oldPage.id&&identity(next)===identity(oldPage));if(index>=0)positions.set(i+1,index+1);});
    doc.foldedPages=(priorLayout.foldedPages||[]).map(page=>positions.get(page)).filter(Boolean);
    doc.foldRegions=(priorLayout.foldRegions||[]).map(region=>positions.has(region.page)&&region.sourceHash===priorLayout.hash?{...region,page:positions.get(region.page),sourceHash:hash}:region);
    const oldPosition=priorLayout.position;if(oldPosition&&positions.has(oldPosition.page))doc.position={...oldPosition,page:positions.get(oldPosition.page)};
  }
  if(doc.position.page>parsed.pageCount)doc.position={page:parsed.pageCount};
  doc.virtualHistory=structuredClone(current?.virtualHistory||{undo:[],redo:[]});
  if(history&&current){doc.virtualHistory.undo.push(layoutSnapshot(current));doc.virtualHistory.undo=doc.virtualHistory.undo.slice(-30);doc.virtualHistory.redo=[];}
  if(action==='undo'||action==='redo'){const other=action==='undo'?'redo':'undo';doc.virtualHistory[other].push(layoutSnapshot(current));doc.virtualHistory[action].pop();}
  state.documents[id]=doc;if(p.activate!==false){state.settings.lastDocument=id;state.settings.openDocuments=[...new Set([...(state.settings.openDocuments||[]),id])].slice(-(state.settings.tabLimit||20));}
  return D.descriptor(doc,parsed);
 });
}
async function open(store,p){
 const rel=S.relative(p.path),file=await S.safePath(store.workspace,rel),data=await S.readBounded(file,4*1024*1024);let input;try{input=JSON.parse(data.toString('utf8'));}catch{S.fail('INVALID_DOCUMENT','Virtual reference file is not valid JSON.');}
 const state=await store.load(),existing=Object.values(state.documents).find(d=>!d.trashed&&d.path===rel);
 if(existing?.virtual&&!p.refresh&&!(await D.sourceStatus(store,existing)).changed){const parsed=await D.parsedDocument(store,existing);if(p.activate===false)return D.descriptor(existing,parsed);return store.transaction(async fresh=>{const doc=D.findDocument(fresh,existing.id);fresh.settings.lastDocument=doc.id;fresh.settings.openDocuments=[...new Set([...(fresh.settings.openDocuments||[]),doc.id])].slice(-(fresh.settings.tabLimit||20));return D.descriptor(doc,parsed);});}
 S.assert(input?.schema==='margin-reader.virtual/v1'&&Array.isArray(input.pages),'INVALID_DOCUMENT','Not a linked virtual document.');
 for(const id of new Set(input.pages.filter(s=>!s.blank).map(s=>s.documentId))){const d=D.findDocument(await store.load(),id);if((await D.sourceStatus(store,d)).changed)await D.openDocument(store,{path:d.path,activate:false});}
 return save(store,{...p,path:rel,id:existing?.id},input,{history:false});
}
async function request(store,method,p){
 if(method==='document.virtual.create')return save(store,p,{schema:'margin-reader.virtual/v1',title:p.title||path.basename(p.path,'.mrv'),pages:p.pages,includeAnnotations:p.includeAnnotations},{create:true});
 const state=await store.load(),doc=D.findDocument(state,p.id);S.assert(doc.virtual,'INVALID_PARAMS','This document is not a virtual page collection.');
 if(method==='document.virtual.source'){
  S.assert(Number.isInteger(p.page)&&p.page>0&&p.page<=doc.virtual.pages.length,'INVALID_LOCATOR','Virtual page is out of range.');const spec=doc.virtual.pages[p.page-1];if(spec.blank)return {blank:true,page:p.page};
  S.assert(p.point===undefined||Array.isArray(p.point)&&p.point.length===2&&p.point.every(n=>Number.isFinite(n)&&n>=0&&n<=1),'INVALID_PARAMS','Point must be a normalized coordinate pair.');const source=D.findDocument(state,spec.documentId),point=R.toSource(p.point||[0,0],spec);S.assert(Array.isArray(point)&&point.length===2&&point.every(n=>Number.isFinite(n)&&n>=0&&n<=1),'INVALID_PARAMS','Point must lie inside the virtual page.');
  return {documentId:source.id,path:source.path,locator:{page:spec.page,pageOffset:point[1]},sourceChanged:source.hash!==spec.sourceHash||(await D.sourceStatus(store,source)).changed,recipe:spec};
 }
 S.assert(p.expectedRevision===doc.revision,'CONFLICT','Virtual collection changed. Refresh before changing it.');
 if(method==='document.virtual.refresh')return open(store,{...p,path:doc.path,refresh:true,activate:p.activate});
 const action=p.action||'replace';let input={...doc.virtual,...(p.title?{title:p.title}:{}),...(p.includeAnnotations!==undefined?{includeAnnotations:p.includeAnnotations}:{})};
 if(action==='undo'||action==='redo'){const prior=doc.virtualHistory?.[action]?.at(-1);S.assert(prior,'NOT_FOUND','No virtual-page history in this direction.');input=prior.recipe||prior;return save(store,{...p,path:doc.path},input,{history:false,action,restoreLayout:prior.recipe?prior:undefined});}
 if(p.pages){S.assert(Array.isArray(p.pages),'INVALID_PARAMS','Page references must be an array.');input.pages=action==='append'?[...doc.virtual.pages,...p.pages]:p.pages;}
 return save(store,{...p,path:doc.path,guarded:false},input);
}
function canonicalSources(state,doc,selection){
 if(!doc.virtual)return undefined;const groups=new Map();
 for(const rect of selection.rects||[]){const spec=doc.virtual.pages[rect.page-1];if(!spec||spec.blank)continue;const original=D.findDocument(state,spec.documentId);let source=groups.get(original.id);if(!source){source={documentId:original.id,path:original.path,title:original.title,format:original.format,hash:original.hash,sourceVersion:original.sourceVersion,locator:{page:spec.page},selection:{rects:[]}};groups.set(original.id,source);}source.selection.rects.push(R.toSourceRect(rect,spec));}
 if(selection.polygon){const spec=doc.virtual.pages[selection.polygon.page-1],source=spec&&!spec.blank&&groups.get(spec.documentId);if(source)source.selection.polygon={page:spec.page,points:selection.polygon.points.map(p=>R.toSource(p,spec))};}
 for(const source of groups.values()){const first=[...source.selection.rects].sort((a,b)=>a.page-b.page||a.y-b.y)[0];source.locator={page:first.page,pageOffset:first.y};}
 return [...groups.values()];
}
function projector(state,set,known){
 const targetDocs=new Set(set.documentIds),index=new Map();
 for(const id of set.documentIds){const doc=state.documents[id];if(!doc?.virtual||doc.virtual.includeAnnotations===false)continue;doc.virtual.pages.forEach((spec,i)=>{if(spec.blank)return;const key=`${spec.documentId}/${spec.page}`;if(!index.has(key))index.set(key,[]);index.get(key).push({document:doc,spec,page:i+1});});}
 return card=>{
  const parts=require('./excerpt-parts.cjs').parts(card),locations=[];
  for(const part of parts){
   const direct=part.source,directDoc=state.documents[direct.documentId];
   if(directDoc?.virtual&&directDoc.hash===direct.hash&&targetDocs.has(directDoc.id))locations.push({partId:part.id,source:direct,sourceChanged:Boolean(known.get(directDoc.id)?.sourceChanged)});
   for(const source of direct.virtualSources?.length?direct.virtualSources:[direct]){
    if(state.documents[source.documentId]?.virtual)continue;
    const d=known.get(source.documentId),changed=!d||d.sourceChanged||d.hash!==source.hash;
    if(targetDocs.has(source.documentId))locations.push({partId:part.id,source,sourceChanged:changed});
    const grouped=new Map();for(const rect of source.selection?.rects||[])for(const target of index.get(`${source.documentId}/${rect.page}`)||[]){if(target.document.id===direct.documentId&&directDoc?.hash===direct.hash)continue;const transformed=R.projectRect(rect,target.spec,target.page);if(!transformed)continue;
      const key=target.document.id+(source.selection.polygon?'/'+target.page:'');const polygon=source.selection.polygon?R.projectPolygon(source.selection.polygon.points,target.spec):null;if(polygon&&polygon.length<3)continue;
      if(!grouped.has(key))grouped.set(key,{partId:part.id,source:{...source,documentId:target.document.id,hash:target.document.hash,locator:{page:target.page,pageOffset:transformed.y},selection:{rects:[],...(polygon?{polygon:{page:target.page,points:polygon}}:{})}},sourceChanged:changed||target.spec.sourceHash!==source.hash||Boolean(known.get(target.document.id)?.sourceChanged)});
      grouped.get(key).source.selection.rects.push(transformed);
    }
    locations.push(...grouped.values());
   }
  }
  return locations;
 };
}
module.exports={methods,request,open,bytes,status,render,normalize,dependencies,canonicalSources,projector};
