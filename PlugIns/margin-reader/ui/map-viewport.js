import {paintEquations} from './equation-renderer.js';
import {overviewGlyphs,hitTopic} from './mindmap-overview.mjs';
import {diagramPaths} from './mindmap-view.mjs';
import { ViewportIndex, cardPaintBounds, intersects } from './viewport-index.mjs';
const svgNS='http://www.w3.org/2000/svg';
// Keep the whole graph in the layout model, but mount only near-screen cards.
// Selection, exports, ordering and hit geometry always use the complete model.
export class MapViewport {
  constructor(map) {
    this.map=map;this.nodes=new Map();this.version=0;
    this.view=document.getElementById('study-map-viewport');this.world=document.getElementById('study-map-world');
    map.board.addEventListener('pointerdown',event=>{this.overviewPointer=null;if(!this.view.contains(event.target))return;if(!this.overview||event.button!==0)return;const r=this.world.getBoundingClientRect();this.overviewPointer={id:hitTopic(this.layout,(event.clientX-r.left)/map.zoom,(event.clientY-r.top)/map.zoom,6/map.zoom),x:event.clientX,y:event.clientY,version:this.version};},true);
    this.view.addEventListener('click',event=>{if(performance.now()<(map.camera?.suppress||0)||performance.now()<(map.study.mapTools?.suppress||0))return;if(!this.overview||event.target.closest('button,#mindmap-overview')||map.study.cardInk?.mode!=='off')return;const r=this.world.getBoundingClientRect(),pressed=this.overviewPointer;this.overviewPointer=null;const id=pressed?.version===this.version&&Math.hypot(event.clientX-pressed.x,event.clientY-pressed.y)<3?pressed.id:hitTopic(this.layout,(event.clientX-r.left)/map.zoom,(event.clientY-r.top)/map.zoom,6/map.zoom);if(!id)return;event.preventDefault();event.stopImmediatePropagation();map.scale(Math.max(.8,map.zoom));map.select(id);map.center(id);const card=this.cards.get(id);if(card.source||card.anchor||card.reference)map.study.activateCard(card).catch(e=>import('./dom.js').then(({toast})=>toast(e.message,true)));},true);
    this.view.addEventListener('scroll',()=>this.schedule(),{passive:true});
    this.resize=new ResizeObserver(()=>{if(this.map.layout)this.map.camera?.resize();else this.schedule();});this.resize.observe(this.view);
    document.addEventListener('pointerup',()=>this.schedule());
    document.addEventListener('pointercancel',()=>this.schedule());
  }
  topicAt(event){
    if(!this.layout||!this.view.contains(event.target))return null;
    const direct=event.target.closest('.mindmap-topic');if(direct&&this.nodes.get(direct.dataset.cardId)===direct)return direct.dataset.cardId;
    const p=this.map.camera.point(event);return hitTopic(this.layout,p.x,p.y,this.overview?6/this.map.zoom:0);
  }
  schedule(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=null;this.paint();});}
  setModel(cards,layout,markup,bind,branchPath,curvePath) {
    this.cards=cards;this.layout=layout;this.markup=markup;this.bind=bind;this.version++;
    this.index=new ViewportIndex([...layout.positions].map(([id,p])=>[id,cardPaintBounds(cards.get(id),p)]));
    this.branches=layout.links.map(l=>{
      const a=layout.positions.get(l.from),b=layout.positions.get(l.to);
      return {d:branchPath(a,b,l.style),box:{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.max(a.x+a.width,b.x+b.width)-Math.min(a.x,b.x),height:Math.max(a.y+a.height,b.y+b.height)-Math.min(a.y,b.y)}};
    });
    this.associations=(this.map.set.links||[]).filter(l=>(!l.toSetId||l.toSetId===this.map.set.id)&&layout.positions.has(l.from)&&layout.positions.has(l.to)).map(link=>{
      const d=curvePath(link,layout.positions),pairs=d.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number)||[];
      const xs=[],ys=[];for(let i=0;i<pairs.length;i+=2){xs.push(pairs[i]);ys.push(pairs[i+1]);}
      return {link,d,box:{x:Math.min(...xs)-3,y:Math.min(...ys)-3,width:Math.max(...xs)-Math.min(...xs)+6,height:Math.max(...ys)-Math.min(...ys)+6}};
    });
    this.paint(true);
  }
  paint(force=false) {
    const map=this.map;
    const drag=map.topicDrag?.active,tracking=Boolean(drag?.moved&&!drag.saving);
    if(!this.index||map.drag&&!tracking||map.pressing!=null&&!tracking||map.study.cardInk?.gesture)return;
    const show=true;
    const box=map.camera.box(240);let wanted=!show?new Set():this.index.entries.size<=400?new Set(this.index.entries.keys()):this.index.query(box);
    if(tracking){const moved=this.index.query({...box,x:box.x-drag.delta[0],y:box.y-drag.delta[1]});for(const id of wanted)if(drag.family.has(id)&&!moved.has(id))wanted.delete(id);for(const id of moved)if(drag.family.has(id))wanted.add(id);}
    const glyphIds=new Set(wanted);this.overview=Boolean(this.layout.mindmap&&wanted.size>600);if(this.overview)wanted=new Set(map.selected&&this.cards.has(map.selected)?[map.selected]:[]);this.view.dataset.mapDetail=this.overview?'overview':'full';
    const focused=document.activeElement?.closest('.study-card'),focusId=focused?.dataset.cardId;
    if(show&&focusId&&this.cards.has(focusId))wanted.add(focusId);
    let changed=false;const fragment=document.createDocumentFragment();
    for(const [id,node] of this.nodes)if(!wanted.has(id)){node.remove();this.nodes.delete(id);changed=true;}
    for(const id of wanted) {
      const old=this.nodes.get(id);if(old?.dataset.windowVersion===String(this.version)&&!force)continue;
      const template=document.createElement('template');template.innerHTML=this.markup(this.cards.get(id));const el=template.content.firstElementChild;
      el.dataset.windowVersion=String(this.version);el.classList.toggle('selected',map.selected===id);
      el.classList.toggle('multi-selected',map.study.advanced?.selected.has(id)||false);this.bind(el,this.cards.get(id));
      if(old)old.replaceWith(el);else fragment.append(el);this.nodes.set(id,el);changed=true;
    }
    this.world.append(fragment);if(changed)paintEquations(this.world);map.filterView?.paint();
    if(focusId&&changed)this.nodes.get(focusId)?.focus({preventScroll:true});
    if(tracking){map.topicDrag.mounted();this.view.dataset.totalCards=String(this.index.entries.size);this.view.dataset.mountedCards=String(this.nodes.size);map.study.mindmapStudio?.overview();return;}
    let svg=this.world.querySelector(':scope > .study-map-links');
    if(!svg){svg=document.createElementNS(svgNS,'svg');svg.classList.add('study-map-links');svg.setAttribute('role','group');svg.setAttribute('aria-label','脑图关联');this.world.prepend(svg);}
    svg.setAttribute('width',map.layout.width);svg.setAttribute('height',map.layout.height);
    if(this.layout.mindmap){
      this.layout.setId=map.set.id;const signature=this.version+'|'+this.overview+'|'+(map.filterView?.active?map.workbench.queryKey:'')+'|'+map.selected+'|'+[box.x,box.y,box.width,box.height].map(v=>Math.round(v/100)).join(',');
      if(this.linkSignature!==signature){this.linkSignature=signature;const glyphs=this.overview?overviewGlyphs(this.layout,glyphIds,map.selected,map.filterView?.active?map.filterView.hits:null):{svg:'',count:0};svg.innerHTML=show?diagramPaths(this.layout,map.set.links,{interactive:!this.overview,filter:item=>this.index.entries.size<=400||intersects(item,box)})+glyphs.svg:'';this.view.dataset.overviewTopics=String(glyphs.count);if(this.overview)document.getElementById('study-map-hint').textContent=`完整总览 · ${glyphs.count+wanted.size} 个主题 · 点击主题放大并定位`;svg.querySelectorAll('path,rect,circle,ellipse,text,g').forEach(el=>{for(const key of ['fill','stroke','stroke-width','stroke-dasharray','opacity'])if(el.hasAttribute(key))el.style.setProperty(key,el.getAttribute(key));});svg.querySelectorAll('[data-link-id]').forEach(el=>el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();map.study.mapTools.editLink(el.dataset.linkId);}});}
      this.view.dataset.totalCards=String(this.index.entries.size);this.view.dataset.mountedCards=String(this.nodes.size);if(changed){map.study.cardInk?.render();map.study.learning?.render(map.set);}map.study.mindmapStudio?.overview();return;
    }
    const all=this.index.entries.size<=400,paths=show?this.branches.filter(l=>all||intersects(l.box,box)).map(l=>l.d).join(' '):'';
    const links=show?this.associations.filter(l=>all||intersects(l.box,box)):[];
    const signature=paths+'|'+links.map(l=>l.link.id).join(',')+'|'+this.version;
    if(signature!==this.linkSignature){
      this.linkSignature=signature;
      svg.innerHTML='<defs><marker id="study-link-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><polygon points="0,0 10,5 0,10"/></marker></defs>';
      if(paths){const path=document.createElementNS(svgNS,'path');path.setAttribute('d',paths);svg.append(path);}
      for(const {link,d} of links){
        const path=document.createElementNS(svgNS,'path');path.classList.add('study-association');path.dataset.associationId=link.id;path.setAttribute('marker-end','url(#study-link-arrow)');if(link.bidirectional)path.setAttribute('marker-start','url(#study-link-arrow)');path.setAttribute('d',d);
        const title=document.createElementNS(svgNS,'title');title.textContent=link.label||'卡片关联';path.append(title);svg.append(path);
        const hit=document.createElementNS(svgNS,'path');hit.classList.add('study-link-hit');hit.dataset.linkId=link.id;hit.setAttribute('d',d);hit.setAttribute('tabindex','0');hit.setAttribute('role','button');hit.setAttribute('aria-label','编辑连线：'+(link.label||'卡片关联'));
        hit.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();map.study.mapTools.editLink(link.id);}};svg.append(hit);
      }
    }
    this.view.dataset.totalCards=String(this.index.entries.size);this.view.dataset.mountedCards=String(this.nodes.size);
    if(changed){map.study.cardInk?.render();map.study.learning?.render(map.set);}
  }
}
