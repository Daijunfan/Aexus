'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const S=require('./safety.cjs'),M=require('./study-model.cjs'),D=require('./documents.cjs');
const {parentExists}=require('./files.cjs');
const {createWorkerJobs}=require('./worker-jobs.cjs');
const FORMAT_EXT={html:'.html',md:'.md',opml:'.opml',docx:'.docx',apkg:'.apkg',pdf:'.pdf'};
function createExports(store){
  const jobs=createWorkerJobs(path.join(__dirname,'export-worker.cjs'),{timeout:90000,memory:768});
  async function save(p,operation){
    const rel=S.relative(p.path),target=await S.safePath(store.workspace,rel);await parentExists(store.workspace,rel);
    S.assert(!(await S.exists(target)),'ALREADY_EXISTS','Export destination already exists.');
    return store.transaction(async(state,rollback)=>{
      const result=await operation(state);S.assert(!jobs.closed,'RUNTIME_CLOSED','Reader closed before saving export.');
      const bytes=Buffer.from(result.bytes);S.assert(bytes.length<=256*1024*1024,'TOO_LARGE','Export exceeds 256 MiB.');
      await S.writeNew(target,bytes);rollback(()=>fs.rm(target,{force:true}));
      const {bytes:ignored,...details}=result;return {path:rel,bytes:bytes.length,...details};
    });
  }
  async function study(p){
    S.assert(Object.hasOwn(FORMAT_EXT,p.format)&&p.path.toLowerCase().endsWith(FORMAT_EXT[p.format]),'INVALID_PARAMS','Export filename must match its declared format.');
    S.assert(!(p.format==='apkg'&&path.basename(p.path).toLowerCase()==='collection.apkg'),'INVALID_PARAMS','Use a deck filename other than collection.apkg; a collection package can replace an Anki library.');
    return save(p,async state=>{
      const raw=M.findSet(state,p.setId);if(p.expectedRevision!==undefined)M.revision(raw,p.expectedRevision);
      const set=await M.describe(store,state,raw);let ids;
      if(p.cardIds){S.assert(Array.isArray(p.cardIds)&&p.cardIds.length&&p.cardIds.length<=2000,'INVALID_PARAMS','Select 1–2000 card IDs.');p.cardIds.forEach(id=>M.card(raw,id));ids=new Set(p.cardIds);}
      if(p.rootId){M.card(raw,p.rootId);const branch=M.subtree(raw.cards,p.rootId);ids=new Set(ids?[...ids].filter(id=>branch.has(id)):branch);}
      const filter=p.filter?require('./study-organize.cjs').checkedFilter(p.filter):null;
      set.cards=set.cards.filter(c=>(!ids||ids.has(c.id))&&(!filter||require('./study-organize.cjs').matches(c,filter))&&(!p.reviewOnly||require('./study-review.cjs').enabled(c)));
      S.assert(set.cards.length<=2000,'TOO_LARGE','Export at most 2000 cards per file; use a complete MRPKG for larger studies.');
      if(p.format==='apkg')S.assert(set.cards.reduce((n,c)=>n+require('./study-review.cjs').variants(c).length,0)<=10000,'TOO_LARGE','Export at most 10000 review questions.');
      const available=new Set(set.cards.map(c=>c.id));set.cards.forEach(c=>{if(!available.has(c.parentId))c.parentId=null;});
      let mediaBytes=0;
      const count=bytes=>{mediaBytes+=bytes.length;S.assert(mediaBytes<=128*1024*1024,'TOO_LARGE','Selected export media exceed 128 MiB.');return bytes;};
      for(const card of set.cards){
        card.rich=require('./study-links.cjs').render(state,raw,M.card(raw,card.id));
        if(p.format==='apkg'){const original=M.card(raw,card.id);card.reviewVariants=require('./study-review.cjs').variants(original).map(v=>require('./review-content.cjs').render(state,raw,original,{variantId:v.id}));}
        if(p.includeImages!==false&&card.image)card.imageBytes=count((await require('./study-capture.cjs').cardImage(store,set.id,card.id)).bytes);
        for(const comment of card.comments||[])if(comment.media&&p.includeImages!==false)comment.mediaBytes=count((await require('./study-media.cjs').readMedia(store,set.id,comment.media.id)).bytes);
      }
      const result=await jobs.run({kind:'study',workspace:store.workspace,set,p});
      return {format:p.format,cards:set.cards.length,...result};
    });
  }
  async function document(p){
    S.assert(p.path.toLowerCase().endsWith('.pdf'),'INVALID_PARAMS','Annotated document exports end in .pdf.');
    return save(p,async state=>{
      const doc=D.findDocument(state,p.id);S.assert(doc.kind==='pdf','INVALID_PARAMS','Select a PDF document.');
      S.assert(doc.sourceVersion===p.expectedSourceVersion,'SOURCE_CHANGED','Refresh the source before exporting.');
      const parsed=await D.parsedDocument(store,doc);if(p.pages)S.assert(p.pages.length>0&&p.pages.length<=2000&&p.pages.every(n=>Number.isInteger(n)&&n>=1&&n<=parsed.pageCount),'INVALID_PARAMS','Invalid PDF page selection.');
      S.assert(parsed.pageCount<=2000,'TOO_LARGE','Export up to 2000 source pages.');
      const sets=p.setIds?p.setIds.map(id=>M.findSet(state,id)):Object.values(state.studySets).filter(s=>!s.deletedAt&&s.documentIds.includes(doc.id));
      S.assert(sets.length<=64,'TOO_LARGE','Choose up to 64 annotation collections.');const described=[];
      for(const set of sets)described.push(await M.describe(store,state,set));
      const source=doc.virtual?await require('./virtual-document.cjs').bytes(store,state,doc):await S.readBounded(await S.safePath(store.workspace,doc.path));
      const result=await jobs.run({kind:'document',sourceBytes:source,document:{...doc,foldedPages:doc.foldedPages||[]},sets:described,...p});
      S.assert(!(await D.sourceStatus(store,doc)).changed,'SOURCE_CHANGED','Original changed during export; no PDF was saved.');return {format:'pdf',...result};
    });
  }
  return {study,document,close:()=>jobs.close()};
}
module.exports={createExports};
