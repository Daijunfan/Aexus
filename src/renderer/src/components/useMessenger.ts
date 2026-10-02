import type {MessageReply} from '../../../shared/types'
import type {MessageQuote} from '../../../shared/message-quotes'
import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react'
import {onPluginFlush} from '../plugins'
import {api} from '../api'
import {createRefreshQueue} from '../snapshot'
import {EMPTY_MESSENGER,hasDraftContent,type MessengerState,type ConversationPreferences,type MessagePreferences,type MessageDraft,type ForwardDraftInput} from '../../../shared/messenger'

export type MessageTarget={conversation:string;id:string;quote?:MessageQuote}
export type ReplyDestination=MessageTarget&{text:string;images:number}
type LocalDraft=MessageDraft&{expectedClientMessageId?:string}

export function useMessengerState(enabled:boolean){
 const [replyTarget,setReplyTarget]=useState<ReplyDestination|null>(null),[replyIntent,setReplyIntent]=useState<{conversation:string;source:MessageTarget;reply:MessageReply;textOnly?:boolean}|null>(null)
 const [navigationReturn,setNavigationReturn]=useState<{from:MessageTarget;viewing:string}|null>(null)
 const [selection,setSelection]=useState<{conversation:string;ids:string[]}|null>(null)
 const [forward,setForward]=useState<{messages:{conversation:string;id:string}[];text:string;images:number}|null>(null)
 const [library,setLibrary]=useState<{conversation?:string;filter?:string;query?:string}|null>(null),[jump,setJump]=useState<{conversation:string;id:string;returnTo?:string;quote?:MessageQuote}|null>(null)
 const [state,setState]=useState<MessengerState>(EMPTY_MESSENGER),[ready,setReady]=useState(false),[error,setError]=useState('')
 const serverState=useRef(EMPTY_MESSENGER),pendingDrafts=useRef(new Map<string,LocalDraft>()),draftTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),writing=useRef<Promise<void>|undefined>(undefined)
 const project=useCallback(()=>{const next={...serverState.current,drafts:{...serverState.current.drafts}};for(const [key,value] of pendingDrafts.current){const {expectedClientMessageId:_,...draft}=value;if(hasDraftContent(draft))next.drafts[key]=draft;else delete next.drafts[key]}setState(next)},[])
 const getDraft=useCallback((conversation:string)=>{const value=pendingDrafts.current.get(conversation);if(!value)return serverState.current.drafts[conversation];const {expectedClientMessageId:_,...draft}=value;return hasDraftContent(draft)?draft:undefined},[])
 const accept=useCallback((next:MessengerState)=>{if(next.revision>=serverState.current.revision)serverState.current=next;project();setReady(true)},[project])
 const refresh=useMemo(()=>createRefreshQueue(async()=>{try{accept(await api.call<MessengerState>('messenger.state'));setError('')}catch(cause){setError((cause as Error).message)}}),[accept])
 useEffect(()=>{if(!enabled)return;void refresh();const off=api.onEvent(event=>{if(event.channel==='messenger:changed')void refresh()});return off},[enabled,refresh])
 const mutate=useCallback(async(command:string,args:Record<string,unknown>)=>{try{const next=await api.call<MessengerState>(command,args);accept(next);setError('');return true}catch(cause){setError((cause as Error).message);return false}},[accept])
 const conversations=useCallback((ids:string[],patch:ConversationPreferences)=>mutate('messenger.conversation',{conversations:ids,patch}),[mutate])
 const message=useCallback((conversation:string,id:string,patch:MessagePreferences)=>mutate('messenger.message',{conversation,id,patch}),[mutate])
 const saveFolder=useCallback(async(values:{id:string;name:string;conversations:string[];expectedRevision:number})=>{const next=await api.call<MessengerState>('messenger.folder-save',values);accept(next);setError('');return next},[accept])
 const deleteFolder=useCallback(async(id:string,expectedRevision:number)=>{const next=await api.call<MessengerState>('messenger.folder-delete',{id,expectedRevision});accept(next);setError('');return next},[accept])
 const saveForward=useCallback(async(value:ForwardDraftInput|null,expectedClientMessageId?:string)=>{const next=await api.call<MessengerState>('messenger.forward-draft',{value,expectedClientMessageId});accept(next);return next.pendingForward},[accept])
 const flushDrafts=useCallback(async()=>{
  clearTimeout(draftTimer.current)
  while(pendingDrafts.current.size||writing.current){
   const work=writing.current??(writing.current=(async()=>{
    while(pendingDrafts.current.size){
     const [conversation,value]=pendingDrafts.current.entries().next().value!,{updatedAt:_,...payload}=value
     let next:MessengerState
     try{next=await api.call<MessengerState>('messenger.draft',{conversation,...payload})}
     catch(cause){if(pendingDrafts.current.get(conversation)!==value)continue;setError((cause as Error).message);throw Error('Your draft could not be saved. Try again before leaving.')}
     if(pendingDrafts.current.get(conversation)===value)pendingDrafts.current.delete(conversation)
     accept(next);setError('')
    }
   })())
   try{await work}finally{if(writing.current===work)writing.current=undefined}
  }
 },[accept])
 const queueDraft=useCallback((conversation:string,value:Omit<LocalDraft,'updatedAt'>)=>{pendingDrafts.current.set(conversation,{...value,updatedAt:Date.now()});project()},[project])
 const scheduleDraft=useCallback((conversation:string,value:Omit<MessageDraft,'updatedAt'>)=>{queueDraft(conversation,value);clearTimeout(draftTimer.current);draftTimer.current=setTimeout(()=>void flushDrafts().catch(()=>{}),300)},[flushDrafts,queueDraft])
 const messages=useCallback((conversation:string,ids:string[],patch:MessagePreferences)=>mutate('messenger.message',{conversation,ids,patch}),[mutate])
 const toggleSelection=useCallback((conversation:string,id:string)=>setSelection(previous=>({conversation,ids:previous?.conversation===conversation?previous.ids.includes(id)?previous.ids.filter(value=>value!==id):[...previous.ids,id]:[id]})),[])
 const draft=useCallback(async(conversation:string,value:Omit<MessageDraft,'updatedAt'>,expectedClientMessageId?:string)=>{if(expectedClientMessageId!==undefined&&getDraft(conversation)?.clientMessageId!==expectedClientMessageId)return true;queueDraft(conversation,{...value,...(expectedClientMessageId!==undefined?{expectedClientMessageId}:{})});try{await flushDrafts();return true}catch{return false}},[flushDrafts,queueDraft,getDraft])
 const clearDraft=useCallback((conversation:string,clientMessageId:string)=>draft(conversation,{text:''},clientMessageId),[draft])
 const navigate=useCallback(async(target:MessageTarget,from?:MessageTarget,current=from?.conversation)=>{try{
  if(target.conversation!==current){const [kind,id]=target.conversation.split(':');await api.call('view.open',{kind:'messages',...(kind==='group'?{chatId:id}:kind==='channel'?{channelId:id}:{employee:id})})}
  setNavigationReturn(from?{from,viewing:target.conversation}:null);setJump(target)
 }catch(cause){setError((cause as Error).message)}},[])
 const prepareReply=useCallback(async(to:string,source:MessageTarget,textOnly?:boolean)=>{
  await flushDrafts()
  const reply=await api.call<MessageReply>('messenger.reference',{conversation:source.conversation,id:source.id,quote:source.quote,textOnly})
  const latest=await api.call<MessengerState>('messenger.state');accept(latest)
  const saved:Omit<MessageDraft,'updatedAt'>=getDraft(to)??{text:''}
  const changed=JSON.stringify([saved.replyTo,saved.replyQuote,saved.replyConversation,saved.replyTextOnly])!==JSON.stringify([source.id,source.quote,source.conversation,textOnly])
  if(!await draft(to,{...saved,...(changed?{clientMessageId:crypto.randomUUID(),viewId:undefined}:{}),replyTo:source.id,replyQuote:source.quote,replyConversation:source.conversation,replyTextOnly:textOnly}))throw Error('The reply draft could not be saved')
  setReplyIntent({conversation:to,source,reply,textOnly})
  const [kind,id]=to.split(':');await api.call('view.open',{kind:'messages',...(kind==='group'?{chatId:id}:kind==='channel'?{channelId:id}:{employee:id})})
 },[flushDrafts,draft,accept,getDraft])
 useEffect(()=>onPluginFlush(flushDrafts),[flushDrafts])
 useEffect(()=>()=>{clearTimeout(draftTimer.current);void flushDrafts().catch(()=>{})},[flushDrafts])
 return useMemo(()=>({replyTarget,setReplyTarget,replyIntent,setReplyIntent,prepareReply,navigationReturn,navigate,state,ready,error,conversations,message,saveFolder,deleteFolder,saveForward,draft,scheduleDraft,getDraft,clearDraft,refresh,library,setLibrary,jump,setJump,forward,setForward,selection,setSelection,toggleSelection,messages}),[replyTarget,replyIntent,prepareReply,navigationReturn,navigate,state,ready,error,conversations,message,saveFolder,deleteFolder,saveForward,draft,scheduleDraft,getDraft,clearDraft,refresh,library,jump,forward,selection,toggleSelection,messages])
}
export type MessengerController=ReturnType<typeof useMessengerState>
export const MessengerContext=createContext<MessengerController|null>(null)
export const useMessenger=()=>useContext(MessengerContext)
