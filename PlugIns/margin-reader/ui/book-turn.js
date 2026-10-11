// A disposable paper layer animates above the real document. Original page,
// text-selection, annotation and pen coordinate systems are never transformed.
export class BookTurn {
  constructor(scroller){
    this.scroller=scroller;this.sequence=0;this.current=null;
    this.motion=matchMedia('(prefers-reduced-motion: reduce)');
    this.motion.addEventListener('change',()=>this.cancel());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancel();});
    window.addEventListener('resize',()=>this.cancel());
  }
  cancel(){this.sequence++;this.current?.finish();this.current=null;}
  capture(page,direction,enabled){
    this.cancel();
    if(!enabled||this.motion.matches||document.body.dataset.uiMotion==='reduced'||document.hidden||!page?.isConnected||page.dataset.renderState!=='ready')return null;
    const viewport=this.scroller.parentElement,box=page.getBoundingClientRect(),bounds=viewport.getBoundingClientRect();
    if(!box.width||!box.height)return null;
    const overlay=document.createElement('div');overlay.className='book-turn-overlay';overlay.setAttribute('aria-hidden','true');overlay.dataset.direction=direction>0?'forward':'backward';overlay.dataset.phase='preparing';
    const shadow=overlay.attachShadow({mode:'closed'}),style=document.createElement('style');
    style.textContent=`:host{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:12;perspective:1800px} .stage{position:absolute;inset:0;perspective:1800px;pointer-events:none} .leaf{position:absolute;transform-style:preserve-3d;will-change:transform;transform-origin:${direction>0?'left':'right'} center} .face{position:absolute;inset:0;backface-visibility:hidden;overflow:hidden;background:white;border:1px solid #0000000e;box-shadow:0 6px 24px #0002} .back{transform:rotateY(180deg);background:linear-gradient(${direction>0?'90deg':'270deg'},#d4cec2,#fffef8 16%,#f7f3e8 86%,#bbb4a5)} .shade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(${direction>0?'270deg':'90deg'},#0008,transparent 18%,#0001 78%,#0004);opacity:0;backface-visibility:hidden} .rim{position:absolute;top:0;bottom:0;${direction>0?'right':'left'}:0;width:22px;border-radius:${direction>0?'0 45% 45% 0':'45% 0 0 45%'};background:linear-gradient(${direction>0?'90deg':'270deg'},transparent,#ffffff80,#00000030);opacity:.35} .cast{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none} .page-host{position:absolute;inset:0;pointer-events:none}`;
    const stage=document.createElement('div');stage.className='stage';
    const leaf=document.createElement('div');leaf.className='leaf';Object.assign(leaf.style,{left:(box.left-bounds.left)+'px',top:(box.top-bounds.top)+'px',width:box.width+'px',height:box.height+'px'});
    const front=document.createElement('div');front.className='face';
    const host=document.createElement('div');host.className='page-host';
    const pageShadow=host.attachShadow({mode:'closed'}),pageStyle=document.createElement('style');
    this.pageCss??=[...document.styleSheets].map(sheet=>{try{return [...sheet.cssRules].map(r=>r.cssText).join('\n');}catch{return '';}}).join('\n');
    pageStyle.textContent=this.pageCss+'\n.pdf-page{left:0!important;top:0!important;margin:0!important}.reading-surface.pdf{width:100%;height:100%;padding:0;margin:0}';
    const clone=page.cloneNode(true),canvases=[...page.querySelectorAll('canvas')],copies=[...clone.querySelectorAll('canvas')];
    clone.removeAttribute('id');clone.removeAttribute('aria-label');clone.style.left=clone.style.top='0px';clone.style.filter=getComputedStyle(page).filter;
    for(const el of clone.querySelectorAll('[id],[tabindex]')){el.removeAttribute('id');el.removeAttribute('tabindex');}
    // cloneNode does not copy canvas pixels. Copy only this page's bounded
    // raster pool, including its source slices, and release it on every exit.
    for(let i=0;i<copies.length;i++){copies[i].width=canvases[i].width;copies[i].height=canvases[i].height;copies[i].getContext('2d').drawImage(canvases[i],0,0);copies[i].style.filter=getComputedStyle(canvases[i]).filter;}
    const wrapper=document.createElement('div');wrapper.className='reading-surface pdf';const originalSurface=page.closest('.reading-surface');if(originalSurface)wrapper.style.filter=getComputedStyle(originalSurface).filter;wrapper.append(clone);pageShadow.append(pageStyle,wrapper);front.append(host);
    const back=document.createElement('div');back.className='face back';
    const shade=document.createElement('div');shade.className='shade';const rim=document.createElement('div');rim.className='rim';front.append(shade,rim);
    const cast=document.createElement('div');cast.className='cast';stage.append(cast);leaf.append(front,back);stage.append(leaf);shadow.append(style,stage);viewport.append(overlay);
    const animations=[];let closed=false,timer,resolve;const settled=new Promise(r=>{resolve=r;});
    const finish=()=>{if(closed)return;closed=true;clearTimeout(timer);for(const a of animations){a.finished.catch(()=>{});a.cancel();}overlay.remove();for(const c of copies)c.width=c.height=0;if(this.current===handle)this.current=null;resolve();};
    const handle={finish,async play(){
      if(closed)return;overlay.dataset.phase='turning';
      const sign=direction>0?-1:1,duration=360;
      try{
        animations.push(leaf.animate([{transform:'rotateY(0deg) skewY(0deg)',offset:0},{transform:`rotateY(${sign*55}deg) skewY(${sign*1.8}deg)`,offset:.42},{transform:`rotateY(${sign*156}deg) skewY(0deg)`,offset:1}],{duration,easing:'cubic-bezier(.24,.52,.32,1)',fill:'forwards'}));
        animations.push(shade.animate([{opacity:0},{opacity:.65,offset:.48},{opacity:.12}],{duration,fill:'forwards'}));
        animations.push(cast.animate([{opacity:0},{opacity:.13,offset:.45},{opacity:0}],{duration,fill:'forwards'}));
        // Animation.finished rejects on cancellation. A bounded timer also
        // settles hidden-window timelines so input can never wait indefinitely.
        timer=setTimeout(finish,duration+180);Promise.allSettled(animations.map(a=>a.finished)).then(finish);
      }catch{finish();}
      return settled;
    }};
    this.current=handle;return handle;
  }
}
