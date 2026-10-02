'use strict';
const {assert}=require('./safety.cjs');
const unit={x:0,y:0,width:1,height:1};
function intersect(a,b){const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),r=Math.min(a.x+a.width,b.x+b.width),bottom=Math.min(a.y+a.height,b.y+b.height);return r>x&&bottom>y?{x,y,width:r-x,height:bottom-y}:null;}
// Both the raster worker and annotations crop before rotating clockwise.
function project(rect,{from=unit,to=unit,rotation=0}={}){
 const clipped=intersect(rect,from);if(!clipped)return null;
 let {x,y,width:w,height:h}={x:(clipped.x-from.x)/from.width,y:(clipped.y-from.y)/from.height,width:clipped.width/from.width,height:clipped.height/from.height};
 if(rotation===90)[x,y,w,h]=[1-y-h,x,h,w];else if(rotation===180)[x,y]=[1-x-w,1-y-h];else if(rotation===270)[x,y,w,h]=[y,1-x-w,h,w];
 // Roundoff must not make a mask lie outside the image after several edits.
 const left=Math.max(0,to.x+x*to.width),top=Math.max(0,to.y+y*to.height),right=Math.min(1,to.x+(x+w)*to.width),bottom=Math.min(1,to.y+(y+h)*to.height);
 return {x:left,y:top,width:right-left,height:bottom-top};
}
function remap(card,set,mappings){
 const transform=rect=>mappings.map(map=>project(rect,map)).filter(Boolean),before=(card.emphasis?.images||[]).length+(card.review?.occlusions||[]).length;
 if(card.emphasis)card.emphasis.images=card.emphasis.images.flatMap(mark=>transform(mark).map(rect=>({...mark,...rect})));
 assert((card.emphasis?.images?.length||0)<=100,'TOO_LARGE','The image edit would create more than 100 emphasis regions.');
 if(card.review?.occlusions?.length){
  const review=card.review,masks=[],groups=[];
  review.occlusions.forEach((rect,i)=>{const next=transform(rect);masks.push(...next);groups.push(...next.map(()=>review.occlusionGroups?.[i]||1));});
  const params={enabled:review.enabled,occlusions:masks,...(review.occlusionGroups?{occlusionGroups:groups}:{})};
  require('./study-review.cjs').configure(card,params,set,{}, {preserveGeneration:true});
 }
 const ink=require('./image-ink.cjs');let unmappedInk=0,transformedInk=0;
 if(card.ink){card.ink=card.ink.flatMap(stroke=>{if(ink.bound(stroke)){transformedInk++;return ink.remap(stroke,mappings,card.image.width/card.image.height);}if(stroke.imageBounds){delete stroke.imageBounds;delete stroke.aspectRatio;unmappedInk++;}return [stroke];});assert(card.ink.length<=500,'TOO_LARGE','The image edit would exceed the card handwriting capacity.');}
 const after=(card.emphasis?.images||[]).length+(card.review?.occlusions||[]).length;
 return {before,after,removed:Math.max(0,before-after),unmappedInk,transformedInk};
}
module.exports={unit,intersect,project,remap};
