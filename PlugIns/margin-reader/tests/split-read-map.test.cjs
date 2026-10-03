'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup,pdfFixture}=require('./fixtures.cjs');
async function fixture(t){
 const f=await setup(t);await fs.writeFile(path.join(f.workspace,'first.pdf'),pdfFixture());await fs.writeFile(path.join(f.workspace,'second.pdf'),pdfFixture());
 let set=await f.api('study.create',{title:'Split reading'});set=await f.api('study.documents.add',{setId:set.id,expectedRevision:set.revision,paths:['first.pdf','second.pdf']});
 set=await f.api('study.mindmap.outline.import',{setId:set.id,expectedRevision:set.revision,text:'Knowledge\n  Reading\n  Diagram'});
 await f.api('study.open',{setId:set.id,documentId:set.documentIds[1]});return {...f,set};
}
test('split view keeps the selected source, page, topic data and public layout preferences',async t=>{
 const f=await fixture(t),before=f.set,docId=before.documentIds[1];await f.api('reader.position.set',{id:docId,locator:{page:2,pageOffset:.4}});
 const split=await f.api('study.view.set',{setId:before.id,expectedRevision:before.revision,view:'split'});
 assert.equal(split.view,'split');assert.deepEqual(split.cards,before.cards);assert.equal(split.revision,before.revision+1);assert.equal((await f.api('settings.get')).lastDocument,docId);assert.equal((await f.api('reader.position.get',{id:docId})).locator.page,2);
 const settings=await f.api('settings.set',{studyOrder:'map-first',studyRatio:.62});assert.equal(settings.studyOrder,'map-first');assert.equal(settings.studyRatio,.62);
 const single=await f.api('study.view.set',{setId:split.id,expectedRevision:split.revision,view:'documents',documentId:docId});assert.equal((await f.api('settings.get')).lastDocument,docId);
 await f.api('study.view.set',{setId:single.id,expectedRevision:single.revision,view:'map'});assert.equal((await f.api('settings.get')).lastDocument,null);assert.equal((await f.api('reader.position.get',{id:docId})).locator.page,2);
 assert.deepEqual(await fs.readFile(path.join(f.workspace,'second.pdf')),pdfFixture());
});
test('split navigation rejects foreign documents and stale writes atomically, and inactive studies cannot steal the reader',async t=>{
 const f=await fixture(t),s=f.set;await f.api('fs.write',{path:'foreign.html',content:'<h1>Other source</h1>'});const foreign=await f.api('document.open',{path:'foreign.html',activate:false});
 const before=await fs.readFile(path.join(f.workspace,'.margin-reader/state.json'));
 await f.error('study.view.set',{setId:s.id,expectedRevision:s.revision,view:'split',documentId:foreign.id},'NOT_MEMBER');assert.deepEqual(await fs.readFile(path.join(f.workspace,'.margin-reader/state.json')),before);
 const split=await f.api('study.view.set',{setId:s.id,expectedRevision:s.revision,view:'split'});
 await f.error('study.view.set',{setId:s.id,expectedRevision:s.revision,view:'documents'},'CONFLICT');
 await f.error('study.view.set',{setId:s.id,expectedRevision:split.revision,view:'map',documentId:s.documentIds[0]},'INVALID_PARAMS');
 const other=await f.api('study.create',{title:'Background'});await f.api('study.view.set',{setId:other.id,expectedRevision:other.revision,view:'split'});
 const after=await f.api('settings.get');assert.equal(after.activeStudySet,s.id);assert.equal(after.lastDocument,s.documentIds[1]);
});
test('empty or missing-source split views keep the document picker usable and preserve the whole graph',async t=>{
 const f=await fixture(t);let s=await f.api('study.view.set',{setId:f.set.id,expectedRevision:f.set.revision,view:'split',documentId:null});assert.equal((await f.api('settings.get')).lastDocument,null);
 await fs.unlink(path.join(f.workspace,'first.pdf'));await f.api('study.open',{setId:s.id});assert.equal((await f.api('settings.get')).lastDocument,s.documentIds[1]);
 await fs.unlink(path.join(f.workspace,'second.pdf'));await f.api('study.open',{setId:s.id});assert.equal((await f.api('settings.get')).lastDocument,null);
 assert.deepEqual((await f.api('study.get',{setId:s.id})).cards,s.cards);assert.equal((await f.api('study.get',{setId:s.id})).view,'split');
});
