"use strict";
const M=require('./study-model.cjs'),{assert}=require('./safety.cjs');
function roots(set,ids){
  const O=require('./study-organize.cjs'),selected=O.selected(set,ids),chosen=new Set(selected.map(c=>c.id)),byId=new Map(set.cards.map(c=>[c.id,c]));
  return selected.filter(c=>{let parent=c.parentId;const seen=new Set();while(parent){assert(!seen.has(parent),'INVALID_OUTLINE','Card hierarchy contains a cycle.');seen.add(parent);if(chosen.has(parent))return false;parent=byId.get(parent)?.parentId;}return true;});
}
function move(set,p){
  const chosen=roots(set,p.cardIds),moving=new Set(require('./study-organize.cjs').selected(set,chosen.map(c=>c.id),true).map(c=>c.id)),parentId=p.parentId||null;
  if(parentId)M.card(set,parentId);assert(!moving.has(parentId),'INVALID_OUTLINE','A branch cannot be moved into itself.');
  const rootIds=new Set(chosen.map(c=>c.id)),siblings=set.cards.filter(c=>c.parentId===parentId&&!rootIds.has(c.id));
  const index=p.index??siblings.length;assert(Number.isInteger(index)&&index>=0&&index<=siblings.length,'INVALID_PARAMS','Sibling insertion index is out of range.');
  if(p.positions){
    assert(Array.isArray(p.positions)&&p.positions.length===chosen.length,'INVALID_PARAMS','Provide one free position per selected root.');
    assert(!parentId||M.card(set,parentId).submap,'INVALID_PARAMS','Free positions require root-level or direct submap cards.');
    const positions=new Map();for(const position of p.positions){assert(position&&rootIds.has(position.cardId)&&!positions.has(position.cardId)&&['x','y'].every(k=>Number.isFinite(position[k])&&position[k]>=0&&position[k]<=100000),'INVALID_PARAMS','Invalid free card position.');positions.set(position.cardId,{x:position.x,y:position.y});}
    for(const c of chosen)c.position=positions.get(c.id);
  }else for(const c of chosen)delete c.position;
  for(const c of chosen){c.parentId=parentId;c.updatedAt=new Date().toISOString();}
  const rest=set.cards.filter(c=>!rootIds.has(c.id)),before=siblings[index];rest.splice(before?rest.indexOf(before):rest.length,0,...chosen);set.cards=M.order(rest);
  return chosen.map(c=>c.id);
}
function insert(set,p){
  const anchor=M.card(set,p.cardId),siblings=set.cards.filter(c=>c.parentId===anchor.parentId),index=siblings.indexOf(anchor);
  const node=require('./study-advanced.cjs').note(set,p.title,p.text||'');
  if(p.relation==='child')M.move(set,node,anchor.id,p.index);
  else if(p.relation==='parent'){
    node.parentId=anchor.parentId;anchor.parentId=node.id;
    const rest=set.cards.filter(c=>c.id!==node.id);rest.splice(rest.indexOf(anchor),0,node);set.cards=M.order(rest);
  }else M.move(set,node,anchor.parentId,index+(p.relation==='after'?1:0));
  set.lastInsertedCard=node.id;return node;
}
module.exports={roots,move,insert};
