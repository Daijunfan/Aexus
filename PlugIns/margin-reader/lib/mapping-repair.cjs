'use strict';
const S=require('./safety.cjs'),M=require('./study-model.cjs'),D=require('./documents.cjs'),P=require('./excerpt-parts.cjs');
function createRepair(store,renderImage,mediaJobs,isClosed){
 const readImage=(set,id)=>{S.assert(M.UUID.test(id),'INVALID_PARAMS','Invalid immutable image identity.');return store.meta(`study-assets/${set.id}/${id}.png`).then(file=>S.readBounded(file,8*1024*1024));};
 const same=async(expected,actual,regions)=>{const result=await mediaJobs({operation:'compare',expected,actual,...(regions?{regions}:{})});S.assert(result.matches,'IMAGE_MISMATCH','The reconstructed pixels do not match the saved excerpt. Its original image and notes were preserved.');};
 async function prepare(p){
  const state=await store.load(),set=M.findSet(state,p.setId);M.revision(set,p.expectedRevision);
  const cards=p.cardIds?require('./study-organize.cjs').selected(set,p.cardIds,p.descendants===true):set.cards,updates=[],documents=new Map(),skipped=[],unchanged=[];
  for(const card of cards){
   if(!card.source||card.reference||!card.image){unchanged.push(card.id);continue;}
   const values=structuredClone(P.parts(card)),needsPart=values.some(part=>part.source.selection?.rects?.length&&!part.image.fragments?.length),needsTop=values.length>1&&!card.image.tiles?.length||!card.image.fragments?.length&&values.some(part=>part.image.fragments?.length);
   if(!needsPart&&!needsTop){unchanged.push(card.id);continue;}
   try{
    require('./study-notebooks.cjs').guard(set,'study.excerpt.repair',{cardId:card.id});let repaired=0;
    const verified=[];
    for(const part of values){
     if(part.image.fragments?.length||!part.source.selection?.rects?.length)continue;
     try{
      const doc=D.findDocument(state,part.source.documentId);S.assert(doc.kind==='pdf'&&doc.hash===part.source.hash&&!(await D.sourceStatus(store,doc)).changed,'SOURCE_CHANGED','The original PDF changed. Re-select this excerpt before rebuilding its source mapping.');
      const selection=part.source.selection,pdfBytes=doc.virtual?await require('./virtual-document.cjs').bytes(store,state,doc):undefined;
      const rendered=await renderImage({pdfBytes,workspace:store.workspace,filename:doc.path,sourceVersion:doc.sourceVersion,rects:selection.rects,polygon:selection.polygon,bands:selection.bands,text:part.text,title:part.source.title,password:p.password});
      const original=await readImage(set,part.image.fileKey||part.id);await same(original,rendered.bytes);
      part.image.fragments=rendered.fragments;repaired++;verified.push({id:doc.id,hash:doc.hash,sourceVersion:doc.sourceVersion,revision:doc.revision});
     }catch(error){if(!error.code||error.code==='RUNTIME_CLOSED')throw error;skipped.push({cardId:card.id,partId:part.id,code:error.code,message:error.message});}
    }
    if(!repaired&&!needsTop){unchanged.push(card.id);continue;}
    const original=await readImage(set,card.image.fileKey||card.id);let image;
    if(values.length===1){await same(original,await readImage(set,values[0].image.fileKey||values[0].id));image={fragments:values[0].image.fragments||[]};}
    else{
     const rendered=await mediaJobs({operation:'combine',parts:await P.readImages(store,set,values)});
     // Historical outer labels can differ; every embedded immutable image must match.
     await same(original,rendered.bytes,rendered.placements);
     const combined=P.composite(rendered,values);image={fragments:combined.fragments,tiles:combined.tiles};
    }
    updates.push({cardId:card.id,parts:values,image,repairedParts:repaired});for(const doc of verified)documents.set(doc.id,doc);
   }catch(error){if(!error.code||error.code==='RUNTIME_CLOSED')throw error;skipped.push({cardId:card.id,code:error.code,message:error.message});}
  }
  S.assert(!isClosed(),'RUNTIME_CLOSED','Reader closed before repairing excerpt mappings.');
  return {setId:set.id,expectedRevision:set.revision,updates,documents:[...documents.values()],report:{repairedCardIds:updates.map(u=>u.cardId),repairedParts:updates.reduce((n,u)=>n+u.repairedParts,0),unchanged:unchanged.length,skipped}};
 }
 async function apply(state,set,prepared){
  S.assert(!isClosed(),'RUNTIME_CLOSED','Reader closed before repairing excerpt mappings.');M.revision(set,prepared.expectedRevision);
  for(const expected of prepared.documents){const doc=D.findDocument(state,expected.id);S.assert(doc.hash===expected.hash&&doc.sourceVersion===expected.sourceVersion&&doc.revision===expected.revision&&!(await D.sourceStatus(store,doc)).changed,'SOURCE_CHANGED','A source changed during mapping repair. No repair was committed.');}
  for(const patch of prepared.updates){const card=M.card(set,patch.cardId);require('./study-notebooks.cjs').guard(set,'study.excerpt.repair',{cardId:card.id});if(card.excerpts)card.excerpts=patch.parts;Object.assign(card.image,patch.image);card.updatedAt=new Date().toISOString();}
  return prepared.report;
 }
 async function repair(p){
  const prepared=await prepare(p);
  if(prepared.updates.length)await store.transaction(async state=>{const set=M.findSet(state,p.setId);M.revision(set,p.expectedRevision);require('./study-history.cjs').checkpoint(set);await apply(state,set,prepared);M.touch(set);});
  const state=await store.load();return {...await M.describe(store,state,M.findSet(state,p.setId)),mappingRepair:prepared.report};
 }
 return {prepare,apply,repair};
}
module.exports={createRepair};
