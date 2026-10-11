'use strict';
const {randomUUID}=require('node:crypto'),{assert}=require('./safety.cjs'),M=require('./study-model.cjs'),A=require('./study-advanced.cjs'),I=require('./image-ink.cjs');
function settings(set,p){const {setId,expectedRevision,...patch}=p;assert(Object.keys(patch).length&&Object.keys(patch).every(k=>['autoBind','autoSelect','doubleTapFocus','hideFocusInk'].includes(k)&&typeof patch[k]==='boolean'),'INVALID_PARAMS','Supply handwriting binding switches.');set.inkBinding={...set.inkBinding,...patch};}
function validate(set){if(set.inkBinding!==undefined){const p=set.inkBinding;assert(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>['autoBind','autoSelect','doubleTapFocus','hideFocusInk'].includes(k)&&typeof p[k]==='boolean'),'INVALID_PARAMS','Invalid map handwriting binding settings.');}}
async function add(store,state,set,input,mapGesture=false){
 const K=require('./study-ink-tools.cjs'),G=require('./stroke-geometry.cjs'),p={...input,width:K.width(set,input,'canvas')};A.editable(set,p.layerId||set.activeLayer||'default');
 assert(Array.isArray(p.points)&&p.points.length>=2&&p.points.length<=2048&&p.points.every(pt=>Array.isArray(pt)&&[2,3].includes(pt.length)&&pt.every(Number.isFinite)&&pt[0]>=0&&pt[0]<=100000&&pt[1]>=0&&pt[1]<=100000&&(pt.length===2||pt[2]>=0&&pt[2]<=1)),'INVALID_PARAMS','Invalid world-coordinate handwriting.');
 if(mapGesture){assert(!p.geometry?.scribbleScope||p.geometry.scribbleScope==='map','INVALID_PARAMS','Mind-map scribbles use the visible map scope.');p.geometry={...p.geometry,scribbleScope:'map'};}
 const geometry=await G.resolve(set,p,1,100000),attributes=K.attributes(p);M.color(p.color);if(await G.erase(store,state,set,p,'canvas',geometry))return;
 const strokes=G.pieces(geometry).map(piece=>({id:randomUUID(),...piece,color:p.color,width:p.width,...attributes,layerId:p.layerId||set.activeLayer||'default'}));let target={cardId:null,selectedCardId:null,binding:'none'},box,card;
 if(mapGesture){
  const {layoutStudy}=await import('../ui/study-map-layout.mjs'),{mapInkTarget}=await import('../ui/ink-binding.mjs'),layout=layoutStudy(set.cards.map(c=>M.effective(state,set,c)),set.map,set.appearance),first=p.points[0],contains=id=>{const b=layout.positions.get(id);return b&&first[0]>=b.x&&first[0]<=b.x+b.width&&first[1]>=b.y&&first[1]<=b.y+b.height;};
  if(p.selectedCardId)M.card(set,p.selectedCardId);const hit=p.selectedCardId&&contains(p.selectedCardId)?p.selectedCardId:[...set.cards].reverse().find(c=>contains(c.id))?.id;
  target=mapInkTarget({focusId:set.map?.focusId,selectedCardId:p.selectedCardId,hitCardId:hit,settings:set.inkBinding});
  if(target.cardId){card=M.card(set,target.cardId);box=layout.positions.get(card.id);assert(box,'INVALID_PARAMS','The binding card is not visible.');require('./study-notebooks.cjs').guard(set,'study.map.ink.add',{cardId:card.id});if(card.anchor?.layerId)A.editable(set,card.anchor.layerId);}
 }
 if(card){
  const frame=card.image&&!card.reference&&!target.focusBound?await I.cardFrame(set,card):null,start=[(p.points[0][0]-box.x)/box.width,(p.points[0][1]-box.y)/box.height],imageBound=Boolean(frame&&I.inside(start,frame));
  const bound=strokes.flatMap(s=>{const value={...s,mapBound:true,...(target.focusBound?{focusBound:true}:{}),space:'card-relative',width:s.width/box.width,points:s.points.map(pt=>[(pt[0]-box.x)/box.width,(pt[1]-box.y)/box.height,...pt.slice(2)]),...(imageBound?{imageBound:true,imageBounds:frame,aspectRatio:box.width/box.height}:{})};assert(value.points.every(p=>Math.abs(p[0])<=1000&&Math.abs(p[1])<=1000),'INVALID_PARAMS','The handwriting is too far from its binding card.');return imageBound?I.clipped(value,frame):[value];});
  card.ink??=[];assert(card.ink.length+bound.length<=500,'TOO_LARGE','Card ink limit reached.');card.ink.push(...bound);set.lastInk={scope:'card',cardId:card.id,strokeIds:bound.map(s=>s.id),selectedCardId:target.selectedCardId,binding:target.binding,recognizedShape:geometry.recognizedShape};
 }else{set.canvasInk??=[];assert(set.canvasInk.length+strokes.length<=2000,'TOO_LARGE','Canvas stroke limit reached.');set.canvasInk.push(...strokes);set.lastInk={scope:'canvas',strokeIds:strokes.map(s=>s.id),selectedCardId:target.selectedCardId,binding:'none',recognizedShape:geometry.recognizedShape};}
}
module.exports={add,settings,validate};
