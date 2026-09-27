'use strict';
const fs=require('node:fs/promises');
const {PDFDocument,degrees,rgb}=require('pdf-lib');
const {assert,safePath,relative,readBounded,writeNew,exists}=require('./safety.cjs');
const {findDocument,sourceStatus,openDocument}=require('./documents.cjs');
const {parentExists}=require('./files.cjs');
async function compose(store,p){
 const pages=p.pages;assert(Array.isArray(pages)&&pages.length>0&&pages.length<=2000,'INVALID_PARAMS','Choose 1–2000 pages.');
 const rel=relative(p.path);assert(rel.toLowerCase().endsWith('.pdf'),'INVALID_PARAMS','Destination must end in .pdf.');
 await store.transaction(async(state,rollback)=>{
  const file=await safePath(store.workspace,rel);await parentExists(store.workspace,rel);assert(!(await exists(file)),'ALREADY_EXISTS','Choose a new document filename.');
  const output=await PDFDocument.create(),loaded=new Map();
  for(const spec of pages){
   assert(spec&&typeof spec==='object'&&!Array.isArray(spec),'INVALID_PARAMS','Invalid page specification.');let page;
   assert(spec.blank===undefined||spec.blank===true,'INVALID_PARAMS','blank must be true when provided.');
   if(spec.blank){
    const w=spec.width??595.28,h=spec.height??841.89;assert(Number.isFinite(w)&&Number.isFinite(h)&&w>=100&&h>=100&&w<=3000&&h<=3000,'INVALID_PARAMS','Blank paper size is out of range.');
    assert(['plain','lined','grid'].includes(spec.paper||'plain'),'INVALID_PARAMS','Unknown paper style.');page=output.addPage([w,h]);
    if(spec.paper==='lined'||spec.paper==='grid')for(let y=24;y<h;y+=24)page.drawLine({start:{x:0,y},end:{x:w,y},thickness:.4,color:rgb(.82,.86,.9)});
    if(spec.paper==='grid')for(let x=24;x<w;x+=24)page.drawLine({start:{x,y:0},end:{x,y:h},thickness:.4,color:rgb(.82,.86,.9)});
   }else{
    const doc=findDocument(state,spec.documentId);assert(doc.kind==='pdf','INVALID_PARAMS','Source must be PDF.');
    assert(spec.expectedSourceVersion===doc.sourceVersion&&!(await sourceStatus(store,doc)).changed,'SOURCE_CHANGED','Source changed; refresh before composing pages.');
    if(!loaded.has(doc.id))loaded.set(doc.id,await PDFDocument.load(await readBounded(await safePath(store.workspace,doc.path))));
    const source=loaded.get(doc.id);assert(Number.isInteger(spec.page)&&spec.page>=1&&spec.page<=source.getPageCount(),'INVALID_LOCATOR','Source page is out of range.');
    [page]=await output.copyPages(source,[spec.page-1]);output.addPage(page);
    if(spec.crop){const c=spec.crop,b=page.getCropBox();assert(['x','y','width','height'].every(k=>Number.isFinite(c[k]))&&c.x>=0&&c.y>=0&&c.width>0&&c.height>0&&c.x+c.width<=1&&c.y+c.height<=1,'INVALID_PARAMS','Crop must fit within the source crop box.');page.setCropBox(b.x+c.x*b.width,b.y+(1-c.y-c.height)*b.height,c.width*b.width,c.height*b.height);}
   }
   if(spec.rotation!==undefined){assert([0,90,180,270].includes(spec.rotation),'INVALID_PARAMS','Rotation must be 0, 90, 180 or 270.');page.setRotation(degrees((page.getRotation().angle+spec.rotation)%360));}
  }
  for(const id of loaded.keys())assert(!(await sourceStatus(store,findDocument(state,id))).changed,'SOURCE_CHANGED','Source changed during composition.');
  output.setTitle(p.title||rel.split('/').at(-1).replace(/\.pdf$/i,''));output.setProducer('Margin Reader');
  const bytes=await output.save();assert(bytes.length<=512*1024*1024,'TOO_LARGE','Composed PDF exceeds 512 MiB.');await writeNew(file,Buffer.from(bytes));rollback(()=>fs.rm(file,{force:true}));
 });
 try{return await openDocument(store,{path:rel,activate:p.activate});}catch(e){e.details={...e.details,savedPath:rel};throw e;}
}
module.exports={compose};
