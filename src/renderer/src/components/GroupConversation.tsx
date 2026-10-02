import {MessageViewport,type MessageViewportHandle} from '../chat/MessageViewport'
import {UnreadDivider} from '../chat/UnreadDivider'
import {MessageReceipt} from '../chat/MessageReceipt'
import {EditMessageComposer} from '../chat/EditMessageComposer'
import {emojiCount} from '../chat/messagePresentation'
import {VoiceRecorder} from '../chat/VoiceRecorder'
import {useAttachmentUploads,AttachmentTransfers,DraftFiles,MessageFile} from '../chat/MessageAttachments'
import {MessageImages,MessageGalleryContext} from '../chat/MessageImage'
import {useReplyReference} from '../chat/useReplyReference'
import {ReplyPreview,replyAuthor} from '../chat/ReplyPreview'
import {QuoteSelection} from '../chat/QuoteSelection'
import {highlightQuote} from '../chat/quoteTextRange'
import {validateQuote,type MessageQuote} from '../../../shared/message-quotes'
import {useComposerHeight} from '../chat/useComposerHeight'
import {MotionStrip} from '../chat/MotionStrip'
import {messageGroups,useMessageMotion} from '../chat/messagePresentation'
import {translate as uiText,useI18n,interfaceLocale} from '../i18n'
import {Fragment,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react'
import type {ChatGroupView,ChatHistory,ChatMessage} from '../../../shared/chat-groups'
import type {Store} from '../../../shared/types'
import {api} from '../api'
import {createRefreshQueue} from '../snapshot'
import {useVisibleReceipt} from '../chat/useReplyRead'
import {BlockView} from '../chat/Chat'
import {Icon} from './Icon'
import {GroupEditor} from './GroupEditor'
import {MessageSelectionBar,MessageCheckbox} from './MessageSelectionBar'
import {ComposerTools} from './ComposerTools'
import {PinnedMessages} from './PinnedMessages'
import {useMessenger} from './useMessenger'
import {conversationKey,messageKey,type MessengerResults} from '../../../shared/messenger'
import {GroupAvatar} from './MessageView'
import {ConversationSearch} from '../chat/ConversationSearch'
import {MessageActions,MessageDate} from '../chat/MessageActions'
export type GroupDraft={text:string;images?:string[];files?:string[];mentions:string[]|'all';clientMessageId:string;viewId?:string;replyTo?:string;replyQuote?:MessageQuote;replyConversation?:string;replyTextOnly?:boolean}
const groupDraftContent=(draft:Partial<GroupDraft>)=>JSON.stringify([(draft.text??'').trim(),draft.images??[],draft.files??[],draft.mentions??[],draft.replyTo??null,draft.replyQuote??null,draft.replyConversation??null,!!draft.replyTextOnly])
export function GroupConversation({group,store,drafts,onBack,onPrivate}:{group:ChatGroupView;store:Store;drafts:Record<string,GroupDraft>;onBack:()=>void;onPrivate:(id:string)=>void}){
  useI18n()

 const messenger=useMessenger()!,conversation=conversationKey('group',group.id)
 const initialAttachments=messenger.getDraft(conversation)??drafts[group.id]
 const [images,setImages]=useState<string[]>(initialAttachments?.images??[]),[files,setFiles]=useState<string[]>(initialAttachments?.files??[]),attachments=useRef({images,files});attachments.current={images,files}
 const attachmentInput=useRef<HTMLInputElement>(null)
 const [returnToMessage,setReturnToMessage]=useState<string|undefined>(undefined)
 const [unreadAfter,setUnreadAfter]=useState<number|null>(null),positioned=useRef(false)
 const prependAnchor=useRef<{id:string;top:number}|null>(null)
 const [search,setSearch]=useState(false),[awayFromLatest,setAwayFromLatest]=useState(false)
 const [messageToEdit,setMessageToEdit]=useState<ChatMessage|null>(null),editLookup=useRef<symbol|null>(null),editReady=useRef(false),restoreComposer=useRef(false)
 const [history,setHistory]=useState<ChatMessage[]>([]),[before,setBefore]=useState<number|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[editing,setEditing]=useState(false),[sending,setSending]=useState(false),[older,setOlder]=useState(false)
 // Merge paged and targeted reads by request order, so late snapshots cannot roll back receipts.
 const loadedHistory=useRef(history),readOrder=useRef(0),messageReadOrder=useRef(new Map<string,number>());loadedHistory.current=history
 const mergeHistory=(messages:ChatMessage[],order:number)=>setHistory(previous=>{const map=new Map(previous.map(message=>[message.id,message]));for(const message of messages){if((messageReadOrder.current.get(message.id)??0)>order||(message.editRevision??0)<(map.get(message.id)?.editRevision??0))continue;messageReadOrder.current.set(message.id,order);map.set(message.id,message)}return [...map.values()].sort((a,b)=>a.sequence-b.sequence)})
 const [text,setText]=useState(initialAttachments?.text??''),[mentions,setMentions]=useState<string[]|'all'>(initialAttachments?.mentions??[]),[mentionMenu,setMentionMenu]=useState(false),[mentionIndex,setMentionIndex]=useState(0),[replyTo,setReplyTo]=useState<string|undefined>(initialAttachments?.replyTo)
 const [replyQuote,setReplyQuote]=useState<MessageQuote|undefined>(initialAttachments?.replyQuote)
 const [replyOrigin,setReplyOrigin]=useState<{conversation?:string;textOnly?:boolean}>({conversation:initialAttachments?.replyConversation,textOnly:initialAttachments?.replyTextOnly})
 const crossReference=useReplyReference(replyOrigin.conversation,replyTo,replyQuote,replyOrigin.textOnly)
 const localReplySource=history.find(message=>message.id===replyTo)
 const localQuoteChanged=useMemo(()=>{if(replyOrigin.conversation||!replyQuote||!localReplySource)return false;try{validateQuote(localReplySource.text,replyQuote);return false}catch{return true}},[replyOrigin.conversation,replyQuote,localReplySource?.text])
 const names=useMemo(()=>Object.fromEntries(store.sessions.map(card=>[card.id,card.title])),[store.sessions])
 const viewport=useRef<MessageViewportHandle|null>(null),transcript=useRef<HTMLDivElement>(null),composer=useRef<HTMLTextAreaElement>(null),follow=useRef(true),scrollTarget=useRef<number|null>(null),sendingRef=useRef(false),loadedInitial=useRef(false)
 useEffect(()=>{if(!messenger.ready||drafts[group.id])return;const saved=messenger.getDraft(conversation);if(saved){setImages(saved.images??[]);setFiles(saved.files??[]);setText(saved.text);setMentions(saved.mentions??[]);setReplyTo(saved.replyTo);setReplyQuote(saved.replyQuote);setReplyOrigin({conversation:saved.replyConversation,textOnly:saved.replyTextOnly});drafts[group.id]={...saved,mentions:saved.mentions??[],clientMessageId:saved.clientMessageId??crypto.randomUUID()}}},[messenger.ready,group.id])
 useEffect(()=>{const intent=messenger.replyIntent;if(intent?.conversation!==conversation)return
  setMessageToEdit(null);editLookup.current=null
  setReplyTo(intent.source.id);setReplyQuote(intent.source.quote);setReplyOrigin({conversation:intent.source.conversation,textOnly:intent.textOnly});persistDraft({text,...attachments.current,mentions,replyTo:intent.source.id,replyQuote:intent.source.quote,replyConversation:intent.source.conversation,replyTextOnly:intent.textOnly});messenger.setReplyIntent(null)
 },[messenger.replyIntent,conversation])
 useEffect(()=>{const el=transcript.current;if(!el)return;const observer=new ResizeObserver(()=>{if(follow.current)viewport.current?.scrollToEnd();setAwayFromLatest(el.scrollHeight-el.clientHeight-el.scrollTop>80)});observer.observe(el);return()=>observer.disconnect()},[group.id])
 const conversationJump=messenger.jump?.conversation===conversation?messenger.jump:undefined
 const jumpLoaded=history.some(message=>message.id===conversationJump?.id)
 useLayoutEffect(()=>{
  const target=conversationJump;if(!target)return
  const controller=new AbortController();let marked:HTMLElement|null=null,clearQuote=()=>{},timer:ReturnType<typeof setTimeout>|undefined
  follow.current=false
  void (async()=>{
   if(!jumpLoaded){if(before){const order=++readOrder.current,page=await api.call<ChatHistory>('chat.history',{id:group.id,before,limit:100});if(controller.signal.aborted)return;mergeHistory(page.messages,order);setBefore(page.nextBefore)}return}
   const el=await viewport.current?.scrollToMessage(target.id,{block:'center',signal:controller.signal});if(controller.signal.aborted||!el)return
   marked=el;setReturnToMessage(target.returnTo);el.dataset.messageJump='true'
   const source=loadedHistory.current.find(message=>message.id===target.id);clearQuote=target.quote&&source?highlightQuote(el,source.text,target.quote):()=>{}
   scrollTarget.current=transcript.current?.scrollTop??null
   timer=setTimeout(()=>{delete el.dataset.messageJump;clearQuote();messenger.setJump(current=>current===target?null:current)},2400)
  })().catch(cause=>{if(!controller.signal.aborted)setError((cause as Error).message)})
  return()=>{controller.abort();clearTimeout(timer);clearQuote();if(marked)delete marked.dataset.messageJump}
 },[conversationJump,jumpLoaded,group.id,before])
 const messageAuthor=(id:string)=>{const message=history.find(item=>item.id===id);return message?.author.kind==='operator'?uiText('You'):message?.authorName}
 const memberName=(id:string)=>group.members.find(member=>member.id===id)?.title??store.sessions.find(card=>card.id===id)?.title??uiText('Former member')
 const draftFor=(value:Omit<GroupDraft,'clientMessageId'>):GroupDraft=>{const previous=messenger.getDraft(conversation)??drafts[group.id],same=previous&&groupDraftContent(previous)===groupDraftContent(value);return {...value,clientMessageId:same&&previous.clientMessageId||crypto.randomUUID(),...(same&&previous.viewId?{viewId:previous.viewId}:{})}}
 const persistDraft=(value:Omit<GroupDraft,'clientMessageId'>)=>{const draft=draftFor(value);drafts[group.id]=draft;messenger.scheduleDraft(conversation,draft)}
 const saveDraft=(value:string,targets:string[]|'all',reply=replyTo,quote:MessageQuote|null=replyQuote??null,origin=replyOrigin)=>persistDraft({text:value,...attachments.current,mentions:targets,replyTo:reply,replyQuote:quote??undefined,replyConversation:origin.conversation,replyTextOnly:origin.textOnly})
 const uploads=useAttachmentUploads(conversation,(_conversation,path,kind)=>{const next={...attachments.current,[kind==='image'?'images':'files']:[...attachments.current[kind==='image'?'images':'files'],path]};attachments.current=next;setImages(next.images);setFiles(next.files);saveDraft(text,mentions)},images.length+files.length)
 editReady.current=!messageToEdit&&!sending&&!mentionMenu&&text===''&&!replyTo&&mentions!=='all'&&!mentions.length&&!images.length&&!files.length&&!uploads.jobs.length
 useEffect(()=>()=>{editLookup.current=null},[])
 const startEdit=(message:ChatMessage)=>{editLookup.current=null;setMentionMenu(false);setMessageToEdit(message)}
 const closeEdit=()=>{restoreComposer.current=true;setMessageToEdit(null)}
 useLayoutEffect(()=>{if(!messageToEdit&&restoreComposer.current){restoreComposer.current=false;composer.current?.focus()}},[messageToEdit])
 const editLatest=async()=>{
  if(!editReady.current||editLookup.current)return
  const own=[...history].reverse().find(message=>message.author.kind==='operator'&&!messenger.state.messages[messageKey(conversation,message.id)]?.hidden)
  if(own){startEdit(own);return}
  const ticket=Symbol();editLookup.current=ticket
  const current=()=>editLookup.current===ticket&&editReady.current&&composer.current?.value===''&&document.activeElement===composer.current
  try{const results=await api.call<MessengerResults>('messenger.search',{conversation,author:'you',limit:1}),target=results.messages[0];if(!current()||!target)return;const page=await api.call<ChatHistory>('chat.history',{id:group.id,around:target.id,limit:1}),message=page.messages.find(item=>item.id===target.id);if(current()&&message?.author.kind==='operator')startEdit(message)}
  catch(cause){if(current())setError((cause as Error).message)}finally{if(editLookup.current===ticket)editLookup.current=null}
 }
 const attachFiles=(selected:File[])=>{try{uploads.add(selected)}catch(cause){setError((cause as Error).message)}}
 const removeAttachment=(path:string)=>{const next={images:images.filter(value=>value!==path),files:files.filter(value=>value!==path)};attachments.current=next;setImages(next.images);setFiles(next.files);saveDraft(text,mentions)}
 const cancelGroupReply=()=>{setReplyTo(undefined);setReplyQuote(undefined);setReplyOrigin({});persistDraft({text,...attachments.current,mentions});composer.current?.focus()}
 const chooseReply=(message:ChatMessage,quote?:MessageQuote)=>{messenger.setJump(null);setReplyTo(message.id);setReplyQuote(quote);setReplyOrigin({});saveDraft(text,mentions,message.id,quote??null,{});composer.current?.focus()}
 const changeText=(value:string)=>{setText(value);saveDraft(value,mentions);setMentionMenu(/(?:^|\s)@[^\n@]*$/.test(value));setMentionIndex(0)}
 const changeMentions=(value:string[]|'all')=>{setMentions(value);saveDraft(text,value)}
 useEffect(()=>{
  let alive=true,timer:ReturnType<typeof setTimeout>|undefined,messageTimer:ReturnType<typeof setTimeout>|undefined
  const changed=new Set<string>()
  const refreshChanged=createRefreshQueue(async()=>{if(!alive)return;const ids=[...changed];changed.clear();await Promise.all(ids.map(async id=>{const order=messageReadOrder.current.get(id)!;try{const page=await api.call<ChatHistory>('chat.history',{id:group.id,around:id,limit:1});if(alive)mergeHistory(page.messages,order)}catch(cause){if(alive&&messageReadOrder.current.get(id)===order)setError((cause as Error).message)}}))})
  const refresh=createRefreshQueue(async()=>{if(!alive)return;try{const order=++readOrder.current,[page,reading]=await Promise.all([api.call<ChatHistory>('chat.history',{id:group.id,limit:100}),loadedInitial.current?Promise.resolve(null):api.call<ChatGroupView>('chat.get',{id:group.id})]);if(alive){mergeHistory(page.messages,order);if(!loadedInitial.current){setBefore(page.nextBefore);setUnreadAfter(reading?.unread?reading.readSequence:null);loadedInitial.current=true};setError('')}}catch(cause){if(alive)setError((cause as Error).message)}finally{if(alive)setLoading(false)}})
  void refresh()
  const off=api.onEvent(event=>{
   if(event.channel!=='chat:changed'||event.payload.id!==group.id)return
   const id=event.payload.editedMessageId??event.payload.messageId
   if(id){if(!loadedHistory.current.some(message=>message.id===id))return;messageReadOrder.current.set(id,++readOrder.current);changed.add(id);if(!messageTimer)messageTimer=setTimeout(()=>{messageTimer=undefined;void refreshChanged()},35);return}
   if(!timer)timer=setTimeout(()=>{timer=undefined;void refresh()},35)
  })
  return()=>{alive=false;off();clearTimeout(timer);clearTimeout(messageTimer)}
 },[group.id])
 const firstUnread=unreadAfter===null?undefined:history.find(message=>message.sequence>unreadAfter&&message.author.kind==='agent'&&!messenger.state.messages[messageKey(conversation,message.id)]?.hidden)?.id
 useEffect(()=>{if(loadedInitial.current&&unreadAfter===null&&group.unread&&!follow.current)setUnreadAfter(group.readSequence)},[group.unread,group.lastIncomingSequence,group.readSequence,unreadAfter])
 useLayoutEffect(()=>{
  if(loading||positioned.current||!history.length)return
  if(!firstUnread||conversationJump){positioned.current=true;return}
  const controller=new AbortController();follow.current=false
  void viewport.current?.scrollToMessage(firstUnread,{block:'start',signal:controller.signal}).then(row=>{const el=transcript.current;if(controller.signal.aborted||!row||!el)return;const marker=row.previousElementSibling;if(marker?.matches('[data-unread-boundary]'))el.scrollTop+=marker.getBoundingClientRect().top-el.getBoundingClientRect().top-14;scrollTarget.current=el.scrollTop;positioned.current=true;setAwayFromLatest(el.scrollHeight-el.clientHeight-el.scrollTop>80)})
  return()=>controller.abort()
 },[loading,firstUnread,!!history.length,conversationJump])
 useLayoutEffect(()=>{const el=transcript.current;if(!el)return;if(follow.current)viewport.current?.scrollToEnd();setAwayFromLatest(el.scrollHeight-el.clientHeight-el.scrollTop>80)},[history,loading])
 const bubbleGroups=useMemo(()=>messageGroups(history.map(message=>({id:message.id,author:(message.author.kind==='agent'?message.author.employeeId:'operator')+':'+message.kind,time:message.createdAt,breakBefore:message.id===firstUnread,break:!!messenger.state.messages[messageKey(conversation,message.id)]?.hidden||!!message.replyTo}))),[history,messenger.state.messages,conversation,firstUnread])
 const motionItems=useMemo(()=>history.map(message=>({id:message.id,outgoing:message.author.kind==='operator',text:message.text})),[history])
 const prepareMessageSend=useMessageMotion({conversation,ready:!loading,items:motionItems,transcript,composer,following:()=>follow.current})
 const galleryImages=useMemo(()=>history.filter(message=>!messenger.state.messages[messageKey(conversation,message.id)]?.hidden).flatMap(message=>(message.attachments??[]).filter(file=>file.kind==='image').map(file=>({group:group.id,path:file.path,messageId:message.id,caption:message.text}))),[history,group.id,messenger.state.messages])
 const searchItems=useMemo(()=>history.map(message=>({id:message.id,text:message.text,images:message.attachments?.map(file=>file.path)})),[history])
 useComposerHeight(composer,text,!messageToEdit,group.id)
 const newest=history.at(-1)
 useVisibleReceipt(transcript,newest&&group.unread?{key:group.id+':'+newest.id,selector:`[data-group-read="${newest.id}"]`,command:'chat.acknowledge',args:{id:group.id,messageId:newest.id}}:undefined,messenger.ready&&!editing&&!messenger.library,group.id)
 // Prefixes can move out of the old first row; retain its visible message after measurements settle.
 useLayoutEffect(()=>{
  const anchor=prependAnchor.current,el=transcript.current;if(!anchor||!el)return
  let frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
   prependAnchor.current=null
   const row=Array.from(el.querySelectorAll<HTMLElement>('[data-chat-item]')).find(row=>row.dataset.chatItem===anchor.id)
   if(row){const box=el.getBoundingClientRect(),scale=box.height/parseFloat(getComputedStyle(el).height)||1;el.scrollTop+=(row.getBoundingClientRect().top-box.top)/scale-anchor.top;scrollTarget.current=el.scrollTop}
  })});return()=>cancelAnimationFrame(frame)
 },[history])
 const loadOlder=async()=>{if(!before||older)return;setOlder(true);const el=transcript.current,top=el?.scrollTop??0,height=el?.scrollHeight??0;follow.current=false;try{const order=++readOrder.current,page=await api.call<ChatHistory>('chat.history',{id:group.id,before,limit:100});if(el&&viewport.current?.managed){const box=el.getBoundingClientRect(),scale=box.height/parseFloat(getComputedStyle(el).height)||1,row=Array.from(el.querySelectorAll<HTMLElement>('[data-chat-item]')).find(row=>row.getBoundingClientRect().bottom>box.top);if(row)prependAnchor.current={id:row.dataset.chatItem!,top:(row.getBoundingClientRect().top-box.top)/scale}}mergeHistory(page.messages,order);setBefore(page.nextBefore);if(!viewport.current?.managed)requestAnimationFrame(()=>{if(el)el.scrollTop=top+el.scrollHeight-height})}catch(cause){setError((cause as Error).message)}finally{setOlder(false)}}
 const send=async()=>{
  if(!text.trim()&&!images.length&&!files.length||uploads.pending||sendingRef.current||crossReference.loading)return
  if(localQuoteChanged){setError(uiText('Selected text changed. Choose a new quote.'));return}
  if(replyOrigin.conversation&&!crossReference.reply){setError(uiText('Original message unavailable'));return}
  if(mentionMenu&&/(?:^|\s)@[^\n@]*$/.test(text)){setError('Choose a member from the mention menu before sending.');return}
  sendingRef.current=true;setSending(true);setError('');follow.current=true;viewport.current?.scrollToEnd()
  const draft=draftFor({text,images,files,mentions,replyTo,replyQuote,replyConversation:replyOrigin.conversation,replyTextOnly:replyOrigin.textOnly});draft.viewId??=store.activeTeamViewId??'all';drafts[group.id]=draft
  let cancelMotion:(()=>void)|undefined
  try{
   if(!await messenger.draft(conversation,draft))throw Error('Your draft could not be saved. Try again.')
   if(messenger.getDraft(conversation)?.clientMessageId!==draft.clientMessageId)throw Error('Draft changed before sending. Review it and try again.')
   cancelMotion=prepareMessageSend(draft.text)
   await api.call('chat.send',{id:group.id,...draft,text:draft.text.trim()});cancelMotion=undefined
   if(!await messenger.clearDraft(conversation,draft.clientMessageId)){setError('Message was sent, but its draft could not be cleared.');return}
   if(drafts[group.id]?.clientMessageId===draft.clientMessageId){
    const remaining=messenger.getDraft(conversation)
    if(remaining)drafts[group.id]={...remaining,mentions:remaining.mentions??[],clientMessageId:remaining.clientMessageId??crypto.randomUUID()};else delete drafts[group.id]
    setText(remaining?.text??'');setImages(remaining?.images??[]);setFiles(remaining?.files??[]);setMentions(remaining?.mentions??[]);setReplyTo(remaining?.replyTo);setReplyQuote(remaining?.replyQuote);setReplyOrigin({conversation:remaining?.replyConversation,textOnly:remaining?.replyTextOnly});setReturnToMessage(undefined);follow.current=true
   }
  }catch(cause){cancelMotion?.();setError((cause as Error).message)}finally{sendingRef.current=false;setSending(false);composer.current?.focus()}
 }
 const term=mentionMenu?(text.match(/(?:^|\s)@([^\n@]*)$/)?.[1]??'').toLowerCase():''
 const choices=[{id:'all',title:'All members',group:''},...group.members].filter(member=>member.id==='all'?!term||'all'.includes(term)||uiText('All members').toLowerCase().includes(term):member.title.toLowerCase().includes(term))
 const selectMention=(id:string)=>{const value=id==='all'?'all':mentions==='all'?[id]:[...new Set([...mentions,id])],next=text.replace(/(^|\s)@[^\n@]*$/,'$1');setText(next);setMentions(value);saveDraft(next,value);setMentionMenu(false);composer.current?.focus()}
 return <div className="group-conversation">
  <header className="message-thread-header"><button className="message-back" aria-label={uiText("Back to conversations")} onClick={onBack}><Icon name="arrow-left"/></button><GroupAvatar group={group} store={store}/><button className="group-title" onClick={()=>setEditing(true)}><strong>{group.name}</strong><small>{group.members.length}  {uiText("members · Shared updates, focused work")}</small></button><div className="message-thread-actions"><button data-message-search-trigger aria-label={uiText("Search conversation")} title={uiText("Search conversation · {0} F",[api.platform==='macos'?'⌘':uiText("Ctrl")])} aria-expanded={search} onClick={()=>setSearch(!search)}><Icon name="search"/></button><button aria-label={uiText("Group shared content")} title={uiText("Shared content")} onClick={()=>messenger.setLibrary({conversation})}><Icon name="info"/></button><button className="group-manage" aria-label={uiText("Manage group")} title={uiText("Manage group")} onClick={()=>setEditing(true)}><Icon name="settings-gear"/></button></div></header>
  <MessageSelectionBar conversation={conversation} messages={searchItems}/>
  <PinnedMessages conversation={conversation}/>
  <div className="group-context-note"><Icon name="info"/><span>{uiText("Everyone receives every message. Replies and mentions identify the main participants; public replies are optional.")}</span></div>
  <ConversationSearch conversation={conversation} open={search} onOpen={setSearch} items={searchItems} transcript={transcript} onReveal={async(id,signal)=>{follow.current=false;return await viewport.current?.scrollToMessage(id,{block:'center',signal})??null}} onNavigate={gap=>{follow.current=gap<5;if(gap<5)scrollTarget.current=transcript.current?.scrollTop??null;setAwayFromLatest(gap>80)}}/>
  <MessageGalleryContext.Provider value={{images:galleryImages,history:{conversation}}}><div className="group-transcript" ref={transcript} onScroll={event=>{const el=event.currentTarget;const gap=el.scrollHeight-el.clientHeight-el.scrollTop;if(!conversationJump&&positioned.current&&Math.abs(el.scrollTop-(scrollTarget.current??-Infinity))>1)follow.current=gap<5;if(gap<5&&follow.current)scrollTarget.current=el.scrollTop;setAwayFromLatest(gap>80)}} onWheel={event=>{if(event.deltaY<0)follow.current=false}}>
   {before&&<button className="group-load-older" disabled={older} onClick={()=>void loadOlder()}>{older?uiText("Loading…"):uiText("Load earlier messages")}</button>}
   {!history.length&&<div className="group-empty"><span className="group-avatar large"><Icon name="organization"/></span><h2>{loading?uiText("Loading conversation…"):uiText("Welcome to {0}",[group.name])}</h2><p>{uiText("Share an update, ask a question, or mention a teammate.")}<br/>{uiText("Everyone stays informed. Reply or @mention to address someone.")}</p></div>}
   <MessageViewport items={history} scrollRef={transcript} apiRef={viewport} following={()=>follow.current} onProgrammaticScroll={top=>{scrollTarget.current=top}} renderItem={(message,index)=>messenger.state.messages[messageKey(conversation,message.id)]?.hidden?<div key={message.id} className="message-hidden" data-chat-item={message.id}><Icon name="eye-closed"/>{uiText("Message hidden for you")}<button onClick={()=>void messenger.message(conversation,message.id,{hidden:false})}>{uiText("Show message")}</button></div>:<Fragment key={message.id}>{(!index||new Date(history[index-1].createdAt).toDateString()!==new Date(message.createdAt).toDateString())&&<MessageDate value={message.createdAt}/>}{message.id===firstUnread&&<UnreadDivider earlier={before!==null&&unreadAfter!==null&&history[0].sequence>unreadAfter+1?()=>void loadOlder():undefined} loading={older}/>}<article data-emoji-count={!message.reply&&!message.replyTo&&!message.attachments?.length&&!message.mentions.length?emojiCount(message.text):undefined} data-bubble-group={bubbleGroups.get(message.id)} data-selecting={messenger.selection?.conversation===conversation||undefined} data-selected={messenger.selection?.conversation===conversation&&messenger.selection.ids.includes(message.id)||undefined} onClickCapture={event=>{if(messenger.selection?.conversation===conversation&&!(event.target as Element).closest('.message-select-toggle')){event.preventDefault();event.stopPropagation();messenger.toggleSelection(conversation,message.id)}}} data-chat-item={message.id} className={`group-message ${message.author.kind==='operator'?'from-user':'from-employee'}`} data-group-message={message.id}>
    <MessageCheckbox conversation={conversation} id={message.id}/><div className="group-message-heading"><strong>{message.author.kind==='operator'?uiText('You'):message.authorName}</strong>{message.kind!=='message'&&<span className={`group-kind kind-${message.kind}`}>{uiText(message.kind)}</span>}</div>
    {message.reply?<ReplyPreview reply={message.reply} author={replyAuthor(message.reply,'',names)} onNavigate={()=>void messenger.navigate({conversation:message.reply!.conversation!,id:message.reply!.id,quote:message.reply!.quote},{conversation,id:message.id})}/>:message.replyTo&&<button className="group-reply-link" onClick={()=>messenger.setJump({conversation,id:message.replyTo!,returnTo:message.id,quote:message.replyQuote})}>{uiText("Replying to")} {messageAuthor(message.replyTo)??uiText("an earlier message")}{message.replyQuote&&<small>{message.replyQuote.text}</small>}</button>}
    {!!message.mentions.length&&<div className="group-message-mentions">{message.mentions.map(id=><span key={id}>@{memberName(id)}</span>)}</div>}
    <BlockView english block={{kind:'text',text:message.text}}/><MessageImages group={group.id} paths={(message.attachments??[]).filter(file=>file.kind==='image').map(file=>file.path)} messageId={message.id} caption={message.text}/>{message.attachments?.filter(file=>file.kind==='file').map(file=><MessageFile messageId={message.id} key={file.path} conversation={conversation} file={file}/>)}
    <div className="message-time message-time-with-receipt">{message.editedAt&&<time className="message-edited" dateTime={new Date(message.editedAt).toISOString()} title={new Date(message.editedAt).toLocaleString(interfaceLocale())}>{uiText('Edited')}</time>}<time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString(interfaceLocale(),{hour:'2-digit',minute:'2-digit'})}</time><MessageReceipt deliveries={message.deliveries} memberName={memberName} onOpenRecipient={onPrivate} canOpenRecipient={id=>store.sessions.some(card=>card.id===id&&!card.deleting)}/></div>
    <MessageActions conversation={conversation} id={message.id} images={message.attachments?.length??0} text={message.text} onReply={messageToEdit?undefined:()=>chooseReply(message)} onEdit={message.author.kind==='operator'&&!sending&&!messageToEdit?()=>startEdit(message):undefined}/>{message.author.kind==='agent'&&store.sessions.some(card=>message.author.kind==='agent'&&card.id===message.author.employeeId&&!card.deleting)&&<button className="group-reply-button group-open-private" onClick={()=>message.author.kind==='agent'&&onPrivate(message.author.employeeId)}>{uiText("Open full conversation ↗")}</button>}
    {message.id===newest?.id&&<span className="reply-seen-marker" data-group-read={message.id}/>}
   </article></Fragment>}/>
  </div></MessageGalleryContext.Provider>
  {!messageToEdit&&<QuoteSelection container={transcript} messages={history.map(message=>({id:message.id,source:message.text}))} identity={group.id} onQuote={(id,quote)=>{const message=history.find(message=>message.id===id);if(message)chooseReply(message,quote)}}/>}
  <div className="group-composer" onDragOver={event=>{if([...event.dataTransfer.items].some(item=>item.kind==='file')){event.preventDefault();event.dataTransfer.dropEffect=messageToEdit?'none':'copy'}}} onDrop={event=>{const selected=[...event.dataTransfer.files];if(selected.length){event.preventDefault();event.stopPropagation();if(!messageToEdit)attachFiles(selected)}}}>
   {messenger.navigationReturn?.viewing===conversation?<button className="message-jump-latest message-return-reply" onClick={()=>void messenger.navigate(messenger.navigationReturn!.from,undefined,conversation)}><Icon name="arrow-left"/> {uiText('Back to reply')}</button>:returnToMessage?<button className="message-jump-latest message-return-reply" onClick={()=>{messenger.setJump({conversation,id:returnToMessage});setReturnToMessage(undefined)}}><Icon name="arrow-left"/> {uiText('Back to reply')}</button>:awayFromLatest&&<button className="message-jump-latest" onClick={()=>{follow.current=true;viewport.current?.scrollToEnd();setAwayFromLatest(false)}}><Icon name="arrow-down"/>  {uiText("Latest messages")}</button>}
   {messageToEdit?<EditMessageComposer key={messageToEdit.id} groupId={group.id} message={messageToEdit} onCancel={closeEdit} onSaved={updated=>{setHistory(previous=>previous.map(message=>message.id===updated.id&&(message.editRevision??0)<=(updated.editRevision??0)?updated:message));closeEdit()}}/>:<>
   {error&&<p className="group-error" role="alert">{uiText(error)}</p>}
   {replyTo&&replyOrigin.conversation?<ReplyPreview reply={crossReference.reply} author={crossReference.reply?replyAuthor(crossReference.reply,'',names):uiText('Original message')} unavailable={crossReference.loading?uiText('Loading quoted message…'):crossReference.error?uiText(crossReference.error):undefined} onNavigate={crossReference.reply?()=>void messenger.navigate({conversation:replyOrigin.conversation!,id:replyTo,quote:replyQuote},undefined,conversation):undefined} onElsewhere={crossReference.reply?()=>messenger.setReplyTarget({conversation:replyOrigin.conversation!,id:replyTo,quote:replyQuote,text:crossReference.reply!.text,images:(crossReference.reply!.omittedImages??0)+(crossReference.reply!.omittedFiles??0)}):undefined} onCancel={cancelGroupReply}/>:replyTo&&<MotionStrip className="group-replying"><button className="group-reply-source" aria-label={uiText('Go to original message')} onClick={()=>messenger.setJump({conversation,id:replyTo,quote:replyQuote})}><strong>{replyQuote?uiText("Quoting"):uiText("Replying to")} {messageAuthor(replyTo)??uiText("a message")}</strong><small role={localQuoteChanged?'alert':undefined}>{localQuoteChanged?uiText('Selected text changed. Choose a new quote.'):replyQuote?.text??localReplySource?.text}</small></button><button className="message-reply-elsewhere" aria-label={uiText('Reply in another conversation')} title={uiText('Reply in another conversation')} onClick={()=>messenger.setReplyTarget({conversation,id:replyTo,quote:replyQuote,text:replyQuote?.text??history.find(message=>message.id===replyTo)?.text??'',images:history.find(message=>message.id===replyTo)?.attachments?.length??0})}><Icon name="arrow-swap"/></button><button aria-label={uiText("Cancel group reply")} onClick={cancelGroupReply}>×</button></MotionStrip>}
   {(mentions==='all'||mentions.length>0)&&<div className="group-recipient-chips" aria-label={uiText("Mentioned members")}>{(mentions==='all'?['all']:mentions).map(id=><button key={id} aria-label={uiText("Remove mention {0}",[id==='all'?uiText("All members"):memberName(id)])} onClick={()=>changeMentions(mentions==='all'?[]:mentions.filter(value=>value!==id))}>@{id==='all'?uiText("All members"):memberName(id)} <span>×</span></button>)}</div>}
   <DraftFiles conversation={conversation} images={images} files={files} onRemove={removeAttachment}/><AttachmentTransfers uploads={uploads}/>
   <div className="group-compose-box">
    <input ref={attachmentInput} type="file" multiple hidden aria-label={uiText('Choose attachments')} onChange={event=>{const selected=[...event.target.files??[]];event.target.value='';attachFiles(selected)}}/><button className="message-attach" aria-label={uiText('Attach files')} title={uiText('Attach files')} disabled={sending} onClick={()=>attachmentInput.current?.click()}><Icon name="attach"/></button><VoiceRecorder conversation={conversation} disabled={sending||images.length+files.length+uploads.jobs.length>=16} onRecorded={file=>uploads.add([file])}/>
    {mentionMenu&&<div className="group-mention-menu" role="listbox" aria-label={uiText("Mention group members")}>{choices.map((member,index)=><button role="option" aria-selected={index===mentionIndex} key={member.id} onMouseDown={event=>event.preventDefault()} onClick={()=>selectMention(member.id)}><Icon name={member.id==='all'?'organization':'person'}/><span>{member.id==='all'?uiText('All members'):member.title}<small>{member.id==='all'?uiText("{0} employees",[group.members.length]):member.group+' · '+uiText('Existing conversation')}</small></span></button>)}{!choices.length&&<p>{uiText("No matching members.")}</p>}</div>}
    <textarea ref={composer} onPaste={event=>{const selected=[...event.clipboardData.items].filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter((file):file is File=>!!file);if(selected.length){event.preventDefault();attachFiles(selected)}}} aria-label={uiText("Group message")} placeholder={uiText("Message {0} · type @ to mention",[group.name])} value={text} rows={1} disabled={sending} onChange={event=>changeText(event.target.value)} onKeyDown={event=>{if(event.nativeEvent.isComposing)return;if(mentionMenu&&['ArrowDown','ArrowUp','Enter','Escape'].includes(event.key)){event.preventDefault();event.stopPropagation();if(event.key==='Escape')setMentionMenu(false);else if(event.key==='Enter'&&choices[mentionIndex])selectMention(choices[mentionIndex].id);else setMentionIndex(index=>(index+(event.key==='ArrowUp'?-1:1)+choices.length)%Math.max(1,choices.length));return}if(event.key==='Escape'&&replyTo){event.preventDefault();event.stopPropagation();cancelGroupReply();return}if(event.key==='ArrowUp'&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&editReady.current){event.preventDefault();void editLatest();return}if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send()}}}/>
    <button className="group-send" aria-label={uiText("Send group message")} disabled={sending||uploads.pending||crossReference.loading||localQuoteChanged||!!(replyOrigin.conversation&&!crossReference.reply)||!text.trim()&&!images.length&&!files.length} onClick={()=>void send()}>{sending?<span className="spinner"/>:<Icon name="arrow-up"/>}</button>
   </div>
   <footer><ComposerTools input={composer} value={text} onChange={changeText} disabled={sending}/><button aria-label={uiText("Mention a member")} onClick={()=>{setMentionMenu(!mentionMenu);setMentionIndex(0);composer.current?.focus()}}>{uiText("@ Mention")}</button><button onClick={()=>{changeMentions('all');setMentionMenu(false);composer.current?.focus()}}>{uiText("@ All")}</button><span>{uiText('Everyone receives this · Public replies optional')}</span></footer>
   </>}
  </div>
  {editing&&<GroupEditor group={group} store={store} onClose={()=>setEditing(false)} onSaved={()=>setEditing(false)}/>}
 </div>
}
