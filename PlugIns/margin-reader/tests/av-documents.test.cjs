'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {setup}=require('./fixtures.cjs'),AV=require('../lib/av-document.cjs');
const {make}=require('./fixtures-av.cjs');
test('local video/audio register as documents with real metadata, valid time locators and byte-preserving assets',{skip:!AV.available()},async t=>{
 const f=await setup(t);make(f.workspace);
 for(const name of ['lesson.webm','lesson.wav']){const bytes=await fs.readFile(path.join(f.workspace,name)),doc=await f.api('document.open',{path:name});assert.equal(doc.kind,'media');assert(doc.media.duration>=4);assert.equal(doc.position.time,0);
  const info=await f.api('document.av.info',{id:doc.id});assert.equal(info.media.type,name.endsWith('wav')?'audio':'video');
  await f.api('reader.position.set',{id:doc.id,locator:{time:1.25}});assert.equal((await f.api('document.open',{path:name})).position.time,1.25);
  await f.error('reader.position.set',{id:doc.id,locator:{time:5}},'INVALID_LOCATOR');
  const bookmark=await f.api('bookmark.add',{id:doc.id,expectedRevision:doc.revision,title:'Time marker',locator:{time:2}});assert.equal(bookmark.bookmarks[0].locator.time,2);const link=await f.api('link.create',{kind:'document',id:doc.id,locator:{time:1.5,endTime:2}});assert.equal((await f.api('link.resolve',{uri:link.uri})).locator.time,1.5);
  assert.deepEqual((await f.runtime.readAsset('original/'+doc.id)).bytes,bytes);
 }
});
test('timeline excerpts save actual frame/waveform images, return to the interval, and preserve conflict/scope boundaries',{skip:!AV.available()},async t=>{
 const f=await setup(t);make(f.workspace);let set=await f.api('study.create',{title:'Media study'});set=await f.api('study.documents.add',{setId:set.id,expectedRevision:set.revision,paths:['lesson.webm','lesson.wav']});
 for(const name of ['lesson.webm','lesson.wav']){const doc=await f.api('document.open',{path:name});const p={setId:set.id,expectedRevision:set.revision,documentId:doc.id,expectedSourceVersion:doc.sourceVersion,start:1,end:2,title:'Excerpt '+name,text:'Local note'};
  set=await f.api('study.av.excerpt',p);const card=set.cards.find(c=>c.title===p.title);assert.equal(card.anchor.locator.time,1);assert.equal(card.anchor.locator.endTime,2);assert(card.image.width>100);assert(card.image.height>50);
  const image=await f.runtime.readAsset(card.imageAsset);assert.equal(image.mimeType,'image/png');assert.equal(image.bytes.toString('ascii',1,4),'PNG');
  const jump=await f.api('study.card.activate',{setId:set.id,cardId:card.id,force:true});assert.equal(jump.source.locator.time,1);
  set=await f.api('study.get',{setId:set.id});await f.error('study.av.excerpt',p,'CONFLICT');
  await f.error('study.av.excerpt',{...p,expectedRevision:set.revision,end:100},'INVALID_LOCATOR');
  await fs.appendFile(path.join(f.workspace,name),'changed');await f.error('study.av.excerpt',{...p,expectedRevision:set.revision},'SOURCE_CHANGED');
 }
});

