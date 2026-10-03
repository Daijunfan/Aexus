// A target's whole body accepts a child. Sibling insertion uses only the
// external gap, so small topics never have an ambiguous inner hit area.
export function topicDrop({cards,layout,rootIds,family,point,delta,alt=false,tolerance=6}) {
  const settings=layout.config||{},roots=new Set(rootIds),byId=new Map(cards.map(c=>[c.id,c])),[x,y]=point;
  const verticalSiblings=parentId=>!['org-down','org-up','timeline-horizontal','matrix','tree-table-down','table-cell-down'].includes(layout.topics.get(parentId)?.box.structure);
  const siblingIntent=(target,after)=>{
    const parentId=target.parentId||null,siblings=cards.filter(c=>c.parentId===parentId&&!roots.has(c.id));
    const parent=layout.positions.get(parentId),box=layout.positions.get(target.id);
    const side=parent&&layout.topics.get(parentId)?.box.structure==='mindmap'?(box.x+box.width/2<parent.x+parent.width/2?'left':'right'):undefined;
    return {parentId,index:siblings.findIndex(c=>c.id===target.id)+(after?1:0),...(side?{side}:{}),targetId:target.id,kind:after?'after':'before',axis:verticalSiblings(parentId)?'y':'x'};
  };
  let hit,gap,movingHit;
  for(const [id,b]of layout.positions){
    const inside=x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height;
    if(inside){
      // Moving topics no longer occupy their old rectangles. An actual target
      // underneath that old position must still be available for reparenting.
      if(family.has(id)){if(!movingHit||b.width*b.height<movingHit.b.width*movingHit.b.height)movingHit={id,b};}
      else if(!hit||b.width*b.height<hit.b.width*hit.b.height)hit={id,b};
      continue;
    }
    const card=byId.get(id);if(!card?.parentId||family.has(id))continue;
    const vertical=verticalSiblings(card.parentId),within=vertical?x>=b.x&&x<=b.x+b.width:y>=b.y&&y<=b.y+b.height;
    const at=vertical?y:x,start=vertical?b.y:b.x,end=start+(vertical?b.height:b.width),distance=Math.min(Math.abs(at-start),Math.abs(at-end));
    if(within&&distance<=tolerance&&(!gap||distance<gap.distance))gap={card,after:at>end,distance};
  }
  hit??=movingHit;
  if(!alt&&hit){
    if(roots.has(hit.id))return {kind:'none'};
    if(family.has(hit.id))return {kind:'invalid',targetId:hit.id,message:'不能把主题移入自己的子主题'};
    return {kind:'child',targetId:hit.id,parentId:hit.id,side:'auto'};
  }
  const freelyPlaced=settings.flexibleFloating&&rootIds.every(id=>!byId.get(id)?.parentId);
  if(!alt&&gap&&!freelyPlaced)return siblingIntent(gap.card,gap.after);
  const moving=rootIds.map(id=>byId.get(id)),parents=new Set(moving.map(c=>c.parentId||null));
  const parentId=!alt&&parents.size===1?moving[0].parentId||null:null,parent=layout.positions.get(parentId);
  if(parent&&settings.freeBranches&&layout.topics.get(parentId)?.box.structure==='mindmap')return {kind:'position',parentId,positions:moving.map(c=>{const b=layout.positions.get(c.id);return {cardId:c.id,x:b.x+delta[0],y:b.y+delta[1]};})};
  if(parent){
    const split=layout.topics.get(parentId)?.box.structure==='mindmap',side=x<parent.x+parent.width/2?'left':'right',vertical=verticalSiblings(parentId);
    const siblings=cards.filter(c=>c.parentId===parentId&&!roots.has(c.id)),visible=siblings.filter(c=>{const b=layout.positions.get(c.id);return b&&(!split||(b.x+b.width/2<parent.x+parent.width/2?'left':'right')===side);});
    const next=visible.find(c=>{const b=layout.positions.get(c.id);return (vertical?y:x)<(vertical?b.y+b.height/2:b.x+b.width/2);});
    const index=next?siblings.indexOf(next):visible.length?siblings.indexOf(visible.at(-1))+1:siblings.length;
    return {kind:'reorder',parentId,index,...(split?{side}:{}),targetId:parentId};
  }
  return {kind:'floating',parentId:null,positions:moving.map(c=>{const b=layout.positions.get(c.id);return {cardId:c.id,x:b.x+delta[0]+(layout.originX||0),y:b.y+delta[1]+(layout.originY||0)};})};
}
