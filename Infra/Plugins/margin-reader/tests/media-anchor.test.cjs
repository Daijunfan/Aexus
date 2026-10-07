"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {createCanvas}=require('@napi-rs/canvas'),{setup,pdfFixture}=require('./fixtures.cjs');
test('media placement validates source and geometry atomically, including no orphan image on failure',async t=>{
 const f=await setup(t);await fs.writeFile(path.join(f.workspace,'book.pdf'),pdfFixture());let set=await f.api('study.create',{title:'Atomic image placement'});set=await f.api('study.documents.add',{setId:set.id,expectedRevision:set.revision,paths:['book.pdf']});const doc=await f.api('document.open',{path:'book.pdf',activate:false});
 const contentBase64=(await createCanvas(60,40).encode('png')).toString('base64'),params={setId:set.id,expectedRevision:set.revision,kind:'image',name:'photo.png',contentBase64};
 const before=await fs.readFile(path.join(f.workspace,'.margin-reader/state.json'));
 await f.error('study.media.import',{...params,anchor:{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,locator:{page:99},display:'margin'}},'INVALID_LOCATOR');
 assert.deepEqual(await fs.readFile(path.join(f.workspace,'.margin-reader/state.json')),before);
 assert.equal((await fs.readdir(path.join(f.workspace,'.margin-reader/study-media',set.id))).length,0);
 set=await f.api('study.media.import',{...params,anchor:{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,locator:{page:1},display:'overlay',rect:{x:.1,y:.2,width:.3,height:.2}}});assert.equal(set.cards[0].anchor.rect.y,.2);
 set=await f.api('study.undo',{setId:set.id,expectedRevision:set.revision});assert.equal(set.cards.length,0);
});
