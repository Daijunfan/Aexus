'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {setup,pdfFixture}=require('./fixtures.cjs');
const {createCanvas}=require('@napi-rs/canvas');
const JSZip=require('jszip');
const sha=b=>createHash('sha256').update(b).digest('hex');
function wav(){const b=Buffer.alloc(44+1600);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(1600,40);return b;}
async function fixture(t){const f=await setup(t);await fs.writeFile(path.join(f.workspace,'source.pdf'),pdfFixture());const doc=await f.api('document.open',{path:'source.pdf',activate:false});let set=await f.api('study.create',{title:'Portable 中文🙂'});const change=async(m,p={})=>set=await f.api(m,{setId:set.id,expectedRevision:set.revision,...p});await change('study.documents.add',{paths:['source.pdf']});
const capture=await f.api('study.card.create',{setId:set.id,expectedRevision:set.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,captureId:randomUUID(),text:'',title:'Original excerpt',color:'blue',locator:{page:2},selection:{rects:[{page:2,x:.1,y:.1,width:.7,height:.2}]}});set=await f.api('study.get',{setId:set.id});return {...f,doc,excerpt:capture.card,change,get:async()=>set=await f.api('study.get',{setId:set.id})};}
test('live references refresh title, edited body and image without changing reference identity or notes',async t=>{
  const f=await fixture(t);let set=await f.change('study.card.update',{cardId:f.excerpt.id,title:'New title',editedText:'live edited body'}),other=await f.api('study.create',{title:'References'});
  other=await f.api('study.card.reference',{setId:other.id,expectedRevision:other.revision,targetSetId:set.id,targetCardId:f.excerpt.id});const id=other.cards[0].id;
  assert.equal(other.cards[0].title,'New title');assert.equal(other.cards[0].editedText,'live edited body');assert(other.cards[0].imageAsset);
  assert.deepEqual(await f.api('study.card.image',{setId:other.id,cardId:id}),await f.api('study.card.image',{setId:set.id,cardId:f.excerpt.id}));
  await f.change('study.comment.add',{cardId:f.excerpt.id,text:'searchable comment marker'});
  assert((await f.api('study.search',{query:'searchable comment marker'})).cards.some(c=>c.cardId===f.excerpt.id));
  assert((await f.api('study.search',{query:'live edited body'})).cards.some(c=>c.cardId===id));
  await f.change('study.card.update',{cardId:f.excerpt.id,title:'Updated from source'});
  other=await f.api('study.get',{setId:other.id});assert.equal(other.cards[0].title,'Updated from source');assert.equal(other.cards[0].id,id);
  set=await f.change('study.card.remove',{cardId:f.excerpt.id,mode:'subtree'});other=await f.api('study.get',{setId:other.id});assert.equal(other.cards[0].referenceStatus,'missing');
  await f.change('study.card.restore',{trashId:set.cardTrash.at(-1).id});assert.equal((await f.api('study.get',{setId:other.id})).cards[0].referenceStatus,'live');
});
test('association listing resolves both endpoints across studies and recovery preserves the outgoing link',async t=>{
  const f=await fixture(t);let set=await f.get(),other=await f.api('study.create',{title:'Other'});other=await f.api('study.note.create',{setId:other.id,expectedRevision:other.revision,title:'Target'});
  set=await f.change('study.link.add',{from:f.excerpt.id,to:other.cards[0].id,toSetId:other.id,label:'Cross-study',bidirectional:true});const linkId=set.links[0].id;
  let out=await f.api('study.links.list',{setId:set.id,cardId:f.excerpt.id});assert.equal(out.links[0].target.title,'Target');assert.equal(out.links[0].ownerSetId,set.id);
  const incoming=await f.api('study.links.list',{setId:other.id,cardId:other.cards[0].id});assert.equal(incoming.links[0].target.cardId,f.excerpt.id);assert.equal(incoming.links[0].outgoing,false);
  set=await f.change('study.card.remove',{cardId:f.excerpt.id,mode:'subtree'});set=await f.change('study.card.restore',{trashId:set.cardTrash.at(-1).id});assert.equal(set.links[0].id,linkId);
  await f.api('study.remove',{setId:other.id,expectedRevision:other.revision});out=await f.api('study.links.list',{setId:set.id,cardId:f.excerpt.id});assert.equal(out.links[0].target.available,false);
});
test('portable package roundtrip carries PDF, image, audio, comments, links and undo across independent workspaces',async t=>{
  const f=await fixture(t);let set=await f.change('study.media.import',{cardId:f.excerpt.id,kind:'audio',mimeType:'audio/wav',name:'recorded.wav',contentBase64:wav().toString('base64')});
  const canvas=createCanvas(40,20);canvas.getContext('2d').fillRect(0,0,30,15);set=await f.change('study.media.import',{kind:'image',name:'photo.png',contentBase64:(await canvas.encode('png')).toString('base64')});const photo=set.lastMedia.cardId;
  set=await f.change('study.comment.add',{cardId:photo,text:`[[${set.id}/${f.excerpt.id}|回源]]`});
  set=await f.change('study.review.configure',{cardId:f.excerpt.id,enabled:true});
  set=await f.change('study.annotation.update',{cardId:f.excerpt.id,visible:false});
  const before=await fs.readFile(path.join(f.workspace,'source.pdf'));const result=await f.api('study.package.export',{setId:set.id,expectedRevision:set.revision,path:'portable.mrpkg'});assert.equal(result.documents,1);assert.equal(result.assets,3);
  const sourceState=await fs.readFile(path.join(f.workspace,'.margin-reader/state.json'));const inspect=await f.api('study.package.inspect',{path:'portable.mrpkg'});assert.equal(inspect.assets,3);assert.deepEqual(await fs.readFile(path.join(f.workspace,'.margin-reader/state.json')),sourceState);
  const other=await setup(t);await fs.copyFile(path.join(f.workspace,'portable.mrpkg'),path.join(other.workspace,'portable.mrpkg'));
  const imported=await other.api('study.package.import',{path:'portable.mrpkg',folder:'Restored',title:'Restored study'});assert.notEqual(imported.setId,set.id);
  let fresh=await other.api('study.get',{setId:imported.setId}),newExcerpt=imported.identityMap[f.excerpt.id],newPhoto=imported.identityMap[photo];assert.equal(fresh.title,'Restored study');assert.equal(fresh.cards.find(c=>c.id===newExcerpt).annotation.visible,false);
  assert.deepEqual(await other.api('study.card.image',{setId:fresh.id,cardId:newExcerpt}),await f.api('study.card.image',{setId:set.id,cardId:f.excerpt.id}));
  const audio=fresh.cards.find(c=>c.id===newExcerpt).comments[0].media;assert.equal(sha((await other.runtime.readAsset(audio.asset)).bytes),sha(wav()));
  const link=await other.api('study.card.render',{setId:fresh.id,cardId:newPhoto});assert(link.html.includes('')&&link.comments[0].html.includes(`${fresh.id}/${newExcerpt}`));
  const target=await other.api('study.card.activate',{setId:fresh.id,cardId:newExcerpt});assert.equal(target.source.locator.page,2);assert(target.source.path.startsWith('Restored/'));
  fresh=await other.api('study.get',{setId:fresh.id});fresh=await other.api('study.undo',{setId:fresh.id,expectedRevision:fresh.revision});assert.notEqual(fresh.cards.find(c=>c.id===newExcerpt).annotation?.visible,false);
  assert.deepEqual(await fs.readFile(path.join(f.workspace,'source.pdf')),before);assert.equal(sha(await fs.readFile(path.join(other.workspace,imported.documents[0].path))),sha(before));
  await other.error('study.package.import',{path:'portable.mrpkg',folder:'Restored'},'ALREADY_EXISTS');
  await other.error('study.package.import',{path:'portable.mrpkg',folder:'../escape'},'SCOPE_DENIED');
});
test('encrypted local package requires a passphrase and corruption never creates a partial restored library',async t=>{
  const f=await fixture(t),set=await f.get();await f.api('study.package.export',{setId:set.id,path:'encrypted.mrpkg',password:'correct local passphrase'});
  const encrypted=await fs.readFile(path.join(f.workspace,'encrypted.mrpkg'));assert(!encrypted.includes(Buffer.from('Portable')));
  await f.error('study.package.inspect',{path:'encrypted.mrpkg'},'PASSWORD_REQUIRED');await f.error('study.package.import',{path:'encrypted.mrpkg',folder:'Wrong',password:'wrong passphrase'},'PASSWORD_REQUIRED');assert.equal(await fs.stat(path.join(f.workspace,'Wrong')).catch(()=>null),null);
  assert.equal((await f.api('study.package.inspect',{path:'encrypted.mrpkg',password:'correct local passphrase'})).sets[0].id,set.id);
  await f.api('study.package.export',{setId:set.id,path:'good.mrpkg'});
  const zip=await JSZip.loadAsync(await fs.readFile(path.join(f.workspace,'good.mrpkg'))),manifest=JSON.parse(await zip.file('manifest.json').async('string'));manifest.assets[0].sha256='a'.repeat(64);zip.file('manifest.json',JSON.stringify(manifest));await fs.writeFile(path.join(f.workspace,'bad.mrpkg'),await zip.generateAsync({type:'nodebuffer'}));
  await f.error('study.package.import',{path:'bad.mrpkg',folder:'Corrupt'},'INVALID_PACKAGE');assert.equal(await fs.stat(path.join(f.workspace,'Corrupt')).catch(()=>null),null);
});
test('package validation rejects CSS injection, missing media and prototype keys before importing',async t=>{
  const f=await fixture(t),set=await f.get();await f.api('study.package.export',{setId:set.id,path:'good.mrpkg'});const bytes=await fs.readFile(path.join(f.workspace,'good.mrpkg'));
  for(const [name,mutate,code] of [['style',m=>m.sets[0].cards[0].style={background:'red;position:fixed'},'INVALID_PARAMS'],['missing',m=>m.assets=[],'INVALID_PACKAGE'],['proto',m=>{Object.defineProperty(m.sets[0],'__proto__',{value:{bad:true},enumerable:true});},'INVALID_PACKAGE']]){
    const zip=await JSZip.loadAsync(bytes),manifest=JSON.parse(await zip.file('manifest.json').async('string'));mutate(manifest);zip.file('manifest.json',JSON.stringify(manifest));await fs.writeFile(path.join(f.workspace,name+'.mrpkg'),await zip.generateAsync({type:'nodebuffer'}));await f.error('study.package.import',{path:name+'.mrpkg',folder:name},code);assert.equal(await fs.stat(path.join(f.workspace,name)).catch(()=>null),null);
  }
});
