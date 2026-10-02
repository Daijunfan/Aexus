import {UnreadDivider} from './chat/UnreadDivider'
import {VoiceRecorder} from './chat/VoiceRecorder'
import {AudioPlaybackProvider} from './chat/AudioPlayback'
import {AudioDock} from './chat/AudioDock'
import {MessageGalleryContext} from './chat/MessageImage'
import {MessageViewport,type MessageViewportHandle} from './chat/MessageViewport'
import {useAttachmentUploads,AttachmentTransfers,DraftFiles} from './chat/MessageAttachments'
import {useReplyReference} from './chat/useReplyReference'
import {QuoteSelection} from './chat/QuoteSelection'
import {highlightQuote} from './chat/quoteTextRange'
import type {MessageQuote} from '../../shared/message-quotes'
import {useComposerHeight} from './chat/useComposerHeight'
import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage,setInterfaceLanguage} from './i18n'
import {MessageSelectionBar} from './components/MessageSelectionBar'
import {ComposerTools} from './components/ComposerTools'
import {PinnedMessages} from './components/PinnedMessages'
import {MessengerContext,useMessengerState} from './components/useMessenger'
import {conversationKey,messageKey,type MessageDraft} from '../../shared/messenger'
import {PlanView} from './components/PlanView'
import {MessageView,MessageHeader,MessageProfile,MessageAvatar} from './components/MessageView'
import {ChannelConversation} from './components/ChannelConversation'
import {useChannelCatalog} from './components/useChannels'
import {GroupConversation,type GroupDraft} from './components/GroupConversation'
import {useChatCatalog} from './components/useChatCatalog'
import {ConversationBody} from './components/ConversationBody'
import {MessageImage} from './chat/MessageImage'
import {ConversationSearch} from './chat/ConversationSearch'
import {MessageDate} from './chat/MessageActions'
import {messageTime,messageReply} from '../../shared/messages'
import {ReplyPreview,replyAuthor} from './chat/ReplyPreview'
import {messageGroups,useMessageMotion} from './chat/messagePresentation'
import {ENGINE_DEFINITIONS} from '../../shared/engines'
import {retainEqual,createRefreshQueue} from './snapshot'
import {employeeReady} from '../../shared/types'
import type {ManagementActivity} from '../../shared/management'
import {employeeActivity} from '../../shared/activity'
import {useReplyRead} from './chat/useReplyRead'
import {Icon} from './components/Icon'
import {AgentApproval} from './components/AgentApproval'
import {EngineTools} from './components/EngineTools'
import {activeModel,modelEfforts,supportsFast,fastTier} from '../../shared/engine-commands'
import {FileWorkspace} from './components/FileWorkspace'
import {EmployeeTerminal} from './components/EmployeeTerminal'
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EFFORT_LEVELS, PERMISSION_MODES,teamSettings,type Item,type Session, type Store, type StoredSession } from '../../shared/types'
import { api } from './api'
import { EngineMark } from './components/EngineMark'
import { HomeView } from './components/HomeView'
import { Dropdown } from './components/Dropdown'
import { Turn } from './chat/Chat'
import { useDialogFocus } from './office/useDialogFocus'
import {DEFAULT_PREFERENCES,readableThemeAccent,resolveViewAppearance,presentationForView} from '../../shared/preferences'
import type { ViewState } from '../../shared/view'
import {SessionTitle} from './components/SessionTitle'
import type {CSSProperties} from 'react'
import { EmployeeForm } from './office/OfficeForms'
import {EmployeeDeleteDialog} from './components/EmployeeDeleteDialog'

const privateDraftContent=(draft:Partial<MessageDraft>)=>JSON.stringify([(draft.text??'').trim(),draft.images??[],draft.files??[],draft.replyTo??null,draft.replyQuote??null,draft.replyConversation??null,!!draft.replyTextOnly])
export default function App() {
  useI18n()

  useEffect(()=>api.rendererReady(),[])
  const [store, setStore] = useState<Store>({ sessions: [], groups: [], rooms: {} })
  useEffect(()=>{if(store.preferences)setInterfaceLanguage(store.preferences.language??DEFAULT_PREFERENCES.language)},[store.preferences?.language])
  const chatCatalog=useChatCatalog(),groupDrafts=useRef<Record<string,GroupDraft>>({})
  const [managementActivity,setManagementActivity]=useState<ManagementActivity>({revision:0,interactions:[]})
  useEffect(()=>{document.documentElement.style.setProperty('--page-zoom',String(store.preferences?.pageZoom??1));if(api.mode==='web')document.documentElement.style.zoom=String(store.preferences?.pageZoom??1)},[store.preferences?.pageZoom])
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedCardId,setSelectedCardId]=useState<string|null>(null)
  const [deletingEmployee,setDeletingEmployee]=useState<string|null>(null)
  const [opening,setOpening]=useState(false),[openError,setOpenError]=useState(''),[savedItems,setSavedItems]=useState<Item[]>([])
  const openSequence=useRef(0)
  const [input, setInput] = useState('')
  const [images,setImages]=useState<string[]>([])
  const [files,setFiles]=useState<string[]>([]),fileDrafts=useRef<Record<string,string[]>>({})
  const imageDrafts=useRef<Record<string,string[]>>({})
  const [returnToMessage,setReturnToMessage]=useState<string|undefined>(undefined)
  const [replyTo,setReplyTo]=useState<string|undefined>(undefined),replyDrafts=useRef<Record<string,string|undefined>>({})
  const [replyQuote,setReplyQuote]=useState<MessageQuote|undefined>(undefined),quoteDrafts=useRef<Record<string,MessageQuote|undefined>>({})
  const [replyOrigin,setReplyOrigin]=useState<{conversation?:string;textOnly?:boolean}>({}),originDrafts=useRef<Record<string,{conversation?:string;textOnly?:boolean}>>({})
  const drafts=useRef<Record<string,string>>({})
  const [sidebarDraft,setSidebarDraft]=useState<number|undefined>(undefined)
  const [error, setError] = useState('')
  const [sendRecovery,setSendRecovery]=useState<{employeeId:string;clientMessageId:string;content:string;error:string}|null>(null)
  const [view,setView]=useState<ViewState>({kind:'home',revision:0})
  const presentation=presentationForView(view),appearance=resolveViewAppearance(store.preferences)[presentation]
  useLayoutEffect(()=>{
    const root=document.documentElement;root.dataset.presentation=presentation;root.dataset.theme=appearance.theme
    root.style.setProperty('--custom-theme-color',appearance.themeColor)
    root.style.setProperty('--custom-theme-accent',readableThemeAccent(appearance.themeColor))
  },[presentation,appearance.theme,appearance.themeColor])
  const messageMode=view.kind==='messages'
  const messenger=useMessengerState(messageMode||view.kind==='conversation'),channelCatalog=useChannelCatalog(messageMode)
  const privateDraftFor=useCallback((id:string,value:Omit<MessageDraft,'updatedAt'>)=>{const previous=messenger.getDraft(conversationKey('employee',id)),same=previous&&privateDraftContent(previous)===privateDraftContent(value);return {...value,clientMessageId:same&&previous.clientMessageId||crypto.randomUUID(),...(same&&previous.viewId?{viewId:previous.viewId}:{})}},[messenger.getDraft])
  const localPrivateDraft=useCallback((id:string)=>({text:drafts.current[id]??'',images:imageDrafts.current[id]??[],files:fileDrafts.current[id]??[],replyTo:replyDrafts.current[id],replyQuote:quoteDrafts.current[id],replyConversation:originDrafts.current[id]?.conversation,replyTextOnly:originDrafts.current[id]?.textOnly}),[])
  const schedulePrivateDraft=useCallback((id:string,value:Omit<MessageDraft,'updatedAt'>)=>{
    const draft=privateDraftFor(id,value)
    drafts.current[id]=draft.text;imageDrafts.current[id]=draft.images??[];fileDrafts.current[id]=draft.files??[];replyDrafts.current[id]=draft.replyTo;quoteDrafts.current[id]=draft.replyQuote;originDrafts.current[id]={conversation:draft.replyConversation,textOnly:draft.replyTextOnly}
    messenger.scheduleDraft(conversationKey('employee',id),draft)
  },[privateDraftFor,messenger.scheduleDraft])
  const jumpScope=messageMode&&view.chatId?conversationKey('group',view.chatId):(messageMode||view.kind==='conversation')&&view.employee?conversationKey('employee',view.employee):undefined
  useEffect(()=>()=>{if(jumpScope)messenger.setJump(current=>current?.conversation===jumpScope?null:current)},[jumpScope,messenger.setJump])
  const [messageSettings,setMessageSettings]=useState(false),[messageProfile,setMessageProfile]=useState(false)
  const [messageSearch,setMessageSearch]=useState(false),[awayFromLatest,setAwayFromLatest]=useState(false)
  const imageInput=useRef<HTMLInputElement>(null),currentEmployee=useRef<string|null>(null),sending=useRef(false)
  const wording=(english:string,chinese:string)=>interfaceLanguage()==='en'?english:chinese
  useEffect(()=>{setMessageSettings(false);setMessageProfile(false);setMessageSearch(false);setAwayFromLatest(false);setReturnToMessage(undefined);messenger.setSelection(null)},[view.employee,view.chatId,view.channelId,view.kind])
  const editingEmployee=!!view.details
  const setEditingEmployee=(enabled:boolean)=>void act('view.details',{enabled})
  const showView=(state:ViewState)=>setView(previous=>state.revision>=previous.revision?state:previous)
  const [menu, setMenu] = useState<'engine' | 'model' | 'perm' | 'effort' | null>(null)
  const [cmdIndex, setCmdIndex] = useState(0)
  const transcript = useRef<HTMLDivElement>(null)
  const messageViewport=useRef<MessageViewportHandle|null>(null)
  const transcriptScroll = useRef<{employee?:string;follow:boolean;targetTop?:number}>({follow:true})
  const composer = useRef<HTMLTextAreaElement>(null)
  const scrollToLatest=useCallback(()=>{const el=transcript.current;if(el){if(messageViewport.current?.managed)messageViewport.current.scrollToEnd();else el.scrollTop=el.scrollHeight;transcriptScroll.current.targetTop=el.scrollTop}},[])
  const revealMessage=useCallback((id:string,signal?:AbortSignal)=>{transcriptScroll.current.follow=false;return messageViewport.current?.scrollToMessage(id,{block:'center',signal})??Promise.resolve(null)},[])
  const liveActive = sessions.find((s) => s.id === activeId)
  const employee=store.sessions.find(c=>c.id===(selectedCardId??liveActive?.cardId))
  const unreadKey=messageMode?employee?.id:undefined
  const [unreadEntry,setUnreadEntry]=useState<{key?:string;id?:string}>({})
  const privatePositioned=useRef(false)
  // A browser clamp while measuring history is not a user choosing to follow the tail.
  const interruptPrivateEntry=()=>{privatePositioned.current=true}
  useEffect(()=>{const id=employee?.lastReply&&!employee.lastReply.readAt?employee.lastReply.itemId:undefined;setUnreadEntry(previous=>previous.key!==unreadKey?{key:unreadKey,id}:!previous.id&&awayFromLatest&&id?{key:unreadKey,id}:previous)},[unreadKey,employee?.lastReply?.id,employee?.lastReply?.readAt,awayFromLatest])
  const active:Session|undefined=liveActive??(employee?{id:employee.id,cardId:employee.id,engine:employee.engine,title:employee.title,group:employee.group,cwd:employee.remote?.directory??employee.cwd,createdAt:employee.createdAt,model:employee.model,effort:employee.effort,permissionMode:employee.permissionMode??'default',thinking:employee.thinking??false,thinkingSupported:employee.engine==='claude',busy:false,items:savedItems,commands:[],models:[]}:undefined)
  useLayoutEffect(()=>{const id=active?.cardId??active?.id;if(transcriptScroll.current.employee!==id){transcriptScroll.current={employee:id,follow:true};privatePositioned.current=false}},[active?.cardId,active?.id])
  useEffect(()=>{
    if(!messenger.ready||!employee||Object.hasOwn(drafts.current,employee.id))return
    const saved=messenger.getDraft(conversationKey('employee',employee.id))
    drafts.current[employee.id]=saved?.text??'';imageDrafts.current[employee.id]=saved?.images??[];fileDrafts.current[employee.id]=saved?.files??[];replyDrafts.current[employee.id]=saved?.replyTo;setReplyTo(saved?.replyTo);quoteDrafts.current[employee.id]=saved?.replyQuote;setReplyQuote(saved?.replyQuote);originDrafts.current[employee.id]={conversation:saved?.replyConversation,textOnly:saved?.replyTextOnly};setReplyOrigin(originDrafts.current[employee.id])
    setInput(saved?.text??'');setImages(saved?.images??[]);setFiles(saved?.files??[])
  },[messenger.ready,employee?.id])
  useEffect(()=>{const intent=messenger.replyIntent;if(!employee||intent?.conversation!==conversationKey('employee',employee.id))return
    replyDrafts.current[employee.id]=intent.source.id;quoteDrafts.current[employee.id]=intent.source.quote;originDrafts.current[employee.id]={conversation:intent.source.conversation,textOnly:intent.textOnly};setReplyTo(intent.source.id);setReplyQuote(intent.source.quote);setReplyOrigin(originDrafts.current[employee.id]);messenger.setReplyIntent(null)
  },[messenger.replyIntent,employee?.id])
  const crossReference=useReplyReference(replyOrigin.conversation,replyTo,replyQuote,replyOrigin.textOnly)
  useEffect(()=>{const el=transcript.current;if(!messageMode||!el)return;const observer=new ResizeObserver(()=>{if(transcriptScroll.current.follow)scrollToLatest();setAwayFromLatest(el.scrollHeight-el.clientHeight-el.scrollTop>80)});observer.observe(el);return()=>observer.disconnect()},[messageMode,active?.id])
  const jumpLoaded=!!active?.items.some(item=>item.id===messenger.jump?.id)
  useLayoutEffect(()=>{
    const target=messenger.jump
    if((!messageMode&&view.kind!=='conversation')||!employee||view.employee!==employee.id||target?.conversation!==conversationKey('employee',employee.id)||!jumpLoaded)return
    const cancellation=new AbortController();let el:HTMLElement|null=null,timer:ReturnType<typeof setTimeout>|undefined,clearQuote=()=>{}
    setReturnToMessage(target.returnTo)
    privatePositioned.current=true;transcriptScroll.current.follow=false
    void messageViewport.current?.scrollToMessage(target.id,{block:'center',signal:cancellation.signal}).then(node=>{
      if(!node||cancellation.signal.aborted)return
      el=node;node.dataset.messageJump='true'
      const source=active?.items.find(item=>item.id===target.id)
      clearQuote=target.quote&&source?highlightQuote(node,source.role==='assistant'?source.blocks.filter(block=>block.kind==='text').map(block=>block.text):source.text,target.quote):()=>{}
      if(transcript.current)transcriptScroll.current.targetTop=transcript.current.scrollTop
      timer=setTimeout(()=>{delete node.dataset.messageJump;clearQuote();messenger.setJump(current=>current===target?null:current)},2400)
    })
    return()=>{cancellation.abort();clearTimeout(timer);clearQuote();if(el)delete el.dataset.messageJump}
  },[messenger.jump,employee?.id,jumpLoaded,messageMode,view.kind,view.employee])
  const privateUnread=messageMode&&employee?.lastReply&&!employee.lastReply.readAt&&!messenger.state.messages[messageKey(conversationKey('employee',employee.id),employee.lastReply.itemId)]?.hidden?employee.lastReply.itemId:undefined
  const privateEntryReady=!!active?.items.length&&(!privateUnread||active.items.some(item=>item.id===privateUnread))
  useLayoutEffect(()=>{
    if(!messageMode||!privateEntryReady||!messenger.ready||privatePositioned.current)return
    if(!privateUnread){privatePositioned.current=true;return}
    const cancellation=new AbortController();transcriptScroll.current.follow=false
    void messageViewport.current?.scrollToMessage(privateUnread,{block:'start',signal:cancellation.signal}).then(node=>{if(node&&!cancellation.signal.aborted)privatePositioned.current=true})
    return()=>cancellation.abort()
  },[employee?.id,messageMode,privateEntryReady,privateUnread,messenger.ready])
  const changeInput=(value:string)=>{setInput(value);if(employee){drafts.current[employee.id]=value;if(messageMode||replyTo)schedulePrivateDraft(employee.id,{text:value,images,files,replyTo,replyQuote,replyConversation:replyOrigin.conversation,replyTextOnly:replyOrigin.textOnly})}}
  const removeImage=(path:string)=>{const next=images.filter(value=>value!==path);setImages(next);if(employee){imageDrafts.current[employee.id]=next;if(messageMode||replyTo)schedulePrivateDraft(employee.id,{text:input,images:next,files,replyTo,replyQuote,replyConversation:replyOrigin.conversation,replyTextOnly:replyOrigin.textOnly})}}
  const closeConversation=()=>void act('view.close')
  const openWorkspace=(details=false)=>employee&&void act('view.open',{kind:'conversation',employee:employee.id,details})
  const chooseReply=useCallback((item:Item,quote?:MessageQuote)=>{
    const id=currentEmployee.current;if(!id||!messageReply(item))return
    messenger.setJump(null);setReturnToMessage(undefined);replyDrafts.current[id]=item.id;setReplyTo(item.id);quoteDrafts.current[id]=quote;setReplyQuote(quote);originDrafts.current[id]={};setReplyOrigin({})
    schedulePrivateDraft(id,{text:drafts.current[id]??'',images:imageDrafts.current[id]??[],files:fileDrafts.current[id]??[],replyTo:item.id,replyQuote:quote})
    composer.current?.focus()
  },[schedulePrivateDraft,messenger.setJump])
  const cancelReply=useCallback(()=>{const id=currentEmployee.current;if(!id)return;replyDrafts.current[id]=undefined;setReplyTo(undefined);quoteDrafts.current[id]=undefined;setReplyQuote(undefined);originDrafts.current[id]={};setReplyOrigin({});schedulePrivateDraft(id,{text:drafts.current[id]??'',images:imageDrafts.current[id]??[],files:fileDrafts.current[id]??[]});composer.current?.focus()},[schedulePrivateDraft])
  const replySource=active?.items.find(item=>item.id===replyTo),localReply=useMemo(()=>{try{return replySource?messageReply(replySource,replyQuote):null}catch{return null}},[replySource,replyQuote]),selectedReply=replyOrigin.conversation?crossReference.reply:localReply
  const authorNames=useMemo(()=>Object.fromEntries(store.sessions.map(card=>[card.id,card.title])),[store.sessions])
  useComposerHeight(composer,input,messageMode,active?.id)
  const searchItems=useMemo(()=>(active?.items??[]).filter(item=>item.role!=='notice').map(item=>({id:item.id,images:item.role==='user'?[...item.images??[],...(item.files??[]).map(file=>file.path)]:[],text:item.role==='assistant'?item.blocks.filter(block=>block.kind==='text').map(block=>block.text).join('\n'):item.text})),[active?.items])
  const galleryImages=useMemo(()=>(active?.items??[]).flatMap(item=>item.role==='user'&&employee&&!messenger.state.messages[messageKey(conversationKey('employee',employee.id),item.id)]?.hidden?(item.images??[]).map(path=>({employee:employee.id,path,messageId:item.id,caption:item.text})):[]),[active?.items,employee?.id,messenger.state.messages])
  const dateMarkers=useMemo(()=>{const result=new Map<string,number>();let day='';for(const item of active?.items??[]){const time=messageTime(item,employee?.lastReply);if(!time)continue;const next=new Date(time).toDateString();if(next!==day){result.set(item.id,time);day=next}}return result},[active?.items,employee?.lastReply])
  const bubbleGroups=useMemo(()=>messageGroups((active?.items??[]).map(item=>({id:item.id,author:item.role==='user'?(item.author?.kind==='agent'?'user:'+item.author.employeeId:'user:'+item.author?.kind):item.role,time:messageTime(item,employee?.lastReply),breakBefore:unreadEntry.key===employee?.id&&unreadEntry.id===item.id,break:item.role==='notice'||item.role==='user'&&(!item.author||!!item.reply)||!!(employee&&messenger.state.messages[messageKey(conversationKey('employee',employee.id),item.id)]?.hidden)}))),[active?.items,employee?.id,employee?.lastReply,messenger.state.messages,unreadEntry])
  const quoteSources=useMemo(()=>(active?.items??[]).filter(item=>item.role!=='notice').map(item=>({id:item.id,source:item.role==='assistant'?item.blocks.filter(block=>block.kind==='text').map(block=>block.text):item.text})),[active?.items])
  const motionItems=useMemo(()=>(active?.items??[]).filter(item=>item.role!=='notice').map(item=>({id:item.id,outgoing:item.role==='user',text:item.role==='user'?item.text:undefined})),[active?.items])
  useDialogFocus('.conversation-dialog', !!active&&!view.pluginId&&!messageMode)
  const busyIds = useMemo(() => new Set(sessions.filter((s) => s.busy).map((s) => s.cardId ?? s.id)), [sessions])
  const disconnectedIds = useMemo(() => new Set(sessions.filter(s=>s.error&&store.sessions.some(card=>card.id===(s.cardId??s.id)&&card.kind==='cloud-native-worker')).map(s=>s.cardId??s.id)),[sessions,store.sessions])
  const activities=useMemo(()=>{
    const live=new Map(sessions.map(session=>[session.cardId??session.id,session]))
    return Object.fromEntries(store.sessions.flatMap(card=>{const value=employeeActivity(card,live.get(card.id));return value?[[card.id,value]]:[]}))
  },[sessions,store.sessions])
  const viewedSession=useRef<string|null>(null)
  const refresh=useMemo(()=>createRefreshQueue(async(configuration,detail)=>{
    const [saved,live]=await Promise.all([configuration?api.call<Store>('session.list'):Promise.resolve(null),api.call<Session[]>('session.list',{live:true,summary:true})])
    const requested=viewedSession.current
    const snapshot=detail&&requested&&live.some(item=>item.id===requested)?await api.call<Session>('session.snapshot',{id:requested}):undefined
    if(saved)setStore(previous=>retainEqual(previous,saved))
    setSessions(previous=>{
      const byId=new Map(previous.map(item=>[item.id,item])),showing=viewedSession.current
      const next=live.map(item=>{
        if(item.id===showing){
          if(snapshot?.id===showing)return retainEqual(byId.get(item.id),snapshot)
          const old=byId.get(item.id);if(old)item={...item,items:old.items}
        }
        return retainEqual(byId.get(item.id),item)
      })
      return retainEqual(previous,next)
    })
  }),[])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let configuration=false,conversation=false
    const schedule = (full=false,detail=false) => {
      configuration ||= full;conversation ||= detail
      if (timer) return
      timer = setTimeout(() => { timer = undefined; const full=configuration,detail=conversation;configuration=false;conversation=false;void refresh(full,detail).catch((e) => setError(String(e))) }, 35)
    }
    const showActivity=(state:ManagementActivity)=>setManagementActivity(previous=>state.revision>=previous.revision?state:previous)
    const off = api.onEvent(event=>{if(event.channel==='management:activity')showActivity(event.payload);else if(event.channel==='view:changed')showView(event.payload);else if(!event.channel.startsWith('terminal:')&&!['plugin:windows','host:health','desktop:visibility','messenger:changed','client:authentication'].includes(event.channel))schedule(event.channel==='store:changed'||event.channel==='hosts:changed',!!viewedSession.current&&event.payload?.sessionId===viewedSession.current)})
    void api.call<ManagementActivity>('management.activity').then(showActivity).catch(e=>setError(String(e)))
    void api.call<ViewState>('view.get').then(showView).catch(e=>setError(String(e)))
    void refresh().catch((e) => setError(String(e)))
    return () => { off(); clearTimeout(timer) }
  }, [refresh])
  const act = useCallback(async (cmd: string, args?: Record<string, unknown>) => {
    try { setError(''); const result = await api.call(cmd, args); await refresh(true,/^(session|config|approval|commands)\./.test(cmd)); return result }
    catch (e) { setError(String(e)); return undefined }
  }, [refresh])
  useEffect(()=>{
    let zoom=store.preferences?.pageZoom??1
    const key=(e:KeyboardEvent)=>{if(e.defaultPrevented||document.querySelector('.message-image-dialog,.message-media:fullscreen'))return;if((e.metaKey||e.ctrlKey)&&['+','=','-','0'].includes(e.key)){
      e.preventDefault();e.stopPropagation()
      zoom=e.key==='0'?1:Math.max(.75,Math.min(1.5,Math.round((zoom+(e.key==='-'?-.1:.1))*100)/100))
      void act('settings.set',{pageZoom:zoom})
    }}
    window.addEventListener('keydown',key,true)
    return()=>window.removeEventListener('keydown',key,true)
  },[store.preferences?.pageZoom,act])
  const openCard = async (card: StoredSession) => {
    if(!employeeReady(card)){await act('view.open',{kind:'initialization',employee:card.id});return}
    const sequence=++openSequence.current
    currentEmployee.current=card.id
    const saved=messenger.getDraft(conversationKey('employee',card.id))
    viewedSession.current=null;setSelectedCardId(card.id);setActiveId(null);setInput(drafts.current[card.id]??saved?.text??'');setImages(imageDrafts.current[card.id]??saved?.images??[]);setFiles(fileDrafts.current[card.id]??saved?.files??[]);fileDrafts.current[card.id]??=saved?.files??[];setReplyTo(Object.hasOwn(drafts.current,card.id)?replyDrafts.current[card.id]:saved?.replyTo);setReplyQuote(Object.hasOwn(drafts.current,card.id)?quoteDrafts.current[card.id]:saved?.replyQuote);setReplyOrigin(Object.hasOwn(drafts.current,card.id)?originDrafts.current[card.id]??{}:{conversation:saved?.replyConversation,textOnly:saved?.replyTextOnly});setMenu(null);setSavedItems([]);setOpenError(card.workspaceError??'');setOpening(!card.workspaceError)
    void api.call<{items:Item[]}>('session.transcript',{id:card.id}).then(data=>{if(sequence===openSequence.current)setSavedItems(data.items)}).catch(()=>{})
    if(card.workspaceError)return
    try{const opened=await api.call('session.open',{cardId:card.id});if(sequence===openSequence.current)viewedSession.current=opened.sessionId;await refresh(false);if(sequence===openSequence.current)setActiveId(opened.sessionId)
    }
    catch(error){if(sequence===openSequence.current)setOpenError((error as Error).message)}
    finally{if(sequence===openSequence.current)setOpening(false)}
  }
  useEffect(()=>{
    if((view.kind==='conversation'||view.kind==='messages')&&view.employee){const card=store.sessions.find(c=>c.id===view.employee);if(card)void openCard(card)}
    else {openSequence.current++;currentEmployee.current=null;viewedSession.current=null;setActiveId(null);setSelectedCardId(null);setOpenError('');setOpening(false);setMenu(null)}
  },[view.kind,view.employee,store.sessions.some(c=>c.id===view.employee)])
  const persistAttachments=(id:string)=>schedulePrivateDraft(id,localPrivateDraft(id))
  const attachFor=(id:string,path:string,kind:'image'|'file'='image')=>{const target=kind==='image'?imageDrafts:fileDrafts,next=[...new Set([...(target.current[id]??[]),path])];target.current[id]=next;persistAttachments(id);if(currentEmployee.current===id)(kind==='image'?setImages:setFiles)(next)}
  const attachImage=(path:string)=>{if(employee)attachFor(employee.id,path)}
  const uploads=useAttachmentUploads(employee?conversationKey('employee',employee.id):'',(conversation,path,kind)=>attachFor(conversation.slice(9),path,kind),images.length+files.length)
  const pasteImages=(selected:File[])=>{if(!employee)return;try{uploads.add(selected)}catch(cause){setError((cause as Error).message)}}
  const removeAttachment=(path:string)=>{if(!employee)return;if(images.includes(path))removeImage(path);else{const next=files.filter(file=>file!==path);fileDrafts.current[employee.id]=next;setFiles(next);persistAttachments(employee.id)}}
  const send = async (value=input,newRequest=false) => {
    if (sending.current || uploads.pending || !liveActive || !active || (!value.trim()&&!images.length&&!files.length)) return
    if(crossReference.loading)return
    if(replyTo&&value.trim().startsWith('/')){setError(uiText('Cancel the reply before running a command.'));return}
    if(replyTo&&!selectedReply){setError(uiText(replySource&&replyQuote?'Selected text changed. Choose a new quote.':'Original message unavailable. Cancel this reply to send a new message.'));return}
    const text=value.trim(),id=employee?.id,conversation=id?conversationKey('employee',id):undefined,slash=text.startsWith('/'),attached=slash?[]:images,snapshot=id?privateDraftFor(id,{text:input,images,files,replyTo,replyQuote,replyConversation:replyOrigin.conversation,replyTextOnly:replyOrigin.textOnly}):undefined,persistent=!!conversation&&(!slash||messageMode||!!replyTo||!!messenger.getDraft(conversation))
    if(newRequest){if(slash||!snapshot||!sendRecovery||sendRecovery.employeeId!==id||messenger.getDraft(conversation!)?.clientMessageId!==sendRecovery.clientMessageId||privateDraftContent(snapshot)!==sendRecovery.content)return;snapshot.clientMessageId=crypto.randomUUID();delete snapshot.viewId}
    if(snapshot&&!slash&&employee?.managementRole==='governor')snapshot.viewId??=store.activeTeamViewId??'all'
    if(id&&snapshot){drafts.current[id]=snapshot.text;imageDrafts.current[id]=snapshot.images??[];fileDrafts.current[id]=snapshot.files??[];replyDrafts.current[id]=snapshot.replyTo;quoteDrafts.current[id]=snapshot.replyQuote;originDrafts.current[id]={conversation:snapshot.replyConversation,textOnly:snapshot.replyTextOnly}}
    sending.current=true;setError('');setSendRecovery(null)
    transcriptScroll.current.follow=true;scrollToLatest();setAwayFromLatest(false)
    let cancelMotion:(()=>void)|undefined
    try{
      if(persistent&&snapshot){
        if(!await messenger.draft(conversation!,snapshot))throw Error('Your draft could not be saved. Try again.')
        if(messenger.getDraft(conversation!)?.clientMessageId!==snapshot.clientMessageId)throw Error('Draft changed before sending. Review it and try again.')
      }
      cancelMotion=messageMode&&!active.busy&&!slash?prepareMessageSend(text):undefined
      const sent=await api.call(active.busy?'session.enqueue':'session.send',{id:active.id,text,images:attached,files:slash?[]:files,replyTo,replyQuote,replyConversation:replyOrigin.conversation,replyTextOnly:replyOrigin.textOnly,...(!slash&&snapshot?{clientMessageId:snapshot.clientMessageId}:{}),...(employee?.managementRole==='governor'?{viewId:slash?store.activeTeamViewId??'all':snapshot?.viewId}:{})})
      if(!sent||sent.sent===false){cancelMotion?.();return}
      cancelMotion=undefined
      const retained=slash&&id&&(images.length||files.length)?privateDraftFor(id,{text:'',images,files}):undefined
      const cleared=!persistent||await messenger.draft(conversation!,retained??{text:''},snapshot!.clientMessageId)
      if(!cleared)setError(uiText('Message was sent, but its draft could not be cleared.'))
      const remaining=persistent?messenger.getDraft(conversation!):retained
      if(cleared&&id&&snapshot&&privateDraftContent(localPrivateDraft(id))===privateDraftContent(snapshot)){
        drafts.current[id]=remaining?.text??'';imageDrafts.current[id]=remaining?.images??[];fileDrafts.current[id]=remaining?.files??[];replyDrafts.current[id]=remaining?.replyTo;quoteDrafts.current[id]=remaining?.replyQuote;originDrafts.current[id]={conversation:remaining?.replyConversation,textOnly:remaining?.replyTextOnly}
        if(currentEmployee.current===id){transcriptScroll.current.follow=true;setAwayFromLatest(false);setInput(drafts.current[id]);setImages(imageDrafts.current[id]);setFiles(fileDrafts.current[id]);setReplyTo(remaining?.replyTo);setReplyQuote(remaining?.replyQuote);setReplyOrigin(originDrafts.current[id]);setReturnToMessage(undefined);if(text==='/model')setMenu('model');if(text==='/effort')setMenu('effort');if(['/permissions','/approvals'].includes(text))setMenu('perm')}
      }
      // A refresh failure cannot turn an accepted send into an apparent transport failure.
      await refresh(true,true).catch(cause=>setError(String(cause)))
    }catch(cause){
      cancelMotion?.();const code=(cause as {code?:string}).code,recovery=code==='PRIVATE_SEND_UNCERTAIN'?'The previous request could not be confirmed. Review the conversation before starting a new request.':code==='PRIVATE_SEND_INTERRUPTED'?'The previous queue was interrupted. Review the conversation before starting a new request.':undefined,message=uiText(recovery??(cause as Error).message??String(cause));setError(message)
      if(id&&snapshot&&recovery)setSendRecovery({employeeId:id,clientMessageId:snapshot.clientMessageId,content:privateDraftContent(snapshot),error:message})
    }finally{sending.current=false;if(currentEmployee.current===id)composer.current?.focus()}
  }

  const showEmployee=useCallback((card:StoredSession)=>void act('view.open',{kind:'conversation',employee:card.id}),[act])
  const activeSendRecovery=sendRecovery&&sendRecovery.error===error&&view.employee===sendRecovery.employeeId&&(view.kind==='messages'||view.kind==='conversation')&&messenger.getDraft(conversationKey('employee',sendRecovery.employeeId))?.clientMessageId===sendRecovery.clientMessageId&&privateDraftContent({text:input,images,files,replyTo,replyQuote,replyConversation:replyOrigin.conversation,replyTextOnly:replyOrigin.textOnly})===sendRecovery.content
  const stop = () => active && act('session.interrupt', { id: active.id,expectedMessageId:active.currentTask?.messageId })
  const configure = (cmd: string, args: Record<string, unknown>) => active && act(cmd, { id: active.id, ...args })
  useLayoutEffect(() => {
    const el = transcript.current
    if (el&&transcriptScroll.current.follow) scrollToLatest()
    if(el&&messageMode)setAwayFromLatest(el.scrollHeight-el.clientHeight-el.scrollTop>80)
  }, [active?.cardId, active?.id, active?.items, active?.busy,unreadEntry.id])
  const prepareMessageSend=useMessageMotion({conversation:messageMode?employee?.id:undefined,ready:messageMode&&!opening&&!!liveActive,items:motionItems,transcript,composer,following:()=>transcriptScroll.current.follow})
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!e.defaultPrevented && e.key === 'Escape' && active && !(e.target as HTMLElement)?.closest('.xterm')) {if(replyTo)cancelReply();else closeConversation()}
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [active?.id, active?.busy, act, replyTo, cancelReply])
  const commands = useMemo(() => {
    if (!active || replyTo || !input.startsWith('/') || /\s/.test(input)) return []
    const term = input.slice(1).toLowerCase()
    return active.commands.filter((c) => !active.terminalCommands?.includes(c.name))
      .filter((c) => c.name.includes(term) || c.aliases?.some(a=>a.includes(term)) || c.description.toLowerCase().includes(term))
  }, [active, input, replyTo])
  useEffect(() => setCmdIndex(0), [input])
  const permissions = active?.engine === 'codex' ? [
    { value: 'default', label: 'Read only', hint: 'Inspect files; no file changes' },
    { value: 'acceptEdits', label: 'Workspace write', hint: 'Allow edits within this workspace' },
    { value: 'bypassPermissions', label: 'Full access', hint: 'Run without sandbox restrictions' }
  ] : PERMISSION_MODES.filter(p=>!active||!['cline','pi'].includes(active.engine)||p.value!=='auto'&&(p.value!=='plan'||active.engine==='cline'))
  const model=active?activeModel(active.models,active.model):undefined
  const efforts=active?modelEfforts(active.engine,model):[]
  const fastAvailable=active?supportsFast(active.engine,model):false
  const modelLabel = active?.models.find((m) => m.value === active.model)?.displayName ?? active?.model ?? 'Configured model'
  const work=!!employee&&teamSettings(store,employee.group).mode==='work'
  useReplyRead(transcript,employee?.id,employee?.lastReply,(view.kind==='conversation'||messageMode)&&(!messageMode||messenger.ready)&&!messageProfile&&!messenger.library&&!editingEmployee&&!view.tools&&!active?.busy&&!!active?.items.some(item=>item.id===employee?.lastReply?.itemId),view.kind)
  useEffect(()=>{document.querySelector('.commands [aria-selected="true"]')?.scrollIntoView({block:'nearest'})},[cmdIndex,input])
  const conversation=(view.kind==='conversation'||messageMode&&!!view.employee)&&active && (!employee||employeeReady(employee)) && <div className={messageMode?`message-conversation ${messageSettings?'message-controls-open':''}`:'conversation-layer'}>
      {!messageMode&&<div className="conversation-backdrop" onClick={closeConversation} />}
      <section className="conversation-dialog" role={messageMode?'region':'dialog'} aria-modal={messageMode?undefined:!view.shared&&!view.pluginId} aria-label={messageMode?uiText("Conversation with {0}",[active.title]):uiText("Conversation with {0}",[active.title])}>
      <main className="main session-main">
        {messageMode&&employee?<MessageHeader employee={employee} session={liveActive} opening={opening} settings={messageSettings} search={messageSearch} onSearch={()=>setMessageSearch(!messageSearch)} onSettings={()=>setMessageSettings(!messageSettings)} onBack={closeConversation} onWorkspace={()=>openWorkspace()} onProfile={()=>setMessageProfile(!messageProfile)}/>:<header className="toolbar">
          {editingEmployee&&<button className="inspector-back" onClick={()=>setEditingEmployee(false)}><Icon name="arrow-left"/>  {uiText("Back to conversation")}</button>}
          <button className="back" title={uiText("Close conversation and keep working")} aria-label={uiText("Close conversation")} onClick={closeConversation}><Icon name="close"/></button>
          <span className="session-heading"><EngineMark engine={active.engine} size={20} /><SessionTitle title={employee?.title??active.title}/><small className="execution-badge" title={employee?.remote?.host}>{employee?.kind==='cloud-native-worker'?uiText("Cloud Native Worker"):uiText("Local Worker")}</small></span>
          <button className="employee-details" hidden={editingEmployee} onClick={() => setEditingEmployee(true)}>{uiText("Employee details")}</button>
          <button className="engine-tools-open" disabled={!liveActive} onClick={()=>void act('view.tools',{section:'skills'})}>{uiText("Tools and usage")}</button>
          <button className="employee-clone" disabled={!ENGINE_DEFINITIONS[active.engine].capabilities.clone||active.busy||!!active.approvals?.length||!!active.pendingMessages?.length} onClick={()=>void act('view.open',{kind:'clone',employee:employee?.id??active.cardId})}>{uiText("Clone employee")}</button>
          <span className="session-state"><i className={active.busy?'working':employee?.kind==='cloud-native-worker'&&active.error?'disconnected':''} />{active.busy?uiText("Working"):employee?.kind==='cloud-native-worker'&&active.error?uiText("Connection or execution failed"):uiText("Resting")}</span>
          <button className="close-session" disabled={!employee} onClick={()=>setDeletingEmployee(employee!.id)} title={uiText("Delete employee and conversation")}>{uiText("Delete conversation")}</button>
        </header>}
        {messageMode&&employee&&<MessageSelectionBar conversation={conversationKey('employee',employee.id)} messages={searchItems}/>}
        {messageMode&&employee&&<PinnedMessages conversation={conversationKey('employee',employee.id)}/>}
        {employee&&deletingEmployee===employee.id&&<EmployeeDeleteDialog employee={employee} onCancel={()=>setDeletingEmployee(null)} onRemove={async deleteWorkspace=>{await api.call('card.remove',{id:employee.id,deleteWorkspace});setDeletingEmployee(null);setSelectedCardId(null);setActiveId(null);await act('view.close')}}/>}
        {!!active.approvals?.length&&<div className="agent-requests">{active.approvals?.map(p=><AgentApproval key={p.id} english={messageMode} approval={p} respond={async(decision,answers,form)=>{await api.call('approval.respond',{id:active.id,requestId:p.id,decision,answers,form});await refresh()}}/>)}</div>}
        {view.tools&&liveActive?<EngineTools id={active.id} section={view.tools} onSection={section=>void act('view.tools',{section})} onClose={()=>void act('view.tools',{section:null})}/>:editingEmployee && employee ? <div className="employee-inspector"><EmployeeForm employee={employee} groups={store.groups} roots={store.teamRoots ?? {}} settings={store.teamSettings} onSave={async (fields) => {
          const {teamRoot,...patch}=fields
          if(teamRoot&&teamRoot!==store.teamRoots?.[fields.group])await api.call('group.root',{name:fields.group,root:teamRoot,create:true})
          const updated=await api.call<Store>('card.update', { id: employee.id, patch })
          await refresh()
          const saved=updated.sessions.find(c=>c.id===employee.id)
          if(!saved)throw new Error('员工已被移除，请重新选择员工')
          setEditingEmployee(false);await openCard(saved);return true
        }} onBound={async saved=>{await refresh();setEditingEmployee(false);await openCard(saved)}} /></div> : <ConversationBody messages={messageMode} explorerWidth={store.preferences?.explorerWidth} terminalHeight={store.preferences?.terminalHeight} onAttachImage={attachImage} key={'body-'+(employee?.id??active.id)} employee={employee?.id??active.cardId??active.id}>
        {openError&&<div className="conversation-repair" role="alert"><span>{openError}</span><button onClick={()=>setEditingEmployee(true)}>{wording('Workspace settings','配置工作目录')}</button>{!employee?.workspaceError&&<button onClick={()=>employee&&void openCard(employee)}>{wording('Reconnect','重试连接')}</button>}</div>}
        {liveActive?<div className="session-settings controls">
          <span className="engine-readonly" data-control="engine" title={wording('The engine is fixed for this employee','引擎创建后固定；如需更换，请删除员工后重新添加')}>{ENGINE_DEFINITIONS[active.engine].label}</span>
          <Dropdown control="model" open={menu === 'model'} onToggle={() => setMenu(menu === 'model' ? null : 'model')} onClose={() => setMenu(null)} label={modelLabel} width={330}>
            {active.models.map((m) => <button className={`menu-item col ${m.value === active.model ? 'sel' : ''}`} key={m.value} disabled={active.busy} onClick={() => { setMenu(null); void configure('config.model', { model: m.value }) }}><span className="menu-name">{m.value === active.model ? '✓ ' : ''}{m.displayName}</span><span className="menu-desc">{m.description||m.value}</span></button>)}
            {!active.models.length && <div className="menu-item">{uiText("Loading models…")}</div>}
          </Dropdown>
          {work||employee?.remote&&employee.kind!=='cloud-native-worker'?<span className="work-permission" title={active.cwd}>{employee?.remote?uiText("SSH · {0}",[employee.remote.host]):wording('Work · Current workspace','Work · 当前目录及子目录')}</span>:<Dropdown control="perm" open={menu === 'perm'} onToggle={() => setMenu(menu === 'perm' ? null : 'perm')} onClose={() => setMenu(null)} label={permissions.find((p) => p.value === active.permissionMode)?.label ?? active.permissionMode} width={310}>
            {permissions.map((p) => <button key={p.value} className={`menu-item col ${p.value === active.permissionMode ? 'sel' : ''}`} onClick={() => { setMenu(null); void configure('config.permission', { mode: p.value }) }}><span className="menu-name">{uiText(p.label)}</span><span className="menu-desc">{uiText(p.hint)}</span></button>)}
          </Dropdown>}
          {ENGINE_DEFINITIONS[active.engine].capabilities.effort&&<Dropdown control="effort" open={menu === 'effort'} onToggle={() => setMenu(menu === 'effort' ? null : 'effort')} onClose={() => setMenu(null)} label={`${wording('Reasoning','思考')} · ${uiText(active.effort ?? 'Default')}`} width={190}>
            <button className="menu-item" onClick={() => { setMenu(null); void configure('config.effort', { effort: 'default' }) }}>{uiText("Default")}</button>
            {efforts.map(value=><button key={value} className={`menu-item ${value===active.effort?'sel':''}`} onClick={()=>{setMenu(null);void configure('config.effort',{effort:value})}}>{uiText(value)}</button>)}
          </Dropdown>}
          {(active.engine==='cline'||active.engine==='pi')&&<span className="work-permission">{uiText("Thinking off")}</span>}
          {active.thinkingManaged&&<span className="ctl-label">{uiText("Provider-controlled reasoning")}</span>}
          {active.engine==='claude'&&<button className={`toggle ${active.thinking?'on':''}`} disabled={active.busy||!active.thinkingSupported} onClick={()=>void configure('config.thinking',{enabled:!active.thinking})}>{uiText("Thinking")} {active.thinking?uiText("on"):uiText("off")}</button>}
          {ENGINE_DEFINITIONS[active.engine].capabilities.plan&&<button className={`toggle ${active.planMode?'on':''}`} data-control="plan" aria-pressed={!!active.planMode} disabled={active.busy} onClick={()=>void configure('config.plan',{enabled:!active.planMode})}>{active.planMode?wording('Plan mode','计划模式'):wording('Act mode','执行模式')}</button>}
          {employee?.remote&&employee.kind!=='cloud-native-worker'&&active.engine==='codex'&&<button className={`toggle ${active.remoteAdmin?'on':''}`} data-control="remote-admin" aria-pressed={!!active.remoteAdmin} disabled={active.busy} title={wording('Allow administration only on the remote host','仅在远端使用 SSH 用户权限访问硬件和管理服务；不会授权本机执行')} onClick={()=>void configure('config.remote-admin',{enabled:!active.remoteAdmin})}>{active.remoteAdmin?wording('Remote administration: on','远端主机管理：已授权'):wording('Remote administration: off','远端主机管理：关闭')}</button>}
          {(fastAvailable||active.fastMode)&&<button className={`toggle ${active.fastMode?'on':''}`} data-control="fast" aria-label={wording('Fast mode','Fast 模式')} aria-pressed={!!active.fastMode} disabled={active.busy} onClick={()=>void configure('config.fast',{enabled:!active.fastMode})} title={active.fastModeDisabledReason?uiText("Fast status: {0}",[active.fastModeDisabledReason]):fastTier(model)?.description??uiText("Official Fast mode uses more quota when enabled")}>⚡ {active.fastMode?'Fast'+(fastTier(model)?.description.match(/(\d+(?:\.\d+)?)x/)?.[1]?' · '+fastTier(model)!.description.match(/(\d+(?:\.\d+)?)x/)![1]+'×':''):uiText("Standard")}{active.fastModeState==='cooldown'?wording(' · Cooling down',' · 冷却中'):''}</button>}
          <span className="cwd" title={active.cwd}>{active.cwd}</span>
        </div>:<div className="session-opening">{opening?wording('Connecting…','正在连接员工…'):wording('Conversation opened. Check the workspace to start messaging.','会话已打开，配置有效工作目录后即可开始。')}</div>}
        {active.busy&&active.currentTask&&<div className="task-provenance" data-message-id={active.currentTask.messageId}>{wording('Task','任务')} {active.currentTask.messageId.slice(-6)} · {wording('From','来自')} {active.currentTask.delegation.requestedBy.kind==='operator'?wording('You','用户'):store.sessions.find(card=>active.currentTask!.delegation.requestedBy.kind==='agent'&&card.id===active.currentTask!.delegation.requestedBy.employeeId)?.title??uiText("Agent")}{active.currentTask.runId?wording(' · Scheduled task',' · 定时任务'):''}{active.currentTask.viewId?wording(' · Target view: ',' · 目标视图：')+(active.currentTask.viewId==='all'?'All Team':store.teamViews?.find(view=>view.id===active.currentTask!.viewId)?.name??wording('Removed','已删除')):''}</div>}
        {messageMode&&<ConversationSearch conversation={employee?conversationKey('employee',employee.id):undefined} key={employee?.id} open={messageSearch} onOpen={setMessageSearch} items={searchItems} transcript={transcript} onReveal={revealMessage} onNavigate={gap=>{transcriptScroll.current.follow=gap<4;if(gap<4)transcriptScroll.current.targetTop=transcript.current?.scrollTop;setAwayFromLatest(gap>80)}}/>}
        <MessageGalleryContext.Provider value={{images:galleryImages,history:employee?{conversation:conversationKey('employee',employee.id)}:undefined}}><div className="transcript" ref={transcript} onScroll={event=>{const el=event.currentTarget,gap=el.scrollHeight-el.clientHeight-el.scrollTop;if(Math.abs(el.scrollTop-(transcriptScroll.current.targetTop??-Infinity))>1&&(!messageMode||privatePositioned.current||gap>=4)){transcriptScroll.current.follow=gap<4;if(gap<4)transcriptScroll.current.targetTop=el.scrollTop};if(messageMode)setAwayFromLatest(gap>80)}} onPointerDown={interruptPrivateEntry} onTouchStart={interruptPrivateEntry} onKeyDown={event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)&&!(event.target as Element).closest('input,textarea,[contenteditable=true]'))interruptPrivateEntry()}} onWheel={event=>{interruptPrivateEntry();if(event.deltaY<0&&event.currentTarget.scrollTop>0)transcriptScroll.current.follow=false}}>
          {!active.items.length && <div className="conversation-empty">{messageMode&&employee?<MessageAvatar employee={employee} large/>:<EngineMark engine={active.engine} size={48}/>}<div className="panel-eyebrow">{uiText("YOUR NEXT IDEA STARTS HERE")}</div><h1>{messageMode?uiText("Message {0}",[active.title]):uiText("What are we building?")}</h1><p>{liveActive?(messageMode?`${active.title} is ready. What would you like to work on?`:`${active.title} 已就绪，说说接下来要做什么。`):opening?wording('Connecting to the workspace…','正在连接工作环境…'):wording('Check the workspace to begin.','检查工作目录后，就可以开始对话。')}</p></div>}
          <MessageViewport key={employee?.id??active.id} items={active.items} scrollRef={transcript} apiRef={messageViewport} enabled={messageMode} following={()=>transcriptScroll.current.follow} onProgrammaticScroll={top=>{transcriptScroll.current.targetTop=top}} renderItem={(item) => <Fragment key={item.id}>{messageMode&&dateMarkers.has(item.id)&&<MessageDate value={dateMarkers.get(item.id)!}/>}{messageMode&&unreadEntry.key===employee?.id&&unreadEntry.id===item.id&&!messenger.state.messages[messageKey(conversationKey('employee',employee!.id),item.id)]?.hidden&&<UnreadDivider reply/>}<Turn item={item} bubbleGroup={messageMode?bubbleGroups.get(item.id):undefined} onReply={messageMode?chooseReply:undefined} conversationEmployee={employee?.id} requestAuthor={item.role==='user'&&item.author?.kind==='agent'?authorNames[item.author.employeeId]??uiText('Former teammate'):undefined} replyAuthor={item.role==='user'&&item.reply?replyAuthor(item.reply,employee?.title??uiText('Teammate'),authorNames):undefined} messageEmployee={messageMode?employee?.id:undefined} timestamp={messageMode?messageTime(item,employee?.lastReply):undefined} replyId={item.id===employee?.lastReply?.itemId?employee.lastReply.id:undefined} /></Fragment>}/>
          {active.error && <div className="error">{active.error}</div>}
        </div></MessageGalleryContext.Provider>
        {messageMode&&<QuoteSelection container={transcript} messages={quoteSources} identity={employee?.id} onQuote={(id,quote)=>{const item=active.items.find(item=>item.id===id);if(item)chooseReply(item,quote)}}/>}
        <div className="composer" onDragOver={event=>{if(messageMode&&Array.from(event.dataTransfer.items).some(item=>item.kind==='file')){event.preventDefault();event.dataTransfer.dropEffect='copy'}}} onDrop={event=>{if(!messageMode)return;const files=Array.from(event.dataTransfer.files);if(files.length){event.preventDefault();event.stopPropagation();void pasteImages(files)}}}>
          {activeSendRecovery&&<div className="private-send-recovery" role="alert"><p>{sendRecovery.error}</p><button onClick={()=>void send(input,true)}>{uiText('Send as a new request')}</button></div>}
          {messageMode&&employee&&messenger.navigationReturn?.viewing===conversationKey('employee',employee.id)?<button className="message-jump-latest message-return-reply" onClick={()=>void messenger.navigate(messenger.navigationReturn!.from,undefined,conversationKey('employee',employee.id))}><Icon name="arrow-left"/> {uiText('Back to reply')}</button>:messageMode&&returnToMessage&&employee?<button className="message-jump-latest message-return-reply" onClick={()=>{messenger.setJump({conversation:conversationKey('employee',employee.id),id:returnToMessage});setReturnToMessage(undefined)}}><Icon name="arrow-left"/> {uiText('Back to reply')}</button>:messageMode&&awayFromLatest&&<button className="message-jump-latest" onClick={()=>{transcriptScroll.current.follow=true;scrollToLatest();setAwayFromLatest(false)}}><Icon name="arrow-down"/>  {uiText("Latest messages")}</button>}
          {replyTo&&employee&&<ReplyPreview reply={selectedReply} author={selectedReply?replyAuthor(selectedReply,employee.title,authorNames):uiText('Original message')} unavailable={crossReference.loading?uiText('Loading quoted message…'):replyOrigin.conversation&&crossReference.error?uiText(crossReference.error):replySource&&replyQuote&&!selectedReply?uiText('Selected text changed. Choose a new quote.'):undefined} onNavigate={selectedReply?()=>replyOrigin.conversation?void messenger.navigate({conversation:replyOrigin.conversation,id:replyTo,quote:replyQuote},undefined,conversationKey('employee',employee.id)):messenger.setJump({conversation:conversationKey('employee',employee.id),id:replyTo,quote:replyQuote}):undefined} onElsewhere={selectedReply?()=>messenger.setReplyTarget({conversation:replyOrigin.conversation??conversationKey('employee',employee.id),id:replyTo,quote:replyQuote,text:selectedReply.text,images:(selectedReply.images?.length??selectedReply.omittedImages??0)+(selectedReply.files?.length??selectedReply.omittedFiles??0)}):undefined} onCancel={cancelReply}/>}
          {employee&&<DraftFiles conversation={conversationKey('employee',employee.id)} images={images} files={files} onRemove={removeAttachment}/>}<AttachmentTransfers uploads={uploads}/>
          {!!active.pendingMessages?.length&&<div className="pending-messages" aria-label={wording('Queued messages','待发送消息')}>{active.pendingMessages.map(message=>{const source=active.items.find(item=>item.id===message.replyTo),reference=message.crossReply??(source?messageReply(source):null);return <div key={message.id}><span>{message.replyTo&&<small className="pending-message-reply"><Icon name="reply"/>{uiText('Replying to {0}',[reference?replyAuthor(reference,employee?.title??uiText('Teammate'),authorNames):uiText('Original message')])}</small>}{message.text||uiText('{0} attachments',[(message.images?.length??0)+(message.files?.length??0)])}</span><button aria-label={wording('Cancel queued message','取消排队')} onClick={()=>void act('session.dequeue',{id:active.id,messageId:message.id})}>×</button></div>})}</div>}
          {!!commands.length && <div className="menu commands" role="listbox" aria-label={wording('Slash commands','斜杠命令')}><div className="commands-heading"><span>{wording('Slash commands','斜杠命令')}</span><span>{wording('↑ ↓ Navigate · Enter run · Tab complete','↑ ↓ 选择 · Enter 执行 · Tab 补全')}</span></div>{commands.map((c, i) => <button key={c.name} role="option" aria-selected={i===cmdIndex} className={`menu-item ${i === cmdIndex ? 'hover' : ''}`} onClick={()=>{if(['model','effort','permissions'].includes(c.name)||!c.argumentHint)void send('/'+c.name);else setInput('/'+c.name+' ');composer.current?.focus()}}><span className="menu-name">/{c.name}</span><span className="menu-desc">{c.description}</span></button>)}</div>}
          <div className={`composer-box${active.busy?' is-busy':''}`}>{messageMode&&<><input ref={imageInput} type="file" multiple hidden aria-label={uiText("Choose attachments")} onChange={event=>{const files=[...(event.target.files??[])];event.target.value='';void pasteImages(files)}}/><button className="message-attach" disabled={!liveActive} aria-label={uiText("Attach files")} title={uiText("Attach files")} onClick={()=>imageInput.current?.click()}><Icon name="attach"/></button>{employee&&<VoiceRecorder key={employee.id} conversation={conversationKey('employee',employee.id)} disabled={!liveActive||images.length+files.length+uploads.jobs.length>=16} onRecorded={file=>uploads.add([file])}/>}</>}<textarea ref={composer} disabled={!liveActive} value={input} rows={messageMode?1:3} placeholder={liveActive?uiText("Message {0}…",[active.title]):wording('Connect to the workspace to send a message','连接工作目录后即可发送消息')} onChange={event=>changeInput(event.target.value)} onPaste={event=>{const files=Array.from(event.clipboardData.items).filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter((file):file is File=>!!file);if(files.length){event.preventDefault();void pasteImages(files)}}} onKeyDown={(e) => {
            if(e.nativeEvent.isComposing)return
            if(e.key==='Escape'&&commands.length){e.preventDefault();e.stopPropagation();setInput('');return}
            if (commands.length && ['ArrowDown', 'ArrowUp', 'Tab', 'Enter'].includes(e.key) && !e.shiftKey) {
              e.preventDefault()
              if (e.key === 'ArrowDown') setCmdIndex((i) => (i + 1) % commands.length)
              else if (e.key === 'ArrowUp') setCmdIndex((i) => (i + commands.length - 1) % commands.length)
              else { const c = commands[cmdIndex];if(e.key==='Enter'&&(input==='/'+c.name||c.aliases?.includes(input.slice(1))||!c.argumentHint))void send(input==='/'+c.name?input:'/'+c.name);else setInput('/'+c.name+(c.argumentHint?' ':'')) }
            } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
          }} />{active.busy ? <><button className="send-btn steer" disabled={!ENGINE_DEFINITIONS[active.engine].capabilities.steer||!input.trim()||!!images.length||!!files.length||uploads.pending||!!replyTo} onClick={async()=>{const text=input;if(await act('session.steer',{id:active.id,text})){setInput('');if(employee)delete drafts.current[employee.id]}}}>{wording('Steer','追加')}</button><button className="send-btn enqueue" disabled={uploads.pending||crossReference.loading||!!(replyTo&&!selectedReply)||!input.trim()&&!images.length&&!files.length} onClick={()=>void send()}>{wording('Queue','排队')}</button><button className="send-btn stop" onClick={() => void stop()}>{uiText("■ Stop")}</button></> : <button className="send-btn" disabled={!liveActive||uploads.pending||crossReference.loading||!!(replyTo&&!selectedReply)||(!input.trim()&&!images.length&&!files.length)} onClick={() => void send()} aria-label={uiText("Send message")} title={uiText("Send message")}>{messageMode?<Icon name="arrow-up"/>:"↑"}</button>}</div>
          <div className="composer-foot">{messageMode&&<ComposerTools input={composer} value={input} onChange={changeInput} disabled={!liveActive}/>}<button className="slash-trigger" aria-label={wording('Open slash commands','打开斜杠命令')} title={replyTo?uiText('Cancel the reply before running a command.'):undefined} disabled={!liveActive||!!replyTo} onClick={()=>{setInput('/');composer.current?.focus()}}>{wording('/ Commands','/ 命令')}</button><span>{active.busy ? <span className="status-line"><span className="spinner" />{active.approvals?.length ? uiText("Waiting for permission") : active.activity || uiText("Working…")}</span> : uiText("Enter to send · Shift Enter for a new line")}</span><span>{ENGINE_DEFINITIONS[active.engine].label} · {active.group || uiText("Independent workspace")}</span></div>
        </div>
        </ConversationBody>}
      </main>
      </section>
      {messageMode&&messageProfile&&employee&&<MessageProfile employee={employee} onClose={()=>setMessageProfile(false)} onWorkspace={()=>openWorkspace()} onEdit={()=>openWorkspace(true)}/>}
    </div>
  const audioTitle=useCallback((ref:string)=>{const [kind,id]=ref.split(':');return kind==='group'?chatCatalog.groups.find(group=>group.id===id)?.name??uiText('Former group'):store.sessions.find(card=>card.id===id)?.title??uiText('Former teammate')},[store.sessions,chatCatalog.groups])
  return <MessengerContext.Provider value={messenger}><AudioPlaybackProvider titleFor={audioTitle} onReveal={track=>{messenger.setLibrary(null);void messenger.navigate({conversation:track.conversation,id:track.messageId})}}><div className={`app in-office ${view.pluginId?'in-plugin':''} ${messageMode?'in-messages':''}`} data-resizing={sidebarDraft!==undefined} style={{'--shared-width':view.shared?'320px':'0px','--directory-width':`clamp(56px, ${sidebarDraft??store.preferences?.sidebarWidth??DEFAULT_PREFERENCES.sidebarWidth}px, 96px)`} as CSSProperties}>
    <HomeView underHeader={<AudioDock/>} groupUnread={chatCatalog.groups.filter(group=>group.unread).length} store={store} view={view} interactions={managementActivity.interactions} activities={activities} busyIds={busyIds} disconnectedIds={disconnectedIds} onResize={setSidebarDraft} onOpen={showEmployee} act={act}>
      {messageMode?<MessageView store={store} channels={channelCatalog.channels} channelId={view.channelId} onChannel={id=>void act('view.open',{kind:'messages',channelId:id})} groups={chatCatalog.groups} groupId={view.chatId} onGroup={id=>void act('view.open',{kind:'messages',chatId:id})} sessions={sessions} selectedId={view.employee} drafts={drafts.current} onNew={()=>void act('view.open',{kind:'employee'})} onOpen={card=>void act('view.open',{kind:employeeReady(card)?'messages':'initialization',employee:card.id})}>{view.channelId?(channelCatalog.channels.find(channel=>channel.id===view.channelId)?<ChannelConversation key={view.channelId} store={store} channel={channelCatalog.channels.find(channel=>channel.id===view.channelId)!} onBack={closeConversation}/>:<div className="message-welcome"><h2>{channelCatalog.ready?uiText('Channel unavailable'):uiText('Loading channel…')}</h2><p>{channelCatalog.error}</p><button onClick={closeConversation}>{uiText('Back to conversations')}</button></div>):view.chatId?(chatCatalog.groups.find(group=>group.id===view.chatId)?<GroupConversation key={view.chatId} group={chatCatalog.groups.find(group=>group.id===view.chatId)!} store={store} drafts={groupDrafts.current} onBack={closeConversation} onPrivate={id=>void act('view.open',{kind:'conversation',employee:id})}/>:<div className="message-welcome"><h2>{chatCatalog.ready?uiText("Group unavailable"):uiText("Loading group…")}</h2><p>{chatCatalog.error}</p><button onClick={closeConversation}>{uiText("Back to conversations")}</button></div>):conversation||undefined}</MessageView>:view.kind==='plan'?<PlanView store={store} view={view} act={act}/>:undefined}
    </HomeView>
    {!messageMode&&conversation}
    {error&&error!==sendRecovery?.error&&<div className="app-error" role="alert">{error}<button onClick={()=>setError('')} aria-label={uiText("Dismiss error")}>×</button></div>}
  </div></AudioPlaybackProvider></MessengerContext.Provider>
}
