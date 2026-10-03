import {$,run,toast} from './dom.js';
import {api} from './transport.js';
import {rootSelection} from './map-interaction.mjs';
import {topicDrop} from './topic-drop.mjs';
import {snapDelta} from './mindmap-guides.mjs';
import {diagramPaths} from './mindmap-view.mjs';
import {overviewGlyphs} from './mindmap-overview.mjs';

// Move the actual topic DOM within its existing scaled world. Native HTML drag
// images are deliberately disabled: they lose the canvas transform on macOS.
export class TopicDrag {
  constructor(study){
    this.study=study;this.map=study.map;this.view=$('study-map-viewport');
    this.view.addEventListener('scroll',()=>{if(this.active?.moved&&!this.active.saving)this.paint(this.active.last);},{passive:true});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.active&&!this.active.saving){e.preventDefault();e.stopImmediatePropagation();this.cancel();}},true);
    window.addEventListener('blur',()=>{if(this.active&&!this.active.saving)this.cancel();});
  }
  point(e){const b=$('study-map-world').getBoundingClientRect();return [(e.clientX-b.left)/this.map.zoom,(e.clientY-b.top)/this.map.zoom];}
  accepts(e){
    const r=this.view.getBoundingClientRect();
    return e.clientX>=r.left&&e.clientX<r.right&&e.clientY>=r.top&&e.clientY<r.bottom&&this.view.contains(document.elementFromPoint(e.clientX,e.clientY));
  }
  start(e){
    const id=this.map.window.topicAt(e);
    if(this.active||!id||e.button!==0||e.target.closest('button,input,select,textarea,[data-link-id],[data-mm-item],#mindmap-overview')||this.study.cardInk.mode!=='off'||this.study.busy)return;
    if(this.study.inspector?.dirty||this.study.mindmapStudio?.dirty){toast('请先保存或放弃当前编辑。',true);return;}
    e.preventDefault();e.stopImmediatePropagation();this.map.motion?.finish();
    // Overview glyphs use the same topic operation, at the same scale. Mount
    // only the selected topic instead of treating its graphic as blank canvas.
    if(!this.map.window.nodes.has(id)){this.map.selected=id;this.map.window.paint();}
    this.map.window.nodes.get(id)?.focus({preventScroll:true});
    const set=this.study.current,selected=this.study.advanced.selected;
    const roots=rootSelection(set.cards,selected.has(id)?[...selected]:[id]),children=new Map();
    for(const c of set.cards){if(!children.has(c.parentId))children.set(c.parentId,[]);children.get(c.parentId).push(c.id);}
    const family=new Set(),todo=roots.map(c=>c.id);while(todo.length){const id=todo.pop();if(family.has(id))continue;family.add(id);todo.push(...children.get(id)||[]);}
    const a=this.active={pointer:e.pointerId,set,id,roots,family,start:this.point(e),first:[e.clientX,e.clientY],last:e,delta:[0,0],nodes:[],edges:[],furniture:[],moved:false,saving:false};
    this.map.drag={id,revision:set.revision,topic:true};
    const move=event=>{if(event.pointerId!==a.pointer)return;a.last=event;if(!a.moved&&Math.hypot(event.clientX-a.first[0],event.clientY-a.first[1])>4)this.begin();if(a.moved)this.paint(event);};
    const up=event=>{if(event.pointerId!==a.pointer)return;move(event);run(()=>this.finish(event))();};
    const cancel=event=>{if(event.pointerId===a.pointer&&!a.saving)this.cancel();};
    a.cleanListeners=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);if(this.view.hasPointerCapture(a.pointer))this.view.releasePointerCapture(a.pointer);};
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);
  }
  begin(){
    const a=this.active;a.moved=true;this.view.setPointerCapture(a.pointer);this.map.closeMenu();this.study.mindmapStudio.peek.hide();
    this.mounted();
    for(const edge of $('study-map-world').querySelectorAll(':scope>.study-map-links .mm-branch,:scope>.study-map-links .mm-branch-batch,:scope>.study-map-links .mm-overview-glyphs')){a.edges.push(edge);edge.style.visibility='hidden';}
    for(const shape of this.map.board.querySelectorAll('[data-mm-furniture]'))if(a.family.has(shape.dataset.mmFurniture))a.furniture.push({shape,transform:shape.getAttribute('transform')||''});
    a.overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');a.overlay.classList.add('mm-drag-overlay');a.overlay.setAttribute('width',this.map.layout.width);a.overlay.setAttribute('height',this.map.layout.height);$('study-map-world').append(a.overlay);
    const layout=this.map.layout,moving=layout.links.filter(l=>a.family.has(l.from)&&a.family.has(l.to)),stationary=layout.links.filter(l=>!a.family.has(l.to));
    const paths=links=>diagramPaths({...layout,links,decorations:[],furniture:[]},[],{interactive:false});
    const glyphs=moving=>this.map.window.overview?overviewGlyphs(layout,new Set([...layout.positions.keys()].filter(id=>a.family.has(id)===moving)),this.map.selected).svg:'';
    a.overlay.innerHTML='<g class="mm-drag-stationary">'+paths(stationary)+glyphs(false)+'</g><g class="mm-drag-internal" data-edge-count="'+moving.length+'">'+paths(moving)+glyphs(true)+'</g><g class="mm-drag-intent"></g>';
    a.overlay.querySelectorAll('[fill],[stroke]').forEach(n=>{for(const k of ['fill','stroke','stroke-width','opacity'])if(n.hasAttribute(k))n.style.setProperty(k,n.getAttribute(k));});
    a.relations=(a.set.links||[]).filter(l=>(!l.toSetId||l.toSetId===a.set.id)&&(a.family.has(l.from)||a.family.has(l.to))).map(l=>({...l,mindmap:{...l.mindmap,avoidTopics:false}}));
    const relationIds=new Set(a.relations.map(l=>l.id));for(const element of $('study-map-world').querySelectorAll(':scope>.study-map-links [data-association-id],:scope>.study-map-links [data-mm-link],:scope>.study-map-links [data-link-id]'))if(relationIds.has(element.dataset.associationId||element.dataset.mmLink||element.dataset.linkId)){a.edges.push(element);element.style.visibility='hidden';}
    a.relationGroup=document.createElementNS('http://www.w3.org/2000/svg','g');a.relationGroup.classList.add('mm-drag-relationships');a.overlay.append(a.relationGroup);
    a.internal=a.overlay.querySelector('.mm-drag-internal');a.indicator=a.overlay.querySelector('.mm-drag-intent');
    a.badge=document.createElement('div');a.badge.className='mm-drop-status';a.badge.setAttribute('role','status');this.map.board.append(a.badge);
    this.map.board.dataset.topicDragging='true';
    const tick=()=>{if(this.active!==a||a.saving)return;const r=this.view.getBoundingClientRect(),e=a.last,speed=(p,min,max)=>p<min+30?-Math.min(14,(min+30-p)/3):p>max-30?Math.min(14,(p-max+30)/3):0;
      if(e.clientX>=r.left-20&&e.clientX<=r.right+20&&e.clientY>=r.top-20&&e.clientY<=r.bottom+20){const dx=speed(e.clientX,r.left,r.right),dy=speed(e.clientY,r.top,r.bottom);if(dx||dy){this.map.camera.panBy(dx,dy);this.map.camera.paint();this.paint(e);}}
      a.frame=requestAnimationFrame(tick);
    };a.frame=requestAnimationFrame(tick);
  }
  mounted(){
    const a=this.active;if(!a?.moved)return;a.bound??=new WeakSet();
    for(const [id,node]of this.map.window.nodes)if(a.family.has(id)){if(!a.bound.has(node)){a.bound.add(node);a.nodes.push({id,node,transform:node.style.transform});node.classList.add('mm-dragging');node.dataset.mmDragging='true';}node.style.transform=`translate(${a.delta[0]}px,${a.delta[1]}px)`;}
    a.nodes=a.nodes.filter(n=>n.node.isConnected);
  }
  paint(e){
    const a=this.active;if(!a?.moved||a.saving)return;const point=this.point(e);let delta=[point[0]-a.start[0],point[1]-a.start[1]],guides=[];
    const intent=()=>this.accepts(e)?topicDrop({cards:a.set.cards,layout:this.map.layout,rootIds:a.roots.map(c=>c.id),family:a.family,point,delta,alt:e.altKey,tolerance:8/this.map.zoom}):{kind:'outside'};a.intent=intent();
    if(['position','floating'].includes(a.intent.kind)&&a.set.map.mindmap.smartGuides!==false&&!e.shiftKey){const near=new Map([...this.map.window.nodes.keys()].map(id=>[id,this.map.layout.positions.get(id)]));near.set(a.roots[0].id,this.map.layout.positions.get(a.roots[0].id));const snap=snapDelta(near,a.family,a.roots[0].id,delta,7/this.map.zoom);delta=snap.delta;guides=snap.guides;a.intent=intent();}
    a.delta=delta;for(const {node}of a.nodes)node.style.transform=`translate(${delta[0]}px,${delta[1]}px)`;
    for(const {shape,transform}of a.furniture)shape.setAttribute('transform',transform+` translate(${delta[0]} ${delta[1]})`);
    a.internal.setAttribute('transform',`translate(${delta[0]} ${delta[1]})`);
    this.map.board.querySelectorAll('[data-mm-drop]').forEach(n=>n.removeAttribute('data-mm-drop'));
    const target=this.map.window.nodes.get(a.intent.targetId);if(target)target.dataset.mmDrop=a.intent.kind;
    let markup=guides.map(g=>`<path class="mm-smart-guide" d="${g.axis?'M'+g.from+','+g.at+' H'+g.to:'M'+g.at+','+g.from+' V'+g.to}" stroke="#3984E5" stroke-width="${1/this.map.zoom}" stroke-dasharray="${4/this.map.zoom} ${4/this.map.zoom}"/>`).join('');
    const targetBox=this.map.layout.positions.get(a.intent.targetId),original=this.map.layout.positions.get(a.roots[0].id),first={...original,x:original.x+delta[0],y:original.y+delta[1]};
    if(targetBox&&['child','invalid'].includes(a.intent.kind))markup+=`<rect class="mm-drop-target-ring" data-kind="${a.intent.kind}" x="${targetBox.x-5/this.map.zoom}" y="${targetBox.y-5/this.map.zoom}" width="${targetBox.width+10/this.map.zoom}" height="${targetBox.height+10/this.map.zoom}" rx="${7/this.map.zoom}" stroke-width="${1.5/this.map.zoom}"/>`;
    if(targetBox&&a.intent.kind==='child'){
      const x=targetBox.x+targetBox.width/2,y=targetBox.y+targetBox.height/2,tx=first.x+first.width/2,ty=first.y+first.height/2;
      markup+=`<path class="mm-drop-connection" d="M${x},${y} C${(x+tx)/2},${y} ${(x+tx)/2},${ty} ${tx},${ty}"/>`;
    }else if(targetBox&&['before','after'].includes(a.intent.kind)){
      const after=a.intent.kind==='after',d=a.intent.axis==='x'?`M${targetBox.x+(after?targetBox.width+8:-8)},${targetBox.y-5} v${targetBox.height+10}`:`M${targetBox.x-5},${targetBox.y+(after?targetBox.height+8:-8)} h${targetBox.width+10}`;
      markup+=`<path class="mm-drop-insertion" d="${d}"/>`;
    }
    if(a.relations.length){const positions={get:id=>{const p=this.map.layout.positions.get(id);return p&&a.family.has(id)?{...p,x:p.x+delta[0],y:p.y+delta[1]}:p;}};a.relationGroup.innerHTML=diagramPaths({...this.map.layout,setId:a.set.id,positions,links:[],decorations:[],furniture:[]},a.relations);for(const n of a.relationGroup.querySelectorAll('[fill],[stroke]'))for(const key of ['fill','stroke','stroke-width'])if(n.hasAttribute(key))n.style.setProperty(key,n.getAttribute(key));}
    a.indicator.innerHTML=markup;this.map.window.schedule();
    const title=a.set.cards.find(c=>c.id===a.intent.targetId)?.title?.slice(0,24)||'';
    a.badge.dataset.kind=a.intent.kind;a.badge.textContent=a.intent.kind==='outside'?'松开取消 · 拖回脑图可继续':a.intent.kind==='child'?`松开成为「${title}」的子主题`:a.intent.kind==='invalid'?a.intent.message:['before','after'].includes(a.intent.kind)?`插到「${title}」${a.intent.kind==='before'?'之前':'之后'}`:`移动 ${a.family.size} 个主题`;
    const boardBox=this.map.board.getBoundingClientRect();a.badge.style.left=Math.max(8,Math.min(e.clientX-boardBox.left+16,boardBox.width-a.badge.offsetWidth-8))+'px';a.badge.style.top=Math.max(8,Math.min(e.clientY-boardBox.top+22,boardBox.height-a.badge.offsetHeight-32))+'px';
    $('study-map-hint').textContent=({child:`松开：放入「${title}」`,before:`松开：插到「${title}」之前`,after:`松开：插到「${title}」之后`,reorder:`松开：同级排序${a.intent.side?' · '+(a.intent.side==='left'?'左侧':'右侧'):''} · Option / Alt 拖动可脱离`,position:'松开：调整主分支位置 · Shift 暂停吸附',floating:'松开：放置自由主题 · Shift 暂停吸附',outside:'已离开脑图 · 松开取消，不更改主题',invalid:a.intent.message,none:'返回原位'})[a.intent.kind];
  }
  cleanup(restore=true){
    const a=this.active;if(!a)return;cancelAnimationFrame(a.frame);a.cleanListeners();a.overlay?.remove();a.badge?.remove();
    for(const {node,transform}of a.nodes){node.classList.remove('mm-dragging');node.removeAttribute('data-mm-dragging');if(restore)node.style.transform=transform;}
    for(const {shape,transform}of a.furniture)shape.setAttribute('transform',transform);
    for(const edge of a.edges)edge.style.visibility='';this.map.board.querySelectorAll('[data-mm-drop]').forEach(n=>n.removeAttribute('data-mm-drop'));
    delete this.map.board.dataset.topicDragging;this.map.drag=null;this.map.pressing=null;this.active=null;
    if(a.moved)this.study.mapTools.suppress=performance.now()+350;
    $('study-map-hint').textContent='拖动主题调整层级或顺序 · Option / Alt 拖到空白处成为自由主题';
    return a;
  }
  cancel(){const a=this.cleanup();if(!a)return;this.map.deferred=null;this.study.render(this.study.current);this.map.window.schedule();}
  async finish(e){
    const a=this.active;if(!a||a.saving)return;
    if(!a.moved){this.cleanup();this.map.window.schedule();return;}
    if(!a.intent||['none','invalid','outside'].includes(a.intent.kind)||!this.accepts(e)){if(a.intent?.message)toast(a.intent.message,true);this.cancel();return;}
    if(this.study.current?.id!==a.set.id){this.cancel();return;}
    const {parentId,index,positions,side}=a.intent;a.saving=true;cancelAnimationFrame(a.frame);a.cleanListeners();
    try{
      const set=a.intent.kind==='position'?await api('study.mindmap.arrange',{setId:a.set.id,expectedRevision:a.set.revision,cardIds:a.roots.map(c=>c.id),action:'place',positions}):await api('study.cards.move',{setId:a.set.id,expectedRevision:a.set.revision,cardIds:a.roots.map(c=>c.id),parentId,...(a.intent.kind==='child'?{expandParent:true}:{}),...(index!==undefined?{index}:{}),...(positions?{positions}:{}),...(side?{side}:{})});
      this.cleanup(false);this.map.deferred=null;
      if(this.study.current?.id===set.id){this.study.render(set);this.map.select(a.id);await this.study.refreshList();}
    }catch(error){this.cleanup();this.map.deferred=null;await this.study.refresh();throw error;}
    finally{this.map.window.schedule();}
  }
}
