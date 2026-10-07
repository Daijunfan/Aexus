import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {useEffect,useState} from 'react'
import {api} from '../api'
import {createRefreshQueue} from '../snapshot'
import {useMessenger} from './useMessenger'
import {Icon} from './Icon'
import {plainMessagePreview,type MessengerResults} from '../../../shared/messenger'

export function PinnedMessages({conversation}:{conversation:string}){
  useI18n()

 const messenger=useMessenger()!,[result,setResult]=useState<MessengerResults|null>(null),[error,setError]=useState('')
 const pins=Object.entries(messenger.state.messages).filter(([key,value])=>key.startsWith(conversation+'/')&&value.pinned&&!value.hidden).map(([key])=>key).join('\n')
 useEffect(()=>{let alive=true,version=0;if(!pins){setResult(null);return}
  const refresh=createRefreshQueue(async()=>{if(!alive)return;const current=version;try{const value=await api.call<MessengerResults>('messenger.search',{conversation,filter:'pinned',limit:1});if(alive&&current===version){setResult(value);setError('')}}catch(cause){if(alive&&current===version)setError((cause as Error).message)}})
  void refresh();const off=api.onEvent(event=>{if(event.channel==='chat:changed'&&conversation==='group:'+event.payload.id&&event.payload.editedMessageId&&pins.split('\n').includes(conversation+'/'+event.payload.editedMessageId)){version++;void refresh()}})
  return()=>{alive=false;off()}
 },[conversation,pins])
 if(!pins)return null
 if(error)return <div className="message-pin-strip" role="alert">{error}</div>
 const message=result?.messages[0];if(!message)return null
 return <div className="message-pin-strip"><Icon name="pinned"/><button className="message-pin-preview" aria-label={uiText("Go to pinned message")} onClick={()=>messenger.setJump({conversation,id:message.id})}><strong>{uiText("Pinned message")}{result!.total>1?` · ${result!.total}`:''}</strong><span>{plainMessagePreview(message.text)||uiText("Photo")}</span></button><button className="message-pin-all" aria-label={uiText("Show pinned messages")} onClick={()=>messenger.setLibrary({conversation,filter:'pinned'})}><Icon name="list-selection"/></button></div>
}
