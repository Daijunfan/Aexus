'use strict';
const {randomUUID}=require('node:crypto');
const {assert,fail}=require('./safety.cjs');
const M=require('./study-model.cjs');
const {findDocument,parsedDocument,sourceStatus}=require('./documents.cjs');
const {validateLocator}=require('./outline.cjs');
const DEFAULT_LAYER={id:'default',title:'默认图层',visible:true,locked:false};
function layers(set){return set.layers||[DEFAULT_LAYER];}
function layer(set,id='default'){const l=layers(set).find(l=>l.id===id&&!l.deletedAt);assert(l,'NOT_FOUND','Layer not found.');return l;}
function editable(set,id){const l=layer(set,id);assert(!l.locked,'LAYER_LOCKED','Unlock this layer before editing.');return l;}
function ids(set,values){assert(Array.isArray(values)&&values.length>0&&values.length<=500,'INVALID_PARAMS','Choose 1–500 cards.');return [...new Set(values)].map(id=>M.card(set,id));}
function note(set,title,text=''){assert(set.cards.length<10000,'TOO_LARGE','Card limit reached.');const now=new Date().toISOString();const c={id:randomUUID(),kind:'note',title:M.title(title),text,note:'',tags:[],color:'yellow',source:null,image:null,parentId:null,collapsed:false,createdAt:now,updatedAt:now};set.cards.push(c);return c;}
async function request(store,state,set,method,p){
 if(method.startsWith('study.layer.')){
  set.layers??=[{...DEFAULT_LAYER}];
  if(method==='study.layer.create'){assert(set.layers.length<64,'TOO_LARGE','Layer limit reached.');const l={id:randomUUID(),title:M.title(p.title),visible:true,locked:false};set.layers.push(l);set.activeLayer=l.id;return;}
  const l=layer(set,p.layerId);
  if(method==='study.layer.update'){if(p.title!==undefined)l.title=M.title(p.title);if(p.visible!==undefined)l.visible=p.visible;if(p.locked!==undefined)l.locked=p.locked;if(p.active){assert(l.visible&&!l.locked,'LAYER_LOCKED','Select a visible unlocked layer.');set.activeLayer=l.id;}return;}
  if(method==='study.layer.merge'){const target=editable(set,p.targetId);editable(set,l.id);assert(target.id!==l.id,'INVALID_PARAMS','Choose another layer.');for(const s of [...set.ink||[],...set.canvasInk||[],...set.cards.flatMap(c=>c.ink||[])])if((s.layerId||'default')===l.id)s.layerId=target.id;if(l.id!=='default')l.deletedAt=new Date().toISOString();set.activeLayer=target.id;return;}
  if(method==='study.layer.remove'){assert(l.id!=='default','INVALID_PARAMS','Default layer cannot be removed.');l.deletedAt=new Date().toISOString();if(set.activeLayer===l.id)set.activeLayer='default';return;}
 }
 if(method==='study.canvas.ink.add'){editable(set,p.layerId||'default');assert(Array.isArray(p.points)&&p.points.length>=2&&p.points.length<=2048&&p.points.every(pt=>Array.isArray(pt)&&pt.length===2&&pt.every(v=>Number.isFinite(v)&&v>=0&&v<=100000)),'INVALID_PARAMS','Invalid canvas points.');set.canvasInk??=[];assert(set.canvasInk.length<2000,'TOO_LARGE','Canvas stroke limit reached.');set.canvasInk.push({id:randomUUID(),points:p.points,color:M.color(p.color),width:p.width,layerId:p.layerId||'default'});return;}
 if(method==='study.canvas.ink.remove'){const s=set.canvasInk?.find(s=>s.id===p.strokeId);assert(s,'NOT_FOUND','Canvas stroke not found.');editable(set,s.layerId);set.canvasInk=set.canvasInk.filter(s=>s.id!==p.strokeId);return;}
 if(method==='study.ink.transform'){
  assert(Array.isArray(p.strokeIds)&&p.strokeIds.length>0&&p.strokeIds.length<=2000,'INVALID_PARAMS','Select strokes.');const strokes=p.strokeIds.map(id=>{const s=(set.ink||[]).find(s=>s.id===id);assert(s,'NOT_FOUND','Stroke not found.');editable(set,s.layerId);return s;});
  for(const s of strokes){if(p.layerId){editable(set,p.layerId);s.layerId=p.layerId;}if(p.color)s.color=M.color(p.color);if(p.dx!==undefined||p.dy!==undefined){const dx=p.dx||0,dy=p.dy||0;const points=s.points.map(pt=>[pt[0]+dx,pt[1]+dy,...pt.slice(2)]);assert(points.every(pt=>pt[0]>=0&&pt[0]<=1&&pt[1]>=0&&pt[1]<=1),'INVALID_PARAMS','Moved strokes would leave the page.');s.points=points;}}return;
 }
 if(method==='study.note.anchor'){
  const c=M.card(set,p.cardId);assert(!c.source,'INVALID_PARAMS','Use an independent note card.');
  if(p.documentId===null){delete c.anchor;return;}
  assert(set.documentIds.includes(p.documentId),'NOT_MEMBER','Document is not a member.');const doc=findDocument(state,p.documentId);assert(!(await sourceStatus(store,doc)).changed,'SOURCE_CHANGED','Reopen the changed source.');
  c.anchor={documentId:doc.id,sourceHash:doc.hash,locator:validateLocator(p.locator,await parsedDocument(store,doc)),display:p.display||'margin'};return;
 }
 if(method==='study.map.configure'){
  set.map??={};if(p.layout)set.map.layout=p.layout;if(p.focusId!==undefined){if(p.focusId)M.card(set,p.focusId);set.map.focusId=p.focusId;}return;
 }
 if(method==='study.cards.group'||method==='study.cards.merge'){
  const cards=ids(set,p.cardIds),selected=new Set(cards.map(c=>c.id));
  assert(cards.every(c=>cards.every(other=>other.id===c.id||!M.subtree(set.cards,c.id).has(other.id))),'INVALID_OUTLINE','Select cards without their selected ancestors.');
  const group=note(set,p.title,cards.map(c=>c.text||c.title).join('\n\n').slice(0,20000));group.tags=[...new Set(cards.flatMap(c=>c.tags||[]))].slice(0,30);group.color=cards[0].color;
  if(method==='study.cards.group'){group.summaryIds=cards.map(c=>c.id);for(const c of cards)M.move(set,c,group.id);}
  else{group.mergedIds=cards.map(c=>c.id);group.collapsed=true;for(const c of cards)M.move(set,c,group.id);}

  set.cards=M.order(set.cards);return;
 }
 if(method==='study.deck.create'){set.decks??=[];assert(set.decks.length<100,'TOO_LARGE','Deck limit reached.');set.decks.push({id:randomUUID(),title:M.title(p.title)});return;}
 if(method==='study.deck.update'){const deck=(set.decks||[]).find(d=>d.id===p.deckId);assert(deck,'NOT_FOUND','Deck not found.');if(p.title)deck.title=M.title(p.title);if(p.deleted!==undefined)deck.deletedAt=p.deleted?new Date().toISOString():null;if(p.deleted&&set.reviewSettings?.deckId===deck.id)set.reviewSettings.deckId=null;return;}
 if(method==='study.review.settings'){
  if(p.deckId)assert(set.decks?.some(d=>d.id===p.deckId&&!d.deletedAt),'NOT_FOUND','Deck not found.');set.reviewSettings={...set.reviewSettings,...p};delete set.reviewSettings.setId;delete set.reviewSettings.expectedRevision;return;
 }
 fail('METHOD_NOT_FOUND','Unknown advanced study command.');
}
module.exports={request,layers,layer,editable,note};
