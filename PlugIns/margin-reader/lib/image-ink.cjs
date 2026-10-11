'use strict';
const {randomUUID}=require('node:crypto');
const {assert}=require('./safety.cjs'),G=require('./ink-geometry.cjs');
const unit={x:0,y:0,width:1,height:1};
const inside=(p,r)=>p[0]>=r.x&&p[1]>=r.y&&p[0]<=r.x+r.width&&p[1]<=r.y+r.height;
function bound(s){return s.imageBound===true||s.imageBound!==false&&Boolean(s.imageBounds&&s.points.every(p=>inside(p,s.imageBounds)));}
function project(s,to=unit){
 if(!bound(s))return s;const from=s.imageBounds;
 return {...s,imageBound:true,imageBounds:to,width:s.width/from.width*to.width,points:s.points.map(p=>[to.x+(p[0]-from.x)/from.width*to.width,to.y+(p[1]-from.y)/from.height*to.height,...p.slice(2)])};
}
// Matches the card's 5/1px borders, 49px header, 40px footer, 8px image
// margins and 1px image border. The browser verifies this against actual pixels.
function frame(card,width,height,appearance={}){
 if(!card.image||(card.style?.titleOnly??appearance.titleOnly))return null;
 const w=width-20,h=height-97;if(w<=0||h<=0)return null;
 const fit=Math.min(w/card.image.width,h/card.image.height),iw=card.image.width*fit,ih=card.image.height*fit;
 return {x:(10+(w-iw)/2)/width,y:(55+(h-ih)/2)/height,width:iw/width,height:ih/height};
}
async function cardFrame(set,card){
 const {layoutStudy}=await import('../ui/study-map-layout.mjs');let box=layoutStudy(set.cards,set.map,set.appearance).positions.get(card.id);
 if(!box)box=layoutStudy([{...card,parentId:null,inMap:true}],{...set.map,focusId:null,submapId:null},set.appearance).positions.get(card.id);
 return set.map?.mindmap?.enabled!==false?(box.imageBounds||null):frame(card,box.width,box.height,set.appearance);
}
function check(s){assert(s.points.length>=2&&s.points.length<=2048&&s.points.every(p=>p.every(Number.isFinite)&&Math.abs(p[0])<=1000&&Math.abs(p[1])<=1000)&&Number.isFinite(s.width)&&s.width>0,'INVALID_PARAMS','Image-bound ink exceeds the supported coordinate range.');return s;}
function clipped(s,rect){return G.clip(s.points,rect).map((points,i)=>({...s,id:i?s.id&&randomUUID():s.id,points}));}
function remap(stroke,mappings,aspect){
 const source=project(stroke),values=[];
 for(const {from=unit,to=unit,rotation=0} of mappings){
  const pad=source.width/2,expanded={x:from.x-pad,y:from.y-pad*aspect,width:from.width+2*pad,height:from.height+2*pad*aspect};
  for(const piece of clipped(source,expanded)){
   const points=piece.points.map(p=>{let x=(p[0]-from.x)/from.width,y=(p[1]-from.y)/from.height;if(rotation===90)[x,y]=[1-y,x];else if(rotation===180)[x,y]=[1-x,1-y];else if(rotation===270)[x,y]=[y,1-x];return [to.x+x*to.width,to.y+y*to.height,...p.slice(2)];});
   const width=source.width*(rotation%180?aspect/from.height:1/from.width)*to.width;
   values.push(check(project({...piece,id:values.length?randomUUID():stroke.id,imageBound:true,imageBounds:unit,points,width},stroke.imageBounds)));
  }
 }
 return values;
}
function forFace(set,card,side='back'){return (card.ink||[]).filter(s=>bound(s)&&!s.hidden&&(!s.reviewSide||s.reviewSide===side||s.reviewSide==='both')&&require('./study-advanced.cjs').layers(set).some(l=>l.id===(s.layerId||'default')&&l.visible&&!l.deletedAt));}
async function paint(bytes,strokes,colors={}){
 if(!strokes.length)return bytes;const {createCanvas,loadImage}=require('@napi-rs/canvas'),image=await loadImage(bytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
 for(const raw of strokes){const s={...project(raw),color:colors[raw.color]||raw.color},opacity=s.opacity??(s.brush==='highlighter'?.35:1),pressure=s.points[0]?.[2]??1;
  if(opacity>=1||s.brush==='highlighter'||s.points.every(p=>(p[2]??1)===pressure)){require('./export-render.cjs').stroke(ctx,s,image.width,image.height);continue;}
  const b=G.bounds(s.points),pad=s.width*image.width/2+1,x=Math.max(0,Math.floor(b.x*image.width-pad)),y=Math.max(0,Math.floor(b.y*image.height-pad)),right=Math.min(image.width,Math.ceil(b.right*image.width+pad)),bottom=Math.min(image.height,Math.ceil(b.bottom*image.height+pad));if(right<=x||bottom<=y)continue;
  const layer=createCanvas(right-x,bottom-y),local=layer.getContext('2d');local.translate(-x,-y);require('./export-render.cjs').stroke(local,{...s,opacity:1},image.width,image.height);ctx.save();ctx.globalAlpha=opacity;ctx.drawImage(layer,x,y);ctx.restore();
 }
 return canvas.encode('png');
}
module.exports={bound,project,frame,cardFrame,check,clipped,remap,paint,forFace,unit,inside};
