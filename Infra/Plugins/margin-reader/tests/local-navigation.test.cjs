"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path');
const {randomUUID} = require('node:crypto');
const {setup, pdfFixture} = require('./fixtures.cjs');
async function fixture(t) {
  const f = await setup(t); await fs.writeFile(path.join(f.workspace, 'book.pdf'), pdfFixture());
  const doc = await f.api('document.open', {path:'book.pdf'});
  let set = await f.api('study.create', {title:'Linked study'});
  set = await f.api('study.documents.add', {setId:set.id, expectedRevision:set.revision, paths:['book.pdf']});
  const result = await f.api('study.card.create', {setId:set.id, expectedRevision:set.revision, documentId:doc.id,
    expectedSourceVersion:doc.sourceVersion, captureId:randomUUID(), text:'', color:'yellow', locator:{page:2},
    selection:{rects:[{page:2,x:.12,y:.22,width:.6,height:.16}]}});
  set = await f.api('study.get',{setId:set.id});
  const change = async (method, params={}) => set=await f.api(method,{setId:set.id,expectedRevision:set.revision,...params});
  return {...f,doc,card:result.card,change,get:async()=>set=await f.api('study.get',{setId:set.id})};
}
test('single activation resolves precise PDF region, unfolds target and reveals collapsed ancestors atomically',async t=>{
  const f=await fixture(t);let s=await f.change('study.note.create',{title:'Parent'});const parent=s.cards.find(c=>c.title==='Parent');
  await f.change('study.card.move',{cardId:f.card.id,parentId:parent.id});
  await f.change('study.card.update',{cardId:parent.id,collapsed:true});
  await f.api('document.fold',{id:f.doc.id,expectedRevision:f.doc.revision,pages:[2]});
  const next=await f.api('study.card.activate',{setId:s.id,cardId:f.card.id});
  assert.equal(next.linked,true);assert.deepEqual(next.source.locator,{page:2,pageOffset:.22});
  assert.equal(next.set.cards.find(c=>c.id===parent.id).collapsed,false);
  assert.equal(next.set.selection.cardId,f.card.id);
  const doc=await f.api('document.get',{id:f.doc.id});assert.deepEqual(doc.foldedPages,[]);assert.deepEqual(doc.position,next.source.locator);
  assert.equal((await f.api('settings.get')).lastDocument,doc.id);
  assert.deepEqual(await fs.readFile(path.join(f.workspace,'book.pdf')),pdfFixture());
});
test('cancel annotation preserves image, card, review and original, with revision guard and undo',async t=>{
  const f=await fixture(t),s=await f.get();const image=await f.api('study.card.image',{setId:s.id,cardId:f.card.id});
  const hidden=await f.change('study.annotation.update',{cardId:f.card.id,visible:false,style:'underline'});
  assert.equal(hidden.cards.length,1);assert.equal(hidden.cards[0].annotation.visible,false);
  assert.deepEqual(await f.api('study.card.image',{setId:s.id,cardId:f.card.id}),image);
  await f.error('study.annotation.update',{setId:s.id,expectedRevision:s.revision,cardId:f.card.id,visible:true},'CONFLICT');
  await f.change('study.undo');assert.notEqual((await f.get()).cards[0].annotation?.visible,false);
  const removed=await f.change('study.card.remove',{cardId:f.card.id});assert.equal(removed.cards.length,0);
  await f.change('study.card.restore',{trashId:removed.cardTrash[0].id});assert.equal((await f.get()).cards[0].id,f.card.id);
});
test('four linkage directions and explicit source action are shared CLI behavior',async t=>{
  const f=await fixture(t);
  for(const mode of ['both','map-to-document','document-to-map','off']){
    const s=await f.change('study.navigation.set',{mode});
    for(const origin of ['map','document']){
      await f.api('reader.position.set',{id:f.doc.id,locator:{page:1}});
      const r=await f.api('study.card.activate',{setId:s.id,cardId:f.card.id,origin});
      const linked=mode==='both'||mode===(origin==='map'?'map-to-document':'document-to-map');
      assert.equal(r.linked,linked);assert.equal((await f.api('reader.position.get',{id:f.doc.id})).locator.page,origin==='map'&&linked?2:1);
    }
  }
  const s=await f.get(),r=await f.api('study.card.activate',{setId:s.id,cardId:f.card.id,force:true});assert.equal(r.source.locator.page,2);
});
test('source changes, detached membership and missing originals never silently apply old coordinates',async t=>{
  const f=await fixture(t);const s=await f.get();await fs.appendFile(path.join(f.workspace,'book.pdf'),'\nchanged');
  const before=await f.api('settings.get');await f.error('study.card.activate',{setId:s.id,cardId:f.card.id},'SOURCE_CHANGED');assert.deepEqual(await f.api('settings.get'),before);
  await fs.writeFile(path.join(f.workspace,'book.pdf'),pdfFixture());await f.api('document.open',{path:'book.pdf',refresh:true});
  await f.change('study.documents.remove',{documentIds:[f.doc.id]});await f.error('study.card.activate',{setId:s.id,cardId:f.card.id},'NOT_MEMBER');
  await f.change('study.documents.add',{paths:['book.pdf']});await fs.rm(path.join(f.workspace,'book.pdf'));await f.error('study.card.activate',{setId:s.id,cardId:f.card.id},'NOT_FOUND');
});
test('document-only notes are idempotent and flow excerpt navigation carries exact Unicode offsets',async t=>{
  const f=await setup(t);await f.api('fs.write',{path:'flow.html',content:'<h1 id="chapter">Title</h1><p>前面的文字🙂</p><p>这里是目标摘录</p>'});
  const doc=await f.api('document.open',{path:'flow.html'});const content=await f.api('document.content',{id:doc.id});
  const dom=new(require('jsdom').JSDOM)(content.html),text=dom.window.document.body.textContent;dom.window.close();
  const start=text.indexOf('这里是目标摘录'),quote='这里是目标摘录';assert(start>0);
  const a=await f.api('study.document.ensure',{id:doc.id});const b=await f.api('study.document.ensure',{id:doc.id});assert.equal(a.id,b.id);assert.equal((await f.api('study.list')).sets.length,1);
  const c=await f.api('study.card.create',{setId:a.id,expectedRevision:a.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,captureId:randomUUID(),text:quote,color:'blue',locator:{section:0},selection:{start,end:start+quote.length}});
  const activated=await f.api('study.card.activate',{setId:a.id,cardId:c.card.id});assert.equal(activated.source.locator.textOffset,start);
  assert.equal((await f.api('reader.position.get',{id:doc.id})).locator.textOffset,start);
  await f.error('reader.position.set',{id:doc.id,locator:{section:0,textOffset:text.length+1}},'INVALID_LOCATOR');
});
test('cross-study references use target source and never resolve another workspace',async t=>{
  const f=await fixture(t),s=await f.get();let other=await f.api('study.create',{title:'Reference'});
  other=await f.api('study.card.reference',{setId:other.id,expectedRevision:other.revision,targetSetId:s.id,targetCardId:f.card.id});
  const r=await f.api('study.card.activate',{setId:other.id,cardId:other.cards[0].id});assert.equal(r.setId,s.id);assert.equal(r.cardId,f.card.id);assert.equal(r.source.documentId,f.doc.id);
  await f.error('study.card.activate',{setId:randomUUID(),cardId:f.card.id},'NOT_FOUND');
});
