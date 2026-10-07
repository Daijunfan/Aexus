'use strict';
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const S=require('./safety.cjs'),M=require('./study-model.cjs'),D=require('./documents.cjs'),P=require('./excerpt-parts.cjs');
const {createWorkerJobs}=require('./worker-jobs.cjs');
function createEditor(store,renderImage,validateSelection){
  const jobs=createWorkerJobs(path.join(__dirname,'media-worker.cjs'),{timeout:30000,memory:256});
  const combine=parts=>parts.length===1?Promise.resolve({...parts[0],kind:'single'}):jobs.run({operation:'combine',parts});
  async function save(method,p){
    S.assert(typeof p.captureId==='string'&&M.UUID.test(p.captureId),'INVALID_PARAMS','Supply a unique capture UUID for idempotent editing.');
    S.assert(p.text.length<=12000,'INVALID_PARAMS','Select at most 12000 text characters.');
    const hash=P.fingerprint(method,p),initial=await store.load(),set=M.findSet(initial,p.setId),duplicate=P.repeated(set,p,hash);if(duplicate)return duplicate;
    M.revision(set,p.expectedRevision);const old=M.card(set,p.cardId);require('./study-notebooks.cjs').guard(set,method,p);S.assert(old.source&&!old.reference,'INVALID_PARAMS','Select a source excerpt card.');
    const previous=P.parts(old);S.assert(method!=='study.excerpt.append'||previous.length<32,'TOO_LARGE','At most 32 excerpts per card.');
    const index=method==='study.excerpt.append'?previous.length:previous.findIndex(part=>part.id===(p.partId||previous[0].id));S.assert(index>=0,'NOT_FOUND','Excerpt part no longer exists.');
    S.assert(set.documentIds.includes(p.documentId),'NOT_MEMBER','Add the source document before editing its excerpt.');
    const doc=D.findDocument(initial,p.documentId);S.assert(doc.sourceVersion===p.expectedSourceVersion,'SOURCE_CHANGED','Refresh the changed source before selecting it.');
    const parsed=await D.parsedDocument(store,doc),locator=require('./outline.cjs').validateLocator(p.locator,parsed),selection=validateSelection(p.selection||{},parsed,locator,p.text);
    S.assert(p.text.trim()||selection.rects?.length,'INVALID_PARAMS','Select text or a PDF area.');
    const pdfBytes=doc.virtual?await require('./virtual-document.cjs').bytes(store,initial,doc):undefined;
    const rendered=await renderImage({pdfBytes,workspace:store.workspace,filename:doc.path,sourceVersion:doc.sourceVersion,rects:selection.rects,polygon:selection.polygon,bands:selection.bands,text:p.text,title:doc.title,password:p.password});
    const notebook=require('./study-notebooks.cjs').active(set,doc.id);require('./study-notebooks.cjs').editable(set,{documentId:doc.id,notebookId:notebook.id});
    const source={documentId:doc.id,notebookId:notebook.id,path:doc.path,title:doc.title,format:doc.format,hash:doc.hash,sourceVersion:doc.sourceVersion,locator,selection,...(doc.virtual?{virtualSources:require('./virtual-document.cjs').canonicalSources(initial,doc,selection)}:{})};
    const partId=method==='study.excerpt.append'?randomUUID():previous[index].id;
    const remaining=await P.readImages(store,set,previous);const newPicture={bytes:Buffer.from(rendered.bytes),label:doc.title};
    if(method==='study.excerpt.append')remaining.push(newPicture);else remaining[index]=newPicture;
    const picture=remaining.length===1?rendered:await jobs.run({operation:'combine',parts:remaining});
    return store.transaction(async(state,rollback)=>{
      S.assert(!jobs.closed,'RUNTIME_CLOSED','Reader closed before saving excerpt changes.');
      const fresh=M.findSet(state,p.setId),again=P.repeated(fresh,p,hash);if(again)return again;M.revision(fresh,p.expectedRevision);
      const current=M.card(fresh,p.cardId),document=D.findDocument(state,p.documentId);S.assert(fresh.documentIds.includes(doc.id),'NOT_MEMBER','Document was removed from this study.');
      S.assert(document.sourceVersion===p.expectedSourceVersion&&!(await D.sourceStatus(store,document)).changed,'SOURCE_CHANGED','Source changed during selection capture.');
      const values=structuredClone(P.parts(current)),part={id:partId,captureId:p.captureId,source,text:p.text,image:await P.saveImage(store,fresh,rendered,rollback)};
      if(method==='study.excerpt.append')values.push(part);else values[index]=part;
      const image=values.length===1?part.image:await P.saveImage(store,fresh,P.composite(picture,values),rollback);
      require('./study-history.cjs').checkpoint(fresh);P.apply(current,values,image,fresh);P.record(fresh,p,hash,current.id,partId);M.touch(fresh);
      return {setId:fresh.id,revision:fresh.revision,card:current,partId,duplicate:false};
    });
  }
  async function remove(p){
    return store.transaction(async(state,rollback)=>{
      const set=M.findSet(state,p.setId);M.revision(set,p.expectedRevision);const card=M.card(set,p.cardId),values=structuredClone(P.parts(card));require('./study-notebooks.cjs').guard(set,'study.excerpt.remove',p);
      const at=values.findIndex(part=>part.id===p.partId);S.assert(at>=0,'NOT_FOUND','Excerpt part no longer exists.');S.assert(values.length>1,'INVALID_PARAMS','Keep at least one excerpt; cancel the annotation or delete the card instead.');
      values.splice(at,1);let picture;
      if(values.length===1)picture=values[0].image;
      else picture=await P.saveImage(store,set,P.composite(await jobs.run({operation:'combine',parts:await P.readImages(store,set,values)}),values),rollback);
      require('./study-history.cjs').checkpoint(set);P.apply(card,values,picture,set);M.touch(set);
      return {setId:set.id,revision:set.revision,card,partId:p.partId};
    });
  }
  return {save,remove,mediaJobs:args=>jobs.run(args),close:()=>jobs.close()};
}
module.exports={createEditor};
