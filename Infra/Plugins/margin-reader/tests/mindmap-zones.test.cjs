'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./fixtures.cjs');
async function fixture(t){
 const f=await setup(t);let set=await f.api('study.create',{title:'Floating zones'});
 const change=async(method,p={})=>set=await f.api(method,{setId:set.id,expectedRevision:set.revision,...p});
 await change('study.note.create',{title:'First',x:100,y:120});const first=set.cards[0].id;await change('study.note.create',{title:'Child',parentId:first});
 await change('study.note.create',{title:'Second',x:600,y:140});const second=set.cards.at(-1).id;await change('study.mindmap.configure',{patch:{topicOverlap:true}});
 await change('study.mindmap.decoration.set',{kind:'zone',cardIds:[first,second],style:{title:'Working group',autoResize:true}});const zone=set.map.mindmap.items.find(i=>i.kind==='zone');
 return {...f,change,first,second,zone,get set(){return set;}};
}
test('zones move independent branches together with stable content, collapsed navigation, one undo and complete export',async t=>{
 const f=await fixture(t),original=structuredClone(f.set.cards),revision=f.set.revision;
 await f.change('study.mindmap.zone.move',{decorationId:f.zone.id,dx:120,dy:-45});assert.equal(f.set.revision,revision+1);
 for(const id of [f.first,f.second]){const before=original.find(c=>c.id===id),after=f.set.cards.find(c=>c.id===id);assert.deepEqual(after.position,{x:before.position.x+120,y:before.position.y-45});assert.equal(after.source,null);}
 assert.equal(f.set.cards.find(c=>c.parentId===f.first).parentId,f.first);await f.change('study.undo');assert.deepEqual(f.set.cards,original);
 await f.change('study.mindmap.decoration.set',{decorationId:f.zone.id,style:{collapsed:true}});
 const geometry=await f.api('study.map.geometry',{setId:f.set.id});assert.equal(geometry.positions.length,0);assert.equal(geometry.decorations[0].height,38);assert.equal(geometry.links.length,0);
 const exported=await f.api('study.mindmap.export',{setId:f.set.id,expectedRevision:f.set.revision,format:'svg',path:'zone-map.svg'});assert.equal(exported.topics,original.length);const svg=await fs.readFile(path.join(f.workspace,'zone-map.svg'),'utf8');assert(svg.includes('Working group'));for(const c of original)assert(svg.includes('topic-'+c.id));
 await f.change('study.map.configure',{focusId:f.first});assert((await f.api('study.map.geometry',{setId:f.set.id})).positions.some(p=>p.cardId===f.first));
 await f.error('study.mindmap.zone.move',{setId:f.set.id,expectedRevision:revision,decorationId:f.zone.id,dx:1,dy:1},'CONFLICT');
});
test('fixed zone frames, source-independent insertion, copy and package remapping use the existing model and preserve original identities',async t=>{
 const f=await fixture(t);await f.change('study.mindmap.decoration.set',{decorationId:f.zone.id,style:{autoResize:false,frame:{x:30,y:40,width:950,height:340},titleHidden:true,zIndex:3}});
 await f.change('study.note.create',{title:'Added inside zone',zoneId:f.zone.id,x:700,y:230});const added=f.set.cards.at(-1);assert.equal(added.source,null);assert(f.set.map.mindmap.items[0].cardIds.includes(added.id));
 const before=structuredClone(f.set.cards);await f.change('study.mindmap.zone.move',{decorationId:f.zone.id,dx:10,dy:20});assert.deepEqual(f.set.map.mindmap.items[0].style.frame,{x:40,y:60,width:950,height:340});
 await f.change('study.undo');assert.deepEqual(f.set.cards,before);
 await f.change('study.cards.copy',{cardIds:[f.first,f.second,added.id],descendants:true});const copy=f.set.map.mindmap.items.find(i=>i.id!==f.zone.id);assert(copy&&copy.cardIds.every(id=>!f.zone.cardIds.includes(id)));
 await f.api('study.package.export',{setId:f.set.id,expectedRevision:f.set.revision,path:'zones.mrpkg'});const result=await f.api('study.package.import',{path:'zones.mrpkg',folder:'RestoredZones'}),restored=await f.api('study.get',{setId:result.setId});assert.equal(restored.map.mindmap.items.filter(i=>i.kind==='zone').length,2);for(const zone of restored.map.mindmap.items)assert(zone.cardIds.every(id=>restored.cards.some(c=>c.id===id)));
});
test('partial topic deletion leaves remaining grouping editable; invalid attached groups and frame values fail atomically',async t=>{
 const f=await fixture(t),child=f.set.cards.find(c=>c.parentId===f.first),revision=f.set.revision;
 await f.error('study.mindmap.decoration.set',{setId:f.set.id,expectedRevision:revision,kind:'zone',cardIds:[child.id],style:{}},'INVALID_PARAMS');
 await f.error('study.mindmap.decoration.set',{setId:f.set.id,expectedRevision:revision,decorationId:f.zone.id,style:{frame:{x:1,y:2,width:null,height:200}}},'INVALID_PARAMS');
 assert.equal((await f.api('study.get',{setId:f.set.id})).revision,revision);
 await f.change('study.cards.remove',{cardIds:[f.first],mode:'subtree'});await f.change('study.mindmap.decoration.set',{decorationId:f.zone.id,style:{title:'Remaining topics'}});assert.equal(f.set.map.mindmap.items[0].style.title,'Remaining topics');
 await f.change('study.card.restore',{trashId:f.set.cardTrash[0].id});assert.equal(f.set.cards.length,3);assert(f.set.map.mindmap.items[0].cardIds.includes(f.first));
 await f.change('study.mindmap.decoration.remove',{decorationId:f.zone.id});assert.equal(f.set.cards.length,3);assert.equal(f.set.map.mindmap.items.length,0);
});
