let active
export function popover(anchor,html,{width=190}={}){
 active?.()
 const element=document.createElement('div');element.className='compact-popover';element.innerHTML=html;element.style.width=width+'px';element.setAttribute('role','menu');document.body.append(element)
 const rect=anchor.getBoundingClientRect();element.style.left=Math.max(8,Math.min(rect.right+6,innerWidth-width-10))+'px';element.style.top=Math.max(8,Math.min(rect.top,innerHeight-element.offsetHeight-10))+'px'
 const outside=event=>{if(!element.contains(event.target)&&!anchor.contains(event.target))close()},key=event=>{if(event.key==='Escape')close()}
 function close(){document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key,true);element.remove();if(active===close)active=null}
 document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key,true);active=close
 return {element,close}
}
