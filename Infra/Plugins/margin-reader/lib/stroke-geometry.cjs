'use strict';
const {assert}=require('./safety.cjs');
async function resolve(set,p,aspectRatio=1,max=1,min=0){
 const input=p.geometry||{};assert(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(k=>['shape','rulerAngle','aspectRatio','straighten','perfectShape','heldMs','scribbleErase','scribbleScope','eraseRadius','bands','ruler'].includes(k)),'INVALID_PARAMS','Invalid stroke geometry intent.');
 const stored=set.inkSettings||{},options={shape:stored.shape||'free',rulerAngle:stored.rulerAngle||0,straighten:stored.straighten||'off',perfectShape:stored.perfectShape||false,heldMs:0,aspectRatio,scribbleErase:false,scribbleScope:'scope',eraseRadius:p.width*2,...input};
 assert(['free','line','rectangle','ellipse','ruler'].includes(options.shape)&&['off','auto','always'].includes(options.straighten)&&typeof options.perfectShape==='boolean','INVALID_PARAMS','Invalid shape setting.');
 assert(Number.isFinite(options.rulerAngle)&&Math.abs(options.rulerAngle)<=180&&Number.isFinite(options.aspectRatio)&&options.aspectRatio>0&&options.aspectRatio<=1000&&Number.isFinite(options.heldMs)&&options.heldMs>=0&&options.heldMs<=60000,'INVALID_PARAMS','Invalid geometry angle, aspect or hold duration.');
 assert(typeof options.scribbleErase==='boolean'&&['scope','map'].includes(options.scribbleScope)&&Number.isFinite(options.eraseRadius)&&options.eraseRadius>0&&options.eraseRadius<=1000,'INVALID_PARAMS','Invalid scribble intent.');
 if(options.bands!==undefined)assert(p.documentId&&Array.isArray(options.bands)&&options.bands.length<=128&&options.bands.every(b=>b&&Object.keys(b).every(k=>['start','end'].includes(k))&&Number.isFinite(b.start)&&Number.isFinite(b.end)&&b.start>=0&&b.end<=1&&b.end>b.start),'INVALID_PARAMS','Visible bands must be original-page intervals.');
 if(options.ruler)require('./study-ruler.cjs').intent(options.ruler);
 const {resolveStroke}=await import('../ui/ink-recognition.mjs'),result=resolveStroke(p.points,options);
 assert(!result.overflow,'TOO_LARGE','Use shorter ruler strokes across folded content.');
 if(result.kind==='ruler'){const pieces=(result.paths||[result.points]).flatMap(points=>require('./ink-geometry.cjs').clip(points,{x:min,y:min,width:max-min,height:max-min}));assert(pieces.length,'INVALID_PARAMS','The ruler stroke is outside the drawing area.');result.points=pieces[0];if(pieces.length>1)result.paths=pieces;else delete result.paths;}
 assert(result.points.length>=2&&result.points.every(pt=>pt.every(Number.isFinite)),'INVALID_PARAMS','The shaped stroke is not finite.');
 return {points:result.points,recognizedShape:result.kind,...(result.paths?{paths:result.paths}:{}),...(result.kind==='scribble'?{erase:{scope:options.scribbleScope,radius:options.eraseRadius,aspectRatio:options.aspectRatio,bands:options.bands}}:{})};
}
async function erase(store,state,set,p,scope,result){
 if(result.recognizedShape!=='scribble')return false;
 let path=result.points.map(p=>p.slice(0,2)),radius=result.erase.radius,aspectRatio=result.erase.aspectRatio;
 if(result.erase.scope==='map'){
  assert(scope!=='document','INVALID_PARAMS','A document gesture cannot erase the mind map.');
  if(scope==='card'){const {layoutStudy}=await import('../ui/study-map-layout.mjs'),box=layoutStudy(set.cards,set.map,set.appearance).positions.get(p.cardId);assert(box,'INVALID_PARAMS','The source card must be visible for a map gesture.');path=path.map(q=>[box.x+q[0]*box.width,box.y+q[1]*box.height]);radius*=box.width;}
  scope='map';aspectRatio=1;
 }
 if(path.length>256)path=Array.from({length:256},(_,i)=>path[Math.round(i*(path.length-1)/255)]);
 await require('./study-ink-tools.cjs').request(store,state,set,'study.ink.erase',{scope,...(scope==='card'?{cardId:p.cardId,imageBounds:p.imageBounds,side:p.reviewSide==='front'?'front':'back'}:{}),...(scope==='document'?{documentId:p.documentId,page:p.page,bands:result.erase.bands}:{}),path,radius,aspectRatio,mode:'stroke'});
 set.lastInk.recognizedShape='scribble';return true;
}
function pieces(geometry){const {paths,...value}=geometry;return (paths||[geometry.points]).map(points=>({...value,points}));}
module.exports={resolve,erase,pieces};
