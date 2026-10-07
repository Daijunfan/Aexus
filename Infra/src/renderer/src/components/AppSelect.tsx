import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {retainEqual} from '../snapshot'
import {useEffect,useId,useLayoutEffect,useRef,useState,type KeyboardEvent,type ReactNode,type SelectHTMLAttributes} from 'react'
import {createPortal} from 'react-dom'

type Choice={value:string;label:string;disabled:boolean}
/** A styled picker backed by a real select for forms, React handlers and CLI-owned settings. */
export function AppSelect({children,className='',onChange,renderChoice,menuClassName='',...props}:SelectHTMLAttributes<HTMLSelectElement>&{renderChoice?:(value:string,label:string)=>ReactNode;menuClassName?:string}){
  useI18n()

  const native=useRef<HTMLSelectElement>(null),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null)
  const menuId=useId()
  const [choices,setChoices]=useState<Choice[]>([]),[open,setOpen]=useState(false),[active,setActive]=useState(0)
  const [position,setPosition]=useState({left:0,top:0,width:180,maxHeight:280})
  useLayoutEffect(()=>{setChoices(previous=>retainEqual(previous,Array.from(native.current?.options??[]).map(option=>({value:option.value,label:option.textContent?.trim()||option.value,disabled:option.disabled}))))},[children,props.value])
  const value=String(props.value??native.current?.value??''),selected=choices.find(choice=>choice.value===value)
  const place=()=>{const box=trigger.current?.getBoundingClientRect();if(!box)return;const width=Math.min(Math.max(box.width,180),window.innerWidth-16),height=Math.min(280,menu.current?.scrollHeight??choices.length*34+12),below=Math.max(0,window.innerHeight-box.bottom-13),above=Math.max(0,box.top-13),up=below<height&&above>below,maxHeight=Math.min(280,up?above:below);setPosition({left:Math.max(8,Math.min(box.left,window.innerWidth-width-8)),top:up?box.top-Math.min(height,maxHeight)-5:box.bottom+5,width,maxHeight})}
  useEffect(()=>{if(!open)return;place();const outside=(event:PointerEvent)=>{const target=event.target as Node;if(!trigger.current?.contains(target)&&!menu.current?.contains(target))setOpen(false)};document.addEventListener('pointerdown',outside);window.addEventListener('resize',place);window.addEventListener('scroll',place,true);return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true)}},[open,choices.length])
  useLayoutEffect(()=>{if(open)menu.current?.querySelectorAll<HTMLElement>('[role=option]')[active]?.scrollIntoView({block:'nearest'})},[open,active])
  const show=()=>{if(props.disabled)return;setActive(Math.max(0,choices.findIndex(choice=>choice.value===value)));setOpen(true)}
  const choose=(choice:Choice)=>{if(choice.disabled)return;const select=native.current!;select.value=choice.value;select.dispatchEvent(new Event('change',{bubbles:true}));setOpen(false);trigger.current?.focus()}
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();return}if(event.key==='Tab'&&open){setOpen(false);trigger.current?.focus();return}if(!choices.length||choices.every(choice=>choice.disabled))return;if(open&&(event.key==='Home'||event.key==='End')){event.preventDefault();setActive(event.key==='Home'?choices.findIndex(choice=>!choice.disabled):choices.reduce((last,choice,index)=>choice.disabled?last:index,-1));return}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!open){show();return}let next=active;do{next=(next+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length}while(choices[next]?.disabled&&next!==active);setActive(next);return}if(event.key==='Enter'||event.key===' '){event.preventDefault();if(open&&choices[active])choose(choices[active]);else show()}}
  return <span className={`app-select ${className}`}>
    <select {...props} ref={native} className="app-select-native" tabIndex={-1} aria-hidden="true" onChange={onChange}>{children}</select>
    <button ref={trigger} type="button" className="app-select-trigger" disabled={props.disabled} title={props.title} aria-label={props['aria-label']} aria-haspopup="listbox" aria-controls={open?menuId:undefined} aria-expanded={open} onClick={()=>open?setOpen(false):show()} onKeyDown={key}><span>{selected?(renderChoice?renderChoice(selected.value,selected.label):selected.label):uiText("Please choose")}</span><b aria-hidden="true">⌄</b></button>
    {open&&createPortal(<div id={menuId} ref={menu} className={`app-select-menu ${menuClassName}`} role="listbox" aria-label={props['aria-label']} style={position} onKeyDown={key}>{choices.map((choice,index)=><button type="button" tabIndex={-1} role="option" aria-label={choice.label} aria-selected={choice.value===value} key={`${choice.value}-${index}`} className={index===active?'active':''} disabled={choice.disabled} onPointerEnter={()=>setActive(index)} onClick={()=>choose(choice)}>{renderChoice?renderChoice(choice.value,choice.label):choice.label}</button>)}</div>,document.body)}
  </span>
}
