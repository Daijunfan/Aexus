"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./fixtures.cjs');
async function fixture(t){
  const f=await setup(t);let a=await f.api('study.create',{title:'Alpha study'}),b=await f.api('study.create',{title:'Beta study'});
  a=await f.api('study.note.create',{setId:a.id,expectedRevision:a.revision,title:'Shared Alpha',text:'first',tags:['topic','alpha']});
  b=await f.api('study.note.create',{setId:b.id,expectedRevision:b.revision,title:'Shared Beta',text:'second',tags:['topic','beta']});
  return {...f,a,b,targets:[{setId:a.id,cardId:a.cards[0].id},{setId:b.id,cardId:b.cards[0].id}],revisions:{[a.id]:a.revision,[b.id]:b.revision}};
}
test('workspace card query retains owner identities, groups across studies and paginates without changing state',async t=>{
  const f=await fixture(t),state=await fs.readFile(path.join(f.workspace,'.margin-reader/state.json'));
  const page=await f.api('study.workspace.query',{filter:{tags:['topic']},groupBy:['study','tag'],sort:'title',limit:1});
  assert.equal(page.total,2);assert.equal(page.nextOffset,1);assert.equal(page.groups.length,2);
  assert.equal(page.cards[0].ownerSetId,f.a.id);assert.equal(page.cards[0].ownerRevision,f.a.revision);
  const second=await f.api('study.workspace.query',{filter:{tags:['topic']},sort:'title',limit:1,offset:page.nextOffset});
  assert.equal(second.cards[0].ownerSetId,f.b.id);assert.equal(second.nextOffset,null);
  assert.equal((await f.api('study.workspace.query',{setIds:[f.b.id],filter:{all:[{query:'Shared'},{not:{tags:['alpha']}}]}})).total,1);
  assert.deepEqual(await fs.readFile(path.join(f.workspace,'.margin-reader/state.json')),state);
});
test('cross-study batch is atomic on stale revisions, invalid patches and later locked owners',async t=>{
  const f=await fixture(t),file=path.join(f.workspace,'.margin-reader/state.json');
  const before=await fs.readFile(file);
  await f.error('study.workspace.batch',{targets:f.targets,expectedRevisions:{...f.revisions,[f.b.id]:f.b.revision-1},patch:{favorite:true}},'CONFLICT');
  assert.deepEqual(await fs.readFile(file),before);
  await f.error('study.workspace.batch',{targets:f.targets,expectedRevisions:f.revisions,patch:{color:'red;position:fixed'}},'INVALID_PARAMS');
  assert.deepEqual(await fs.readFile(file),before);
  const result=await f.api('study.workspace.batch',{targets:f.targets,expectedRevisions:f.revisions,patch:{favorite:true,addTags:['review']}});
  assert.equal(result.studies,2);assert.equal(result.updated,2);
  for(const {setId,cardId} of f.targets){const s=await f.api('study.get',{setId});const c=s.cards.find(c=>c.id===cardId);assert(c.favorite&&c.tags.includes('review'));assert.equal(s.revision,result.revisions[setId]);}
  const restored=await f.api('study.undo',{setId:f.a.id,expectedRevision:result.revisions[f.a.id]});assert(!restored.cards[0].favorite);
  assert((await f.api('study.get',{setId:f.b.id})).cards[0].favorite);
});
test('workspace query and batches reject foreign and prototype identities and exclude trashed studies',async t=>{
  const f=await fixture(t),other=await setup(t),foreign=await other.api('study.create',{title:'Foreign'});
  await f.error('study.workspace.query',{setIds:[foreign.id]},'NOT_FOUND');
  await f.error('study.workspace.query',{setIds:['__proto__']},'NOT_FOUND');
  await f.error('study.workspace.query',{groupBy:['unsupported']},'INVALID_PARAMS');
  await f.error('study.workspace.batch',{targets:f.targets,expectedRevisions:{[f.a.id]:f.a.revision},patch:{favorite:true}},'INVALID_PARAMS');
  await f.api('study.remove',{setId:f.b.id,expectedRevision:f.b.revision});
  assert.equal((await f.api('study.workspace.query')).total,1);
});
test('whole-study selections support 10000 cards and traverse overlapping subtrees once',()=>{
  const O=require('../lib/study-organize.cjs');
  const cards=Array.from({length:10000},(_,i)=>({id:'card-'+i,parentId:i?'card-'+Math.floor((i-1)/4):null}));
  const start=performance.now(),all=O.selected({cards},cards.map(c=>c.id),true);
  assert.equal(all.length,10000);assert.equal(O.selected({cards},['card-0'],true).length,10000);
  assert(performance.now()-start<3000,'selection unexpectedly revisited the whole tree per card');
});
