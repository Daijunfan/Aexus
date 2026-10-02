import {useEffect,useState} from 'react'
import {effectiveChatMute,type ChatGroupView} from '../../../shared/chat-groups'
import type {AvatarKind} from '../../../shared/office'
import {api} from '../api'
import {translate as uiText,useI18n,interfaceLocale} from '../i18n'
import {EmployeePortrait} from './EmployeePortrait'
import {Icon} from './Icon'

/** Publication controls only; receiving messages and employee work keep their existing authority. */
export function ChatMuteControls({group,onChanged,onPending,disabled=false}:{group:ChatGroupView;onChanged:(group:ChatGroupView)=>void;onPending:(pending:boolean)=>void;disabled?:boolean}){
 useI18n()
 const [duration,setDuration]=useState('3600'),[pending,setPending]=useState(''),[error,setError]=useState(''),[tick,setTick]=useState(0),now=Date.now()
 useEffect(()=>{
  const next=Math.min(...Object.values(group.mutes??{}).filter((value):value is number=>typeof value==='number'&&value>now))
  if(!Number.isFinite(next))return
  const timer=setTimeout(()=>setTick(value=>value+1),Math.min(2147483647,Math.max(0,next-Date.now())+20));return()=>clearTimeout(timer)
 },[group.mutes,tick])
 const all=effectiveChatMute(group,'all',now),status=(until:number|null|undefined)=>until===undefined?uiText('Can reply'):until===null?uiText('Muted indefinitely'):uiText('Muted until {0}',[new Date(until).toLocaleString(interfaceLocale(),{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})])
 const change=async(member:string,muted:boolean)=>{setPending(member);onPending(true);setError('');try{onChanged(await api.call<ChatGroupView>('chat.mute',{id:group.id,member,muted,...(muted&&duration!=='forever'?{durationSeconds:Number(duration)}:{})}))}catch(cause){setError((cause as Error).message)}finally{setPending('');onPending(false)}}
 return <details className="group-speaking-controls"><summary><Icon name="mute"/><strong>{uiText('Speaking permissions')}</strong><span>{all!==undefined?uiText('Everyone muted'):uiText('{0} muted',[group.members.filter(member=>effectiveChatMute(group,member.id,now)!==undefined).length])}</span><Icon name="chevron-down"/></summary>
  <p>{uiText('Control replies in this group. Members still receive messages and can continue their work.')}</p>
  <label>{uiText('Mute duration')}<select aria-label={uiText('Mute duration')} value={duration} onChange={event=>setDuration(event.target.value)}><option value="900">{uiText('15 minutes')}</option><option value="3600">{uiText('1 hour')}</option><option value="28800">{uiText('8 hours')}</option><option value="86400">{uiText('24 hours')}</option><option value="604800">{uiText('7 days')}</option><option value="forever">{uiText('Until I unmute')}</option></select></label>
  <div className="group-mute-all"><span className="group-mute-mark"><Icon name="organization"/></span><div><strong>{uiText('All members')}</strong><small>{status(all)}</small></div><button disabled={disabled||!!pending} aria-label={uiText(all===undefined?'Mute all members':'Unmute all members')} onClick={()=>void change('all',all===undefined)}><Icon name={all===undefined?'mute':'unmute'}/>{uiText(pending==='all'?'Saving…':all===undefined?'Mute all':'Unmute all')}</button></div>
  <div className="group-mute-members" role="list" aria-label={uiText('Member speaking permissions')}>{group.members.map(member=>{const until=effectiveChatMute(group,member.id,now);return <div key={member.id} role="listitem" className="group-mute-member"><EmployeePortrait avatar={(member.avatar??(member.engine==='codex'?'robot':'cat')) as AvatarKind}/><div><strong>{member.title}</strong><small>{status(until)}</small></div><button disabled={disabled||!!pending||all!==undefined} aria-label={uiText(until===undefined?'Mute {0}':'Unmute {0}',[member.title])} title={all!==undefined?uiText('Unmute all members first'):undefined} onClick={()=>void change(member.id,until===undefined)}><Icon name={until===undefined?'mute':'unmute'}/>{uiText(pending===member.id?'Saving…':until===undefined?'Mute':'Unmute')}</button></div>})}</div>
  {error&&<p className="group-error" role="alert">{uiText(error)}</p>}<small className="group-mute-note">{uiText('Mute changes apply immediately. Silent acknowledgments are still allowed.')}</small>
 </details>
}
