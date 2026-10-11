'use strict';
const {randomUUID}=require('node:crypto'),M=require('./study-model.cjs'),S=require('./safety.cjs');
function expand(set,cards){
 const ids=new Set(cards.map(c=>c.id));let changed=true;
 while(changed){changed=false;for(const item of set.map?.mindmap?.items||[])if(item.kind==='summary'&&item.topicId&&!ids.has(item.topicId)&&item.cardIds.every(id=>ids.has(id))&&set.cards.some(c=>c.id===item.topicId)){for(const id of M.subtree(set.cards,item.topicId))ids.add(id);changed=true;}}
 return set.cards.filter(c=>ids.has(c.id));
}
function summaryRoots(set,members){return new Set((set.map?.mindmap?.items||[]).filter(i=>i.kind==='summary'&&(!members||i.cardIds.every(id=>members.has(id)))&&set.cards.some(c=>c.id===i.topicId&&!c.parentId)).map(i=>i.topicId));}
function copy(source,target,remap){
 const items=(source.map?.mindmap?.items||[]).filter(i=>i.cardIds.every(id=>remap.has(id))&&(!i.topicId||remap.has(i.topicId))).map(i=>({...structuredClone(i),id:randomUUID(),cardIds:i.cardIds.map(id=>remap.get(id)),...(i.topicId?{topicId:remap.get(i.topicId)}:{})}));
 if(!items.length)return;target.map??={};target.map.mindmap??={};target.map.mindmap.items??=[];S.assert(target.map.mindmap.items.length+items.length<=500,'TOO_LARGE','Destination map annotation limit reached.');target.map.mindmap.items.push(...items);
}
function transfer(source,target,ids){
 const items=source.map?.mindmap?.items||[],complete=items.filter(i=>i.cardIds.every(id=>ids.has(id))&&(!i.topicId||ids.has(i.topicId)));
 if(complete.length){target.map??={};target.map.mindmap??={};target.map.mindmap.items??=[];S.assert(target.map.mindmap.items.length+complete.length<=500,'TOO_LARGE','Destination map annotation limit reached.');const targetIds=new Set(target.map.mindmap.items.map(i=>i.id));S.assert(complete.every(i=>!targetIds.has(i.id)),'CONFLICT','A destination annotation identity already exists.');target.map.mindmap.items.push(...complete);}
 if(source.map?.mindmap)source.map.mindmap.items=items.filter(i=>!complete.includes(i)).map(i=>({...i,cardIds:i.cardIds.filter(id=>!ids.has(id))})).filter(i=>i.cardIds.length&&!ids.has(i.topicId));
}
module.exports={expand,summaryRoots,copy,transfer};
