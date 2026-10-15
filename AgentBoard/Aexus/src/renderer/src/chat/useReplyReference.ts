import {useEffect,useState} from 'react'
import type {MessageReply} from '../../../shared/types'
import type {MessageQuote} from '../../../shared/message-quotes'
import {api} from '../api'
import {createRefreshQueue} from '../snapshot'

/** Unsent previews resolve current public text; sent reply snapshots remain immutable. */
export function useReplyReference(conversation:string|undefined,id:string|undefined,quote?:MessageQuote,textOnly?:boolean){
 const key=JSON.stringify([conversation,id,quote?.text,quote?.offset,textOnly]),empty={reply:null,loading:!!(conversation&&id),error:''}
 const [result,setResult]=useState<{key:string;reply:MessageReply|null;loading:boolean;error:string}>({key,...empty})
 useEffect(()=>{
  let active=true,revision=0
  if(!conversation||!id){setResult({key,reply:null,loading:false,error:''});return}
  const refresh=createRefreshQueue(async()=>{if(!active)return;const requested=revision;try{const reply=await api.call<MessageReply>('messenger.reference',{conversation,id,quote,textOnly});if(active&&requested===revision)setResult({key,reply,loading:false,error:''})}catch(cause){if(active&&requested===revision)setResult({key,reply:null,loading:false,error:(cause as Error).message})}})
  const request=()=>{revision++;setResult({key,reply:null,loading:true,error:''});void refresh()}
  request()
  const off=api.onEvent(event=>{if(event.channel==='chat:changed'&&conversation==='group:'+event.payload.id&&(!event.payload.editedMessageId||event.payload.editedMessageId===id)||event.channel==='client:authentication'&&event.payload.authenticated)request()})
  return()=>{active=false;off()}
 },[key])
 return result.key===key?result:empty
}
