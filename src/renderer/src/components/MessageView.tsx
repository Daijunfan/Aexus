import {useDialogFocus} from '../office/useDialogFocus'
import {useConversationListMotion} from '../chat/useConversationListMotion'
import {useSurfaceMotion} from '../chat/surfaceMotion'
import {MessageWallpaper} from '../chat/MessageWallpaper'
import {translate as uiText,useI18n,interfaceLocale} from '../i18n'
import {ForwardMessageDialog} from './ForwardMessageDialog'
import {useMessenger} from './useMessenger'
import {MessageMenu} from './MessageMenu'
import {MessageLibrary} from './MessageLibrary'
import {conversationKey,plainMessagePreview,type ConversationFolder} from '../../../shared/messenger'
import {EmployeePortrait} from './EmployeePortrait'
import {MessageListAvatar,useMessageAvatarMotion,type MessageAvatarState} from './MessageListAvatar'
import {CanvasMotion} from '../office/motion'
import {memo,useEffect,useMemo,useRef,useState,type ReactNode} from 'react'
import type {Store,StoredSession,Session} from '../../../shared/types'
import type {InboxEntry} from '../../../shared/messages'
import {employeeReady} from '../../../shared/types'
import {engineDefinition} from '../../../shared/engines'
import {rolePolicy} from '../../../shared/roles'
import {api} from '../api'
import {retainEqual,createRefreshQueue} from '../snapshot'
import {Icon} from './Icon'
import {GroupEditor} from './GroupEditor'
import {ConversationFolders,ConversationFolderEditor} from './ConversationFolders'
import type {ChannelView} from '../../../shared/channels'
import {ChannelAvatar} from './ChannelNewsCard'
import {ChannelSourcesDialog} from './ChannelSourcesDialog'
import type {ChatGroupView} from '../../../shared/chat-groups'

export const MessageAvatar=memo(function MessageAvatar({employee,large=false}:{employee:StoredSession;large?:boolean}){
  
return <EmployeePortrait avatar={employee.avatar??(employee.engine==='codex'?'robot':'cat')} color={employee.color} large={large}/>})
export function messageStatus(card:StoredSession,session?:Session){
  if(!employeeReady(card))return card.initialization?.status==='failed'?'Initialization failed':'Getting ready…'
  if(session?.approvals?.length)return 'Needs your approval'
  if(session?.acknowledging)return 'Confirming message…'
  if(session?.busy)return session.activityPreview?.kind==='speech'?'Responding…':'Working…'
  if(card.workspaceError||session?.error)return 'Needs attention'
  return 'Ready'
}
const dateLabel=(value:number|null)=>{if(!value)return '';const date=new Date(value);return date.toDateString()===new Date().toDateString()?date.toLocaleTimeString(interfaceLocale(),{hour:'2-digit',minute:'2-digit'}):date.toLocaleDateString(interfaceLocale(),{month:'short',day:'numeric'})}
type Props={store:Store;sessions:Session[];selectedId?:string;groupId?:string;groups:ChatGroupView[];channels?:ChannelView[];channelId?:string;onChannel?:(id:string)=>void;onGroup:(id:string)=>void;drafts:Record<string,string>;onOpen:(card:StoredSession)=>void;onNew:()=>void;children?:ReactNode}
export function MessageView({store,sessions,selectedId,groupId,groups,onGroup,channels=[],channelId,onChannel,drafts,onOpen,onNew,children}:Props){
  useI18n()

  const messenger=useMessenger()!
  const [scope,setScope]=useState<'all'|'favorites'|'archive'>('all'),[folderId,setFolderId]=useState<string|null>(null),[folderEditor,setFolderEditor]=useState<ConversationFolder|'new'|null>(null),[listMenu,setListMenu]=useState<{x:number;y:number}|null>(null),[selecting,setSelecting]=useState(false),[selected,setSelected]=useState<string[]>([]),[context,setContext]=useState<{key:string;x:number;y:number}|null>(null)
  const preferences=(key:string)=>messenger.state.conversations[key]??{}
  const toggle=(key:string)=>setSelected(previous=>previous.includes(key)?previous.filter(id=>id!==key):[...previous,key])
  const update=(keys:string[],patch:import('../../../shared/messenger').ConversationPreferences)=>{void messenger.conversations(keys,patch).then(ok=>{if(ok){setContext(null);setSelected([]);setSelecting(false)}})}
  const [newGroup,setNewGroup]=useState(false),[channelManager,setChannelManager]=useState(false)
  const [query,setQuery]=useState(''),[inbox,setInbox]=useState<InboxEntry[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true)
  const markChannelRead=async(id:string)=>{setContext(null);try{await api.call('channel.acknowledge',{id,all:true});setError('')}catch(cause){setError((cause as Error).message)}}
  const search=useRef<HTMLInputElement>(null)
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&!document.querySelector('[aria-modal="true"]')){event.preventDefault();search.current?.focus();search.current?.select()}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[])
  useEffect(()=>{
    let mounted=true,timer:ReturnType<typeof setTimeout>|undefined
    const load=createRefreshQueue(async()=>{try{const result=await api.call<InboxEntry[]>('session.inbox');if(mounted){setInbox(previous=>retainEqual(previous,result));setError('')}}catch(cause){if(mounted)setError((cause as Error).message)}finally{if(mounted)setLoading(false)}})
    void load()
    const off=api.onEvent(event=>{if(['store:changed','session:user','session:turn-start','session:turn-end','session:closed','session:error'].includes(event.channel)&&!timer)timer=setTimeout(()=>{timer=undefined;void load()},80)})
    return()=>{mounted=false;off();clearTimeout(timer)}
  },[])
  const authorNames=useMemo(()=>new Map(store.sessions.map(card=>[card.id,card.title])),[store.sessions])
  const live=useMemo(()=>new Map(sessions.map(session=>[session.cardId??session.id,session])),[sessions])
  const previews=useMemo(()=>new Map(inbox.map(entry=>[entry.employeeId,entry])),[inbox])
  const cards=useMemo(()=>store.sessions.filter(card=>!card.deleting).sort((a,b)=>(previews.get(b.id)?.updatedAt??b.lastReply?.createdAt??b.createdAt)-(previews.get(a.id)?.updatedAt??a.lastReply?.createdAt??a.createdAt)||a.id.localeCompare(b.id)),[store.sessions,previews])
  const folders=messenger.state.folders??[],activeFolder=folders.find(folder=>folder.id===folderId),members=activeFolder?new Set(activeFolder.conversations):null,needle=query.trim().toLocaleLowerCase()
  useEffect(()=>{if(messenger.ready&&folderId&&!folders.some(folder=>folder.id===folderId))setFolderId(null)},[messenger.ready,folderId,folders])
  const catalog=[...channels.map(channel=>({kind:'channel' as const,id:channel.id,at:Math.max(channel.lastPost?.publishedAt??0,channel.lastMessage?.createdAt??0,channel.createdAt),channel})),...groups.map(group=>({kind:'group' as const,id:group.id,at:group.lastMessage?.createdAt??group.createdAt,group})),...cards.map(card=>({kind:'employee' as const,id:card.id,at:previews.get(card.id)?.updatedAt??card.lastReply?.createdAt??card.createdAt,card}))].map(entry=>({...entry,key:conversationKey(entry.kind,entry.id)})).sort((a,b)=>Number(!!preferences(b.key).pinned)-Number(!!preferences(a.key).pinned)||b.at-a.at||a.id.localeCompare(b.id))
  const conversations=catalog.filter(entry=>(scope==='archive'?preferences(entry.key).archived:!preferences(entry.key).archived&&(scope!=='favorites'||preferences(entry.key).favorite))&&(!members||members.has(entry.key))&&(entry.kind==='channel'?[entry.channel.name,entry.channel.lastPost?.title,entry.channel.lastPost?.sourceName,entry.channel.lastMessage?.text,entry.channel.lastMessage?.authorName].join(' '):entry.kind==='group'?[entry.group.name,...entry.group.members.map(member=>member.title)].join(' '):[entry.card.title,entry.card.group,entry.card.role,entry.card.engine,previews.get(entry.card.id)?.text].join(' ')).toLocaleLowerCase().includes(needle))
  const chooseFolder=(id:string|null)=>{setFolderId(id);setScope('all');setSelecting(false);setSelected([])}
  const chooseScope=(value:'all'|'favorites'|'archive')=>{setScope(value);setFolderId(null);setListMenu(null);setSelecting(false);setSelected([])}
  const contacts=useConversationListMotion(conversations.map(entry=>entry.key).join('\n'))
  const animatedAvatars=useMessageAvatarMotion()
  return <div className={`message-view ${selectedId||groupId||channelId?'has-conversation':''}`}>
    <aside className="message-sidebar" aria-label={uiText("Conversations")}>
      <header className="message-list-heading"><div><h1>{uiText("Messages")}<span className="message-heading-count">{catalog.length}</span></h1></div><button onClick={()=>messenger.setLibrary({filter:'saved'})} aria-label={uiText("Saved messages")} title={uiText("Saved messages")}><Icon name="bookmark"/></button><button className="message-create-contact" onClick={onNew} aria-label={uiText("Add employee")} title={uiText("Add employee")}><Icon name="edit"/></button><button aria-label={uiText("Conversation list options")} title={uiText("Conversation list options")} aria-expanded={!!listMenu} onClick={event=>{const box=event.currentTarget.getBoundingClientRect();setListMenu(listMenu?null:{x:box.right-238,y:box.bottom+6})}}><Icon name="ellipsis"/></button></header>
      <label className="message-search"><Icon name="search"/><input ref={search} aria-label={uiText("Search conversations")} placeholder={uiText("Search conversations…")} value={query} onChange={event=>setQuery(event.target.value)}/>{!query&&<kbd>{api.platform==='macos'?'⌘':'Ctrl'} K</kbd>}{query&&<button aria-label={uiText("Clear search")} onClick={()=>{setQuery('');search.current?.focus()}}><Icon name="close"/></button>}</label>
      {messenger.state.pendingForward&&<button className="message-resume-forward" onClick={()=>{const pending=messenger.state.pendingForward!;messenger.setForward({messages:pending.messages,text:pending.preview.text,images:pending.preview.images})}}><Icon name="arrow-right"/><span>{uiText('Continue forwarding')}</span><Icon name="chevron-right"/></button>}
      <ConversationFolders folders={folders} selectedId={folderId} onSelect={chooseFolder} onCreate={()=>setFolderEditor('new')} onEdit={setFolderEditor}/>
      {query&&<button className="message-search-history" onClick={()=>messenger.setLibrary({query})}><Icon name="search"/><span>{uiText("Search all messages for “")}{query}”</span><Icon name="arrow-right"/></button>}
      <div className="message-list-caption"><span>{query?uiText("{0} results",[conversations.length]):scope==='archive'?uiText("Archived"):scope==='favorites'?uiText("Favorites"):activeFolder?.name??uiText("RECENT CONVERSATIONS")}</span><button className="message-select-conversations" aria-label={uiText("Select conversations")} aria-pressed={selecting} title={uiText("Select conversations")} onClick={()=>{setSelecting(!selecting);setSelected([])}}><Icon name="checklist"/></button><button onClick={()=>setNewGroup(true)} aria-label={uiText("New group")} title={uiText("New group")}><Icon name="add"/>  {uiText("New group")}</button></div>
      {(error||messenger.error)&&<p className="message-list-error" role="alert">{error||messenger.error}</p>}
      {selecting&&<div className="message-bulk-actions" role="toolbar" aria-label={uiText("Selected conversation actions")}><span>{uiText('{0} selected',[selected.length])}</span><button disabled={!selected.length} onClick={()=>update(selected,{pinned:true})} aria-label={uiText("Pin selected conversations")}><Icon name="pinned"/></button><button disabled={!selected.length} onClick={()=>update(selected,{archived:scope!=='archive'})} aria-label={scope==='archive'?uiText("Restore selected conversations"):uiText("Archive selected conversations")}><Icon name="archive"/></button><button disabled={!selected.length} onClick={()=>update(selected,{unread:true})} aria-label={uiText("Mark selected conversations unread")}><Icon name="mail"/></button><button onClick={()=>{setSelecting(false);setSelected([])}} aria-label={uiText("Cancel conversation selection")}><Icon name="close"/></button></div>}
      <CanvasMotion.Provider value={animatedAvatars}><div ref={contacts} className="message-contacts" aria-label={uiText("Conversations")} role="list">
        {conversations.map(entry=>{
          const channel=entry.kind==='channel'?entry.channel:undefined,group=entry.kind==='group'?entry.group:undefined,card=entry.kind==='employee'?entry.card:undefined,session=card?live.get(card.id):undefined,preview=card?previews.get(card.id):undefined,prefs=preferences(entry.key)
          const title=channel?.name??group?.name??card!.title,current=channel?channelId===channel.id:group?groupId===group.id:selectedId===card!.id,unreadCount=channel?.unreadCount??0,unread=!!prefs.unread||(channel?unreadCount>0:group?group.unread:!!card?.lastReply&&!card.lastReply.readAt),draft=(card?drafts[card.id]:undefined)??messenger.state.drafts[entry.key]?.text
          const state:MessageAvatarState=card&&(!employeeReady(card)||session?.approvals?.length||session?.error||card.workspaceError)?'attention':session?.busy?(session.activityPreview?.kind==='speech'?'responding':'working'):'idle',status=card?uiText(messageStatus(card,session)):''
          const snippet=draft?<><em>{uiText('Draft:')} </em>{plainMessagePreview(draft)}</>:channel?(channel.lastMessage&&channel.lastMessage.createdAt>=(channel.lastPost?.publishedAt??0)?`${channel.lastMessage.author?.kind==='operator'?uiText('You'):channel.lastMessage.authorName}: ${plainMessagePreview(channel.lastMessage.text)}`:channel.lastPost?(plainMessagePreview(channel.lastPost.title)||uiText('New article')):uiText('New articles will appear here')):card&&(state!=='idle')?<>{session?.busy&&state!=='attention'&&<span className="message-typing" aria-hidden="true"><i/><i/><i/></span>}{status}</>:group?(group.lastMessage?`${group.lastMessage.author?.kind==='operator'?uiText('You: '):group.lastMessage.authorName+': '}${plainMessagePreview(group.lastMessage.text)}`:uiText('Start a group conversation')):preview?.error??(preview?.text?`${preview.role==='user'?(preview.author?.kind==='operator'?uiText('You: '):preview.author?.kind==='agent'?(authorNames.get(preview.author.employeeId)??uiText('Former teammate'))+': ':uiText('Message: ')):''}${plainMessagePreview(preview.text)}`:loading?uiText('Loading history…'):uiText('Start a conversation'))
          return <div role="listitem" className="message-contact-wrap" data-conversation-key={entry.key} key={entry.key} onContextMenu={event=>{event.preventDefault();setContext({key:entry.key,x:event.clientX,y:event.clientY})}}>
            <button className={`message-contact ${group?'message-group-contact ':''}${current?'selected':''}`} data-channel={channel?.id} data-chat={group?.id} data-employee={card?.id} data-unread={unread||undefined} aria-label={uiText(channel?'Open channel {0}':group?'Open group {0}':'Message {0}',[title])} aria-current={current?'true':undefined} onClick={()=>{if(selecting){toggle(entry.key);return}if(prefs.unread)void messenger.conversations([entry.key],{unread:false});if(channel)onChannel?.(channel.id);else if(group)onGroup(group.id);else if(card)onOpen(card)}}>
              {selecting&&<span className={`message-selection-box ${selected.includes(entry.key)?'checked':''}`}><Icon name={selected.includes(entry.key)?'check':'circle-outline'}/></span>}
              {channel?<ChannelAvatar kind={channel.kind} avatar={channel.avatar} name={channel.name}/>:group?<GroupAvatar group={group} store={store}/>:<span className="message-contact-avatar"><MessageListAvatar avatar={card!.avatar??(card!.engine==='codex'?'robot':'cat')} color={card!.color} state={state}/><i data-state={state==='idle'?'ready':state} title={status}/></span>}
              <span className="message-contact-content"><span className="message-contact-line"><strong>{title}</strong>{prefs.pinned&&<Icon name="pinned"/>}<time>{dateLabel(channel?Math.max(channel.lastPost?.publishedAt??0,channel.lastMessage?.createdAt??0)||null:group?.lastMessage?.createdAt??preview?.updatedAt??card?.lastReply?.createdAt??null)}</time></span><span className="message-contact-line message-contact-preview"><span className={`message-snippet ${state==='working'||state==='responding'?'working':''} ${draft?'draft':''}`}>{snippet}</span>{unread&&<i className="message-unread-dot message-unread-badge" data-unread-count={channel&&unreadCount>0?unreadCount:undefined} aria-label={channel&&unreadCount>0?uiText(unreadCount===1?'{0} unread update':'{0} unread updates',[unreadCount]):uiText(channel?'Unread reminder':group?'Unread group messages':'Unread reply')}>{channel&&unreadCount>0?(unreadCount>99?'99+':unreadCount):uiText('Unread')}</i>}</span><span className="message-contact-subtitle">{channel?<>{uiText('Channel')} <b>·</b> {uiText(channel.sourceCount===1?'{0} author':'{0} authors',[channel.sourceCount])}</>:group?<>{uiText('Group ·')} {group.members.length} {uiText('members')}</>:<>{card!.group} <b>·</b> {uiText(rolePolicy(card!.managementRole).label)}</>}</span></span>
            </button>
            {!selecting&&<button className="message-row-menu" aria-label={uiText('Actions for {0}',[title])} onClick={event=>{const box=event.currentTarget.getBoundingClientRect();setContext({key:entry.key,x:box.right,y:box.bottom})}}><Icon name="ellipsis"/></button>}
          </div>
        })}
        {!conversations.length&&<div className="message-no-results"><Icon name={activeFolder?'folder':'search'}/><strong>{activeFolder&&!query?uiText('No conversations in this category'):catalog.length?uiText("No conversations found"):uiText("Your team starts here")}</strong><p>{activeFolder&&!query?uiText('Choose any conversations to keep together.'):catalog.length?uiText("Try another name or clear the filters."):uiText("Add an employee to start a direct conversation.")}</p>{activeFolder&&!query?<button onClick={()=>setFolderEditor(activeFolder)}>{uiText('Add conversations')}</button>:catalog.length?<button onClick={()=>{setQuery('');chooseFolder(null)}}>{uiText("Clear filters")}</button>:<button onClick={onNew}>{uiText("Add employee")}</button>}</div>}
      </div></CanvasMotion.Provider>
      <footer className="message-sidebar-footer"><span className="message-footer-mark"><Icon name="comment-discussion"/></span><span><strong>{uiText("Your company, together")}</strong><small>{cards.length}  {uiText("employees ·")} {groups.length}  {uiText("groups")}{channels.length?' · '+uiText('{0} channels',[channels.length]):''}</small></span><Icon name="arrow-up-right"/></footer>
    </aside>
    {listMenu&&<MessageMenu anchor={listMenu} label={uiText('Conversation list options')} onClose={()=>setListMenu(null)}><button role="menuitem" onClick={()=>chooseScope('all')}><Icon name="comment-discussion"/>{uiText('All conversations')}</button><button role="menuitem" onClick={()=>chooseScope('favorites')}><Icon name="star"/>{uiText('Favorites')}</button><button role="menuitem" onClick={()=>chooseScope('archive')}><Icon name="archive"/>{uiText('Archived')}</button><hr/><button role="menuitem" onClick={()=>{setListMenu(null);setChannelManager(true)}}><Icon name="radio-tower"/>{uiText('Manage channels and authors')}</button><button role="menuitem" onClick={()=>{setListMenu(null);setFolderEditor('new')}}><Icon name="add"/>{uiText('Create category')}</button>{activeFolder&&<button role="menuitem" onClick={()=>{setListMenu(null);setFolderEditor(activeFolder)}}><Icon name="edit"/>{uiText('Edit category')}</button>}</MessageMenu>}
    {folderEditor&&<ConversationFolderEditor folder={folderEditor==='new'?undefined:folderEditor} conversations={catalog.map(entry=>entry.kind==='channel'?{key:entry.key,title:entry.channel.name,description:uiText('Channel'),avatar:<ChannelAvatar kind={entry.channel.kind} avatar={entry.channel.avatar} name={entry.channel.name}/>,archived:preferences(entry.key).archived}:entry.kind==='group'?{key:entry.key,title:entry.group.name,description:uiText('Group ·')+' '+entry.group.members.length+' '+uiText('members'),avatar:<GroupAvatar group={entry.group} store={store}/>,archived:preferences(entry.key).archived}:{key:entry.key,title:entry.card.title,description:entry.card.group+' · '+uiText(rolePolicy(entry.card.managementRole).label),avatar:<MessageAvatar employee={entry.card}/>,archived:preferences(entry.key).archived})} onClose={()=>setFolderEditor(null)} onSaved={id=>{setFolderEditor(null);chooseFolder(id)}}/>}
    {context&&<MessageMenu anchor={context} label={uiText("Conversation actions")} onClose={()=>setContext(null)}>
      <span className="messenger-menu-label">{uiText("CONVERSATION")}</span>
      <button role="menuitem" onClick={()=>update([context.key],{pinned:!preferences(context.key).pinned})}><Icon name="pinned"/>{preferences(context.key).pinned?uiText("Unpin conversation"):uiText("Pin conversation")}</button>
      <button role="menuitem" onClick={()=>update([context.key],{favorite:!preferences(context.key).favorite})}><Icon name="star"/>{preferences(context.key).favorite?uiText("Remove from favorites"):uiText("Add to favorites")}</button>
      {context.key.startsWith('channel:')&&channels.some(channel=>context.key==='channel:'+channel.id&&channel.unreadCount>0)&&<button role="menuitem" onClick={()=>void markChannelRead(context.key.slice(8))}><Icon name="check-all"/>{uiText('Mark as read')}</button>}
      <button role="menuitem" onClick={()=>update([context.key],{unread:!preferences(context.key).unread})}><Icon name="mail"/>{preferences(context.key).unread?uiText("Clear unread reminder"):uiText("Mark as unread")}</button>
      <button role="menuitem" onClick={()=>{messenger.setLibrary({conversation:context.key});setContext(null)}}><Icon name="search"/>{uiText("Search conversation history")}</button>
      <hr/><button role="menuitem" onClick={()=>update([context.key],{archived:!preferences(context.key).archived})}><Icon name="archive"/>{preferences(context.key).archived?uiText("Move to inbox"):uiText("Archive conversation")}</button>
      <button role="menuitem" onClick={()=>{setSelecting(true);setSelected([context.key]);setContext(null)}}><Icon name="checklist"/>{uiText("Select conversations")}</button>
    </MessageMenu>}
    {(messenger.forward||messenger.replyTarget)&&<ForwardMessageDialog key={messenger.replyTarget?'reply':'forward'} store={store} groups={groups}/>}
    {channelManager&&<ChannelSourcesDialog onClose={()=>setChannelManager(false)}/>}
    {newGroup&&<GroupEditor store={store} onClose={()=>setNewGroup(false)} onSaved={group=>{setNewGroup(false);onGroup(group.id)}}/>}
    <div className="message-stage"><MessageWallpaper/>{messenger.library&&<MessageLibrary key={JSON.stringify(messenger.library)}/>} {children??<div className="message-welcome"><div className="message-welcome-art"><span className="message-orbit orbit-one"/><span className="message-orbit orbit-two"/><div className="message-welcome-mark"><Icon name="comment-discussion"/></div>{cards.slice(0,3).map((card,index)=><button className={`message-orbit-person person-${index}`} key={card.id} onClick={()=>onOpen(card)} aria-label={uiText("Start messaging {0}",[card.title])} title={card.title}><MessageAvatar employee={card}/></button>)}</div><span>{uiText("YOUR COMPANY, CONNECTED")}</span><h2>{uiText("Good work starts")}<br/>{uiText("with a conversation.")}</h2><p>{uiText("A place for every idea, update, and little breakthrough.")}<br/>{uiText("Choose a conversation and pick up where you left off.")}</p><div className="message-welcome-actions"><button onClick={()=>{search.current?.focus();search.current?.select()}}><Icon name="search"/>  {uiText("Find a conversation")} <kbd>{api.platform==='macos'?'⌘':'Ctrl'} K</kbd></button><button onClick={()=>setNewGroup(true)}><Icon name="organization"/>  {uiText("Create a group")} <Icon name="arrow-right"/></button></div><small>{uiText("One shared space. A world of possibilities.")}</small></div>}</div>
  </div>
}

export function GroupAvatar({group,store}:{group:ChatGroupView;store:Store}){
  

  const people=group.members.slice(0,4).flatMap(member=>{const card=store.sessions.find(card=>card.id===member.id);return card?[card]:[]})
  return <span className={`group-avatar ${people.length>1?'group-portrait-grid':''}`} aria-hidden="true">{people.length>1?people.map(card=><MessageAvatar key={card.id} employee={card}/>):<Icon name="organization"/>}</span>
}
export function MessageHeader({employee,session,opening,settings,search,onSearch,onSettings,onBack,onWorkspace,onProfile}:{employee:StoredSession;session?:Session;opening:boolean;settings:boolean;search:boolean;onSearch:()=>void;onSettings:()=>void;onBack:()=>void;onWorkspace:()=>void;onProfile:()=>void}){
  useI18n()

  return <header className="message-thread-header">
    <button className="message-back" aria-label={uiText("Back to conversations")} onClick={onBack}><Icon name="arrow-left"/></button>
    <button className="message-person" onClick={onProfile} aria-label={uiText("Employee profile")}><MessageAvatar employee={employee}/><span><strong>{employee.title}</strong><small><i className={session?.approvals?.length||session?.error||employee.workspaceError?'attention':session?.busy?'working':''}/><span>{opening?uiText("Connecting…"):uiText(messageStatus(employee,session))}</span><b>·</b><span className="message-person-team">{employee.group}</span></small></span></button>
    <div className="message-thread-actions"><button data-message-search-trigger title={uiText("Search conversation · {0} F",[api.platform==='macos'?'⌘':uiText("Ctrl")])} aria-label={uiText("Search conversation")} aria-expanded={search} onClick={onSearch}><Icon name="search"/></button><span className="message-action-divider"/><button title={uiText("Conversation settings")} aria-label={uiText("Conversation settings")} aria-expanded={settings} onClick={onSettings}><Icon name="settings-gear"/></button><button title={uiText("Open workspace")} aria-label={uiText("Open workspace")} onClick={onWorkspace}><Icon name="files"/></button><button title={uiText("Employee details")} aria-label={uiText("Employee details")} onClick={onProfile}><Icon name="info"/></button></div>
  </header>
}
export function MessageProfile({employee,onClose,onWorkspace,onEdit}:{employee:StoredSession;onClose:()=>void;onWorkspace:()=>void;onEdit:()=>void}){
  useI18n()

  const surface=useSurfaceMotion<HTMLElement>('panel')
  const messenger=useMessenger()
  useDialogFocus('.message-profile',true)
  useDialogFocusForProfile(onClose)
  return <aside ref={surface} className="message-profile" role="dialog" aria-label={uiText("Employee information")}><header><strong>{uiText("Employee information")}</strong><button aria-label={uiText("Close employee information")} onClick={onClose}><Icon name="close"/></button></header><MessageAvatar employee={employee} large/><h2>{employee.title}</h2><p>{employee.role||uiText("Your AI teammate")}</p><div className="message-profile-content">{[['media','Media','file-media'],['links','Links','link'],['saved','Saved','bookmark'],['pinned','Pinned','pinned']].map(([filter,label,icon])=><button key={filter} onClick={()=>{messenger?.setLibrary({conversation:conversationKey('employee',employee.id),filter});onClose()}}><Icon name={icon}/>{uiText(label)}</button>)}</div><dl><dt>{uiText("Team")}</dt><dd>{employee.group}</dd><dt>{uiText("Role")}</dt><dd>{uiText(rolePolicy(employee.managementRole).label)}</dd><dt>{uiText("Coding agent")}</dt><dd>{engineDefinition(employee.engine).label}</dd><dt>{uiText("Model")}</dt><dd>{employee.model||uiText("Configured default")}</dd><dt>{uiText("Workspace")}</dt><dd>{employee.remote?uiText("Cloud workspace"):uiText("Local workspace")}<small>{employee.cwd}</small></dd></dl><button className="message-profile-action" onClick={onWorkspace}><Icon name="files"/>  {uiText("Open workspace")}</button><button className="message-profile-action" onClick={onEdit}><Icon name="edit"/>  {uiText("Edit employee")}</button><small className="message-profile-note">{uiText("This is the same employee and conversation as your company canvas.")}</small></aside>
}
function useDialogFocusForProfile(onClose:()=>void){
  useEffect(()=>{const key=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();onClose()}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true)},[onClose])
}
