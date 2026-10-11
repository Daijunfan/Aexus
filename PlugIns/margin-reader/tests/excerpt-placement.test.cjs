'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {setup,pdfFixture}=require('./fixtures.cjs');
test('excerpt drop placement is atomic, bypasses presets only explicitly, expands a target and preserves capture retry identities',async t=>{
 const f=await setup(t),bytes=pdfFixture();await fs.writeFile(path.join(f.workspace,'source.pdf'),bytes);
 let set=await f.api('study.create',{title:'Drop excerpts'});
 const change=async(method,p={})=>set=await f.api(method,{setId:set.id,expectedRevision:set.revision,...p});
 await change('study.documents.add',{paths:['source.pdf']});const document=await f.api('document.get',{id:set.documentIds[0]});
 await change('study.note.create',{title:'Target'});const parent=set.cards[0].id;await change('study.card.update',{cardId:parent,collapsed:true});
 const draft=()=>({setId:set.id,expectedRevision:set.revision,documentId:document.id,expectedSourceVersion:document.sourceVersion,captureId:randomUUID(),title:'Source excerpt',text:'',color:'yellow',locator:{page:1},selection:{rects:[{page:1,x:.1,y:.05,width:.6,height:.1}]}});
 let request={...draft(),parentId:parent},result=await f.api('study.card.create',request);set=await f.api('study.get',{setId:set.id});assert.equal(set.cards.find(c=>c.id===parent).collapsed,false);assert.equal(result.card.parentId,parent);
 assert((await f.api('study.card.create',request)).duplicate);await change('study.undo');assert.equal(set.cards.length,1);assert.equal(set.cards[0].collapsed,true);
 await change('study.capture.settings',{parentId:parent,inMap:false,organize:'toc'});
 request={...draft(),parentId:null,x:-340,y:-220};result=await f.api('study.card.create',request);set=await f.api('study.get',{setId:set.id});assert.equal(result.card.parentId,null);assert.equal(result.card.inMap,true);assert.deepEqual(result.card.position,{x:-340,y:-220});assert(result.card.source&&result.card.image);
 assert((await f.api('study.card.create',request)).duplicate);await f.error('study.card.create',{...request,x:200},'CONFLICT');
 for(const patch of [{x:2},{x:2,y:3,parentId:parent},{x:2e9,y:1,parentId:null}])await f.error('study.card.create',{...draft(),...patch},'INVALID_PARAMS');
 assert.deepEqual(await fs.readFile(path.join(f.workspace,'source.pdf')),bytes);await change('study.undo');assert.equal(set.cards.length,1);
 const defaultRequest=draft();result=await f.api('study.card.create',defaultRequest);assert.equal(result.card.parentId,parent);assert((await f.api('study.card.create',defaultRequest)).duplicate);
});
