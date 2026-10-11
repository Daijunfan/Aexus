'use strict';
const fs=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
const M=require('./study-model.cjs'),S=require('./safety.cjs'),D=require('./documents.cjs');
function parts(card){return card.excerpts?.length?card.excerpts:card.source?[{id:card.id,source:card.source,text:card.text,image:{...card.image,fileKey:card.image?.fileKey||card.id}}]:[];}
async function list(store,p){
  const state=await store.load(),set=M.findSet(state,p.setId),card=M.card(set,p.cardId),rows=[];
  for(const part of parts(card)){const doc=state.documents[part.source.documentId],status=doc&&!doc.trashed?await D.sourceStatus(store,doc).catch(()=>null):null;
    rows.push({...part,sourceAvailable:Boolean(status?.st?.isFile()),sourceChanged:!status||status.changed||doc.hash!==part.source.hash,path:doc?.path||part.source.path});
  }
  return {setId:set.id,cardId:card.id,revision:set.revision,parts:rows};
}
function fingerprint(method,p){return S.digest(JSON.stringify([method,p.cardId,p.partId||null,p.documentId||null,p.expectedSourceVersion||null,p.locator||null,p.selection||null,p.text||'']));}
function repeated(set,p,hash){
  const previous=set.captureRequests?.[p.captureId];if(!previous)return null;
  S.assert(previous.fingerprint===hash,'CONFLICT','This capture ID was used for a different operation.');
  const card=M.card(set,previous.cardId);
  S.assert(parts(card).some(part=>part.id===previous.partId&&part.captureId===p.captureId),'CONFLICT','The prior capture was removed or undone. Start a new selection.');
  return {setId:set.id,revision:set.revision,card,partId:previous.partId,duplicate:true};
}
function record(set,p,hash,cardId,partId){
  set.captureRequests??={};S.assert(Object.keys(set.captureRequests).length<10000,'TOO_LARGE','Capture request journal is full. Create another study set.');
  set.captureRequests[p.captureId]={fingerprint:hash,cardId,partId};
}
async function readImages(store,set,values){
  const rows=[];
  for(const part of values){const key=part.image.fileKey;S.assert(M.UUID.test(key),'INVALID_PARAMS','Invalid immutable image reference.');rows.push({bytes:await S.readBounded(await store.meta(`study-assets/${set.id}/${key}.png`),8*1024*1024),label:part.source.title+(part.source.locator.page?' · p. '+part.source.locator.page:'')});}
  return rows;
}
async function saveImage(store,set,rendered,rollback){
  const fileKey=randomUUID();await store.mkdir(`study-assets/${set.id}`);const file=await store.meta(`study-assets/${set.id}/${fileKey}.png`);
  await S.writeNew(file,Buffer.from(rendered.bytes));rollback(()=>fs.rm(file,{force:true}));
  return {...(rendered.fragments?{fragments:rendered.fragments}:{}),...(rendered.tiles?{tiles:rendered.tiles}:{}),kind:rendered.kind||'composite',mimeType:'image/png',width:rendered.width,height:rendered.height,fileKey};
}
function apply(card,values,image,set){
  S.assert(values.length>0&&values.length<=32,'INVALID_PARAMS','A card needs 1–32 excerpt parts.');
  const text=values.map(p=>p.text).filter(Boolean).join('\n\n');S.assert(text.length<=20000,'TOO_LARGE','Combined excerpt text exceeds 20000 characters.');
  if(set)require('./image-marks.cjs').remap(card,set,mappings(card,values,image));
  card.excerpts=values;card.source=values[0].source;card.text=text;card.image=image;card.updatedAt=new Date().toISOString();
}
const key=t=>`${t.partId}/${t.captureId||''}`;
const identity=part=>({partId:part.id,captureId:part.captureId||null});
function fragments(image,source,origin){return (image.fragments||[]).map(f=>({...f,documentId:f.documentId||source.documentId,sourceHash:f.sourceHash||source.hash,notebookId:f.notebookId||source.notebookId||'default',origin:f.origin||origin}));}
function composite(rendered,values){
 S.assert(rendered.placements?.length===values.length,'CAPTURE_FAILED','Missing composite image layout.');
 const marks=require('./image-marks.cjs'),tiles=values.map((part,i)=>({...identity(part),image:rendered.placements[i]}));
 return {...rendered,tiles,fragments:values.flatMap((part,i)=>fragments(part.image,part.source,identity(part)).map(f=>({...f,image:marks.project(f.image,{to:rendered.placements[i]})})))};
}
function mappings(card,values,image){
 const marks=require('./image-marks.cjs'),oldParts=parts(card),oldTiles=card.image.tiles||[{...identity(oldParts[0]),image:marks.unit}],newTiles=image.tiles||[{...identity(values[0]),image:marks.unit}],matched=new Set(),maps=[];
 for(const a of oldTiles)for(const b of newTiles)if(key(a)===key(b)){maps.push({from:a.image,to:b.image});matched.add(key(a));}
 // A revised PDF selection can still cover the same original page region.
 const old=fragments(card.image,card.source,identity(oldParts[0])).filter(f=>!matched.has(key(f.origin))),next=fragments(image,values[0].source,identity(values[0]));
 for(const a of old)for(const b of next){if(a.origin.partId!==b.origin.partId||a.documentId!==b.documentId||a.sourceHash!==b.sourceHash||a.page!==b.page||a.notebookId!==b.notebookId)continue;const overlap=marks.intersect(a.source,b.source);if(overlap)maps.push({from:marks.project(overlap,{from:a.source,to:a.image}),to:marks.project(overlap,{from:b.source,to:b.image})});}
 return maps;
}
module.exports={composite,mappings,fragments,parts,list,fingerprint,repeated,record,readImages,saveImage,apply};
