import {useLayoutEffect,useRef,useState} from 'react'
import type {OutboundReceipt} from '../../../shared/types'
import type {ChatDelivery} from '../../../shared/chat-groups'
import {translate as uiText,useI18n,interfaceLocale} from '../i18n'
import {Icon} from '../components/Icon'
import {MessageMenu} from '../components/MessageMenu'
import {playMessageMotion} from './surfaceMotion'

type Milestones={deliveredAt?:number;readAt?:number}
const receiptState=({deliveredAt,readAt}:Milestones)=>readAt!==undefined?'read':deliveredAt!==undefined?'delivered':'sent'
const stateLabel={sent:'Sent',delivered:'Delivered',read:'Read'} as const
function ReceiptTimes({deliveredAt,readAt}:Milestones){
  return <span className="message-receipt-times">{([['Delivered',deliveredAt,'Not yet delivered'],['Read',readAt,'Not yet read']] as const).map(([label,value,pending])=><span key={label}><span>{uiText(label)}</span>{value===undefined?<small>{uiText(pending)}</small>:<time dateTime={new Date(value).toISOString()} title={new Date(value).toLocaleString(interfaceLocale())}>{new Date(value).toLocaleTimeString(interfaceLocale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time>}</span>)}</span>
}

/** These are transport/recipient milestones, independent of task progress or inbound read marks. */
export function MessageReceipt({outbound,deliveries,memberName,onOpenRecipient,canOpenRecipient}:{outbound?:OutboundReceipt;deliveries?:ChatDelivery[];memberName?:(id:string)=>string;onOpenRecipient?:(id:string)=>void;canOpenRecipient?:(id:string)=>boolean}){
  useI18n()
  const trigger=useRef<HTMLButtonElement>(null),[point,setPoint]=useState<{x:number;y:number;originX:number;originY:number}|null>(null)
  const total=deliveries?.length??0,delivered=deliveries?.filter(item=>item.deliveredAt!==undefined).length??0,read=deliveries?.filter(item=>item.readAt!==undefined).length??0,present=!!outbound||total>0
  const stage=total?(read?'read':delivered?'delivered':'sent'):receiptState(outbound??{})
  const label=total&&read>0&&read<total?uiText('Read {0} of {1}',[read,total]):total&&read===0&&delivered>0&&delivered<total?uiText('Delivered {0} of {1}',[delivered,total]):uiText(stateLabel[stage])
  const attention=deliveries?.filter(item=>item.status==='failed'||item.status==='interrupted').length??0,attentionLabel=attention?uiText(attention===1?'{0} delivery needs attention':'{0} deliveries need attention',[attention]):''
  const signature=present?total+':'+delivered+':'+read+':'+stage:'',previous=useRef(signature)
  useLayoutEffect(()=>{if(previous.current===signature)return;previous.current=signature;if(!present||!trigger.current)return;const icon=trigger.current.querySelector('.codicon');if(!icon)return;const animation=playMessageMotion(icon,[{opacity:.45,transform:'translateY(2px) scale(.8)'},{opacity:1,transform:'none'}],220);return()=>animation?.cancel()},[signature,present])
  if(!present)return null
  const close=()=>{setPoint(null);trigger.current?.focus()}
  return <><button ref={trigger} className="message-receipt" data-receipt-state={stage} data-receipt-attention={attention||undefined} aria-label={[uiText('{0} · Delivery details',[label]),attentionLabel].filter(Boolean).join(' · ')} title={[uiText('Message delivery details'),attentionLabel].filter(Boolean).join(' · ')} aria-haspopup="dialog" aria-expanded={!!point} onClick={event=>{const box=event.currentTarget.getBoundingClientRect();setPoint(point?null:{x:box.right-340,y:box.bottom+7,originX:box.right,originY:box.bottom})}}><Icon name={stage==='sent'?'check':'check-all'}/><span>{label}</span>{attention>0&&<span className="message-receipt-attention" title={attentionLabel} aria-hidden="true"><Icon name="warning"/></span>}</button>
    {point&&<MessageMenu anchor={point} role="dialog" nativeKeys label={uiText('Message delivery details')} className="message-receipt-menu" onClose={()=>setPoint(null)}>
      <header><div><strong>{uiText('Message delivery details')}</strong>{total>0&&<small>{uiText(total===1?'Sent to {0} recipient':'Sent to {0} recipients',[total])}</small>}</div><button aria-label={uiText('Close delivery details')} onClick={close}><Icon name="close"/></button></header>
      {total>0?<ul className="message-receipt-list" tabIndex={0} aria-label={uiText('Message recipients')}>{deliveries!.map(delivery=>{
        const name=memberName?.(delivery.employeeId)??uiText('Former member'),available=!!onOpenRecipient&&(canOpenRecipient?.(delivery.employeeId)??true)
        return <li key={delivery.employeeId} data-task-state={delivery.status}><div className="message-receipt-person"><button disabled={!available} aria-label={uiText('Open private conversation with {0}',[name])} title={uiText(available?'Open the full private conversation':'Conversation unavailable')} onClick={()=>{close();onOpenRecipient?.(delivery.employeeId)}}><span>{name}</span>{available&&<Icon name="arrow-up-right"/>}</button><span data-receipt-state={delivery.readAt===undefined?'unread':'read'}><Icon name={delivery.readAt===undefined?'circle-outline':'check-all'}/>{uiText(delivery.readAt===undefined?'Unread':'Read')}</span></div><ReceiptTimes deliveredAt={delivery.deliveredAt} readAt={delivery.readAt}/><div className="message-receipt-task"><span>{uiText(delivery.mode==='awareness'?'Context only':'Task status')}</span>{(delivery.mode!=='awareness'||delivery.status==='failed'||delivery.status==='interrupted')&&<strong>{uiText(delivery.status)}</strong>}</div>{delivery.error&&<p className="message-receipt-error">{uiText(delivery.error)}</p>}</li>
      })}</ul>:outbound&&<div className="message-receipt-private"><ReceiptTimes deliveredAt={outbound.deliveredAt} readAt={outbound.readAt}/></div>}
    </MessageMenu>}
  </>
}
