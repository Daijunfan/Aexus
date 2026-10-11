'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, randomBytes, scryptSync, createCipheriv, createDecipheriv } = require('node:crypto');
const JSZip = require('jszip');
const M = require('./study-model.cjs');
const S = require('./safety.cjs');
const D = require('./documents.cjs');
const { parentExists } = require('./files.cjs');
const MAX = 256 * 1024 * 1024;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g;
const MAGIC = Buffer.from('MRPKG1\0');
function json(bytes) { try { return JSON.parse(bytes.toString('utf8')); } catch { S.fail('INVALID_PACKAGE', 'Package JSON is malformed.'); } }
function object(v) { S.assert(v && typeof v === 'object' && !Array.isArray(v), 'INVALID_PACKAGE', 'Expected an object.'); }
function array(v, max, label) { S.assert(Array.isArray(v) && v.length <= max, 'INVALID_PACKAGE', `Invalid ${label}.`); }
function text(v, max = 20000) { S.assert(typeof v === 'string' && v.length <= max, 'INVALID_PACKAGE', 'Invalid or oversized text.'); }
function id(v) { S.assert(typeof v === 'string' && M.UUID.test(v), 'INVALID_PACKAGE', 'Invalid stable identity.'); }
function reviewSchedule(value){
  object(value);object(value.schedule);S.assert(Number.isFinite(Date.parse(value.schedule.due)),'INVALID_PACKAGE','Invalid review due date.');
  for(const key of ['stability','difficulty','elapsed_days','scheduled_days','reps','lapses','state'])S.assert(Number.isFinite(value.schedule[key])&&value.schedule[key]>=0,'INVALID_PACKAGE','Invalid FSRS schedule.');
  array(value.logs||[],100000,'review logs');for(const log of value.logs||[])S.assert([1,2,3,4].includes(log.rating)&&Number.isFinite(Date.parse(log.review)),'INVALID_PACKAGE','Invalid review log.');
}
function cleanTree(value) {
  let nodes = 0;
  function visit(v, depth) {
    S.assert(++nodes <= 1500000 && depth <= 90, 'TOO_LARGE', 'Package structure exceeds the validation budget.');
    if (v && typeof v === 'object') for (const [key, child] of Object.entries(v)) {
      S.assert(!['__proto__', 'constructor', 'prototype'].includes(key), 'INVALID_PACKAGE', 'Unsafe object key.'); visit(child, depth + 1);
    }
  }
  visit(value, 0); return value;
}
function points(values, max = 1) {
  array(values, 2048, 'stroke points');
  S.assert(values.length >= 2 && values.every(p => Array.isArray(p) && [2,3].includes(p.length) && p.every(Number.isFinite) && p[0] >= 0 && p[0] <= max && p[1] >= 0 && p[1] <= max && (p.length === 2 || p[2] >= 0 && p[2] <= 1)), 'INVALID_PACKAGE', 'Invalid stroke geometry.');
}
function stroke(s, max = 1) { id(s.id);for(const key of ['mapHidden','focusBound','mapBound'])if(s[key]!==undefined)S.assert(typeof s[key]==='boolean','INVALID_PACKAGE','Invalid map handwriting flag.');if(s.recognizedShape!==undefined)S.assert(['free','line','ruler','rectangle','ellipse','circle','triangle','pentagon','star','heart'].includes(s.recognizedShape),'INVALID_PACKAGE','Invalid recognized stroke shape.'); if(s.space==='card-relative'||s.imageBound){array(s.points,2048,'bound ink points');S.assert(s.points.length>=2&&s.points.every(p=>Array.isArray(p)&&[2,3].includes(p.length)&&p.every(Number.isFinite)&&Math.abs(p[0])<=1000&&Math.abs(p[1])<=1000&&(p.length===2||p[2]>=0&&p[2]<=1)),'INVALID_PACKAGE','Invalid bound ink.');}else points(s.points,max); M.color(s.color); S.assert(Number.isFinite(s.width) && s.width > 0 && s.width <= (s.imageBound?Number.MAX_VALUE:s.space==='card-relative'?100:max === 1 ? .1 : 100), 'INVALID_PACKAGE', 'Invalid stroke width.'); if(s.reviewSide!==undefined)S.assert(['front','back','both'].includes(s.reviewSide),'INVALID_PACKAGE','Invalid handwriting side.');if(s.imageBound!==undefined)S.assert(typeof s.imageBound==='boolean'&&(!s.imageBound||s.imageBounds),'INVALID_PACKAGE','Invalid image handwriting binding.');if(s.imageBounds)S.assert(require('./study-emphasis.cjs').rect(s.imageBounds)&&Number.isFinite(s.aspectRatio)&&s.aspectRatio>0,'INVALID_PACKAGE','Invalid ink image mapping.'); if (s.layerId && s.layerId !== 'default') id(s.layerId); if (s.documentId) id(s.documentId); }
function locator(v) { object(v); S.assert(Number.isInteger(v.page) && v.page > 0 || Number.isInteger(v.section) && v.section >= 0, 'INVALID_PACKAGE', 'Invalid source locator.'); if(v.anchor!==undefined)text(v.anchor,300); for(const key of ['pageOffset','offset'])if(v[key]!==undefined)S.assert(Number.isFinite(v[key])&&v[key]>=0&&v[key]<=1,'INVALID_PACKAGE','Invalid source offset.');if(v.textOffset!==undefined)S.assert(Number.isInteger(v.textOffset)&&v.textOffset>=0,'INVALID_PACKAGE','Invalid text offset.'); }
function card(c) {
  object(c); id(c.id); if(c.parentId)id(c.parentId); M.title(c.title); text(c.text || ''); text(c.note || ''); if(c.editedText!==undefined)text(c.editedText); M.tags(c.tags || []); M.color(c.color);
  if(c.style)require('./study-organize.cjs').checkedStyle(c.style);
  if(c.position)S.assert(['x','y'].every(k=>Number.isFinite(c.position[k])&&c.position[k]>=0&&c.position[k]<=100000),'INVALID_PACKAGE','Invalid card position.');
  for(const key of ['reference'])if(c[key]){id(c[key].setId);id(c[key].cardId);}
  if(c.source){id(c.source.documentId);S.relative(c.source.path);text(c.source.title||'',500);S.assert(/^[a-f0-9]{64}$/.test(c.source.hash),'INVALID_PACKAGE','Invalid source hash.');locator(c.source.locator);
    const selection=c.source.selection||{};if(selection.rects){array(selection.rects,2000,'excerpt rectangles');for(const r of selection.rects)S.assert(Number.isInteger(r.page)&&r.page>0&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=1.000001,'INVALID_PACKAGE','Invalid excerpt rectangle.');}
    if(selection.bands){array(selection.bands,128,'capture bands');for(const b of selection.bands)S.assert(Number.isInteger(b.page)&&b.page>0&&Number.isFinite(b.start)&&Number.isFinite(b.end)&&b.start>=0&&b.end<=1&&b.end>b.start,'INVALID_PACKAGE','Invalid capture band.');}
    if(selection.polygon){points(selection.polygon.points);S.assert(selection.polygon.points.length>=3,'INVALID_PACKAGE','Invalid excerpt polygon.');}
    if(selection.start!==undefined)S.assert(Number.isInteger(selection.start)&&Number.isInteger(selection.end)&&selection.start>=0&&selection.end>selection.start,'INVALID_PACKAGE','Invalid text selection.');
  }
  if(c.anchor){const a=c.anchor;id(a.documentId);locator(a.locator);S.assert(['margin','embedded','collapsed','overlay'].includes(a.display),'INVALID_PACKAGE','Unknown note display.');
    S.assert(/^[a-f0-9]{64}$/.test(a.sourceHash),'INVALID_PACKAGE','Invalid note source hash.');
    if(a.layerId&&a.layerId!=='default')id(a.layerId);
    if(a.height!==undefined)S.assert(Number.isFinite(a.height)&&a.height>=36&&a.height<=2000,'INVALID_PACKAGE','Invalid note height.');
    if(a.rect){const r=a.rect;S.assert(['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=1.000001,'INVALID_PACKAGE','Invalid positioned note rectangle.');}
    S.assert(a.display!=='overlay'||a.rect&&a.locator.page,'INVALID_PACKAGE','A positioned note needs PDF coordinates.');
  }
  if(c.annotation)S.assert(['highlight','underline','strike','box'].includes(c.annotation.style||'highlight'),'INVALID_PACKAGE','Unknown annotation style.');
  if(c.image){S.assert(Number.isFinite(c.image.width)&&Number.isFinite(c.image.height)&&c.image.width>0&&c.image.height>0&&c.image.width*c.image.height<=24000000,'INVALID_PACKAGE','Invalid image dimensions.');if(c.image.fileKey)id(c.image.fileKey);if(c.image.fragments){array(c.image.fragments,4096,'image fragments');for(const f of c.image.fragments)S.assert(Number.isInteger(f.page)&&f.page>0&&Number.isFinite(f.aspect)&&f.aspect>0&&require('./study-emphasis.cjs').rect(f.image)&&f.source&&['x','y','width','height'].every(k=>Number.isFinite(f.source[k]))&&f.source.x>=0&&f.source.y>=0&&f.source.width>0&&f.source.height>0&&f.source.x+f.source.width<=1.01&&f.source.y+f.source.height<=1.01,'INVALID_PACKAGE','Invalid image source mapping.');}}
  if(c.image?.tiles){array(c.image.tiles,32,'composite placements');for(const tile of c.image.tiles){id(tile.partId);if(tile.captureId)id(tile.captureId);S.assert(require('./study-emphasis.cjs').rect(tile.image),'INVALID_PACKAGE','Invalid composite image placement.');}}
  for(const f of c.image?.fragments||[]){if(f.documentId)id(f.documentId);if(f.sourceHash)S.assert(/^[a-f0-9]{64}$/.test(f.sourceHash),'INVALID_PACKAGE','Invalid fragment source hash.');if(f.origin){id(f.origin.partId);if(f.origin.captureId)id(f.origin.captureId);}}
  if(c.excerpts){array(c.excerpts,32,'excerpt parts');S.assert(c.excerpts.length>0,'INVALID_PACKAGE','Empty excerpt parts.');const partIds=new Set();for(const part of c.excerpts){id(part.id);S.assert(!partIds.has(part.id),'INVALID_PACKAGE','Duplicate excerpt part.');partIds.add(part.id);card({id:part.id,parentId:null,title:c.title,text:part.text,color:c.color,source:part.source,image:part.image});}}
  if(c.mediaId)id(c.mediaId);
  array(c.comments||[],1000,'comments');for(const v of c.comments||[]){id(v.id);text(v.text||'');if(v.reviewSide!==undefined)S.assert(['front','back','both'].includes(v.reviewSide),'INVALID_PACKAGE','Invalid review comment side.');if(v.mediaId)id(v.mediaId);}
  array(c.ink||[],500,'card handwriting');for(const s of c.ink||[])stroke(s);
  if(c.emphasis){try{require('./study-emphasis.cjs').validate(c.emphasis);}catch(error){S.fail('INVALID_PACKAGE',error.message);}}
  if(c.review){const r=c.review;S.assert(typeof r.enabled==='boolean','INVALID_PACKAGE','Invalid review state.');text(r.front);text(r.back);object(r.schedule);for(const [key,values] of Object.entries({frontMode:['title','card','emphasis','custom'],backMode:['card','custom'],revealMode:['sequential','independent']}))if(r[key]!==undefined)S.assert(values.includes(r[key]),'INVALID_PACKAGE','Invalid review content mode.');
    if(r.generation){const g=r.generation;object(g);object(g.rules);S.assert(['ready','empty','invalid'].includes(g.status)&&Object.entries(g.rules).every(([k,v])=>['documentHighlighter','cardHighlighter','textEmphasis','imageEmphasis'].includes(k)&&typeof v==='boolean'),'INVALID_PACKAGE','Invalid automatic question rules.');array(g.warnings||[],20,'automatic review warnings');for(const warning of g.warnings||[])text(warning,4000);}
    if(r.groupNames){object(r.groupNames);S.assert(Object.keys(r.groupNames).length<=100&&Object.entries(r.groupNames).every(([k,v])=>/^[1-9]\d{0,2}$/.test(k)&&typeof v==='string'&&v.trim()&&v.length<=60),'INVALID_PACKAGE','Invalid review group names.');}
    reviewSchedule(r);array(r.variants||[],100,'review variants');const seenVariants=new Set();
    for(const variant of r.variants||[]){text(variant.id,100);S.assert(variant.id&&!seenVariants.has(variant.id),'INVALID_PACKAGE','Duplicate review group.');seenVariants.add(variant.id);text(variant.front);text(variant.back);reviewSchedule(variant);}
    if(r.variantArchive){object(r.variantArchive);S.assert(Object.keys(r.variantArchive).length<=2000,'INVALID_PACKAGE','Too many archived review groups.');for(const [key,variant] of Object.entries(r.variantArchive)){S.assert(key===variant.id,'INVALID_PACKAGE','Archived group identity mismatch.');text(key,100);text(variant.front);text(variant.back);reviewSchedule(variant);}}
    for(const rect of r.occlusions||[])S.assert(['x','y','width','height'].every(k=>Number.isFinite(rect[k]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=1.000001&&rect.y+rect.height<=1.000001,'INVALID_PACKAGE','Invalid image mask.');
  }
}
function validateSet(set, snapshots = true) {
  require('./mindmap-model.cjs').validateSet(set);
  object(set); if(snapshots)id(set.id); M.title(set.title);text(set.description||'',4000);
  array(set.cards,10000,'cards');array(set.documentIds,10000,'documents');set.documentIds.forEach(id);
  const ids=new Set();for(const c of set.cards){card(c);S.assert(!ids.has(c.id),'INVALID_PACKAGE','Duplicate card identity.');ids.add(c.id);}M.order(set.cards);
  array(set.cardTrash||[],10000,'card trash');for(const t of set.cardTrash||[]){id(t.id);array(t.cards,10000,'trashed cards');t.cards.forEach(card);}
  for(const [name,max] of [['ink',1],['canvasInk',100000]]){array(set[name]||[],10000,name);for(const s of set[name]||[])stroke(s,max);}
  for(const l of set.layers||[]){if(l.id!=='default')id(l.id);M.title(l.title);}
  for(const l of set.links||[]){id(l.id);id(l.from);id(l.to);if(l.toSetId)id(l.toSetId);text(l.label||'',200);if(l.curve)require('./study-content.cjs').validateCurve(l.curve);}
  for(const d of set.decks||[]){id(d.id);M.title(d.title);}
  for(const b of set.boards||[]){id(b.id);M.title(b.title);require('./study-organize.cjs').checkedFilter(b.filter||{});}
  if(set.appearance){const {paper,background,...style}=set.appearance;require('./study-organize.cjs').checkedStyle({...style,...(background?{background}:{})});if(paper)S.assert(['plain','grid','dots','lined'].includes(paper),'INVALID_PACKAGE','Invalid map paper.');}
  if(set.map){if(set.map.focusId)id(set.map.focusId);if(set.map.submapId)id(set.map.submapId);}
  if(set.linkSettings?.sources!==undefined)require('./study-dictionary.cjs').validateSources(set.linkSettings.sources);
  const checkedSettings=(value,kind)=>{object(value);require('../runtime.cjs').validate(kind==='ink'?'study.ink.settings':'study.capture.settings',{...value,setId:set.id||'snapshot',expectedRevision:1});if(value.color)M.color(value.color);if(kind==='ink'&&value.brush!=='laser')require('./study-ink-tools.cjs').attributes(value);};
  if(set.inkSettings)checkedSettings(set.inkSettings,'ink');
  if(set.tools){array(set.tools,103,'saved tools');const toolIds=new Set();for(const t of set.tools){id(t.id);S.assert(!toolIds.has(t.id)&&['capture','ink'].includes(t.kind),'INVALID_PACKAGE','Invalid or duplicate saved tool.');toolIds.add(t.id);M.title(t.title);checkedSettings(t.settings,t.kind);const base=require('./ink-toolbar.cjs').builtin(t.id);if(base)S.assert(t.kind==='ink'&&require('./ink-toolbar.cjs').family(t)===base.builtin,'INVALID_PACKAGE','Invalid base pen family.');}}
  require('./ink-toolbar.cjs').validate(set);require('./study-ruler.cjs').validate(set);require('./map-ink.cjs').validate(set);
  if(set.versionArchive&&snapshots){array(set.versionArchive,500,'saved versions');for(const v of set.versionArchive){id(v.id);S.assert(v.schema==='margin-reader.version/v1'&&v.setId===set.id,'INVALID_PACKAGE','Invalid saved version.');validateSet(v.snapshot,false);}}
  if(set.history&&snapshots){array(set.history.undo,30,'undo history');array(set.history.redo,30,'redo history');for(const snapshot of [...set.history.undo,...set.history.redo])validateSet(snapshot,false);}
}
function cardsEverywhere(set) { return [...set.cards,...(set.cardTrash||[]).flatMap(t=>t.cards),...(set.history?[...set.history.undo,...set.history.redo].flatMap(s=>[...s.cards,...(s.cardTrash||[]).flatMap(t=>t.cards)]):[]),...(set.versionArchive||[]).flatMap(v=>[...v.snapshot.cards,...(v.snapshot.cardTrash||[]).flatMap(t=>t.cards)])]; }
function protect(bytes, password) {
  if(!password)return bytes;text(password,1000);S.assert(password.length>=8,'INVALID_PARAMS','Use a passphrase of at least eight characters.');
  const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(password,salt,32),cipher=createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);return Buffer.concat([MAGIC,salt,iv,cipher.getAuthTag(),encrypted]);
}
function unprotect(bytes,password) {
  if(!bytes.subarray(0,MAGIC.length).equals(MAGIC))return bytes;
  S.assert(typeof password==='string'&&password.length<=1000,'PASSWORD_REQUIRED','This local package requires its passphrase.');
  try{const n=MAGIC.length,key=scryptSync(password,bytes.subarray(n,n+16),32),cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(n+16,n+28));cipher.setAuthTag(bytes.subarray(n+28,n+44));return Buffer.concat([cipher.update(bytes.subarray(n+44)),cipher.final()]);}
  catch{S.fail('PASSWORD_REQUIRED','Wrong passphrase or damaged encrypted package.');}
}
async function exportPackage(store,p) {
  S.assert(p.path.toLowerCase().endsWith('.mrpkg'),'INVALID_PARAMS','Complete study packages require a .mrpkg filename.');
  return store.transaction(async(state,rollback)=>{
    const first=M.findSet(state,p.setId);if(p.expectedRevision!==undefined)M.revision(first,p.expectedRevision);
    const sets=new Map([[first.id,first]]),warnings=[];
    if(p.includeDependencies!==false)for(const set of sets.values()){
      for(const id of [...cardsEverywhere(set).map(c=>c.reference?.setId),...(set.links||[]).map(l=>l.toSetId),...(set.linkSettings?.dictionarySetIds||[]),...(set.linkSettings?.sources||[]).map(s=>s.setId),...Object.values(set.cardRedirects||{}).map(r=>r.setId),...[...(set.history?.undo||[]),...(set.history?.redo||[])].flatMap(h=>h.historyTransaction?.owners||[])].filter(Boolean)){
        const next=Object.hasOwn(state.studySets,id)?state.studySets[id]:null;
        if(next&&!next.deletedAt)sets.set(id,next);else warnings.push(`Unresolved study reference: ${id}`);
      }
      S.assert(sets.size<=256,'TOO_LARGE','A package supports up to 256 related study sets.');
    }
    for(const [id,original] of sets){const clone=structuredClone(original);if(clone.versionRecords?.length){clone.versionArchive=[];for(const record of clone.versionRecords){const {value}=await require('./study-versions.cjs').readSnapshot(store,original,record.id);clone.versionArchive.push({id:record.id,...value});}}sets.set(id,clone);}
    const zip=new JSZip(),manifest={format:'margin-reader.package/v1',createdAt:new Date().toISOString(),primarySetId:first.id,sets:[...sets.values()].map(s=>structuredClone(s)),documents:[],assets:[],warnings};
    let total=0;const add=(bytes)=>{total+=bytes.length;S.assert(total<=MAX,'TOO_LARGE','Package contents exceed 256 MiB.');const hash=S.digest(bytes),key=`blobs/${hash}`;if(!zip.file(key))zip.file(key,bytes);return {blob:key,sha256:hash,bytes:bytes.length};};
    const documentIds=new Set();
    for(const set of sets.values()){
      const cards=cardsEverywhere(set);[...set.documentIds,...cards.flatMap(c=>[c.source?.documentId,c.anchor?.documentId,...(c.excerpts||[]).map(p=>p.source.documentId)]),...[set,...(set.history?.undo||[]),...(set.history?.redo||[])].flatMap(s=>[...(s.documentIds||[]),...(s.ink||[]).map(i=>i.documentId)])].filter(Boolean).forEach(id=>documentIds.add(id));
      const imageIds=new Set(cards.filter(c=>c.image&&!c.mediaId&&!c.reference).flatMap(c=>[c.image.fileKey||c.id,...(c.excerpts||[]).map(part=>part.image.fileKey||part.id)]));
      for(const imageId of imageIds){id(imageId);const bytes=await S.readBounded(await store.meta(`study-assets/${set.id}/${imageId}.png`),8*1024*1024);manifest.assets.push({kind:'excerpt',setId:set.id,id:imageId,...add(bytes)});}
      const media=new Map(Object.entries(set.mediaAssets||{}));
      for(const snapshot of [...(set.history?.undo||[]),...(set.history?.redo||[]),...(set.versionArchive||[]).map(v=>v.snapshot)])for(const pair of Object.entries(snapshot.mediaAssets||{}))media.set(...pair);
      for(const [mediaId,m] of media){id(mediaId);const bytes=await S.readBounded(await store.meta(`study-media/${set.id}/${mediaId}.${m.extension}`),16*1024*1024);S.assert(S.digest(bytes)===m.sha256,'ASSET_CORRUPT','An attachment is damaged; package not written.');manifest.assets.push({kind:'media',setId:set.id,id:mediaId,extension:m.extension,mimeType:m.mimeType,...add(bytes)});}
    }
    for(const documentId of documentIds)for(const ref of state.documents[documentId]?.virtual?.pages||[])if(ref.documentId)documentIds.add(ref.documentId);
    if(p.includeDocuments!==false)for(const documentId of documentIds){
      const doc=Object.hasOwn(state.documents,documentId)?state.documents[documentId]:null;
      if(!doc||doc.trashed){warnings.push(`Original document is unavailable: ${documentId}`);continue;}
      const status=await D.sourceStatus(store,doc);S.assert(!status.changed,'SOURCE_CHANGED','Reopen changed original documents before packaging.');
      const bytes=await S.readBounded(status.file,MAX);S.assert(S.digest(bytes)===doc.hash,'SOURCE_CHANGED','Original content changed during packaging.');
      const parsed=await D.parsedDocument(store,doc);manifest.documents.push({record:doc,original:add(bytes),parsed:add(Buffer.from(JSON.stringify(parsed)))});
    }
    const data=JSON.stringify(manifest);S.assert(Buffer.byteLength(data)<=32*1024*1024,'TOO_LARGE','Study metadata exceeds 32 MiB.');zip.file('manifest.json',data);
    const bytes=protect(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}}),p.password);
    const rel=S.relative(p.path),file=await S.safePath(store.workspace,rel);await parentExists(store.workspace,rel);await S.writeNew(file,bytes);rollback(()=>fs.rm(file,{force:true}));
    return {path:rel,bytes:bytes.length,sets:sets.size,documents:manifest.documents.length,assets:manifest.assets.length,encrypted:Boolean(p.password),warnings:[...new Set(warnings)]};
  });
}
async function readPackage(store,p){
  const file=await S.safePath(store.workspace,S.relative(p.path)),bytes=unprotect(await S.readBounded(file,MAX),p.password);
  let zip;try{zip=await JSZip.loadAsync(bytes);}catch{S.fail('INVALID_PACKAGE','Not a valid reader ZIP package.');}
  const entries=Object.values(zip.files);S.assert(entries.length<=20000,'TOO_LARGE','Too many package entries.');let total=0;
  for(const e of entries){S.assert(e.name==='manifest.json'||e.name==='blobs/'||/^blobs\/[0-9a-f]{64}$/.test(e.name),'INVALID_PACKAGE','Unexpected package path.');S.assert(!e.unsafeOriginalName||e.unsafeOriginalName===e.name,'SCOPE_DENIED','Archive path traversal is forbidden.');S.assert((Number(e.unixPermissions||0)&0xf000)!==0xa000,'SCOPE_DENIED','Archive links are forbidden.');total+=e._data?.uncompressedSize||0;S.assert(total<=MAX,'TOO_LARGE','Expanded package exceeds 256 MiB.');}
  const header=zip.file('manifest.json');S.assert(header&&header._data.uncompressedSize<=32*1024*1024,'INVALID_PACKAGE','Missing or oversized package manifest.');
  const manifest=cleanTree(json(await header.async('nodebuffer')));S.assert(manifest.format==='margin-reader.package/v1','INVALID_PACKAGE','Unsupported reader package version.');
  array(manifest.sets,256,'study sets');array(manifest.documents,10000,'documents');array(manifest.assets,20000,'assets');manifest.sets.forEach(s=>validateSet(s));id(manifest.primarySetId);
  require('./package-validation.cjs').consistency(manifest,cardsEverywhere);
  const setIds=new Set(manifest.sets.map(s=>s.id));S.assert(setIds.size===manifest.sets.length&&setIds.has(manifest.primarySetId),'INVALID_PACKAGE','Duplicate or missing study set.');
  const blob=async ref=>{object(ref);S.assert(ref.blob===`blobs/${ref.sha256}`&&/^[a-f0-9]{64}$/.test(ref.sha256),'INVALID_PACKAGE','Invalid content reference.');const entry=zip.file(ref.blob);S.assert(entry&&entry._data.uncompressedSize===ref.bytes,'INVALID_PACKAGE','Missing or wrong-size content.');const value=await entry.async('nodebuffer');S.assert(S.digest(value)===ref.sha256,'CHECKSUM_MISMATCH','A package blob failed integrity verification.');return value;};
  // Verify every blob before a single library file is created.
  for(const ref of [...manifest.assets,...manifest.documents.flatMap(d=>[d.original,d.parsed])])await blob(ref);
  return {manifest,blob};
}
async function inspect(store,p){const {manifest:m}=await readPackage(store,p);return {format:m.format,primarySetId:m.primarySetId,sets:m.sets.map(M.summary),documents:m.documents.map(d=>({id:d.record.id,title:d.record.title,path:d.record.path})),assets:m.assets.length,warnings:m.warnings||[]};}
async function importPackage(store,p){
  const {manifest:m,blob}=await readPackage(store,p),folder=S.relative(p.folder),destination=await S.safePath(store.workspace,folder);await parentExists(store.workspace,folder);
  S.assert(!(await S.exists(destination)),'ALREADY_EXISTS','Import into a new folder; existing files will not be replaced.');
  const {map,remap}=require('./package-identities.cjs').identities(m);
  const docs=[];
  for(const item of m.documents){
    const old=item.record;id(old.id);S.relative(old.path);M.title(old.title);const original=await blob(item.original);
    S.assert(S.digest(original)===old.hash,'CHECKSUM_MISMATCH','Document hash differs from its original bytes.');
    let parsed=cleanTree(json(await blob(item.parsed)));array(parsed.sections,20000,'document sections');S.assert(parsed.sections.length>0&&['pdf','flow'].includes(parsed.kind),'INVALID_PACKAGE','Invalid parsed document.');
    if(parsed.kind==='pdf'&&!old.virtual)parsed=await require('./parse.cjs').parseInWorker(store,{bytes:original,filename:old.path});
    else {const sections=[];for(const [i,s] of parsed.sections.entries()){text(s.html,32*1024*1024);sections.push(await require('./html.cjs').normalizeSection(s.html,i,{title:s.title}));}parsed={...parsed,sections};}
    array(old.toc,10000,'document outline');for(const node of old.toc){text(node.id,200);S.assert(/^[a-zA-Z0-9_.:-]+$/.test(node.id),'INVALID_PACKAGE','Invalid outline identity.');text(node.title,500);locator(node.locator);}
    const ordered=require('./outline.cjs').ordered(old.toc),depths=new Map();
    for(const node of ordered){const depth=node.parentId?(depths.get(node.parentId)||0)+1:0;S.assert(depth<=64,'INVALID_PACKAGE','Imported outline exceeds 64 levels.');depths.set(node.id,depth);}
    array(old.bookmarks||[],10000,'bookmarks');for(const bookmark of old.bookmarks||[]){id(bookmark.id);text(bookmark.title,200);locator(bookmark.locator);}
    if(old.foldedPages)S.assert(Array.isArray(old.foldedPages)&&old.foldedPages.every(n=>Number.isInteger(n)&&n>0&&n<=parsed.sections.length),'INVALID_PACKAGE','Invalid folded page.');
    const rel=`${folder}/${map.get(old.id).slice(0,8)}-${S.cleanName(path.basename(old.path))}`;
    docs.push({old,rel,original,parsed});
  }
  return store.transaction(async(state,rollback)=>{
    S.assert(!(await S.exists(destination)),'ALREADY_EXISTS','Destination was created by another client.');await fs.mkdir(destination);rollback(()=>fs.rm(destination,{recursive:true,force:true}));
    const documentMap=new Map();
    for(const item of docs.sort((a,b)=>Number(Boolean(a.old.virtual))-Number(Boolean(b.old.virtual)))){
      const {old,rel}=item;let {original,parsed}=item;const docId=map.get(old.id),file=await S.safePath(store.workspace,rel),record={...remap(old),id:docId,path:rel,revision:1,trashed:false};
      if(old.virtual){S.assert(JSON.stringify(json(original))===JSON.stringify(old.virtual),'INVALID_PACKAGE','Virtual reference bytes do not match their manifest.');original=Buffer.from(JSON.stringify(record.virtual,null,2));record.hash=S.digest(original);}
      await S.writeNew(file,original);record.sourceVersion=S.version(await fs.stat(file));
      if(record.virtual){const pdf=await require('./virtual-document.cjs').render(store,state,record.virtual);parsed=await require('./parse.cjs').parseInWorker(store,{bytes:pdf,filename:'virtual.pdf'});parsed.format='mrv';}
      const cacheKey=`${docId}-${record.hash}`,cache=await store.meta(`cache/${cacheKey}.json`);await S.writeNew(cache,JSON.stringify(parsed));rollback(()=>fs.rm(cache,{force:true}));Object.assign(record,{kind:parsed.kind,format:parsed.format,cacheKey});
      try{record.position=require('./outline.cjs').validateLocator(record.position,parsed);}catch{record.position=parsed.kind==='pdf'?{page:1}:{section:0};}
      for(const node of record.toc)try{require('./outline.cjs').validateLocator(node.locator,parsed);delete node.unresolved;}catch{node.unresolved=true;}
      state.documents[docId]=record;documentMap.set(docId,record);
    }
    for(const originalSet of m.sets){const set=remap(originalSet);set.revision=1;delete set.deletedAt;
      for(const c of cardsEverywhere(set))for(const source of [c.source,...(c.excerpts||[]).map(part=>part.source)].filter(Boolean).flatMap(source=>[source,...(source.virtualSources||[])])){const d=documentMap.get(source.documentId);if(d){source.path=d.path;source.sourceVersion=d.sourceVersion;if(d.virtual){const old=docs.find(item=>map.get(item.old.id)===d.id)?.old;if(old?.hash===source.hash)source.hash=d.hash;}}}
      if(set.versionArchive?.length){await store.mkdir(`versions/${set.id}`);for(const version of set.versionArchive){const record=set.versionRecords.find(r=>r.id===version.id);S.assert(record,'INVALID_PACKAGE','Version record is missing.');const payload={schema:'margin-reader.version/v1',setId:set.id,sourceRevision:version.sourceRevision,createdAt:version.createdAt,snapshot:version.snapshot},bytes=Buffer.from(JSON.stringify(payload)),file=await store.meta(`versions/${set.id}/${record.id}.json`);await S.writeNew(file,bytes);rollback(()=>fs.rm(file,{force:true}));record.sha256=S.digest(bytes);record.bytes=bytes.length;}delete set.versionArchive;}
      state.studySets[set.id]=set;
    }
    for(const a of m.assets){id(a.setId);id(a.id);S.assert(m.sets.some(s=>s.id===a.setId),'INVALID_PACKAGE','Attachment owner is missing.');const bytes=await blob(a),setId=map.get(a.setId),assetId=map.get(a.id);
      S.assert(a.kind==='excerpt'||a.kind==='media'&&['png','wav','mp3','m4a','ogg','webm'].includes(a.extension),'INVALID_PACKAGE','Invalid attachment type.');
      if(a.kind==='excerpt'||a.extension==='png')S.assert(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.readUInt32BE(16)*bytes.readUInt32BE(20)<=24000000,'INVALID_PACKAGE','Invalid image asset.');
      else require('./study-media.cjs').audioType(bytes,a.mimeType);
      const directory=a.kind==='excerpt'?`study-assets/${setId}`:`study-media/${setId}`,filename=`${directory}/${assetId}.${a.kind==='excerpt'?'png':a.extension}`;
      await store.mkdir(directory);const target=await store.meta(filename);await S.writeNew(target,bytes);rollback(()=>fs.rm(target,{force:true}));
    }
    const primary=map.get(m.primarySetId);if(p.title)state.studySets[primary].title=M.title(p.title);
    if(p.activate!==false){state.settings.activeStudySet=primary;state.settings.lastDocument=null;}
    return {setId:primary,setIds:m.sets.map(s=>map.get(s.id)),documents:[...documentMap.values()].map(d=>({id:d.id,path:d.path})),folder,warnings:m.warnings||[],identityMap:Object.fromEntries(map)};
  });
}
module.exports={exportPackage,importPackage,inspect,validateSet,cardsEverywhere,protect,unprotect,cleanTree};
