"use strict";
const fs=require('node:fs/promises'),{randomUUID}=require('node:crypto');
const S=require('./safety.cjs'),M=require('./study-model.cjs'),O=require('./study-organize.cjs'),H=require('./study-history.cjs'),T=require('./study-tree.cjs');
function clip(state,id){const value=state.settings.studyClipboard;S.assert(value&&value.id===id,'CONFLICT','Clipboard changed or is empty. Read/copy the intended cards again.');return value;}
function referenceChanges(owner,sourceId,moved){
  return Object.values(owner.cardRedirects||{}).some(r=>r.setId===sourceId&&moved.has(r.cardId))||owner.cards.some(c=>c.reference?.setId===sourceId&&moved.has(c.reference.cardId))||(owner.links||[]).some(l=>(l.toSetId||owner.id)===sourceId&&moved.has(l.to));
}
function layers(source,target,cards){
 const ids=new Set(cards.flatMap(c=>[c.anchor?.layerId,...(c.ink||[]).map(s=>s.layerId)]).filter(id=>id&&id!=='default'));
 if(!ids.size)return;target.layers??=[{id:'default',title:'默认图层',visible:true,locked:false}];
 for(const id of ids)if(!target.layers.some(l=>l.id===id)){const layer=source.layers?.find(l=>l.id===id);S.assert(layer,'NOT_FOUND','A copied handwriting layer is unavailable.');S.assert(target.layers.length<64,'TOO_LARGE','Destination layer limit reached.');target.layers.push(structuredClone(layer));}
}
async function assets(store,source,target,cards,rollback){
 await store.mkdir(`study-assets/${target.id}`);
 const ids=new Set(cards.filter(c=>c.image&&!c.mediaId&&!c.reference).flatMap(c=>[c.image.fileKey||c.id,...(c.excerpts||[]).map(p=>p.image.fileKey||p.id)]));
 for(const id of ids){
  const bytes=await S.readBounded(await store.meta(`study-assets/${source.id}/${id}.png`),8*1024*1024),to=await store.meta(`study-assets/${target.id}/${id}.png`);
  const old=await S.exists(to);if(old)S.assert(S.digest(await S.readBounded(to,8*1024*1024))===S.digest(bytes),'CONFLICT','A destination snapshot has a different identity.');
  else{await S.writeNew(to,bytes);rollback(()=>fs.rm(to,{force:true}));}
 }
 await require('./study-media.cjs').cloneAssets(store,source,target,cards,rollback);layers(source,target,cards);require('./study-notebooks.cjs').cloneDefinitions(source,target,cards);
}
function position(set,rootIds,p){
 const spec={cardIds:rootIds,parentId:p.parentId||null,...(p.index===undefined?{}:{index:p.index})};
 if(p.x!==undefined||p.y!==undefined){S.assert(p.x!==undefined&&p.y!==undefined,'INVALID_PARAMS','Provide both x and y.');spec.positions=rootIds.map((id,i)=>({cardId:id,x:p.x,y:p.y+i*260}));}
 T.move(set,spec);
}
async function paste(store,state,p,rollback){
 const receipt=clip(state,p.clipboardId),source=M.findSet(state,receipt.setId),target=M.findSet(state,p.setId);
 M.revision(source,receipt.sourceRevision);M.revision(target,p.expectedRevision);
 if(receipt.mode==='cut')require('./study-notebooks.cjs').guard(source,'study.cards.move',{cardIds:receipt.cardIds});
 const initial=O.selected(source,receipt.cardIds,receipt.mode==='cut'||receipt.descendants),selected=receipt.mode==='cut'||receipt.descendants?require('./mindmap-items.cjs').expand(source,initial):initial,ids=new Set(selected.map(c=>c.id)),summaryRoots=require('./mindmap-items.cjs').summaryRoots(source,ids),roots=T.roots(source,selected.map(c=>c.id)).filter(c=>!summaryRoots.has(c.id));
 if(receipt.mode==='cut')require('./study-notebooks.cjs').guard(source,'study.cards.move',{cardIds:selected.map(c=>c.id)});
 if(p.parentId){M.card(target,p.parentId);S.assert(source!==target||!ids.has(p.parentId)||receipt.mode!=='cut','INVALID_OUTLINE','Cannot cut a branch into itself.');}
 let rootIds,changed=new Set([target]);
 if(receipt.mode==='cut'&&source!==target){
  S.assert(target.cards.length+selected.length<=10000,'TOO_LARGE','Destination card capacity exceeded.');
  const targetIds=new Set([...target.cards,...(target.cardTrash||[]).flatMap(t=>t.cards)].map(c=>c.id));
  S.assert(selected.every(c=>!targetIds.has(c.id)),'CONFLICT','A moved card identity already exists in the destination.');
  for(const c of selected)if(c.anchor?.layerId)require('./study-advanced.cjs').editable(source,c.anchor.layerId);
  const owners=[...new Set([source,target,...Object.values(state.studySets).filter(s=>!s.deletedAt&&referenceChanges(s,source.id,ids))])];
  H.checkpointGroup(owners);changed=new Set(owners);
  await assets(store,source,target,selected,rollback);
  require('./mindmap-items.cjs').transfer(source,target,ids);
  source.cards=source.cards.filter(c=>!ids.has(c.id));target.cards.push(...selected);
  source.cardRedirects??={};for(const id of ids)source.cardRedirects[id]={setId:target.id,cardId:id};
  S.assert(Object.keys(source.cardRedirects).length<=100000,'TOO_LARGE','Relocation history capacity reached.');
  for(const c of roots)c.parentId=p.parentId||null;
  rootIds=roots.map(c=>c.id);
  const movedLinks=(source.links||[]).filter(l=>ids.has(l.from));source.links=(source.links||[]).filter(l=>!ids.has(l.from));target.links??=[];
  for(const link of movedLinks){const dest=link.toSetId||source.id;target.links.push({...link,...(dest===source.id&&!ids.has(link.to)?{toSetId:source.id}:{} )});}
  for(const owner of owners){
   for(const [id,redirect] of Object.entries(owner.cardRedirects||{}))if(redirect.setId===source.id&&ids.has(redirect.cardId)){if(owner===target&&ids.has(id))delete owner.cardRedirects[id];else owner.cardRedirects[id]={setId:target.id,cardId:redirect.cardId};}
   for(const c of owner.cards)if(c.reference?.setId===source.id&&ids.has(c.reference.cardId))c.reference={...c.reference,setId:target.id};
   for(const link of owner.links||[]){
    // A moved source-local link initially has no explicit destination owner.
    const destination=link.toSetId||(owner===target&&movedLinks.some(l=>l.id===link.id)?source.id:owner.id);
    if(destination===source.id&&ids.has(link.to))link.toSetId=target.id;
    if(link.toSetId===owner.id)delete link.toSetId;
   }
  }
  if(ids.has(source.map?.focusId))source.map.focusId=null;if(ids.has(source.map?.submapId))source.map.submapId=null;
  if(ids.has(source.captureSettings?.parentId))source.captureSettings.parentId=null;
  target.documentIds=[...new Set([...target.documentIds,...selected.flatMap(c=>[c.source?.documentId,c.anchor?.documentId,...(c.excerpts||[]).map(p=>p.source.documentId)]).filter(Boolean)])];
  S.assert(target.documentIds.length<=10000,'TOO_LARGE','Destination document capacity exceeded.');
  source.cards=M.order(source.cards);position(target,rootIds,p);delete state.settings.studyClipboard;
 }else if(receipt.mode==='cut'){
  H.checkpoint(target);rootIds=roots.map(c=>c.id);position(target,rootIds,p);delete state.settings.studyClipboard;
 }else if(receipt.mode==='clone'){
  H.checkpoint(source);changed.add(source);
  await O.request(store,state,source,'study.cards.copy',{cardIds:receipt.cardIds,descendants:receipt.descendants,targetSetId:target.id,targetRevision:target.revision,parentId:p.parentId||undefined},rollback);
  const copied=new Set(source.lastCopy.cardIds),copiedSummaries=require('./mindmap-items.cjs').summaryRoots(target);rootIds=target.cards.filter(c=>copied.has(c.id)&&!copied.has(c.parentId)&&!copiedSummaries.has(c.id)).map(c=>c.id);position(target,rootIds,p);
  // The existing copy operation already advances a different target revision.
  if(target!==source)changed.delete(target);
 }else{
  H.checkpoint(target);S.assert(target.cards.length+selected.length<=10000,'TOO_LARGE','Destination card capacity exceeded.');
  const map=new Map(selected.map(c=>[c.id,randomUUID()])),now=new Date().toISOString();
  const copies=selected.map(c=>({id:map.get(c.id),title:c.title,text:c.editedText??c.text??'',note:'',tags:[...(c.tags||[])],color:c.color,source:null,image:null,parentId:map.get(c.parentId)||p.parentId||null,reference:{setId:source.id,cardId:c.id},createdAt:now,updatedAt:now}));
  target.cards.push(...copies);const copyIds=new Set(copies.map(c=>c.id));rootIds=copies.filter(c=>!copyIds.has(c.parentId)).map(c=>c.id);position(target,rootIds,p);
 }
 for(const owner of changed)M.touch(owner);
 if(state.settings.studyClipboard)state.settings.studyClipboard.sourceRevision=source.revision;
 state.settings.activeStudySet=target.id;
 state.settings.studySelection={setId:target.id,cardId:rootIds[0],origin:'map',linked:true,serial:state.revision+1};
 return {mode:receipt.mode,rootIds,cardIds:receipt.mode==='clone'?source.lastCopy.cardIds:receipt.mode==='cut'?selected.map(c=>c.id):O.selected(target,rootIds,true).map(c=>c.id),set:await M.describe(store,state,target)};
}
async function request(store,method,p){
 if(method==='study.clipboard.get'){
  const state=await store.load(),clipboard=state.settings.studyClipboard||null;
  const source=clipboard&&state.studySets[clipboard.setId];
  return {clipboard,valid:Boolean(clipboard&&source&&!source.deletedAt&&source.revision===clipboard.sourceRevision&&clipboard.cardIds.every(id=>source.cards.some(c=>c.id===id)))};
 }
 return store.transaction(async(state,rollback)=>{
  if(method==='study.clipboard.set'){
   const set=M.findSet(state,p.setId);M.revision(set,p.expectedRevision);const ids=(p.mode==='cut'||p.descendants!==false?T.roots(set,p.cardIds):O.selected(set,p.cardIds)).map(c=>c.id);
   const clipboard={id:randomUUID(),setId:set.id,cardIds:ids,sourceRevision:set.revision,mode:p.mode,descendants:p.mode==='cut'||p.descendants!==false,createdAt:new Date().toISOString()};
   state.settings.studyClipboard=clipboard;return {clipboard,valid:true};
  }
  if(method==='study.clipboard.clear'){clip(state,p.clipboardId);delete state.settings.studyClipboard;return {cleared:true};}
  return paste(store,state,p,rollback);
 });
}
module.exports={request,layers,assets};
