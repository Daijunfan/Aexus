'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs/promises'), path=require('node:path');
const {setup}=require('./fixtures.cjs');
async function fixture(t){const f=await setup(t);let set=await f.api('study.create',{title:'Reading dictionary'});return {...f,get:()=>f.api('study.get',{setId:set.id}),change:async(method,p={})=>set=await f.api(method,{setId:set.id,expectedRevision:set.revision,...p}),setId:set.id};}
test('dictionary reads preserve exact UTF-16 Unicode boundaries, longest aliases and the original state bytes',async t=>{
 const f=await fixture(t);await f.change('study.note.create',{title:'条件概率；概率',text:'Probability definition'});await f.change('study.note.create',{title:'İstanbul',text:'Unicode test'});await f.change('study.note.create',{title:'Alpha',text:'Latin term'});
 const text='🙂İstanbul 与条件概率、概率。Alphabet ALPHA。',file=path.join(f.workspace,'.margin-reader/state.json');
 await f.change('study.links.settings',{wholeWords:true});const before=await fs.readFile(file);
 const result=await f.api('study.dictionary.match',{setId:f.setId,text});
 assert.deepEqual(result.matches.map(m=>m.text),['İstanbul','条件概率','概率','ALPHA']);for(const hit of result.matches)assert.equal(text.slice(hit.start,hit.end),hit.text);
 assert.equal(result.matches[0].start,2);assert.deepEqual(await fs.readFile(file),before);
 await f.change('study.links.settings',{caseSensitive:true});const strict=await f.api('study.dictionary.match',{setId:f.setId,text});assert(!strict.matches.some(m=>m.text==='ALPHA'));
});
test('submap dictionaries exclude other branches, carry source colors, and can be reset or disabled explicitly',async t=>{
 const f=await fixture(t);let other=await f.api('study.create',{title:'External dictionary'});
 const change=async(method,p)=>other=await f.api(method,{setId:other.id,expectedRevision:other.revision,...p});
 await change('study.note.create',{title:'Medical glossary',submap:true});const rootId=other.cards[0].id;
 await change('study.note.create',{title:'Neuron',text:'Selected definition',parentId:rootId});const neuron=other.cards.find(c=>c.title==='Neuron').id;
 await change('study.note.create',{title:'Axon',text:'Excluded definition'});
 await f.change('study.links.settings',{sources:[{setId:other.id,rootId,color:'green'}]});
 const match=()=>f.api('study.dictionary.match',{setId:f.setId,text:'Neuron Axon'});let r=await match();assert.equal(r.matches.length,1);assert.equal(r.matches[0].targets[0].cardId,neuron);assert.equal(r.matches[0].targets[0].color,'#278451');
 await f.change('study.note.create',{title:'Reading card',text:'Neuron Axon'});const card=(await f.get()).cards[0];
 const rendered=await f.api('study.card.render',{setId:f.setId,cardId:card.id});assert(rendered.titleLinks.some(l=>l.cardId===neuron));assert(!rendered.titleLinks.some(l=>l.title==='Axon'));
 await f.change('study.links.settings',{sources:[]});assert.equal((await match()).total,0);
 await f.change('study.undo');assert.equal((await match()).total,1);
 await f.change('study.links.settings',{sources:null,dictionarySetIds:[other.id]});assert.equal((await match()).total,2);
 await f.change('study.links.settings',{titleLinks:false});assert.equal((await match()).total,0);
});
test('all repeated matches and duplicate dictionary candidates are accessible through bounded pagination',async t=>{
 const f=await fixture(t);for(let n=0;n<25;n++)await f.change('study.note.create',{title:'Shared term',text:'Definition '+n});
 const text=Array(407).fill('Shared term').join(' '),all=[];let offset=0;
 do{const r=await f.api('study.dictionary.match',{setId:f.setId,text,offset,limit:70});assert.equal(r.total,407);all.push(...r.matches);offset=r.nextOffset;}while(offset!==null);
 assert.equal(all.length,407);assert.equal(new Set(all.map(m=>m.start)).size,407);assert(all.every(m=>m.targetTotal===25&&m.targets.length===20));
 const candidates=[];offset=0;do{const r=await f.api('study.dictionary.lookup',{setId:f.setId,term:'SHARED TERM',offset,limit:6});candidates.push(...r.targets);offset=r.nextOffset;}while(offset!==null);
 assert.equal(new Set(candidates.map(c=>c.cardId)).size,25);assert.equal((await f.api('study.dictionary.lookup',{setId:f.setId,term:'Missing term'})).total,0);
});
test('dictionary scopes reject unknown, foreign and non-submap IDs without advancing history or permissions',async t=>{
 const f=await fixture(t);const s=await f.change('study.note.create',{title:'Ordinary card'}),before=await f.get();
 for(const sources of [[{setId:'../outside'}],[{setId:f.setId,rootId:s.cards[0].id}],[{setId:f.setId,color:'javascript:red'}],[{setId:f.setId},{setId:f.setId}],[{setId:f.setId,secret:'escape'}]])await f.error('study.links.settings',{setId:f.setId,expectedRevision:s.revision,sources},'INVALID_PARAMS');
 const foreign='11111111-1111-4111-8111-111111111111';await f.error('study.links.settings',{setId:f.setId,expectedRevision:s.revision,sources:[{setId:foreign}]},'NOT_FOUND');
 await f.error('study.dictionary.match',{setId:foreign,text:'hello'},'NOT_FOUND');await f.error('study.dictionary.match',{setId:f.setId,text:'x'.repeat(262145)},'INVALID_PARAMS');
 await f.error('study.dictionary.lookup',{setId:f.setId,term:'x'},'INVALID_PARAMS');assert.deepEqual(await f.get(),before);
});
test('portable study packages include external submap dictionaries and remap their identities on import',async t=>{
 const f=await fixture(t);let other=await f.api('study.create',{title:'Saved dictionary'});other=await f.api('study.note.create',{setId:other.id,expectedRevision:other.revision,title:'Glossary',submap:true});const root=other.cards[0].id;
 other=await f.api('study.note.create',{setId:other.id,expectedRevision:other.revision,parentId:root,title:'Archived term',text:'A complete local entry.'});
 await f.change('study.links.settings',{sources:[{setId:other.id,rootId:root,color:'purple'}]});
 const pack=await f.api('study.package.export',{setId:f.setId,path:'Dictionary.mrpkg'});assert.equal(pack.sets,2);
 const imported=await f.api('study.package.import',{path:'Dictionary.mrpkg',folder:'Imported',activate:false});
 const recovered=await f.api('study.get',{setId:imported.setId});assert.notEqual(recovered.linkSettings.sources[0].setId,other.id);assert.notEqual(recovered.linkSettings.sources[0].rootId,root);
 const matched=await f.api('study.dictionary.match',{setId:imported.setId,text:'Archived term'});assert.equal(matched.total,1);assert.equal(matched.matches[0].targets[0].color,'#8654b8');
});
test('specific submap colors win main-map overlaps and a cut dictionary branch remains reachable by its stable identity',async t=>{
 const f=await fixture(t);let dict=await f.api('study.create',{title:'Relocatable dictionary'});
 const change=async(method,p)=>dict=await f.api(method,{setId:dict.id,expectedRevision:dict.revision,...p});
 await change('study.note.create',{title:'Submap dictionary',submap:true});const rootId=dict.cards[0].id;
 await change('study.note.create',{title:'Movable term',text:'Definition',parentId:rootId});const termId=dict.cards.at(-1).id;
 await f.change('study.links.settings',{sources:[{setId:dict.id,color:'blue'},{setId:dict.id,rootId,color:'red'}]});
 let result=await f.api('study.dictionary.lookup',{setId:f.setId,term:'Movable term'});assert.equal(result.total,1);assert.equal(result.targets[0].color,'#c24848');
 const destination=await f.api('study.create',{title:'New dictionary owner'});
 const {clipboard}=await f.api('study.clipboard.set',{setId:dict.id,expectedRevision:dict.revision,cardIds:[rootId],mode:'cut'});
 await f.api('study.clipboard.paste',{setId:destination.id,expectedRevision:destination.revision,clipboardId:clipboard.id});
 result=await f.api('study.dictionary.lookup',{setId:f.setId,term:'Movable term'});assert.equal(result.total,1);assert.equal(result.targets[0].cardId,termId);assert.equal(result.targets[0].setId,destination.id);assert.equal(result.targets[0].color,'#c24848');
});
