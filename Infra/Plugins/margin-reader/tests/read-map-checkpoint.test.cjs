'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup,pdfFixture}=require('./fixtures.cjs');
test('late reader checkpoints preserve navigation while explicit CLI position jumps still activate their document',async t=>{
 const f=await setup(t);await fs.writeFile(path.join(f.workspace,'original.pdf'),pdfFixture());const doc=await f.api('document.open',{path:'original.pdf'});let s=await f.api('study.create',{title:'Map navigation'});
 s=await f.api('study.documents.add',{setId:s.id,expectedRevision:s.revision,paths:['original.pdf']});await f.api('study.open',{setId:s.id,documentId:doc.id});
 s=await f.api('study.view.set',{setId:s.id,expectedRevision:s.revision,view:'map'});assert.equal((await f.api('settings.get')).lastDocument,null);
 await f.api('reader.position.set',{id:doc.id,locator:{page:2},activate:false});assert.equal((await f.api('settings.get')).lastDocument,null);assert.equal((await f.api('reader.position.get',{id:doc.id})).locator.page,2);
 await f.api('reader.position.set',{id:doc.id,locator:{page:1}});assert.equal((await f.api('settings.get')).lastDocument,doc.id);
 assert.deepEqual(await fs.readFile(path.join(f.workspace,'original.pdf')),pdfFixture());
});
