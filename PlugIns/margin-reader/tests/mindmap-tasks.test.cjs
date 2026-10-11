'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./fixtures.cjs');
test('task timeline reads the complete topic model with stable IDs, branch scope and pagination, without changing its revision',async t=>{
 const f=await setup(t);let set=await f.api('study.create',{title:'Topic timeline'});
 const change=async(method,p={})=>set=await f.api(method,{setId:set.id,expectedRevision:set.revision,...p});
 await change('study.mindmap.outline.import',{text:'Project\n  Plan\n    Evidence\n  Build\n    Untimed'});const [root,plan,evidence,build,untimed]=set.cards;
 await change('study.mindmap.topics.update',{cardIds:[plan.id],patch:{task:{start:'2026-10-01',due:'2026-10-03',assignee:'Reader'},progress:0,status:'todo'}});
 await change('study.mindmap.topics.update',{cardIds:[evidence.id],patch:{task:{due:'2026-10-02'},status:'done',progress:100}});
 await change('study.mindmap.topics.update',{cardIds:[build.id],patch:{task:{start:'2026-10-05',due:'2026-10-09'},progress:35,status:'doing'}});
 await change('study.mindmap.topics.update',{cardIds:[untimed.id],patch:{status:'todo'}});await change('study.card.update',{cardId:root.id,collapsed:true});
 const revision=set.revision,first=await f.api('study.mindmap.tasks.plan',{setId:set.id,limit:2}),second=await f.api('study.mindmap.tasks.plan',{setId:set.id,offset:first.nextOffset,limit:2});
 assert.equal(first.total,4);assert.deepEqual(first.range,{start:'2026-10-01',end:'2026-10-09',days:9});assert.deepEqual([...first.tasks,...second.tasks].map(c=>c.id),[plan.id,evidence.id,build.id,untimed.id]);assert.equal(second.nextOffset,null);assert.equal(first.tasks[0].progress,0);
 const scoped=await f.api('study.mindmap.tasks.plan',{setId:set.id,rootId:plan.id});assert.deepEqual(scoped.tasks.map(c=>c.id),[plan.id,evidence.id]);assert.equal((await f.api('study.get',{setId:set.id})).revision,revision);
});
test('CSV and ICS exports preserve content, dates, Unicode and workspace bounds while rejecting stale revisions and overwrites',async t=>{
 const f=await setup(t);let set=await f.api('study.create',{title:'Local task exports'});
 const change=async(method,p={})=>set=await f.api(method,{setId:set.id,expectedRevision:set.revision,...p});
 await change('study.note.create',{title:'=1+1',text:'Original note'});const first=set.cards[0].id;
 await change('study.mindmap.topics.update',{cardIds:[first],patch:{task:{start:'2026-02-28',due:'2026-02-28',assignee:'"中文, Reader"'},progress:60,status:'doing'}});
 await change('study.card.update',{cardId:first,note:'中文备注🙂'.repeat(35)+'\nSecond line; comma, and slash\\'});
 await change('study.note.create',{title:'Undated task'});await change('study.mindmap.topics.update',{cardIds:[set.cards.at(-1).id],patch:{status:'todo'}});
 const original=structuredClone(set.cards),revision=set.revision;
 for(const format of ['csv','ics']){
  const p={setId:set.id,expectedRevision:revision,format,path:'tasks.'+format},result=await f.api('study.mindmap.tasks.export',p),text=await fs.readFile(path.join(f.workspace,p.path),'utf8');assert.equal(result.tasks,format==='csv'?2:1);
  if(format==='csv'){assert(text.startsWith('\uFEFF'));assert(text.includes('"\'=1+1"'));assert(text.includes('""中文, Reader""'));assert(text.includes('Undated task'));}
  else{for(const line of text.split('\r\n'))assert(Buffer.byteLength(line)<=75);const unfolded=text.replaceAll('\r\n ','');assert(unfolded.includes('DTSTART;VALUE=DATE:20260228'));assert(unfolded.includes('DTEND;VALUE=DATE:20260301'));assert(unfolded.includes(first+'.'+set.id+'@margin-reader.local'));assert(unfolded.includes('中文备注🙂'));assert(unfolded.includes('Second line\\; comma\\, and slash\\\\'));assert.equal(unfolded.match(/BEGIN:VEVENT/g).length,1);}
  await f.error('study.mindmap.tasks.export',p,'ALREADY_EXISTS');
 }
 await f.error('study.mindmap.tasks.export',{setId:set.id,expectedRevision:revision-1,format:'csv',path:'stale.csv'},'CONFLICT');await assert.rejects(fs.stat(path.join(f.workspace,'stale.csv')));
 await f.error('study.mindmap.tasks.export',{setId:set.id,expectedRevision:revision,format:'ics',path:'../outside.ics'},'SCOPE_DENIED');
 const after=await f.api('study.get',{setId:set.id});assert.equal(after.revision,revision);assert.deepEqual(after.cards,original);
});
test('task projections and exports follow a live reference title without changing its identity or local task fields',async t=>{
 const f=await setup(t);let source=await f.api('study.create',{title:'Source'});source=await f.api('study.note.create',{setId:source.id,expectedRevision:source.revision,title:'Original title'});
 let target=await f.api('study.create',{title:'Task reference'});target=await f.api('study.card.reference',{setId:target.id,expectedRevision:target.revision,targetSetId:source.id,targetCardId:source.cards[0].id});const id=target.cards[0].id;
 target=await f.api('study.mindmap.topics.update',{setId:target.id,expectedRevision:target.revision,cardIds:[id],patch:{status:'todo',task:{due:'2026-10-04'}}});
 await f.api('study.card.update',{setId:source.id,expectedRevision:source.revision,cardId:source.cards[0].id,title:'Latest title'});
 const plan=await f.api('study.mindmap.tasks.plan',{setId:target.id});assert.equal(plan.tasks[0].id,id);assert.equal(plan.tasks[0].title,'Latest title');assert.equal(plan.tasks[0].due,'2026-10-04');assert.equal(plan.revision,target.revision);
 await f.api('study.mindmap.tasks.export',{setId:target.id,expectedRevision:target.revision,format:'csv',path:'live-reference.csv'});assert((await fs.readFile(path.join(f.workspace,'live-reference.csv'),'utf8')).includes('Latest title'));
});
