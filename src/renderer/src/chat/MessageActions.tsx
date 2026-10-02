import {translate as uiText,useI18n,interfaceLocale} from '../i18n'
import {useEffect,useMemo,useRef,useState} from 'react'
import {useMessageOwner} from './MessageViewport'
import {MessageMenu} from '../components/MessageMenu'
import {useMessenger} from '../components/useMessenger'
import {messageKey,MESSAGE_REACTIONS,type MessagePreferences} from '../../../shared/messenger'
import {Icon} from '../components/Icon'
import {emojiCount} from './messagePresentation'
import {useMessageExpression,type ReactionAcknowledgement} from './messageExpressionMotion'
import {MessageActionRail,useMessageCopy} from './MessageActionRail'

export function MessageActions({text,onReply,onEdit,conversation,id,images=0}:{images?:number;text:string;onReply?:()=>void;onEdit?:()=>void;conversation?:string;id?:string}){
  useI18n()

  const messenger=useMessenger(),root=useRef<HTMLDivElement>(null),clipboard=useMessageCopy(text),status=clipboard.status,[menu,setMenu]=useState<{x:number;y:number;originX?:number;originY?:number}|null>(null),[acknowledgement,setAcknowledgement]=useState<ReactionAcknowledgement|null>(null)
  useMessageOwner(!!menu)
  const preferences=conversation&&id?messenger?.state.messages[messageKey(conversation,id)]??{}:{}
  const replay=useMessageExpression(root,preferences.reaction,acknowledgement),isEmoji=useMemo(()=>images===0&&!!emojiCount(text),[text,images])
  useEffect(()=>{const el=root.current?.closest('[data-chat-item]');if(!conversation||!id||!el)return;const open=(event:Event)=>{event.preventDefault();const mouse=event as MouseEvent;setMenu({x:mouse.clientX,y:mouse.clientY})};el.addEventListener('contextmenu',open);return()=>el.removeEventListener('contextmenu',open)},[conversation,id])
  const change=(patch:MessagePreferences,from?:DOMRect)=>{if(conversation&&id)void messenger?.message(conversation,id,patch).then(ok=>{if(!ok||!root.current?.isConnected)return;setMenu(null);if(patch.reaction&&from)setAcknowledgement({emoji:patch.reaction,from})})}
  const copy=async()=>{if(await clipboard.copy())setMenu(null)}
  const forward=()=>{if(conversation&&id)messenger?.setForward({messages:[{conversation,id}],text,images});setMenu(null)}
  if(!text.trim()&&!conversation)return null
  return <>
    <MessageActionRail><div ref={root} className={`message-actions ${menu?'menu-open':''}`} aria-label={uiText("Message actions")}>
      {text.trim()&&<button className="message-copy-action" aria-label={uiText("Copy message")} title={uiText("Copy message")} onClick={()=>void copy()}><Icon name={status==='Copied'?'check':status?'error':'copy'}/>{status&&<span className="message-copy-feedback" role="status">{uiText(status)}</span>}</button>}
      {conversation&&id&&<button className="message-forward-action" aria-label={uiText('Forward message')} title={uiText('Forward message')} onClick={forward}><Icon name="arrow-right"/></button>}
      {onReply&&<button className="message-reply-action" aria-label={uiText("Reply to message")} title={uiText("Reply to message")} onClick={onReply}><Icon name="reply"/></button>}
      {onEdit&&<button aria-label={uiText('Edit message')} title={uiText('Edit message')} onClick={onEdit}><Icon name="edit"/></button>}
      {isEmoji&&<button className="message-replay-emoji" aria-label={uiText('Replay emoji animation')} title={uiText('Replay emoji animation')} onClick={replay}><Icon name="play"/></button>}
      {conversation&&id&&<><button aria-label={preferences.saved?uiText("Unsave message"):uiText("Save message")} title={preferences.saved?uiText("Unsave message"):uiText("Save message")} aria-pressed={!!preferences.saved} onClick={()=>change({saved:!preferences.saved})}><Icon name="bookmark"/></button><button className="message-more-action" aria-label={uiText("More message actions")} title={uiText("More message actions")} aria-expanded={!!menu} onClick={event=>{const box=event.currentTarget.getBoundingClientRect();setMenu(menu?null:{x:box.right-230,y:box.bottom+6,originX:box.right,originY:box.bottom})}}><Icon name="ellipsis"/></button></>}
    </div></MessageActionRail>
    {(preferences.reaction||preferences.saved||preferences.pinned)&&<div className="message-annotations">{preferences.reaction&&<button className="message-reaction" aria-label={uiText("Remove reaction {0}",[preferences.reaction])} onClick={()=>change({reaction:''})}>{preferences.reaction}<span>1</span></button>}{preferences.saved&&<span title={uiText("Saved message")}><Icon name="bookmark"/></span>}{preferences.pinned&&<button onClick={()=>messenger?.setLibrary({conversation,filter:'pinned'})}><Icon name="pinned"/>  {uiText("Pinned")}</button>}</div>}
    {menu&&<MessageMenu anchor={menu} label={uiText("Message options")} onClose={()=>setMenu(null)}>
      <div className="message-reaction-picker" aria-label={uiText("React to message")}>{MESSAGE_REACTIONS.map(reaction=><button key={reaction} role="menuitemradio" aria-checked={preferences.reaction===reaction} aria-label={uiText("React {0}",[reaction])} onClick={event=>change({reaction:preferences.reaction===reaction?'':reaction},event.currentTarget.getBoundingClientRect())}>{reaction}</button>)}</div>
      {isEmoji&&!!root.current?.closest('[data-chat-item][data-emoji-count]')&&<button role="menuitem" onClick={()=>{setMenu(null);replay()}}><Icon name="play"/>{uiText('Replay emoji animation')}</button>}
      {text.trim()&&<button role="menuitem" onClick={()=>void copy()}><Icon name="copy"/>{uiText("Copy message")}</button>}
      {onReply&&<button role="menuitem" onClick={()=>{setMenu(null);onReply()}}><Icon name="reply"/>{uiText("Reply")}</button>}
      {onEdit&&<button role="menuitem" onClick={()=>{setMenu(null);onEdit()}}><Icon name="edit"/>{uiText('Edit message')}</button>}
      {conversation&&id&&<button role="menuitem" onClick={forward}><Icon name="arrow-right"/>{uiText("Forward message")}</button>}
      {conversation&&id&&<button role="menuitem" onClick={()=>{messenger?.setReplyTarget({conversation,id,text,images});setMenu(null)}}><Icon name="reply"/>{uiText('Reply in another conversation')}</button>}
      <button role="menuitem" onClick={()=>change({saved:!preferences.saved})}><Icon name="bookmark"/>{preferences.saved?uiText("Remove from saved"):uiText("Save message")}</button>
      <button role="menuitem" onClick={()=>change({pinned:!preferences.pinned})}><Icon name="pinned"/>{preferences.pinned?uiText("Unpin message"):uiText("Pin message")}</button>
      {conversation&&id&&<button role="menuitem" onClick={()=>{messenger?.setSelection({conversation,ids:[id]});setMenu(null)}}><Icon name="checklist"/>{uiText("Select message")}</button>}
      <hr/><button role="menuitem" onClick={()=>change({hidden:true})}><Icon name="eye-closed"/>{uiText("Hide for me")}</button><small className="messenger-menu-note">{uiText("Task history stays unchanged.")}</small>
    </MessageMenu>}
  </>
}

export function MessageDate({value}:{value:number}){
  useI18n()

  const date=new Date(value),today=new Date(),yesterday=new Date();yesterday.setDate(today.getDate()-1)
  const label=date.toDateString()===today.toDateString()?'Today':date.toDateString()===yesterday.toDateString()?'Yesterday':date.toLocaleDateString(interfaceLocale(),{month:'long',day:'numeric',...(date.getFullYear()!==today.getFullYear()?{year:'numeric' as const}:{})})
  return <div className="message-date"><time dateTime={date.toISOString()}>{uiText(label)}</time></div>
}
