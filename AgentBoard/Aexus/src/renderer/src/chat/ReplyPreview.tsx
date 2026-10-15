import type {MessageReply} from '../../../shared/types'
import {plainMessagePreview} from '../../../shared/messenger'
import {translate as uiText,useI18n} from '../i18n'
import {Icon} from '../components/Icon'
import {MotionStrip} from './MotionStrip'

export function replyAuthor(reply:MessageReply,employeeName:string,names:Record<string,string>){
  if(reply.conversation)return reply.author?.kind==='operator'?uiText('You'):reply.authorName??uiText('Original sender')
  return reply.role==='assistant'?employeeName:reply.author?.kind==='operator'?uiText('You'):reply.author?.kind==='agent'?names[reply.author.employeeId]??uiText('Former teammate'):uiText('Original message')
}

/** Same compact reference for the composer and the sent message. */
export function ReplyPreview({reply,author,onNavigate,onCancel,onElsewhere,unavailable}:{onElsewhere?:()=>void;unavailable?:string;reply:MessageReply|null;author:string;onNavigate?:()=>void;onCancel?:()=>void}){
  useI18n()
  const content=<><Icon name={onCancel?'reply':'quote'}/><span><strong>{onCancel?uiText(reply?.quote?'Quoting {0}':'Replying to {0}',[author]):author}{reply?.conversationTitle&&reply.conversationTitle!==author&&<em> · {reply.conversationTitle}</em>}</strong><small>{unavailable??(reply?(reply.quote?.text||plainMessagePreview(reply.text)||reply.files?.map(file=>file.name).join(', ')||uiText('Photo'))+(reply.truncated?'…':''):uiText('Original message unavailable'))}</small>{!!reply?.omittedFiles&&<small className="reply-omitted-note">{uiText('Files remain in the original conversation')}</small>}{!!reply?.omittedImages&&<small className="reply-omitted-note">{uiText('Photos remain in the original conversation')}</small>}</span>{!!reply?.omittedImages&&<span className="reply-photo-count" title={uiText('Photos remain in the original conversation')}><Icon name="file-media"/>{reply.omittedImages}</span>}{!!reply?.images?.length&&<span className="reply-photo-count"><Icon name="file-media"/>{reply.images.length}</span>}</>
  if(onCancel)return <MotionStrip className="message-replying" aria-label={uiText('Reply preview')}><button className="message-reply-preview" onClick={onNavigate} disabled={!onNavigate} aria-label={uiText('Go to original message')} title={uiText('Go to original message')}>{content}</button>{onElsewhere&&<button className="message-reply-elsewhere" onClick={onElsewhere} aria-label={uiText('Reply in another conversation')} title={uiText('Reply in another conversation')}><Icon name="arrow-swap"/></button>}<button className="message-reply-cancel" onClick={onCancel} aria-label={uiText('Cancel reply')} title={uiText('Cancel reply')}><Icon name="close"/></button></MotionStrip>
  return <button className="message-reply-preview message-reply-link" data-reply-to={reply?.id} onClick={onNavigate} aria-label={uiText('Go to original message')} title={uiText('Go to original message')}>{content}</button>
}
