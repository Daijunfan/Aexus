import {retainEqual} from '../snapshot'
import {useEffect,useLayoutEffect,useRef,useState,type KeyboardEvent,type SelectHTMLAttributes} from 'react'
import {createPortal} from 'react-dom'

type Choice={value:string;label:string;disabled:boolean}
/** A styled picker backed by a real select for forms, React handlers and CLI-owned settings. */
export function AppSelect({children,className='',onChange,...props}:SelectHTMLAttributes<HTMLSelectElement>){
  const native=useRef<HTMLSelectElement>(null),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null)
  const [choices,setChoices]=useState<Choice[]>([]),[open,setOpen]=useState(false),[active,setActive]=useState(0)
  const [position,setPosition]=useState({left:0,top:0,width:180})
  useLayoutEffect(()=>{setChoices(previous=>retainEqual(previous,Array.from(native.current?.options??[]).map(option=>({value:option.value,label:option.textContent?.trim()||option.value,disabled:option.disabled}))))},[children,props.value])
  const value=String(props.value??native.current?.value??''),selected=choices.find(choice=>choice.value===value)
  const place=()=>{const box=trigger.current?.getBoundingClientRect();if(!box)return;const height=Math.min(280,choices.length*34+12),above=window.innerHeight-box.bottom<height+8&&box.top>height+8;setPosition({left:Math.max(8,Math.min(box.left,window.innerWidth-Math.max(box.width,180)-8)),top:above?box.top-height-5:box.bottom+5,width:Math.max(box.width,180)})}
  useEffect(()=>{if(!open)return;place();const outside=(event:PointerEvent)=>{const target=event.target as Node;if(!trigger.current?.contains(target)&&!menu.current?.contains(target))setOpen(false)};document.addEventListener('pointerdown',outside);window.addEventListener('resize',place);window.addEventListener('scroll',place,true);return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true)}},[open,choices.length])
  const show=()=>{if(props.disabled)return;setActive(Math.max(0,choices.findIndex(choice=>choice.value===value)));setOpen(true)}
  const choose=(choice:Choice)=>{if(choice.disabled)return;const select=native.current!;select.value=choice.value;select.dispatchEvent(new Event('change',{bubbles:true}));setOpen(false);trigger.current?.focus()}
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);return}if(!choices.length)return;if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!open){show();return}let next=active;do{next=(next+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length}while(choices[next]?.disabled&&next!==active);setActive(next);return}if(event.key==='Enter'||event.key===' '){event.preventDefault();if(open)choose(choices[active]);else show()}}
  return <span className={`app-select ${className}`}>
    <select {...props} ref={native} className="app-select-native" tabIndex={-1} aria-hidden="true" onChange={onChange}>{children}</select>
    <button ref={trigger} type="button" className="app-select-trigger" disabled={props.disabled} title={props.title} aria-label={props['aria-label']} aria-haspopup="listbox" aria-expanded={open} onClick={()=>open?setOpen(false):show()} onKeyDown={key}><span>{selected?.label||'请选择'}</span><b aria-hidden="true">⌄</b></button>
    {open&&createPortal(<div ref={menu} className="app-select-menu" role="listbox" aria-label={props['aria-label']} style={position} onKeyDown={key}>{choices.map((choice,index)=><button type="button" role="option" aria-selected={choice.value===value} key={`${choice.value}-${index}`} className={index===active?'active':''} disabled={choice.disabled} onPointerEnter={()=>setActive(index)} onClick={()=>choose(choice)}>{choice.label}</button>)}</div>,document.body)}
  </span>
}
