'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup,pdfFixture}=require('./fixtures.cjs');
const {createCanvas}=require('@napi-rs/canvas');
async function picture(){const canvas=createCanvas(80,50),c=canvas.getContext('2d');c.fillStyle='#2785ae';c.fillRect(0,0,40,50);c.fillStyle='#db683b';c.fillRect(40,0,40,50);return canvas.encode('png');}
function wav(){const frames=800,bytes=Buffer.alloc(44+frames*2);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(16000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*2,40);return bytes;}
async function fixture(t){const f=await setup(t);let set=await f.api('study.create',{title:'Content'});const change=async(method,p={})=>set=await f.api(method,{setId:set.id,expectedRevision:set.revision,...p});return {...f,change,get:async()=>set=await f.api('study.get',{setId:set.id})};}
test('wiki links, aliases, title dictionaries and backlinks resolve stable scoped identities',async t=>{
  const f=await fixture(t);let s=await f.change('study.note.create',{title:'Concept',text:'Definition'});const target=s.cards[0].id;
  s=await f.change('study.note.create',{title:'Discussion',text:`[[${s.id}/${target}|Alias]] and Concept.\n\n\`Concept\`\n\n<script>alert(1)</script>`});const card=s.cards[1].id;
  const rendered=await f.api('study.card.render',{setId:s.id,cardId:card});assert.match(rendered.html,/margin-reader:\/\/card\//);assert.match(rendered.html,/>Alias<\/a>/);assert.match(rendered.html,/<code>Concept<\/code>/);assert(!rendered.html.includes('<script'));
  assert(rendered.links.some(l=>l.cardId===target));
  const back=await f.api('study.card.backlinks',{setId:s.id,cardId:target});assert.equal(back.backlinks[0].cardId,card);assert(!back.uri.includes(f.workspace));
  s=await f.change('study.links.settings',{titleLinks:false});const plain=await f.api('study.card.render',{setId:s.id,cardId:card});assert.equal((plain.html.match(/<a /g)||[]).length,1);
  const catalog=await f.api('study.catalog',{query:'',limit:1});assert.equal(catalog.total,2);assert.equal(catalog.nextOffset,1);assert.equal((await f.api('study.catalog',{offset:1,limit:1})).nextOffset,null);
});
test('duplicate wiki titles return explicit candidates instead of silently selecting a card',async t=>{
  const f=await fixture(t);let s=await f.change('study.note.create',{title:'Repeated'});s=await f.change('study.note.create',{title:'Repeated'});s=await f.change('study.note.create',{title:'Caller',text:'[[Repeated]]'});
  const html=await f.api('study.card.render',{setId:s.id,cardId:s.cards.at(-1).id});assert.equal(html.choices.length,1);assert.equal(html.choices[0].targets.length,2);assert.match(html.html,/#reader-link-choice-0/);
});
test('credential-free links open exact documents/studies and reject foreign or unsupported URIs',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.workspace,'book.pdf'),pdfFixture());const doc=await f.api('document.open',{path:'book.pdf'}),s=await f.get();
  const link=await f.api('link.create',{kind:'document',id:doc.id,locator:{page:2,pageOffset:.3}});assert(!link.uri.includes('127.0.0.1'));const resolved=await f.api('link.resolve',link);assert.equal(resolved.locator.page,2);
  await f.api('link.open',link);assert.deepEqual((await f.api('reader.position.get',{id:doc.id})).locator,{page:2,pageOffset:.3});
  await f.api('link.open',await f.api('link.create',{kind:'study',id:s.id}));assert.equal((await f.api('settings.get')).lastDocument,null);
  await f.error('link.open',{uri:'javascript:alert(1)'},'INVALID_LINK');await f.error('link.open',{uri:'margin-reader://document/../../escape'},'INVALID_LINK');
  await f.error('link.open',{uri:'margin-reader://card/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000001'},'NOT_FOUND');
});
test('cross-study associations retain labels, drawn curves, direction and inbound discoverability',async t=>{
  const f=await fixture(t);let a=await f.change('study.note.create',{title:'A'});let b=await f.api('study.create',{title:'Other'});b=await f.api('study.note.create',{setId:b.id,expectedRevision:b.revision,title:'B'});
  a=await f.change('study.link.add',{from:a.cards[0].id,to:b.cards[0].id,toSetId:b.id,label:'External',curve:[[100,200],[300,150],[500,250]],bidirectional:false});assert.equal(a.links[0].toSetId,b.id);
  const incoming=await f.api('study.card.backlinks',{setId:b.id,cardId:b.cards[0].id});assert(incoming.backlinks.some(c=>c.cardId===a.cards[0].id));
  a=await f.change('study.link.update',{linkId:a.links[0].id,label:'Edited',bidirectional:true,curve:[]});assert(a.links[0].bidirectional);assert.deepEqual(a.links[0].curve,[]);
  await f.error('study.link.update',{setId:a.id,expectedRevision:a.revision,linkId:a.links[0].id,curve:[[Infinity,1]]},'INVALID_PARAMS');
});
test('ordered comments have separate IDs, reversible deletion, rich rendering and revision guards',async t=>{
  const f=await fixture(t);let s=await f.change('study.note.create',{title:'Notes'});const cardId=s.cards[0].id;
  s=await f.change('study.comment.add',{cardId,text:'**First** $x^2$'});const first=s.cards[0].comments[0].id;
  s=await f.change('study.comment.add',{cardId,text:'Second'});const second=s.cards[0].comments[1].id;
  s=await f.change('study.comment.move',{cardId,commentId:second,index:0});assert.equal(s.cards[0].comments[0].id,second);
  const rich=await f.api('study.card.render',{setId:s.id,cardId});assert.match(rich.comments.find(c=>c.id===first).html,/katex/);
  const revision=s.revision;s=await f.change('study.comment.update',{cardId,commentId:first,deleted:true});assert.equal(s.cards[0].comments.length,1);
  assert.equal((await f.api('study.comment.list',{setId:s.id,cardId,includeDeleted:true})).comments.length,2);
  await f.error('study.comment.update',{setId:s.id,expectedRevision:revision,cardId,commentId:second,text:'stale'},'CONFLICT');
  s=await f.change('study.undo');assert.equal(s.cards[0].comments.length,2);
});
test('sanitized image cards crop/rotate into immutable assets, survive undo and copy with their media',async t=>{
  const f=await fixture(t);let s=await f.change('study.media.import',{kind:'image',name:'photo.png',contentBase64:(await picture()).toString('base64')});const card=s.cards[0],original=s.lastMedia.mediaId;
  assert.equal(card.media.width,80);assert.equal(card.image.width,80);assert.match(card.imageAsset,/study-media/);
  const bytes=await f.api('study.media.get',{setId:s.id,mediaId:original});assert.equal(Buffer.from(bytes.contentBase64,'base64').toString('ascii',1,4),'PNG');
  s=await f.change('study.media.transform',{cardId:card.id,crop:{x:0,y:0,width:.5,height:1},rotation:90});assert.equal(s.cards[0].media.width,50);assert.equal(s.cards[0].media.height,40);assert.notEqual(s.cards[0].media.id,original);
  s=await f.change('study.undo');assert.equal(s.cards[0].media.id,original);
  let other=await f.api('study.create',{title:'Copied photos'});s=await f.change('study.cards.copy',{cardIds:[card.id],targetSetId:other.id,targetRevision:other.revision});other=await f.api('study.get',{setId:other.id});
  assert.equal(other.cards[0].media.sha256,bytes.sha256);assert.deepEqual(await f.api('study.card.image',{setId:s.id,cardId:card.id}),await f.api('study.card.image',{setId:other.id,cardId:other.cards[0].id}));
});
test('audio comments are durable and scoped, while malformed or oversized images never commit partial notes',async t=>{
  const f=await fixture(t);let s=await f.change('study.media.import',{kind:'audio',mimeType:'audio/wav',name:'Recorded.wav',contentBase64:wav().toString('base64')});const media=s.cards[0].comments[0].media;
  assert.equal(media.mimeType,'audio/wav');const asset=await f.runtime.readAsset(media.asset);assert.equal(asset.bytes.toString('ascii',8,12),'WAVE');
  const other=await f.api('study.create',{title:'Other'});await f.error('study.media.get',{setId:other.id,mediaId:media.id},'NOT_FOUND');
  const before=s.revision;await f.error('study.media.import',{setId:s.id,expectedRevision:s.revision,kind:'audio',mimeType:'audio/wav',contentBase64:Buffer.from('<html>bad</html>').toString('base64')},'INVALID_MEDIA');
  const bomb=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bomb);bomb.writeUInt32BE(100000,16);bomb.writeUInt32BE(100000,20);
  await f.error('study.media.import',{setId:s.id,expectedRevision:s.revision,kind:'image',contentBase64:bomb.toString('base64')},'INVALID_MEDIA');assert.equal((await f.get()).revision,before);
  await fs.appendFile(path.join(f.workspace,'.margin-reader',media.asset),'modified');await f.error('study.media.get',{setId:s.id,mediaId:media.id},'ASSET_CORRUPT');
});
