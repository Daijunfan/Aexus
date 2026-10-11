// Presentation feedback is transient; only its opt-in setting belongs to Core.
export class PresentationPointers {
 constructor(){
  this.enabled=false;this.pointers=new Map();
  document.addEventListener('pointerdown',event=>this.show(event),true);
  document.addEventListener('pointermove',event=>{if(this.pointers.has(event.pointerId))this.position(this.pointers.get(event.pointerId),event);},true);
  for(const name of ['pointerup','pointercancel'])document.addEventListener(name,event=>this.remove(event.pointerId),true);
  window.addEventListener('blur',()=>this.clear());window.addEventListener('pagehide',()=>this.clear());
 }
 setEnabled(enabled){this.enabled=Boolean(enabled);if(!this.enabled)this.clear();document.body.dataset.presentationPointers=String(this.enabled);}
 position(el,event){el.style.left=event.clientX+'px';el.style.top=event.clientY+'px';}
 show(event){
  if(!this.enabled)return;this.remove(event.pointerId);const el=document.createElement('span');el.className='presentation-input-pointer';el.dataset.pointerType=event.pointerType;el.setAttribute('aria-hidden','true');
  if(event.pointerType==='pen')el.innerHTML='<svg viewBox="0 0 36 52"><path d="M3 48 11 44 33 10 26 5 4 39Z" fill="white" stroke="#c74242" stroke-width="2"/><path d="m4 39 7 5M26 5l7 5" fill="none" stroke="#c74242" stroke-width="2"/></svg>';
  (document.querySelector('dialog[open]')||document.body).append(el);this.pointers.set(event.pointerId,el);this.position(el,event);
 }
 remove(id){const el=this.pointers.get(id);if(el){el.remove();this.pointers.delete(id);}}
 clear(){for(const id of this.pointers.keys())this.remove(id);}
}
