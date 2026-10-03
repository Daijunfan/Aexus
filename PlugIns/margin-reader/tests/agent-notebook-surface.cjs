'use strict';
const assert=require('node:assert/strict');
exports.exercise=async({api,deny,pdf})=>{
 const doc=await api('document.get',{id:pdf.id});let set=await api('study.create',{mapMode:'cards',title:'Employee annotation notebooks'});
 const change=async(method,p={})=>set=await api(method,{setId:set.id,expectedRevision:set.revision,...p});
 await change('study.documents.add',{paths:[doc.path]});
 const initial=await api('study.notebook.list',{setId:set.id,documentId:doc.id});assert.equal(initial.activeId,'default');
 await change('study.notebook.create',{documentId:doc.id,title:'First pass'});const notebookId=set.lastNotebookId;
 await change('study.note.create',{title:'First-pass note',text:'Preserve this note across notebook switches'});const cardId=set.lastInsertedCard||set.cards.at(-1).id;
 await change('study.note.anchor',{cardId,documentId:doc.id,locator:{page:1},display:'margin'});assert.equal(set.cards.find(c=>c.id===cardId).anchor.notebookId,notebookId);
 await change('study.notebook.update',{documentId:doc.id,notebookId,title:'Renamed pass',locked:true});
 await deny('study.card.update',{setId:set.id,expectedRevision:set.revision,cardId,text:'Blocked'},'NOTEBOOK_LOCKED');
 await change('study.notebook.update',{documentId:doc.id,notebookId,locked:false});
 await change('study.notebook.assign',{documentId:doc.id,notebookId:'default',cardIds:[cardId]});assert.equal(set.cards.find(c=>c.id===cardId).anchor.notebookId,'default');
 await change('study.notebook.select',{documentId:doc.id,notebookId:'default',showOthers:false});
 await change('study.notebook.update',{documentId:doc.id,notebookId,deleted:true});await change('study.notebook.update',{documentId:doc.id,notebookId,deleted:false});
 const after=await api('study.notebook.list',{setId:set.id,documentId:doc.id});assert(after.notebooks.some(n=>n.id===notebookId&&!n.deletedAt));assert.equal(after.notebooks.find(n=>n.id==='default').cards,1);
 console.log('PASS Employee annotation notebooks preserve note identities, locking, assignment, selection and recoverable deletion');
};
