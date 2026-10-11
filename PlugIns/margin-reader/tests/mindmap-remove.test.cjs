'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup,pdfFixture}=require('./fixtures.cjs');
async function fixture(t){
 const f=await setup(t);let set=await f.api('study.create',{title:'Recoverable topics'});
 const change=async(method,p={})=>set=await f.api(method,{setId:set.id,expectedRevision:set.revision,...p});
 await change('study.mindmap.outline.import',{text:'Root\n  First\n    Nested\n      Leaf\n  Second\n    Second leaf'});
 return {...f,change,get set(){return set;}};
}
test('atomic topic deletion promotes unselected descendants once and undo/redo and trash restore preserve identities and links',async t=>{
 const f=await fixture(t),[root,first,nested,leaf,second]=f.set.cards;
 await f.change('study.link.add',{from:first.id,to:second.id,label:'Saved relationship'});
 const original=structuredClone(f.set.cards),links=structuredClone(f.set.links),revision=f.set.revision;
 await f.change('study.cards.remove',{cardIds:[first.id,nested.id,first.id]});
 assert.equal(f.set.revision,revision+1);assert.equal(f.set.cardTrash.length,1);assert.equal(f.set.cardTrash[0].count,2);assert.equal(f.set.cards.find(c=>c.id===leaf.id).parentId,root.id);assert.equal(f.set.links.length,0);
 await f.change('study.undo');assert.deepEqual(f.set.cards,original);assert.deepEqual(f.set.links,links);
 await f.change('study.redo');await f.change('study.card.restore',{trashId:f.set.cardTrash[0].id});
 assert.equal(f.set.cards.find(c=>c.id===leaf.id).parentId,nested.id);assert.equal(f.set.cards.find(c=>c.id===nested.id).parentId,first.id);assert.deepEqual(f.set.links,links);
});
test('stale and invalid batch deletions are atomic; subtree removal clears focus and preserves locked descendants',async t=>{
 const f=await fixture(t),[root,first,nested,leaf]=f.set.cards;
 await f.change('study.map.configure',{focusId:first.id});let revision=f.set.revision;
 for(const [cardIds,expectedRevision,code] of [[[first.id],revision-1,'CONFLICT'],[[first.id,'missing'],revision,'NOT_FOUND'],[[],revision,'INVALID_PARAMS']])await f.error('study.cards.remove',{setId:f.set.id,cardIds,expectedRevision},code);
 assert.equal((await f.api('study.get',{setId:f.set.id})).revision,revision);
 await f.change('study.cards.remove',{cardIds:[first.id,nested.id],mode:'subtree'});assert.equal(f.set.cardTrash[0].count,3);assert.equal(f.set.map.focusId,null);assert(!f.set.cards.some(c=>[first.id,nested.id,leaf.id].includes(c.id)));
 await f.change('study.undo');assert.equal(f.set.map.focusId,first.id);
 const pdf=pdfFixture();await fs.writeFile(path.join(f.workspace,'source.pdf'),pdf);await f.change('study.documents.add',{paths:['source.pdf']});
 const document=await f.api('document.get',{id:f.set.documentIds[0]});
 const capture=await f.api('study.card.create',{setId:f.set.id,expectedRevision:f.set.revision,documentId:document.id,expectedSourceVersion:document.sourceVersion,captureId:require('node:crypto').randomUUID(),title:'Excerpt',text:'',color:'yellow',locator:{page:1},selection:{rects:[{page:1,x:.1,y:.05,width:.6,height:.1}]}});
 const refresh=()=>f.api('study.get',{setId:f.set.id});let set=await refresh();
 set=await f.api('study.card.move',{setId:set.id,expectedRevision:set.revision,cardId:capture.card.id,parentId:first.id});
 set=await f.api('study.notebook.update',{setId:set.id,expectedRevision:set.revision,documentId:document.id,notebookId:'default',locked:true});
 await f.error('study.cards.remove',{setId:set.id,expectedRevision:set.revision,cardIds:[first.id],mode:'subtree'},'NOTEBOOK_LOCKED');assert.deepEqual((await refresh()).cards,set.cards);
 set=await f.api('study.notebook.update',{setId:set.id,expectedRevision:set.revision,documentId:document.id,notebookId:'default',locked:false});
 const image=await f.api('study.card.image',{setId:set.id,cardId:capture.card.id});
 set=await f.api('study.cards.remove',{setId:set.id,expectedRevision:set.revision,cardIds:[capture.card.id]});set=await f.api('study.card.restore',{setId:set.id,expectedRevision:set.revision,trashId:set.cardTrash.at(-1).id});
 assert.deepEqual(await f.api('study.card.image',{setId:set.id,cardId:capture.card.id}),image);assert.deepEqual(await fs.readFile(path.join(f.workspace,'source.pdf')),pdf);
});
test('restoring a deleted parent retains a deliberate later child move',async t=>{
 const f=await fixture(t),[,first,nested,,second]=f.set.cards;
 await f.change('study.card.remove',{cardId:first.id});const trashId=f.set.cardTrash[0].id;
 await f.change('study.card.move',{cardId:nested.id,parentId:second.id});await f.change('study.card.restore',{trashId});
 assert.equal(f.set.cards.find(c=>c.id===nested.id).parentId,second.id);
});
