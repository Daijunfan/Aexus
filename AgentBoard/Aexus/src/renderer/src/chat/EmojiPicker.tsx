import {useDeferredValue,useEffect,useRef,useState} from 'react'
import {Icon} from '../components/Icon'
import {MessageMenu} from '../components/MessageMenu'
import {translate as uiText,useI18n} from '../i18n'

type Emoji=[string,string,string,number,string,[number,string][]]
const groups=[[-1,'Recently used','history'],[0,'Smileys & emotion','smiley'],[1,'People & body','person'],[3,'Animals & nature','leaf'],[4,'Food & drink','coffee'],[5,'Travel & places','globe'],[6,'Activities','gift'],[7,'Objects','lightbulb'],[8,'Symbols','heart'],[9,'Flags','flag']] as const
const tones=['Default skin tone','Light skin tone','Medium-light skin tone','Medium skin tone','Medium-dark skin tone','Dark skin tone']
function preferences():{tone:number;recent:string[]}{try{const value=JSON.parse(localStorage.getItem('message-emoji')??'{}');return {tone:tones[value.tone]?value.tone:0,recent:Array.isArray(value.recent)?value.recent.filter((x:unknown)=>typeof x==='string').slice(0,32):[]}}catch{return {tone:0,recent:[]}}}

/** One category at a time, lazy local data, and ordinary Unicode in the existing draft. */
export function EmojiPicker({anchor,onClose,onSelect}:{anchor:{x:number;y:number;originX?:number;originY?:number};onClose:()=>void;onSelect:(emoji:string)=>void}){
 const {language}=useI18n(),[items,setItems]=useState<Emoji[]>([]),[failed,setFailed]=useState(false),[query,setQuery]=useState(''),search=useDeferredValue(query.trim().toLowerCase()),[prefs,setPrefs]=useState(preferences),[group,setGroup]=useState(prefs.recent.length?-1:0),[limit,setLimit]=useState(160),[hover,setHover]=useState<Emoji|null>(null),body=useRef<HTMLDivElement>(null)
 const load=()=>{setFailed(false);void import('./emoji-data.json').then(data=>setItems(data.default as Emoji[])).catch(()=>setFailed(true))}
 useEffect(load,[])
 useEffect(()=>{setLimit(160);body.current?.scrollTo(0,0);setHover(null)},[search,group])
 const variant=(item:Emoji)=>item[5].find(([tone])=>tone===prefs.tone)?.[1]??item[0]
 const selected=search?items.filter(item=>(item.slice(0,3).join(' ')+item[4]).toLowerCase().includes(search)):group===-1?prefs.recent.flatMap(value=>{const found=items.find(item=>item[0]===value||item[5].some(([,emoji])=>emoji===value));return found?[[value,found[1],found[2],found[3],found[4],[]] as Emoji]:[]}):items.filter(item=>item[3]===group)
 const label=(item:Emoji)=>item[language==='zh-CN'?2:1],save=(next:typeof prefs)=>{setPrefs(next);try{localStorage.setItem('message-emoji',JSON.stringify(next))}catch{}}
 const choose=(item:Emoji)=>{const emoji=variant(item);save({...prefs,recent:[emoji,...prefs.recent.filter(value=>value!==emoji)].slice(0,32)});onSelect(emoji)}
 return <MessageMenu anchor={anchor} onClose={onClose} label={uiText('Emoji picker')} className="emoji-picker" nativeKeys>
  <header className="emoji-heading"><strong>{uiText('Emoji')}</strong><select aria-label={uiText('Emoji skin tone')} value={prefs.tone} onChange={event=>save({...prefs,tone:Number(event.target.value)})}>{tones.map((tone,index)=><option key={tone} value={index}>{['✋','✋🏻','✋🏼','✋🏽','✋🏾','✋🏿'][index]} {uiText(tone)}</option>)}</select></header>
  <label className="emoji-search"><Icon name="search"/><input autoFocus value={query} aria-label={uiText('Search emoji')} placeholder={uiText('Find an emoji…')} onChange={event=>setQuery(event.target.value)}/>{query&&<button aria-label={uiText('Clear search')} onClick={()=>setQuery('')}><Icon name="close"/></button>}</label>
  <nav className="emoji-tabs" aria-label={uiText('Emoji categories')}>{groups.map(([id,title,icon])=><button key={id} aria-label={uiText(title)} title={uiText(title)} aria-pressed={!search&&group===id} onClick={()=>{setGroup(id);setQuery('')}}><Icon name={icon}/></button>)}</nav>
  <div ref={body} className="emoji-body"><div className="emoji-section-title">{search?uiText('{0} results',[selected.length]):uiText(groups.find(([id])=>id===group)![1])}</div>
   {failed?<div className="emoji-empty"><Icon name="refresh"/><p>{uiText('Emoji could not load.')}</p><button onClick={load}>{uiText('Retry')}</button></div>:!items.length?<div className="emoji-empty" role="status">{uiText('Loading emoji…')}</div>:!selected.length?<div className="emoji-empty"><Icon name="smiley"/><p>{uiText(search?'No emoji found. Try another word.':'Your recently used emoji will appear here.')}</p></div>:<div className="emoji-grid" role="group" aria-label={uiText('Emoji results')} onKeyDown={event=>{const step=({ArrowLeft:-1,ArrowRight:1,ArrowUp:-8,ArrowDown:8,Home:-Infinity,End:Infinity} as Record<string,number>)[event.key];if(step===undefined)return;event.preventDefault();const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')],index=buttons.indexOf(event.target as HTMLButtonElement);buttons[Math.min(buttons.length-1,Math.max(0,index+step))]?.focus()}}>{selected.slice(0,limit).map(item=><button key={item[0]} data-emoji={variant(item)} aria-label={uiText('Insert {0} {1}',[label(item),variant(item)])} title={label(item)} onPointerEnter={()=>setHover(item)} onFocus={()=>setHover(item)} onClick={()=>choose(item)}>{variant(item)}</button>)}</div>}
   {selected.length>limit&&<button className="emoji-more" onClick={()=>setLimit(limit+160)}>{uiText('Show more')}</button>}
  </div><footer className="emoji-preview"><span>{hover?variant(hover):'✨'}</span><div><strong>{hover?label(hover):uiText('A little more expression')}</strong><small>{uiText('Choose an emoji to add to your message')}</small></div></footer>
 </MessageMenu>
}
