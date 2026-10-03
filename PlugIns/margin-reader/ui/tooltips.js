// One delegated tooltip serves dynamic controls without observing every map node.
export function installTooltips(){
 const tip=document.createElement('div');tip.id='control-tooltip';tip.className='control-tooltip';tip.role='tooltip';tip.setAttribute('popover','manual');document.body.append(tip);
 let target,timer,description,title;
 const hide=()=>{
  clearTimeout(timer);if(tip.matches(':popover-open'))tip.hidePopover();
  if(target){if(description===null)target.removeAttribute('aria-describedby');else target.setAttribute('aria-describedby',description);if(title!==null)target.setAttribute('title',title);}
  target=null;
 };
 const show=()=>{
  if(!target?.isConnected||!target.getClientRects().length){hide();return;}
  tip.textContent=target.dataset.tooltip||title||target.getAttribute('aria-label')||target.textContent.trim();
  if(!tip.textContent){hide();return;}
  target.setAttribute('aria-describedby',[description,tip.id].filter(Boolean).join(' '));tip.showPopover();
  const box=target.getBoundingClientRect(),r=tip.getBoundingClientRect();
  tip.style.left=Math.max(8,Math.min(innerWidth-r.width-8,box.x+(box.width-r.width)/2))+'px';
  tip.style.top=(box.bottom+r.height+12<innerHeight?box.bottom+7:Math.max(8,box.top-r.height-7))+'px';
 };
 const enter=event=>{
  const control=event.target.closest?.('button,summary,select,[role=button]');if(!control||control===target)return;
  hide();if(!control.dataset.tooltip&&!control.title&&!control.getAttribute('aria-label')&&!control.textContent.trim())return;
  target=control;description=target.getAttribute('aria-describedby');title=target.getAttribute('title');target.removeAttribute('title');timer=setTimeout(show,280);
 };
 document.addEventListener('pointerover',enter);
 document.addEventListener('pointerout',event=>{if(target?.contains(event.target)&&!target.contains(event.relatedTarget))hide();});
 document.addEventListener('focusin',enter);document.addEventListener('focusout',hide);
 for(const type of ['pointerdown','wheel','scroll'])document.addEventListener(type,hide,{capture:true,passive:true});
 document.addEventListener('keydown',hide,true);window.addEventListener('blur',hide);window.addEventListener('resize',hide);
}
