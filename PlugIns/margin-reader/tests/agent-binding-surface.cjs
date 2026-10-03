'use strict';
const assert=require('node:assert/strict');
exports.exercise=async({api,deny})=>{
 let set=await api('study.create',{mapMode:'cards',title:'Employee map handwriting binding'});
 const change=async(method,params={})=>set=await api(method,{setId:set.id,expectedRevision:set.revision,...params});
 await change('study.note.create',{title:'Bound owner'});const owner=set.cards[0].id;
 await change('study.note.create',{title:'Independent card'});const other=set.cards[1].id;
 await change('study.ink.binding.set',{autoBind:true,autoSelect:true,hideFocusInk:true,doubleTapFocus:true});
 const box=(await api('study.map.geometry',{setId:set.id})).positions.find(p=>p.cardId===owner);
 await change('study.map.ink.add',{points:[[box.x+30,box.y+75,.2],[box.x+160,box.y+95,.8]],color:'blue',width:6});
 assert.equal(set.lastInk.cardId,owner);assert.equal(set.lastInk.selectedCardId,owner);assert(set.cards[0].ink[0].mapBound);assert.equal(set.cards[0].ink[0].width,6/box.width);
 await change('study.map.configure',{focusId:owner});await change('study.map.ink.add',{points:[[box.x+box.width+30,box.y+65],[box.x+box.width+160,box.y+105]],color:'red'});
 assert(set.cards[0].ink.at(-1).focusBound);assert.equal(set.cards[1].ink?.length||0,0);
 await deny('study.map.ink.add',{setId:set.id,expectedRevision:set.revision-1,points:[[0,0],[20,20]],color:'blue'},'CONFLICT');
 await deny('study.ink.binding.set',{setId:set.id,expectedRevision:set.revision,autoBind:'false'},'INVALID_PARAMS');
 const snapshot=JSON.stringify(set.cards[0].ink);await change('study.map.configure',{focusId:null});await change('study.card.position',{cardId:owner,x:180,y:130});assert.equal(JSON.stringify(set.cards[0].ink),snapshot);
 await change('study.ink.binding.set',{autoBind:false});await change('study.map.ink.add',{selectedCardId:other,points:[[900,400],[1000,420]],color:'green'});assert.equal(set.lastInk.scope,'canvas');
 console.log('PASS Employee binding preferences, automatic source-of-truth hit testing, pressure, focus ownership, movement and conflict rejection');
};
