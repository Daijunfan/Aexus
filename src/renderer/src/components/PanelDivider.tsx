import {useRef,useState} from 'react'
/** Pointer drafts are local; only an explicit drop/key press commits through Core. */
export function PanelDivider({axis,value,min,max,label,onDraft,onCommit}:{axis:'x'|'y';value:number;min:number;max:number;label:string;onDraft:(value:number|undefined)=>void;onCommit:(value:number)=>Promise<unknown>}){
 const drag=useRef<{start:number;size:number;value:number}|null>(null),[error,setError]=useState('')
 const bound=(v:number)=>Math.round(Math.max(min,Math.min(max,v)))
 const save=async(v:number)=>{try{setError('');await onCommit(v)}catch(e){setError((e as Error).message);onDraft(undefined)}}
 return <><div className={`panel-divider divider-${axis}`} role="separator" aria-label={label} aria-orientation={axis==='x'?'vertical':'horizontal'} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)} tabIndex={0}
  onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);const parent=e.currentTarget.parentElement!,size=axis==='x'?parent.querySelector('.file-list')!.getBoundingClientRect().width:parent.getBoundingClientRect().height;drag.current={start:axis==='x'?e.clientX:e.clientY,size,value:size}}}
  onPointerMove={e=>{const d=drag.current;if(!d)return;d.value=bound(d.size+((axis==='x'?e.clientX:e.clientY)-d.start)*(axis==='x'?1:-1));onDraft(d.value)}}
  onPointerUp={e=>{const d=drag.current;if(!d)return;drag.current=null;e.currentTarget.releasePointerCapture(e.pointerId);void save(d.value)}}
  onPointerCancel={()=>{drag.current=null;onDraft(undefined)}}
  onKeyDown={e=>{if(e.key==='Escape'&&drag.current){e.preventDefault();e.stopPropagation();drag.current=null;onDraft(undefined);return}const decrease=axis==='x'?'ArrowLeft':'ArrowDown',increase=axis==='x'?'ArrowRight':'ArrowUp';if([decrease,increase,'Home','End'].includes(e.key)){e.preventDefault();void save(e.key==='Home'?min:e.key==='End'?max:bound(value+(e.key===increase?10:-10)))}}}/>{error&&<span className="resize-error" role="alert">{error}</span>}</>
}
