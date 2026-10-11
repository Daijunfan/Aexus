'use strict';
const S=require('./safety.cjs'),M=require('./study-model.cjs');
async function arrange(set,p){
 const chosen=require('./study-tree.cjs').roots(set,p.cardIds),ids=new Set(chosen.map(c=>c.id));
 S.assert(chosen.length&&chosen.length<=1000,'INVALID_PARAMS','Arrange 1–1000 independent topic branches.');
 if(p.action==='reset'){for(const c of chosen){delete c.position;if(c.mindmap)delete c.mindmap.offset;}return;}
 const {layoutMindmap}=await import('../ui/mindmap-layout.mjs'),layout=layoutMindmap(set.cards,{...set.map,focusId:null,submapId:null});
 const boxes=new Map(chosen.map(c=>[c.id,layout.positions.get(c.id)]));
 for(const c of chosen){const parent=set.cards.find(n=>n.id===c.parentId),kind=layout.topics.get(parent?.id)?.box.structure;
  S.assert(boxes.get(c.id),'INVALID_PARAMS','Expand the selected topics before arranging them.');
  S.assert(!parent||parent.submap||set.map?.mindmap?.freeBranches&&kind==='mindmap','INVALID_PARAMS','Enable free branch positioning for attached main topics. Other attached topics use hierarchy layout.');
 }
 let targets=new Map([...boxes].map(([id,b])=>[id,{x:b.x,y:b.y}]));
 if(p.action==='place'){
  S.assert(Array.isArray(p.positions)&&p.positions.length===chosen.length,'INVALID_PARAMS','Supply one position per chosen root.');targets=new Map();
  for(const q of p.positions){S.assert(q&&Object.keys(q).every(k=>['cardId','x','y'].includes(k))&&ids.has(q.cardId)&&!targets.has(q.cardId)&&['x','y'].every(k=>Number.isFinite(q[k])&&Math.abs(q[k])<=1000000000),'INVALID_PARAMS','Invalid topic position.');targets.set(q.cardId,{x:q.x,y:q.y});}
 }else{
  S.assert(chosen.length>=2,'INVALID_PARAMS','Select at least two independent branches.');
  const bs=[...boxes.values()],left=Math.min(...bs.map(b=>b.x)),right=Math.max(...bs.map(b=>b.x+b.width)),top=Math.min(...bs.map(b=>b.y)),bottom=Math.max(...bs.map(b=>b.y+b.height));
  if(p.action.startsWith('distribute-')){
   S.assert(bs.length>=3,'INVALID_PARAMS','Distribute at least three topics.');const x=p.action.endsWith('x'),axis=x?'x':'y',size=x?'width':'height',rows=[...boxes].sort((a,b)=>a[1][axis]-b[1][axis]);
   const total=rows.reduce((n,[,b])=>n+b[size],0),start=x?left:top,end=x?right:bottom,gap=(end-start-total)/(rows.length-1);let at=start;
   for(const [id,b]of rows){targets.get(id)[axis]=at;at+=b[size]+gap;}
  }else for(const [id,b]of boxes){const t=targets.get(id);switch(p.action){case'left':t.x=left;break;case'right':t.x=right-b.width;break;case'top':t.y=top;break;case'bottom':t.y=bottom-b.height;break;case'center-x':t.x=(left+right-b.width)/2;break;case'center-y':t.y=(top+bottom-b.height)/2;break;default:S.fail('INVALID_PARAMS','Unknown arrangement.');}}
 }
 for(const c of chosen){const b=boxes.get(c.id),t=targets.get(c.id),dx=t.x-b.x,dy=t.y-b.y,parent=set.cards.find(n=>n.id===c.parentId);
  if(!parent||parent.submap){const origin=c.position||{x:b.x+(layout.originX||0),y:b.y+(layout.originY||0)};c.position={x:origin.x+dx,y:origin.y+dy};}
  else{const old=c.mindmap?.offset||{x:0,y:0};c.mindmap={...c.mindmap,offset:{x:old.x+dx,y:old.y+dy}};}
  c.updatedAt=new Date().toISOString();
 }
}
module.exports={arrange};
