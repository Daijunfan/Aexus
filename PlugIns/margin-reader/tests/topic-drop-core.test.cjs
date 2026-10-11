'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./fixtures.cjs');
async function tree(t){const f=await setup(t);let s=await f.api('study.create',{title:'Drop history'});s=await f.api('study.mindmap.outline.import',{setId:s.id,expectedRevision:s.revision,text:'Root\n  Moving\n    Descendant\n  Destination\n    Existing'});const ids=Object.fromEntries(s.cards.map(c=>[c.title,c.id]));s=await f.api('study.card.update',{setId:s.id,expectedRevision:s.revision,cardId:ids.Destination,collapsed:true});return {...f,s,ids};}
test('reparent and expand a collapsed destination is one guarded operation and one undo',async t=>{
 const f=await tree(t),before=structuredClone(f.s.cards);
 let s=await f.api('study.cards.move',{setId:f.s.id,expectedRevision:f.s.revision,cardIds:[f.ids.Moving],parentId:f.ids.Destination,expandParent:true});assert.equal(s.cards.find(c=>c.id===f.ids.Moving).parentId,f.ids.Destination);assert.equal(s.cards.find(c=>c.id===f.ids.Descendant).parentId,f.ids.Moving);assert.equal(s.cards.find(c=>c.id===f.ids.Destination).collapsed,false);assert.equal(s.revision,f.s.revision+1);assert.equal((await f.api('study.map.geometry',{setId:s.id})).positions.length,5);
 s=await f.api('study.undo',{setId:s.id,expectedRevision:s.revision});assert.deepEqual(s.cards,before);assert(s.cards.find(c=>c.id===f.ids.Destination).collapsed);
 s=await f.api('study.redo',{setId:s.id,expectedRevision:s.revision});assert.equal(s.cards.find(c=>c.id===f.ids.Moving).parentId,f.ids.Destination);assert.equal(s.cards.find(c=>c.id===f.ids.Destination).collapsed,false);
});
test('failed drop cannot change destination fold state, source branches or unrelated data',async t=>{
 const f=await tree(t),file=path.join(f.workspace,'.margin-reader/state.json'),before=await fs.readFile(file),params={setId:f.s.id,expectedRevision:f.s.revision,cardIds:[f.ids.Moving],parentId:f.ids.Descendant,expandParent:true};
 await f.error('study.cards.move',params,'INVALID_OUTLINE');assert.deepEqual(await fs.readFile(file),before);
 await f.error('study.cards.move',{...params,parentId:f.ids.Destination,expectedRevision:f.s.revision-1},'CONFLICT');assert.deepEqual(await fs.readFile(file),before);
 const s=await f.api('study.cards.move',{...params,parentId:f.ids.Destination,expandParent:false});assert.equal(s.cards.find(c=>c.id===f.ids.Destination).collapsed,true);
});
