import {layoutMindmap} from './mindmap-layout.mjs';
import { buildBranch, branchPath } from './branch-layout.mjs';
export { branchPath };
export function descendants(cards,id){const ids=new Set([id]);for(let changed=true;changed;){changed=false;for(const c of cards)if(ids.has(c.parentId)&&!ids.has(c.id)){ids.add(c.id);changed=true;}}return ids;}
// Deterministic hierarchy layout. The Core owns all cards, styles and free positions.
export function layoutStudy(input,options={},appearance={}) {
  if(options.mindmap?.enabled)return layoutMindmap(input,options);
  const scope=options.focusId||options.submapId,scopeIds=scope?descendants(input,scope):null;
  const cards=input.filter(c=>(c.inMap!==false||c.id===scope)&&(!scopeIds||scopeIds.has(c.id))).map(c=>c.id===scope?{...c,parentId:null}:c);
  const ids=new Set(cards.map(c=>c.id)),children=new Map(),positions=new Map(),links=[];
  for(const c of cards){const parent=ids.has(c.parentId)?c.parentId:null;if(!children.has(parent))children.set(parent,[]);children.get(parent).push(c);}
  function place(n,x,y,parent,relationStyle) {
    positions.set(n.card.id,{x:x+n.x,y:y+n.y,width:n.width,height:n.height});
    if(parent)links.push({from:parent,to:n.card.id,style:relationStyle});
    let previous=n.card.id;
    for(const p of n.placements){place(p.node,x+p.x,y+p.y,n.style.startsWith('line')?previous:n.card.id,n.style);previous=p.node.card.id;}
  }
  let top=options.focusId?350:30;
  for(const root of children.get(null)||[]){const node=buildBranch(root,children,options,appearance,scope);place(node,options.focusId?600:30,top,null,node.style);top+=node.h+42;}
  if(options.layout==='radial'&&!options.branchStyle&&positions.size>1) {
    const levels=new Map(),groups=new Map();
    for(const c of cards)if(positions.has(c.id)){const depth=c.parentId?(levels.get(c.parentId)||0)+1:0;levels.set(c.id,depth);if(!groups.has(depth))groups.set(depth,[]);groups.get(depth).push(c);}
    const roots=groups.get(0)?.length||1;
    for(const [depth,rows] of groups){const radius=roots===1&&depth===0?0:Math.max((depth+1)*400,rows.length*350/(2*Math.PI));rows.forEach((c,i)=>{const p=positions.get(c.id),angle=2*Math.PI*i/rows.length-Math.PI/2;p.x=radius*Math.cos(angle);p.y=radius*Math.sin(angle);});}
    const minX=Math.min(...[...positions.values()].map(p=>p.x)),minY=Math.min(...[...positions.values()].map(p=>p.y));for(const p of positions.values()){p.x+=30-minX;p.y+=30-minY;}
  }
  // A free root position moves every displayed descendant by the same amount.
  for(const c of cards)if(c.id!==options.focusId&&c.position&&positions.has(c.id)&&(!c.parentId||input.find(n=>n.id===c.parentId)?.submap)) {
    const root=positions.get(c.id),dx=c.position.x-root.x,dy=c.position.y-root.y;
    for(const id of descendants(cards,c.id)){const p=positions.get(id);if(p){p.x+=dx;p.y+=dy;}}
  }
  const minX=Math.min(0,...[...positions.values()].map(p=>p.x)),minY=Math.min(0,...[...positions.values()].map(p=>p.y));
  if(minX<0||minY<0)for(const p of positions.values()){p.x-=minX;p.y-=minY;}
  return {positions,links,width:Math.max(options.focusId?1436:340,...[...positions.values()].map(p=>p.x+p.width+50)),height:Math.max(options.focusId?926:300,...[...positions.values()].map(p=>p.y+p.height+30))};
}
