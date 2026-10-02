'use strict';
const S=require('./safety.cjs'),M=require('./study-model.cjs');
const extensions={png:'image/png',wav:'audio/wav',mp3:'audio/mpeg',m4a:'audio/mp4',ogg:'audio/ogg',webm:'audio/webm'};
const object=v=>S.assert(v&&typeof v==='object'&&!Array.isArray(v),'INVALID_PACKAGE','Expected package metadata object.');
const id=v=>S.assert(typeof v==='string'&&M.UUID.test(v),'INVALID_PACKAGE','Invalid package identity.');
const array=(v,n)=>S.assert(Array.isArray(v)&&v.length<=n,'INVALID_PACKAGE','Package list is invalid or too large.');
function settings(set){
  if(set.cardRedirects){object(set.cardRedirects);S.assert(Object.keys(set.cardRedirects).length<=100000,'INVALID_PACKAGE','Too many card relocations.');for(const [key,value] of Object.entries(set.cardRedirects)){id(key);object(value);id(value.setId);id(value.cardId);}}
  if(set.historyTransaction){const marker=set.historyTransaction;object(marker);id(marker.id);array(marker.owners,1000);S.assert(marker.owners.length>0&&new Set(marker.owners).size===marker.owners.length,'INVALID_PACKAGE','Invalid linked history owners.');marker.owners.forEach(id);}
  for(const key of ['captureSettings','reviewSettings','map','navigation','linkSettings','mediaAssets'])if(set[key]!==undefined)object(set[key]);
  const review=set.reviewSettings||{};
  if(review.retention!==undefined)S.assert(Number.isFinite(review.retention)&&review.retention>=.7&&review.retention<=.99,'INVALID_PACKAGE','Invalid retention.');
  if(review.maximumInterval!==undefined)S.assert(Number.isInteger(review.maximumInterval)&&review.maximumInterval>=1&&review.maximumInterval<=36500,'INVALID_PACKAGE','Invalid review interval.');
  if(review.w!==undefined)S.assert(Array.isArray(review.w)&&review.w.length===21&&review.w.every(Number.isFinite),'INVALID_PACKAGE','Invalid FSRS parameters.');
  const preset=set.captureSettings||{};if(preset.color)M.color(preset.color);if(preset.tags)M.tags(preset.tags);if(preset.parentId)id(preset.parentId);if(preset.deckId)id(preset.deckId);
  if(preset.organize)S.assert(['none','document','toc'].includes(preset.organize),'INVALID_PACKAGE','Invalid excerpt automation.');
  if(set.navigation?.mode)S.assert(['off','both','map-to-document','document-to-map'].includes(set.navigation.mode),'INVALID_PACKAGE','Invalid linkage mode.');
  const map=set.map||{};if(map.layout)S.assert(['tree','down','radial'].includes(map.layout),'INVALID_PACKAGE','Invalid map layout.');
  if(map.branchStyle)S.assert(require('./study-organize.cjs').STYLES.includes(map.branchStyle),'INVALID_PACKAGE','Invalid branch style.');
  if(set.view)S.assert(['map','cards','outline','review'].includes(set.view),'INVALID_PACKAGE','Invalid study view.');
  array(set.boards||[],100);for(const board of set.boards||[]){array(board.groupBy||[],2);S.assert((board.groupBy||[]).every(k=>['color','tag','keyword','document','chapter','created','updated','kind','inMap'].includes(k)),'INVALID_PACKAGE','Invalid board grouping.');require('./study-organize.cjs').sorted([],board.sort||'outline');}
  array(set.layers||[],64);array(set.decks||[],100);array(set.links||[],50000);
  if(set.linkSettings?.dictionarySetIds){array(set.linkSettings.dictionarySetIds,1000);set.linkSettings.dictionarySetIds.forEach(id);}
  for(const [key,media] of Object.entries(set.mediaAssets||{})){
    id(key);object(media);S.assert(media.id===key&&Object.hasOwn(extensions,media.extension)&&extensions[media.extension]===media.mimeType,'INVALID_PACKAGE','Attachment type or identity mismatch.');
    S.assert(media.kind===(media.extension==='png'?'image':'audio'),'INVALID_PACKAGE','Attachment kind mismatch.');
    S.assert(typeof media.name==='string'&&media.name.length<=300&&/^[a-f0-9]{64}$/.test(media.sha256)&&Number.isInteger(media.bytes)&&media.bytes>0&&media.bytes<=16*1024*1024,'INVALID_PACKAGE','Invalid attachment metadata.');
  }
}
function consistency(manifest,cardsEverywhere){
  const assets=new Map(),documents=new Set();
  for(const a of manifest.assets){id(a.setId);id(a.id);const key=`${a.setId}/${a.kind}/${a.id}`;S.assert(!assets.has(key),'INVALID_PACKAGE','Duplicate attachment descriptor.');assets.set(key,a);}
  for(const d of manifest.documents){object(d.record);id(d.record.id);S.assert(!documents.has(d.record.id),'INVALID_PACKAGE','Duplicate original document.');documents.add(d.record.id);S.relative(d.record.path);documentLayout(d.record);}
  for(const set of manifest.sets){
    const snapshots=[set,...(set.history?.undo||[]),...(set.history?.redo||[])];
    for(const s of snapshots){settings(s);for(const [mediaId,m] of Object.entries(s.mediaAssets||{})){const a=assets.get(`${set.id}/media/${mediaId}`);S.assert(a&&a.sha256===m.sha256&&a.extension===m.extension&&a.mimeType===m.mimeType&&a.bytes===m.bytes,'INVALID_PACKAGE','Missing or inconsistent media attachment.');}}
    for(const card of cardsEverywhere(set)){
      for(const part of card.excerpts||[])S.assert(assets.has(`${set.id}/excerpt/${part.image.fileKey||part.id}`),'INVALID_PACKAGE','Missing immutable excerpt-fragment image.');
      if(card.image&&!card.mediaId&&!card.reference)S.assert(assets.has(`${set.id}/excerpt/${card.image.fileKey||card.id}`),'INVALID_PACKAGE','Missing immutable excerpt image.');
      for(const mediaId of [card.mediaId,...(card.comments||[]).map(c=>c.mediaId)].filter(Boolean))S.assert(assets.has(`${set.id}/media/${mediaId}`),'INVALID_PACKAGE','A card refers to missing media.');
    }
  }
}
function documentLayout(doc){
  if(doc.virtual){const v=doc.virtual;S.assert(v.schema==='margin-reader.virtual/v1'&&typeof v.title==='string'&&v.title.length<=200,'INVALID_PACKAGE','Invalid virtual collection.');array(v.pages,2000);S.assert(v.pages.length,'INVALID_PACKAGE','Empty virtual collection.');for(const p of v.pages){id(p.id);if(!p.blank){id(p.documentId);S.assert(Number.isInteger(p.page)&&p.page>0&&[0,90,180,270].includes(p.rotation)&&/^[a-f0-9]{64}$/.test(p.sourceHash),'INVALID_PACKAGE','Invalid virtual page reference.');require('./page-reference.cjs').crop(p.crop);}else S.assert(p.blank===true&&Number.isFinite(p.width)&&Number.isFinite(p.height)&&p.width>=100&&p.height>=100&&p.width<=3000&&p.height<=3000&&['plain','lined','grid','dots'].includes(p.paper),'INVALID_PACKAGE','Invalid virtual paper.');}}
  const snapshots=[doc,...(doc.layoutHistory?.undo||[]),...(doc.layoutHistory?.redo||[])];
  if(doc.layoutHistory){array(doc.layoutHistory.undo,30);array(doc.layoutHistory.redo,30);}
  for(const snapshot of snapshots){
    array(snapshot.foldedPages||[],20000);S.assert((snapshot.foldedPages||[]).every(p=>Number.isInteger(p)&&p>0&&p<=20000),'INVALID_PACKAGE','Invalid folded page number.');
    array(snapshot.foldRegions||[],2000);const seen=new Set();
    for(const r of snapshot.foldRegions||[]){object(r);id(r.id);S.assert(!seen.has(r.id),'INVALID_PACKAGE','Duplicate folded region.');seen.add(r.id);
      S.assert(Number.isInteger(r.page)&&r.page>0&&r.page<=20000&&Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.start>=0&&r.end<=1&&r.end-r.start>=.001&&typeof r.folded==='boolean'&&/^[a-f0-9]{64}$/.test(r.sourceHash),'INVALID_PACKAGE','Invalid folded region.');
    }
    const groups=new Map();for(const r of snapshot.foldRegions||[]){if(r.deletedAt||!r.folded)continue;const key=r.page+':'+r.sourceHash;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
    for(const values of groups.values()){values.sort((a,b)=>a.start-b.start);for(let i=1;i<values.length;i++)S.assert(values[i].start>=values[i-1].end,'INVALID_PACKAGE','Overlapping folds are not allowed.');}
  }
}
module.exports={settings,consistency,documentLayout};
