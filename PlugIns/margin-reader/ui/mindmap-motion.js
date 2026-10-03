// Transient display layers never own document geometry. Pointer/key input first
// completes the transition, so selection, ink and drag use committed coordinates.
const NS='http://www.w3.org/2000/svg',DURATION=260;
const rect=node=>{const b=node.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};};
const samples=path=>{const length=path.getTotalLength();return Array.from({length:25},(_,i)=>{const p=path.getPointAtLength(length*i/24);return[p.x,p.y];});};
// Keep a disappearing topic's gradients/clip paths self-contained without
// duplicating the live DOM IDs used by its original visual resources.
function localizePaint(ghost,prefix){
 const ids=new Map();for(const node of ghost.querySelectorAll('[id]')){const old=node.id,next=prefix+old;ids.set(old,next);node.setAttribute('id',next);}
 for(const node of [ghost,...ghost.querySelectorAll('*')])for(const attr of [...node.attributes]){
  let value=attr.value.replace(/url\(#([^)]*)\)/g,(original,id)=>ids.has(id)?'url(#'+ids.get(id)+')':original);
  if(['href','xlink:href'].includes(attr.name)&&value.startsWith('#')&&ids.has(value.slice(1)))value='#'+ids.get(value.slice(1));
  if(value!==attr.value)node.setAttribute(attr.name,value);
 }
}
export class MindmapMotion{
 constructor(map){
  this.map=map;this.animations=new Set();this.temporary=[];this.hidden=[];this.media=matchMedia('(prefers-reduced-motion: reduce)');
  this.media.addEventListener('change',()=>this.finish());
  for(const name of ['pointerdown','keydown'])document.addEventListener(name,e=>{if(map.board.contains(e.target))this.finish();},true);
 }
 enabled(){return this.map.set?.map?.mindmap?.enabled&&this.map.set.map.mindmap.motion!==false&&!this.media.matches&&document.body.dataset.uiMotion!=='reduced'&&!this.map.study.cardInk?.dirty&&!this.map.study.ink?.dirty;}
 finish(){
  cancelAnimationFrame(this.frame);this.frame=null;for(const n of this.temporary)n.remove();this.temporary=[];for(const n of this.hidden)n.style.visibility='';this.hidden=[];
  for(const a of this.animations){a.finished.catch(()=>{});try{a.finish();}catch{}a.cancel();}this.animations.clear();
  for(const n of this.map.set?.map?.mindmap?.enabled?this.map.window?.nodes.values()||[]:[])for(const a of n.getAnimations({subtree:true})){if(a.effect?.target?.closest?.('.card-ink-overlay'))continue;a.finished.catch(()=>{});try{a.finish();}catch{}a.cancel();}
  delete this.map.board.dataset.mapAnimating;delete this.map.board.dataset.mapGeometryAnimating;
 }
 capture(){
  this.finish();this.before=new Map();this.edges=new Map();this.branchColors=new Map();if(!this.enabled()||this.map.window.nodes.size>250)return;
  this.oldWorld=rect(this.map.window.world);this.oldZoom=this.map.zoom;this.oldCards=new Map((this.map.set?.cards||[]).map(c=>[c.id,c]));
  for(const [id,node]of this.map.window.nodes){const b=rect(node),shape=node.querySelector('.mm-topic-shape>path');this.before.set(id,{...b,color:getComputedStyle(node).color,fill:shape?getComputedStyle(shape).fill:null,stroke:shape?getComputedStyle(shape).stroke:null,clone:node.cloneNode(true)});}
  for(const p of this.map.window.world.querySelectorAll('.study-map-links [data-mm-branch]')){const id=p.dataset.mmBranch,paint=getComputedStyle(p);this.branchColors.set(id,{stroke:paint.stroke,fill:paint.fill});if(!p.getAttribute('d'))continue;try{this.edges.set(id,{points:samples(p),color:paint.stroke,fill:paint.fill,width:paint.strokeWidth});}catch{}}
 }
 animate(node,frames,duration=DURATION){
  try{const a=node.animate(frames,{duration,easing:'cubic-bezier(.2,.65,.25,1)'});this.animations.add(a);this.map.board.dataset.mapAnimating='true';a.finished.catch(()=>{}).finally(()=>{this.animations.delete(a);if(!this.animations.size)delete this.map.board.dataset.mapAnimating;});return a;}catch{}
 }
 play(){
  if(!this.enabled()||!this.before?.size)return;const zoom=this.map.zoom,world=this.map.window.world,wr=rect(world),positions=this.map.layout.positions,byId=new Map(this.map.set.cards.map(c=>[c.id,c]));let geometry=false;
  const ancestor=(id,old=false)=>{const cards=old?this.oldCards:byId;let c=cards.get(id),seen=new Set();while(c?.parentId&&!seen.has(c.id)){seen.add(c.id);c=cards.get(c.parentId);if(c&&positions.has(c.id))return positions.get(c.id);}return positions.values().next().value;};
  for(const [id,node]of this.map.window.nodes){const a=this.before.get(id),b=rect(node);
   if(!a){const p=ancestor(id);if(p){geometry=true;this.animate(node,[{transform:`translate(${(wr.x+(p.x+p.width/2)*zoom-b.x-b.width/2)/zoom}px,${(wr.y+(p.y+p.height/2)*zoom-b.y-b.height/2)/zoom}px) scale(.88)`,opacity:0},{transform:'translate(0,0) scale(1)',opacity:1}]);}continue;}
   const dx=(a.x-b.x)/zoom,dy=(a.y-b.y)/zoom;if(Math.hypot(dx,dy)>=.5){geometry=true;this.animate(node,[{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}]);}
   const color=getComputedStyle(node).color;if(a.color!==color)this.animate(node,[{color:a.color},{color}]);const shape=node.querySelector('.mm-topic-shape>path');if(shape){const s=getComputedStyle(shape);if(a.fill!==s.fill&&a.fill?.startsWith('rgb')&&s.fill.startsWith('rgb'))this.animate(shape,[{fill:a.fill},{fill:s.fill}]);if(a.stroke!==s.stroke&&a.stroke&&a.stroke!=='none')this.animate(shape,[{stroke:a.stroke},{stroke:s.stroke}]);}
  }
  for(const [id,a]of this.before)if(!positions.has(id)){
   const p=ancestor(id,true);if(!p)continue;geometry=true;const ghost=a.clone;ghost.classList.add('mm-motion-ghost');ghost.removeAttribute('data-card-id');ghost.removeAttribute('id');ghost.setAttribute('aria-hidden','true');ghost.inert=true;
   localizePaint(ghost,'mm-exit-'+id+'-');Object.assign(ghost.style,{left:(a.x-wr.x)/zoom+'px',top:(a.y-wr.y)/zoom+'px',width:a.width/zoom+'px',height:a.height/zoom+'px',transform:'none'});world.append(ghost);this.temporary.push(ghost);
   this.animate(ghost,[{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${p.x+p.width/2-(a.x-wr.x+a.width/2)/zoom}px,${p.y+p.height/2-(a.y-wr.y+a.height/2)/zoom}px) scale(.85)`,opacity:0}]);
  }
  if(!geometry)for(const p of world.querySelectorAll('.study-map-links [data-mm-branch]')){const from=this.branchColors.get(p.dataset.mmBranch),to=getComputedStyle(p);for(const key of ['stroke','fill'])if(from?.[key]&&from[key]!==to[key])this.animate(p,[{[key]:from[key]},{[key]:to[key]}]);}
  if(geometry)this.transitionEdges(wr,zoom,ancestor);else{this.before=null;this.edges=null;}
 }
 transitionEdges(wr,zoom,ancestor){
  const world=this.map.window.world,overlay=document.createElementNS(NS,'svg');overlay.classList.add('mm-motion-links');overlay.setAttribute('width',this.map.layout.width);overlay.setAttribute('height',this.map.layout.height);overlay.setAttribute('aria-hidden','true');
  const tracks=[],oldPoint=p=>[(this.oldWorld.x+p[0]*this.oldZoom-wr.x)/zoom,(this.oldWorld.y+p[1]*this.oldZoom-wr.y)/zoom];
  const current=new Map([...world.querySelectorAll('.study-map-links [data-mm-branch]')].map(p=>[p.dataset.mmBranch,p]));
  const create=(id,from,to,color,width,fill='none',exiting=false)=>{const p=document.createElementNS(NS,'path');p.dataset.motionTo=id;p.setAttribute('fill',fill);p.setAttribute('stroke',color);p.setAttribute('stroke-width',parseFloat(width)||1.4);p.setAttribute('stroke-linecap','round');overlay.append(p);tracks.push({p,from,to,filled:fill!=='none',exiting});const old=this.edges.get(id);if(old){if(old.fill!==fill)this.animate(p,[{fill:old.fill},{fill}]);if(old.color!==color)this.animate(p,[{stroke:old.color},{stroke:color}]);}};
  for(const [id,p]of current){if(!p.getAttribute('d'))continue;let to;try{to=samples(p);}catch{continue;}const old=this.edges.get(id),anchor=ancestor(id),from=old?old.points.map(oldPoint):to.map(()=>anchor?[anchor.x+anchor.width/2,anchor.y+anchor.height/2]:to[0]);const style=getComputedStyle(p);create(id,from,to,style.stroke,style.strokeWidth,style.fill);p.style.visibility='hidden';this.hidden.push(p);}
  for(const [id,old]of this.edges)if(!current.has(id)){const a=ancestor(id,true),from=old.points.map(oldPoint),to=from.map(()=>a?[a.x+a.width/2,a.y+a.height/2]:from[0]);create(id,from,to,old.color,old.width,old.fill,true);}
  world.append(overlay);this.temporary.push(overlay);this.map.board.dataset.mapGeometryAnimating='true';const clock=this.animate(overlay,[{opacity:1},{opacity:1}]);
  const paint=t=>{for(const {p,from,to,filled,exiting}of tracks){p.setAttribute('d','M'+to.map((v,i)=>[from[i][0]+(v[0]-from[i][0])*t,from[i][1]+(v[1]-from[i][1])*t].join(',')).join(' L')+(filled?' Z':''));if(exiting)p.setAttribute('opacity',1-t);}};
  paint(0);const tick=()=>{if(!this.temporary.includes(overlay))return;const progress=clock?.effect?.getComputedTiming().progress;paint(progress??1);if(progress===null||progress>=1){this.finish();return;}this.frame=requestAnimationFrame(tick);};this.frame=requestAnimationFrame(tick);clock?.finished.then(()=>{if(this.temporary.includes(overlay))this.finish();}).catch(()=>{});
  this.before=null;this.edges=null;
 }
}
