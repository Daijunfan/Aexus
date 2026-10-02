import {mapStyle,topicStyle,topicBox,numberLabel,branchRoute} from './mindmap-style.mjs';
const bounds=rows=>({x:Math.min(...rows.map(p=>p.x)),y:Math.min(...rows.map(p=>p.y)),right:Math.max(...rows.map(p=>p.x+p.width)),bottom:Math.max(...rows.map(p=>p.y+p.height))});
const overlap=(a,b,pad=10)=>a.x<b.x+b.width+pad&&a.x+a.width+pad>b.x&&a.y<b.y+b.height+pad&&a.y+a.height+pad>b.y;
export function layoutMindmap(input,options={}){
 const config=mapStyle(options.mindmap),scope=options.focusId||options.submapId,all=new Map(input.map(c=>[c.id,c])),children=new Map();
 for(const c of input){const parent=all.has(c.parentId)?c.parentId:null;if(!children.has(parent))children.set(parent,[]);children.get(parent).push(c);}
 const descendants=id=>{const ids=new Set(),todo=[id];while(todo.length){const n=todo.pop();if(ids.has(n))continue;ids.add(n);for(const c of children.get(n)||[])todo.push(c.id);}return ids;};
 const allowed=scope?descendants(scope):null;
 const positions=new Map(),topics=new Map(),links=[],furniture=[],decorations=[];
 const items=(options.mindmap?.items||[]).filter(i=>i.cardIds.some(id=>all.has(id)&&(!allowed||allowed.has(id))));
 const summaryIds=new Set(items.filter(i=>i.kind==='summary'&&all.has(i.topicId)&&all.get(i.topicId).parentId===null).map(i=>i.topicId));
 const childRows=c=>c.collapsed||c.submap&&c.id!==scope?[]:(children.get(c.id)||[]).filter(n=>n.inMap!==false&&(!allowed||allowed.has(n.id)));
 function build(card,inherited,depth,branch,path,forcedWidth){
  const style={...topicStyle(card,options.mindmap,depth,branch),...(forcedWidth?{width:forcedWidth}:{})},prefix=depth&&path.length?numberLabel(path.at(-1),path,style.numbering):'';
  const size=topicBox(card,style,config,prefix),structure=card.mindmap?.structure||inherited;
  const n={card,style,...size,structure,x:0,y:0,w:size.width,h:size.height,placements:[]};
  const rows=depth<64?childRows(card):[],gap=config.spacing,distance=config.branchSpacing;
  const split=structure==='mindmap',left=new Set();
  if(split){let a=0,b=0;rows.forEach((c,i)=>{const fixed=c.mindmap?.side;if(fixed==='left'||fixed!=='right'&&(config.autoBalance?b<a:i%2===1)){left.add(c.id);b+=descendants(c.id).size;}else a+=descendants(c.id).size;});}
  const equalWidth=config.sameLevelWidth&&rows.length?Math.max(...rows.map((c,i)=>{const s=topicStyle(c,options.mindmap,depth+1,depth===0?i:branch);return topicBox(c,s,config,numberLabel(i+1,[...path,i+1],s.numbering)).width;})):null;
  const nodes=rows.map((c,i)=>{const inherit=split?(left.has(c.id)?'logic-left':'logic-right'):structure.startsWith('timeline')||structure.startsWith('fishbone')?(i%2?'org-down':'org-up'):structure==='matrix'?'timeline-vertical':structure;return build(c,inherit,depth+1,depth===0?i:branch,[...path,i+1],equalWidth);});
  if(!nodes.length)return n;
  // Equal topic widths are applied before recursive placement, never after it.
  const span=(nodes,axis)=>nodes.reduce((s,c)=>s+c[axis],0)+Math.max(0,nodes.length-1)*gap;
  const horizontal=['logic-right','logic-left','tree-right','tree-left','brace'].includes(structure);
  if(horizontal){const backward=structure.endsWith('left'),childWidth=Math.max(...nodes.map(c=>c.w)),childHeight=span(nodes,'h');n.w=n.width+distance+childWidth;n.h=Math.max(n.height,childHeight);n.x=backward?childWidth+distance:0;n.y=(n.h-n.height)/2;let y=(n.h-childHeight)/2;for(const c of nodes){n.placements.push({node:c,x:backward?childWidth-c.w:n.width+distance,y,vertical:false});y+=c.h+gap;}}
  else if(['org-down','org-up'].includes(structure)){const up=structure==='org-up',childWidth=span(nodes,'w'),childHeight=Math.max(...nodes.map(c=>c.h));n.w=Math.max(n.width,childWidth);n.h=n.height+distance+childHeight;n.x=(n.w-n.width)/2;n.y=up?childHeight+distance:0;let x=(n.w-childWidth)/2;for(const c of nodes){n.placements.push({node:c,x,y:up?childHeight-c.h:n.height+distance,vertical:true});x+=c.w+gap;}}
  else if(split){const L=nodes.filter(c=>left.has(c.card.id)),R=nodes.filter(c=>!left.has(c.card.id));const lw=L.length?Math.max(...L.map(c=>c.w)):0,rw=R.length?Math.max(...R.map(c=>c.w)):0;n.x=lw?lw+distance:0;n.w=n.x+n.width+(rw?distance+rw:0);n.h=Math.max(n.height,span(L,'h'),span(R,'h'));n.y=(n.h-n.height)/2;for(const [arr,isLeft]of[[L,true],[R,false]]){let y=(n.h-span(arr,'h'))/2;for(const c of arr){n.placements.push({node:c,x:isLeft?lw-c.w:n.x+n.width+distance,y,vertical:false});y+=c.h+gap;}}}
  else if(structure==='timeline-vertical'){
   n.w=Math.max(n.width,...nodes.map(c=>c.w));n.h=n.height+distance+span(nodes,'h');n.x=(n.w-n.width)/2;let y=n.height+distance;for(const c of nodes){n.placements.push({node:c,x:(n.w-c.w)/2,y,vertical:true,chain:true});y+=c.h+gap;}
  }else if(structure==='matrix'){
   const widths=nodes.map(c=>c.w),maxH=Math.max(...nodes.map(c=>c.h));n.w=Math.max(n.width,widths.reduce((s,v)=>s+v,0)+gap*(nodes.length-1));n.h=n.height+distance+maxH;n.x=(n.w-n.width)/2;let x=0;for(const c of nodes){n.placements.push({node:c,x,y:n.height+distance,vertical:true,cell:true});x+=c.w+gap;}
  }else{
   const above=nodes.filter((_,i)=>i%2===0),below=nodes.filter((_,i)=>i%2===1),top=above.length?Math.max(...above.map(c=>c.h))+distance:0,bottom=below.length?Math.max(...below.map(c=>c.h))+distance:0;
   const lane=Math.max(n.height/2,top);n.y=lane-n.height/2;n.h=lane+Math.max(n.height/2,bottom);n.w=n.width+distance+span(nodes,'w');const reversed=structure==='fishbone-left';n.x=reversed?n.w-n.width:0;let x=reversed?0:n.width+distance;
   for(const [i,c]of nodes.entries()){n.placements.push({node:c,x,y:i%2?lane+distance:lane-distance-c.h,vertical:true,spine:true,spineY:lane,slant:structure.startsWith('fishbone')});x+=c.w+gap;}
  }
  return n;
 }
 function place(n,x,y,parent=null,incoming=null){
  const p={x:x+n.x,y:y+n.y,width:n.width,height:n.height};if(n.style.showImage&&n.card.image){const w=n.imageWidth??n.width-24,h=n.imageHeight,fit=Math.min(w/n.card.image.width,h/n.card.image.height),iw=n.card.image.width*fit,ih=n.card.image.height*fit;p.imageBounds={x:((n.imageLeft??12)+(w-iw)/2)/n.width,y:(n.padTop+n.titleHeight+12+n.markers+(h-ih)/2)/n.height,width:iw/n.width,height:ih/n.height};}positions.set(n.card.id,p);topics.set(n.card.id,{...n.style,box:{...n},prefix:n.prefix,lines:n.lines});
  if(parent)links.push({from:parent,to:n.card.id,style:'mindmap',vertical:incoming?.vertical,line:incoming?.spine?'straight':incoming?.line||n.style.line,color:n.style.accent,width:n.style.lineWidth,...(incoming?.spine?{spine:true,spineY:y-incoming.y+incoming.spineY,slant:incoming.slant}:{})});
  if(n.structure==='matrix'){const left=x,top=y+n.height+config.branchSpacing/2;furniture.push({kind:'matrix',id:n.card.id,x:left,y:top,width:n.w,height:n.h-(top-y)+12,columns:n.placements.map(c=>x+c.x+c.node.w+config.spacing/2).slice(0,-1),color:n.style.accent});}
  if(n.structure==='brace'&&n.placements.length){const ps=n.placements.map(c=>({x:x+c.x+c.node.x,y:y+c.y+c.node.y,width:c.node.width,height:c.node.height})),b=bounds(ps);furniture.push({kind:'brace',id:n.card.id,x:b.x-30,y:b.y,width:24,height:b.bottom-b.y,color:n.style.accent});}
  let previous=n.card.id;
  for(const child of n.placements){place(child.node,x+child.x,y+child.y,child.chain?previous:n.card.id,{...child,line:n.structure==='tree-right'||n.structure==='tree-left'||n.structure==='matrix'?'elbow':n.structure==='brace'?'rounded':undefined});previous=child.node.card.id;}
 }
 const roots=(scope?[all.get(scope)]:children.get(null)||[]).filter(c=>c&&(c.inMap!==false||c.id===scope)&&(!summaryIds.has(c.id)||c.id===scope));
 let top=50;for(const [i,c]of roots.entries()){const n=build(c,config.structure||'mindmap',0,i,[]);place(n,50,top);top+=n.h+100;}
 // Summary topics remain regular model cards, including their own subtopics.
 // Their bracket anchors move with the selected branch, not stored screen pixels.
 for(const item of items.filter(i=>i.kind==='summary')){
  const ranges=item.cardIds.filter(id=>positions.has(id)).flatMap(id=>[...descendants(id)].filter(id=>positions.has(id)).map(id=>positions.get(id))),topic=all.get(item.topicId);
  if(!ranges.length||!topic||positions.has(topic.id))continue;
  const b=bounds(ranges),n=build(topic,'logic-right',1,topics.get(item.cardIds[0])?.branch||0,[]);let x=b.right+config.branchSpacing,y=Math.max(30,(b.y+b.bottom-n.h)/2);
  const rectangle={x,y,width:n.w,height:n.h};for(let retry=0;retry<30;retry++){const collisions=[...positions.values()].filter(p=>overlap(rectangle,p));if(!collisions.length)break;rectangle.x=Math.max(...collisions.map(p=>p.x+p.width))+config.branchSpacing;}place(n,rectangle.x,y);
 }
 // Preserve explicit floating roots and translate their entire visible branch.
 for(const c of roots)if(c.position&&c.id!==options.focusId){const p=positions.get(c.id);if(!p)continue;const dx=c.position.x-p.x,dy=c.position.y-p.y;const family=descendants(c.id);for(const id of family){const p=positions.get(id);if(p){p.x+=dx;p.y+=dy;}}for(const f of furniture)if(family.has(f.id)){f.x+=dx;f.y+=dy;if(f.columns)f.columns=f.columns.map(x=>x+dx);}}
 for(const item of items){
  const ids=item.cardIds.filter(id=>positions.has(id));if(!ids.length)continue;
  const rects=ids.flatMap(id=>[...descendants(id)].filter(id=>positions.has(id)).map(id=>positions.get(id)));if(!rects.length)continue;
  const b=bounds(rects),s=item.style||{},padding=s.padding??18,color=s.color||topics.get(ids[0])?.accent||config.palette[0];
  if(item.kind==='boundary')decorations.push({...item,color,x:b.x-padding,y:b.y-padding-(s.title?24:0),width:b.right-b.x+padding*2,height:b.bottom-b.y+padding*2+(s.title?24:0)});
  if(item.kind==='summary'&&positions.has(item.topicId))decorations.push({...item,color,x:b.right+12,y:b.y,width:Math.max(20,positions.get(item.topicId).x-b.right-12),height:b.bottom-b.y});
  if(item.kind==='callout'){
   const p=positions.get(ids[0]),label=s.title||'标注',w=Math.min(260,Math.max(100,label.length*(s.fontSize||13)*.65+26)),h=Math.ceil(label.length/Math.max(1,(w-24)/(s.fontSize||13)))*20+22;
   let box={x:p.x+p.width+24,y:p.y-h-16,width:w,height:h};for(let k=0;k<15;k++){const collides=[...positions.values()].filter(p=>overlap(box,p));if(!collides.length)break;box.x=Math.max(...collides.map(p=>p.x+p.width))+28;}
   decorations.push({...item,color,...box});
  }
 }
 const allBoxes=[...positions.values(),...decorations,...furniture];const minX=Math.min(0,...allBoxes.map(p=>p.x-26)),minY=Math.min(0,...allBoxes.map(p=>p.y-26));
 for(const p of allBoxes){p.x-=minX;p.y-=minY;if(p.columns)p.columns=p.columns.map(x=>x-minX);}
 for(const l of links)if(l.spine)l.spineY-=minY;
 for(const [id,t]of topics){const {card,style,nodes,placements,...box}=t.box;t.box=box;}
 const width=Math.max(420,...allBoxes.map(p=>p.x+p.width+70)),height=Math.max(300,...allBoxes.map(p=>p.y+p.height+70));
 return {positions,links,topics,decorations,furniture,width,height,mindmap:true,config};
}
export function mindmapBranchPath(link,positions){
 const a=positions.get(link.from),b=positions.get(link.to);if(!a||!b)return '';
 if(link.spine){const y=link.spineY,x=b.x+b.width/2+(link.slant?Math.min(70,b.width*.4):0),ty=b.y>y?b.y:b.y+b.height;return `M${a.x+a.width/2},${a.y+a.height/2} L${x},${y} L${b.x+b.width/2},${ty}`;}
 return branchRoute(a,b,link.line,link.vertical);
}
