// FLIP and palette transitions are presentation-only. A real pointer or key
// finishes them before a drawing/drag tool reads source-of-truth geometry.
export class MindmapMotion {
 constructor(map){this.map=map;this.animations=new Set();this.media=matchMedia('(prefers-reduced-motion: reduce)');this.media.addEventListener('change',()=>this.finish());document.addEventListener('pointerdown',event=>{if(map.board.contains(event.target))this.finish();},true);document.addEventListener('keydown',event=>{if(map.board.contains(event.target))this.finish();},true);}
 enabled(){return this.map.set?.map?.mindmap?.enabled&&this.map.set.map.mindmap.motion!==false&&!this.media.matches&&document.body.dataset.uiMotion!=='reduced'&&!this.map.study.cardInk?.dirty&&!this.map.study.ink?.dirty;}
 finish(){for(const a of this.animations){a.finished.catch(()=>{});try{a.finish();}catch{}a.cancel();}this.animations.clear();for(const node of this.map.set?.map?.mindmap?.enabled?this.map.window?.nodes.values()||[]:[])for(const animation of node.getAnimations({subtree:true})){if(animation.effect?.target?.closest?.('.card-ink-overlay'))continue;animation.finished.catch(()=>{});try{animation.finish();}catch{}animation.cancel();}delete this.map.board.dataset.mapAnimating;}
 capture(){this.finish();this.before=new Map();this.branchColors=new Map();if(!this.enabled()||this.map.window.nodes.size>250)return;for(const [id,node]of this.map.window.nodes){const b=node.getBoundingClientRect(),shape=node.querySelector('.mm-topic-shape>path');this.before.set(id,{x:b.x,y:b.y,width:b.width,height:b.height,color:getComputedStyle(node).color,fill:shape?getComputedStyle(shape).fill:null,stroke:shape?getComputedStyle(shape).stroke:null});}for(const p of this.map.board.querySelectorAll('[data-mm-branch]'))this.branchColors.set(p.dataset.mmBranch,getComputedStyle(p).stroke);}
 animate(node,frames,duration=260){try{const a=node.animate(frames,{duration,easing:'cubic-bezier(.2,.65,.25,1)'});this.animations.add(a);this.map.board.dataset.mapAnimating='true';a.finished.catch(()=>{}).finally(()=>{this.animations.delete(a);if(!this.animations.size)delete this.map.board.dataset.mapAnimating;});}catch{}}
 play(){if(!this.enabled()||!this.before?.size)return;const zoom=this.map.zoom;for(const [id,node]of this.map.window.nodes){const a=this.before.get(id),b=node.getBoundingClientRect();if(!a)continue;const dx=(a.x-b.x)/zoom,dy=(a.y-b.y)/zoom;
   if(Math.hypot(dx,dy)>=1)this.animate(node,[{transform:`translate(${dx}px,${dy}px)`,opacity:.85},{transform:'translate(0,0)',opacity:1}]);
   const color=getComputedStyle(node).color;if(a.color!==color)this.animate(node,[{color:a.color},{color}]);
   const shape=node.querySelector('.mm-topic-shape>path');if(shape){const current=getComputedStyle(shape);if(a.fill!==current.fill&&a.fill?.startsWith('rgb')&&current.fill.startsWith('rgb'))this.animate(shape,[{fill:a.fill},{fill:current.fill}]);if(a.stroke!==current.stroke&&a.stroke&&a.stroke!=='none')this.animate(shape,[{stroke:a.stroke},{stroke:current.stroke}]);}
  }
  for(const p of this.map.board.querySelectorAll('[data-mm-branch]')){const from=this.branchColors.get(p.dataset.mmBranch),to=getComputedStyle(p).stroke;if(from&&from!==to)this.animate(p,[{stroke:from},{stroke:to}]);}
  this.before=null;this.branchColors=null;
 }
}
