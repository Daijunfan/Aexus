'use strict';
const S=require('./safety.cjs'),M=require('./study-model.cjs');
function zone(set,id){const item=set.map?.mindmap?.items?.find(i=>i.id===id&&i.kind==='zone');S.assert(item,'NOT_FOUND','Mind-map zone not found.');return item;}
function attach(set,id,card){if(!id)return;const item=zone(set,id);S.assert(!card.parentId,'INVALID_PARAMS','Only floating branches can be added to a zone.');S.assert(item.cardIds.length<1000,'TOO_LARGE','A zone supports at most 1000 branch roots.');item.cardIds.push(card.id);}
async function move(set,p){
 const item=zone(set,p.decorationId),ids=item.cardIds.filter(id=>set.cards.some(c=>c.id===id));S.assert(ids.length,'NOT_FOUND','The zone has no available topics.');
 require('./study-notebooks.cjs').guard(set,'study.mindmap.zone.move',{cardIds:ids});
 const view={...set,map:{...set.map,focusId:null,submapId:null,mindmap:{...set.map.mindmap,items:set.map.mindmap.items.map(i=>({...i,style:{...i.style,collapsed:false}}))}}};
 const layout=(await import('../ui/mindmap-layout.mjs')).layoutMindmap(view.cards,view.map);
 const positions=ids.map(cardId=>{const c=M.card(set,cardId),b=layout.positions.get(cardId);S.assert(b,'INVALID_PARAMS','Expand the selected zone before moving it.');return {cardId,x:(c.position?.x??b.x+layout.originX)+p.dx,y:(c.position?.y??b.y+layout.originY)+p.dy};});
 await require('./mindmap-arrange.cjs').arrange(view,{cardIds:ids,action:'place',positions});
 if(item.style?.frame)item.style.frame={...item.style.frame,x:item.style.frame.x+p.dx,y:item.style.frame.y+p.dy};
}
module.exports={zone,attach,move};
