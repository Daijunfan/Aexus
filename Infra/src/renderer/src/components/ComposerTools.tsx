import {translate as uiText,useI18n} from '../i18n'
import {useEffect,useState,type RefObject} from 'react'
import {Icon} from './Icon'
import {EmojiPicker} from '../chat/EmojiPicker'
export function ComposerTools({input,value,onChange,disabled=false}:{input:RefObject<HTMLTextAreaElement|null>;value:string;onChange:(text:string)=>void;disabled?:boolean}){
  useI18n()

 const [menu,setMenu]=useState<{x:number;y:number;originX?:number;originY?:number}|null>(null)
 const insert=(before:string,after='',placeholder='',replace=false)=>{const el=input.current,start=el?.selectionStart??value.length,end=el?.selectionEnd??start,selection=replace?'':value.slice(start,end)||placeholder;onChange(value.slice(0,start)+before+selection+after+value.slice(end));setMenu(null);requestAnimationFrame(()=>{el?.focus();el?.setSelectionRange(start+before.length,start+before.length+selection.length)})}
 useEffect(()=>{const el=input.current;if(!el||disabled)return;const key=(event:KeyboardEvent)=>{if(event.isComposing||!(event.metaKey||event.ctrlKey))return;const delimiter=({b:'**',i:'_',e:'`'} as Record<string,string>)[event.key.toLowerCase()];if(delimiter){event.preventDefault();insert(delimiter,delimiter,'text')}};el.addEventListener('keydown',key);return()=>el.removeEventListener('keydown',key)},[value,input,disabled,onChange])
 return <div className="composer-tools" role="toolbar" aria-label={uiText("Message formatting")}>
  <button disabled={disabled} aria-label={uiText("Insert emoji")} title={uiText("Emoji")} aria-expanded={!!menu} onClick={event=>{const box=event.currentTarget.getBoundingClientRect();setMenu(menu?null:{x:box.left,y:box.top-494,originX:box.left+box.width/2,originY:box.top})}}><Icon name="smiley"/></button>
  {([['Bold','bold','**','**','text'],['Italic','italic','_','_','text'],['Inline code','code','`','`','code'],['Bullet list','list-unordered','\n- ','','item']] as const).map(([label,icon,before,after,placeholder])=><button disabled={disabled} key={label} aria-label={uiText(label)} title={uiText(label)} onMouseDown={event=>event.preventDefault()} onClick={()=>insert(before,after,placeholder)}><Icon name={icon}/></button>)}
  {menu&&<EmojiPicker anchor={menu} onClose={()=>setMenu(null)} onSelect={emoji=>insert(emoji,'','',true)}/>}
 </div>
}
