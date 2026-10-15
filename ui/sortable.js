// Shared native HTML drag ordering with FLIP animation for lists and grids.
export function sortable(root,{selector,handle,type,onChange,onStart,onEnd,effectAllowed='move'}){
  let source,lastTarget
  const start=event=>{if(!event.target.closest(handle||selector))return;source=event.target.closest(selector);if(!source)return;event.dataTransfer.setData(type,source.dataset.id);event.dataTransfer.effectAllowed=effectAllowed;source.classList.add('sorting');onStart?.()}
  const over=event=>{
    if(!source||!event.dataTransfer.types.includes(type))return
    event.preventDefault();event.dataTransfer.dropEffect='move'
    const target=event.target.closest(selector);if(!target||target===source)return
    if(lastTarget===target)return
    lastTarget=target
    const rows=[...root.querySelectorAll(selector)],after=rows.indexOf(source)<rows.indexOf(target)
    if((after&&target.nextElementSibling===source)||(!after&&source.nextElementSibling===target))return
    const before=new Map(rows.map(row=>[row,row.getBoundingClientRect()]))
    root.insertBefore(source,after?target.nextElementSibling:target)
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const row of rows){const a=before.get(row),b=row.getBoundingClientRect();if(a.left!==b.left||a.top!==b.top)row.animate([{transform:`translate(${a.left-b.left}px,${a.top-b.top}px)`},{transform:'translate(0,0)'}],{duration:190,easing:'cubic-bezier(.2,.8,.2,1)'})}
  }
  const end=()=>{if(!source)return;source.classList.remove('sorting');source=null;lastTarget=null;onChange([...root.querySelectorAll(selector)].map(row=>row.dataset.id));onEnd?.()}
  const drop=event=>{if(source)event.preventDefault()}
  root.addEventListener('dragstart',start);root.addEventListener('dragover',over);root.addEventListener('drop',drop);root.addEventListener('dragend',end)
  return()=>{root.removeEventListener('dragstart',start);root.removeEventListener('dragover',over);root.removeEventListener('drop',drop);root.removeEventListener('dragend',end)}
}
