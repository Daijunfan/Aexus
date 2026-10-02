"use strict";
const {randomUUID}=require('node:crypto');
const {assert}=require('./safety.cjs'),M=require('./study-model.cjs');
const writes=new Set(['study.notebook.create','study.notebook.update','study.notebook.select','study.notebook.assign']);
const defaultBook=()=>({id:'default',title:'默认笔记本',visible:true,locked:false});
function list(set,documentId){return set.documentNotebooks?.[documentId]||[defaultBook()];}
function book(set,documentId,id='default',deleted=false){const value=list(set,documentId).find(n=>n.id===id&&(deleted||!n.deletedAt));assert(value,'NOT_FOUND','Document notebook is not available.');return value;}
function active(set,documentId){return book(set,documentId,set.activeNotebooks?.[documentId]||'default');}
function forSource(set,source){return source?list(set,source.documentId).find(n=>n.id===(source.notebookId||'default')):null;}
function visible(set,source){const value=forSource(set,source);return !source||Boolean(value&&!value.deletedAt&&value.visible);}
function editable(set,source){if(!source)return;const value=book(set,source.documentId,source.notebookId||'default');assert(!value.locked,'NOTEBOOK_LOCKED','Unlock this document notebook before editing its notes.');}
function guard(set,method,p){
 if(writes.has(method)||['study.undo','study.redo','study.card.restore','study.cards.copy'].includes(method)||method.startsWith('study.review.'))return;
 const ids=[p.cardId,...(Array.isArray(p.cardIds)?p.cardIds:[])].filter(Boolean);
 for(const id of new Set(ids)){const c=set.cards.find(c=>c.id===id);if(c){editable(set,c.source||c.anchor);for(const part of c.excerpts||[])editable(set,part.source);}}
}
function imageNotebooks(card,documentId,notebookId){for(const part of [card,...(card.excerpts||[])])for(const f of part.image?.fragments||[])if((f.documentId||part.source?.documentId)===documentId)f.notebookId=notebookId;}
function initialize(set,doc){set.documentNotebooks??={};if(!set.documentNotebooks[doc])set.documentNotebooks[doc]=[defaultBook()];set.activeNotebooks??={};return set.documentNotebooks[doc];}
async function read(store,p){const state=await store.load(),set=M.findSet(state,p.setId);require('./documents.cjs').findDocument(state,p.documentId);assert(set.documentIds.includes(p.documentId),'NOT_MEMBER','Document is not a study member.');return {setId:set.id,documentId:p.documentId,revision:set.revision,activeId:active(set,p.documentId).id,notebooks:list(set,p.documentId).filter(n=>p.includeDeleted||!n.deletedAt).map(n=>({...n,cards:set.cards.filter(c=>[c.source,c.anchor,...(c.excerpts||[]).map(p=>p.source)].some(s=>s?.documentId===p.documentId&&(s.notebookId||'default')===n.id)).length,strokes:(set.ink||[]).filter(s=>s.documentId===p.documentId&&(s.notebookId||'default')===n.id).length}))};}
async function request(store,state,set,method,p,rollback){
 const doc=require('./documents.cjs').findDocument(state,p.documentId);assert(set.documentIds.includes(doc.id),'NOT_MEMBER','Document is not a study member.');
 const books=initialize(set,doc.id);
 if(method==='study.notebook.create'){
  assert(books.length<128,'TOO_LARGE','Each document supports at most 128 notebooks.');
  const notebook={id:randomUUID(),title:M.title(p.title),visible:true,locked:false,createdAt:new Date().toISOString()};books.push(notebook);
  if(p.copyFrom){
   const source=book(set,doc.id,p.copyFrom);
   const originals=set.cards.filter(c=>{const source=c.source||c.anchor;return source?.documentId===doc.id&&(source.notebookId||'default')===p.copyFrom;});
   if(originals.length){
    await require('./study-organize.cjs').request(store,state,set,'study.cards.copy',{cardIds:originals.map(c=>c.id),descendants:false},rollback);
    for(const id of set.lastCopy.cardIds){const c=M.card(set,id);if(c.source?.documentId===doc.id)c.source.notebookId=notebook.id;if(c.anchor?.documentId===doc.id)c.anchor.notebookId=notebook.id;for(const part of c.excerpts||[])if(part.source.documentId===doc.id)part.source.notebookId=notebook.id;imageNotebooks(c,doc.id,notebook.id);}
   }
   const strokes=(set.ink||[]).filter(s=>s.documentId===doc.id&&(s.notebookId||'default')===source.id);assert((set.ink?.length||0)+strokes.length<=2000,'TOO_LARGE','Copying the notebook would exceed handwriting capacity.');
   set.ink??=[];set.ink.push(...strokes.map(s=>({...structuredClone(s),id:randomUUID(),notebookId:notebook.id})));
  }
  set.activeNotebooks[doc.id]=notebook.id;set.lastNotebookId=notebook.id;return;
 }
 const notebook=book(set,doc.id,p.notebookId,method==='study.notebook.update'&&p.deleted===false);
 if(method==='study.notebook.select'){
  notebook.visible=true;set.activeNotebooks[doc.id]=notebook.id;
  if(p.showOthers!==undefined)for(const other of books)if(other!==notebook&&!other.deletedAt)other.visible=p.showOthers;
  return;
 }
 if(method==='study.notebook.update'){
  assert(['title','visible','locked','deleted'].some(k=>p[k]!==undefined),'INVALID_PARAMS','Supply a notebook setting.');
  if(p.title!==undefined)notebook.title=M.title(p.title);if(p.visible!==undefined)notebook.visible=p.visible;if(p.locked!==undefined)notebook.locked=p.locked;
  if(p.deleted!==undefined){assert(notebook.id!=='default','INVALID_PARAMS','The default notebook cannot be removed.');notebook.deletedAt=p.deleted?new Date().toISOString():null;}
  if(notebook.deletedAt&&set.activeNotebooks[doc.id]===notebook.id)set.activeNotebooks[doc.id]='default';
  notebook.updatedAt=new Date().toISOString();return;
 }
 assert(method==='study.notebook.assign','METHOD_NOT_FOUND','Unknown notebook operation.');editable(set,{documentId:doc.id,notebookId:notebook.id});
 const cards=require('./study-organize.cjs').selected(set,p.cardIds,p.descendants===true);
 for(const c of cards){
  const sources=[c.source,c.anchor,...(c.excerpts||[]).map(p=>p.source)].filter(s=>s?.documentId===doc.id);assert(sources.length,'NOT_MEMBER','Each selected card must refer to the chosen document.');
  for(const source of sources){editable(set,source);source.notebookId=notebook.id;}imageNotebooks(c,doc.id,notebook.id);
 }
}
function cloneDefinitions(source,target,cards){
 for(const card of cards)for(const value of [card.source,card.anchor,...(card.excerpts||[]).map(p=>p.source)].filter(Boolean)){
  const id=value.notebookId||'default';if(id==='default')continue;
  const notebook=book(source,value.documentId,id,true),targetBooks=initialize(target,value.documentId);
  if(!targetBooks.some(n=>n.id===id)){assert(targetBooks.length<128,'TOO_LARGE','Destination notebook capacity exceeded.');targetBooks.push(structuredClone(notebook));}
 }
}
function reveal(set,source){
 if(!source)return false;const notebook=forSource(set,source);if(!notebook||notebook.deletedAt)return false;
 const changed=!notebook.visible||(set.activeNotebooks?.[source.documentId]||'default')!==notebook.id;
 if(changed){initialize(set,source.documentId);book(set,source.documentId,notebook.id).visible=true;set.activeNotebooks[source.documentId]=notebook.id;}return changed;
}
module.exports={writes,list,book,active,forSource,visible,editable,guard,read,request,cloneDefinitions,reveal};
