// A small labelled picker used by the session toolbar.

import {useLayoutEffect,useRef,useState,type ReactNode} from 'react'

export function Dropdown({

  control,
  open,
  onToggle,
  onClose,
  label,
  icon,
  width,
  children
}: {
  control?:string
  open: boolean
  onToggle: () => void
  onClose: () => void
  label: ReactNode
  icon?: ReactNode
  width: number
  children: ReactNode
}) {
  const picker=useRef<HTMLDivElement>(null),[placement,setPlacement]=useState({minWidth:width,maxWidth:width,marginLeft:0})
  useLayoutEffect(()=>{
    const el=picker.current;if(!open||!el)return
    const surface=el.closest('.conversation-dialog')
    const place=()=>{
      const box=el.getBoundingClientRect(),bounds=surface?.getBoundingClientRect(),scale=el.offsetWidth?box.width/el.offsetWidth:1
      const left=Math.max(8,(bounds?.left??0)+8),right=Math.min(innerWidth-8,(bounds?.right??innerWidth)-8),size=Math.min(Math.max(width*scale,box.width),right-left)
      setPlacement({minWidth:size/scale,maxWidth:size/scale,marginLeft:(Math.max(left,Math.min(box.left,right-size))-box.left)/scale})
    }
    place();const observer=new ResizeObserver(place);observer.observe(surface??el);window.addEventListener('resize',place)
    return()=>{observer.disconnect();window.removeEventListener('resize',place)}
  },[open,width,label])
  return (
    <div className="picker" data-control={control} ref={picker} onKeyDown={event=>{if(open&&event.key==='Escape'&&!event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();onClose();picker.current?.querySelector<HTMLButtonElement>('.ctl')?.focus()}}}>
      <button className={`ctl ${open ? 'open' : ''}`} aria-expanded={open} aria-haspopup="true" onClick={onToggle}>
        {icon && <span className="ctl-icon">{icon}</span>}
        <span className="ctl-label">{label}</span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <>
          <div className="scrim" onClick={onClose} />
          <div className="menu" style={placement}>
            {children}
          </div>
        </>
      )}
    </div>
  )
}
