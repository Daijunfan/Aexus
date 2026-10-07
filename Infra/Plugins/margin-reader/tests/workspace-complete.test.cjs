'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {setup}=require('./fixtures.cjs'),{compile}=require('../lib/search-query.cjs');
test('literal Boolean grammar handles phrases, fields, negation and nesting without interpreting regex or code',()=>{
 const row={title:'Alpha 中文',text:'Beta and gamma (x+y)',tags:['exam','review'],note:'evidence',path:'Books/alpha.md',color:'blue'};
 for(const query of ['title:Alpha AND tag:exam','(tag:exam OR tag:other) NOT color:red','"and"','"(x+y)"','Alpha -red','text:Beta note:evidence'])assert(compile(query).matches(row),query);
 for(const query of ['tag:other','Alpha AND color:red','NOT (tag:exam OR text:Beta)','text:"A.*"'])assert(!compile(query).matches(row),query);
 for(const query of ['(', 'Alpha OR','"unterminated','script:alert','Alpha )','NOT','()'])assert.throws(()=>compile(query),{code:'INVALID_QUERY'});
 assert.throws(()=>compile('AND'),{code:'INVALID_QUERY'});
});
test('workspace indexing and search paginate documents/cards without stealing reader position or hiding stale originals',async t=>{
 const f=await setup(t);for(let i=0;i<5;i++)await fs.writeFile(path.join(f.workspace,`doc-${i}.html`),`<h1>Topic ${i}</h1><p>Alpha exact phrase 中文🙂 example ${i}.</p>`);
 const active=await f.api('document.open',{path:'doc-0.html'});const indexed=[];let offset=0;
 do{const batch=await f.api('library.index',{offset,limit:2});indexed.push(...batch.indexed);assert.deepEqual(batch.errors,[]);offset=batch.nextOffset;}while(offset!==null);
 assert.equal(indexed.length,5);assert.equal((await f.api('settings.get')).lastDocument,active.id);
 let s=await f.api('study.create',{title:'Search notes'});s=await f.api('study.note.create',{setId:s.id,expectedRevision:s.revision,title:'Alpha note',text:'exact phrase 中文🙂',tags:['exam']});
 const all=[];offset=0;do{const result=await f.api('library.search',{query:'"exact phrase" OR tag:exam',offset,limit:2});assert.equal(result.total,6);all.push(...result.hits);offset=result.nextOffset;}while(offset!==null);
 assert.equal(new Set(all.map(x=>x.uri)).size,6);const docs=all.filter(x=>x.kind==='document');assert(docs.every(x=>x.locator.textOffset>=0));
 assert.equal((await f.api('library.search',{query:'tag:exam AND title:Alpha'})).total,1);
 await fs.appendFile(path.join(f.workspace,'doc-4.html'),'<p>Changed</p>');const changed=await f.api('library.search',{query:'Alpha',kind:'documents'});assert.equal(changed.skipped.length,1);assert.equal(changed.skipped[0].code,'SOURCE_CHANGED');
 await f.error('library.search',{query:'title:"bad'},'INVALID_QUERY');
});
test('outline batch is atomic, old edits undo/redo, and a document outline imports before there are any excerpts',async t=>{
 const f=await setup(t);await fs.writeFile(path.join(f.workspace,'outline.md'),'# One\nText\n## Two\nSecond\n');let d=await f.api('document.open',{path:'outline.md'});const id=d.id,original=d.toc;
 const update=await f.api('toc.batch',{id,expectedRevision:d.revision,operations:[{action:'update',nodeId:original[0].id,title:'Changed'},{action:'add',title:'Manual',locator:{section:0}}]});assert.equal(update.toc.length,3);assert.equal(update.toc[0].title,'Changed');
 await f.error('toc.batch',{id,expectedRevision:update.revision,operations:[{action:'update',nodeId:original[0].id,title:'Must rollback'},{action:'move',nodeId:original[0].id,parentId:original[1].id}]},'INVALID_OUTLINE');assert.equal((await f.api('toc.list',{id})).toc[0].title,'Changed');
 d=await f.api('toc.undo',{id,expectedRevision:update.revision});assert.deepEqual(d.toc,original);d=await f.api('toc.redo',{id,expectedRevision:d.revision});assert.equal(d.toc.length,3);
 let s=await f.api('study.create',{title:'Direct chapter map'});s=await f.api('study.documents.add',{setId:s.id,expectedRevision:s.revision,paths:['outline.md']});s=await f.api('study.toc.import',{setId:s.id,expectedRevision:s.revision,documentId:id});assert.equal(s.lastOutlineImport.chapters,3);assert.equal(s.cards.length,4);assert(s.cards.filter(c=>c.anchor).every(c=>c.anchor.documentId===id));
 const identities=s.cards.map(c=>c.id);s=await f.api('study.toc.import',{setId:s.id,expectedRevision:s.revision,documentId:id});assert.deepEqual(s.cards.map(c=>c.id),identities);
});
test('local numbered-heading outline generation does not claim to use OCR or AI and can be reverted',async t=>{
 const f=await setup(t);await fs.writeFile(path.join(f.workspace,'numbered.txt'),'1 Introduction\nBody here\n1.1 Background\nMore body\n2 Results\nFinal body');let d=await f.api('document.open',{path:'numbered.txt'});const before=d.toc;
 d=await f.api('toc.generate',{id:d.id,expectedRevision:d.revision,strategy:'numbered'});assert.equal(d.toc.length,3);assert.equal(d.toc[1].parentId,d.toc[0].id);d=await f.api('toc.undo',{id:d.id,expectedRevision:d.revision});assert.deepEqual(d.toc,before);
});
