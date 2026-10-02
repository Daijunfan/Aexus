import {attachmentPaths} from '../shared/message-attachments'
import type {MessageReply} from '../shared/types'
import {quoteShape,validateQuote,type MessageQuote} from '../shared/message-quotes'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {APP_HOME} from '../shared/protocol'
import {EMPTY_MESSENGER,MESSAGE_REACTIONS,conversationKey,messageKey,hasDraftContent,type MessengerState,type MessengerMessage,type ConversationPreferences,type MessagePreferences} from '../shared/messenger'
import {messageTime} from '../shared/messages'
import {atomicJson,readJson} from './atomic-file'
import {authorize,requestContext,visibleEmployees,requireAppAdministrator} from './authorization'
import {readChatMessages,listChatGroups,getChatGroup} from './chat-groups'
import {transcriptItems,resolveMessageReply} from './transcripts'
import {getChannel,getChannelPost,queryChannelPosts,channelRequest} from './channels'
import type {ChannelPost,ChannelMessage} from '../shared/channels'
import {getChannelMessage,queryChannelMessages} from './channel-discussion'
let emit:(payload:{revision:number;conversation?:string})=>void=()=>{}
export function setMessengerEmitter(handler:typeof emit){emit=handler}

const file=join(APP_HOME,'messenger.json')
function read(){return readJson<MessengerState>(file,()=>({...EMPTY_MESSENGER,conversations:{},messages:{},drafts:{}}),value=>!!value&&typeof value==='object'&&(value as MessengerState).version===1&&Number.isSafeInteger((value as MessengerState).revision)&&['conversations','messages','drafts'].every(key=>!!(value as any)[key]&&typeof (value as any)[key]==='object'&&!Array.isArray((value as any)[key])))}
function write(state:MessengerState,conversation?:string){state.revision++;atomicJson(file,state,true);emit({revision:state.revision,conversation});return state}
function resolve(value:unknown){
 if(typeof value!=='string'||!/^(employee|group|channel):[a-zA-Z0-9_-]+$/.test(value))throw Error('Choose a valid conversation')
 const [kind,id]=value.split(':')
 if(kind==='channel')return {key:value,kind,id,title:getChannel(id).name}
 if(kind==='group')return {key:value,kind,id,title:getChatGroup(id).name}
 const card=visibleEmployees().find(card=>card.id===id);if(!card)throw Error('Unknown employee conversation')
 return {key:value,kind,id,title:card.title,card}
}
function newsMessage(post:ChannelPost):MessengerMessage{return {conversation:conversationKey('channel',post.channelId),conversationTitle:getChannel(post.channelId).name,id:post.id,author:post.authorName??post.sourceName,role:'assistant',text:[post.title,post.body,post.url].filter(Boolean).join('\n\n'),images:post.media.map(media=>post.id+'/'+media.id),createdAt:post.publishedAt,preferences:{saved:post.saved},news:post}}
function discussionMessage(message:ChannelMessage,state:MessengerState):MessengerMessage{const conversation=conversationKey('channel',message.channelId);return {conversation,conversationTitle:getChannel(message.channelId).name,id:message.id,author:message.authorName,authorIdentity:message.author,role:message.author.kind==='operator'?'user':'assistant',text:message.text,images:[],createdAt:message.createdAt,preferences:state.messages[messageKey(conversation,message.id)]??{}}}
function channelMessage(channelId:string,id:string,state:MessengerState){if(id.startsWith('cm_'))return discussionMessage(getChannelMessage(channelId,id),state);const post=getChannelPost(id);if(post.channelId!==channelId)throw Error('News item belongs to another channel');return newsMessage(post)}
function publicMessages(value:string,state:MessengerState):MessengerMessage[]{
 const ref=resolve(value)
 if(ref.kind==='channel')return queryChannelMessages({channelId:ref.id,limit:-1}).messages.map(message=>discussionMessage(message,state))
 if(ref.kind==='group')return readChatMessages(ref.id).map(message=>({conversation:value,conversationTitle:ref.title,id:message.id,author:message.authorName,authorIdentity:message.author,role:message.author.kind==='operator'?'user':'assistant',text:message.text,images:message.attachments?.filter(file=>file.kind==='image').map(file=>file.path)??[],files:message.attachments?.filter(file=>file.kind==='file'),createdAt:message.createdAt,editedAt:message.editedAt,editRevision:message.editRevision,preferences:state.messages[messageKey(value,message.id)]??{}}))
 const names=new Map(visibleEmployees().map(card=>[card.id,card.title]))
 return transcriptItems(ref.id).flatMap(item=>{
  if(item.role==='notice')return []
  const text=item.role==='user'?item.text:item.blocks.filter(block=>block.kind==='text').map(block=>block.text).join('\n\n'),images=item.role==='user'?item.images??[]:[]
  if(!text.trim()&&!images.length&&!(item.role==='user'&&item.files?.length))return []
  const authorIdentity=item.role==='user'?item.author:{kind:'agent' as const,employeeId:ref.id},author=item.role==='assistant'?ref.title:item.author?.kind==='operator'?'You':item.author?.kind==='agent'?names.get(item.author.employeeId)??'Former teammate':'Original sender'
  return [{conversation:value,conversationTitle:ref.title,id:item.id,author,authorIdentity,role:item.role,text,images,files:item.role==='user'?item.files:undefined,createdAt:messageTime(item,ref.card?.lastReply),preferences:state.messages[messageKey(value,item.id)]??{}}]
 })
}
export function readMessengerMessages(conversation:string,ids?:string[]){authorize('messenger.search');const ref=resolve(conversation);if(ref.kind==='channel'&&ids){const state=read();return ids.map(id=>channelMessage(ref.id,id,state))};return publicMessages(conversation,read())}
/** A user-approved excerpt can be shared; it never grants access to its source. */
export function resolveConversationReply(conversation:unknown,id:unknown,quote?:MessageQuote,textOnly?:boolean):MessageReply{
 authorize('messenger.reference');if(requestContext().principal.kind!=='operator')throw Error('Only the user may quote another conversation')
 if(typeof id!=='string'||!id)throw Error('Choose a source message')
 if(textOnly!==undefined&&typeof textOnly!=='boolean')throw Error('textOnly must be boolean')
 const ref=resolve(conversation),state=read(),source=ref.kind==='channel'?channelMessage(ref.id,id,state):publicMessages(ref.key,state).find(message=>message.id===id)
 if(!source||source.preferences.hidden)throw Error('Source message is unavailable or hidden')
 if((source.images.length||source.files?.length)&&!quote&&!textOnly)throw Error('Choose a text-only quote or forward the attachments explicitly')
 const selected=ref.kind!=='employee'&&quote!==undefined?validateQuote(source.text,quote):undefined
 const reply=ref.kind==='employee'?resolveMessageReply(ref.id,id,quote)!:{id,role:source.role,author:source.authorIdentity,text:selected?.text??Array.from(source.text).slice(0,1200).join(''),...(selected?{quote:selected}:{}),...(!selected&&Array.from(source.text).length>1200?{truncated:true}:{})}
 const {images,files,...excerpt}=reply
 return {...excerpt,conversation:ref.key,conversationTitle:ref.title,authorName:source.author,...(source.images.length?{omittedImages:source.images.length}:{}),...(source.files?.length?{omittedFiles:source.files.length}:{})}
}
const patchFields=(patch:unknown,allowed:string[])=>{if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length)throw Error('Provide a nonempty patch');for(const [key,value] of Object.entries(patch)){if(!allowed.includes(key))throw Error('Unknown preference: '+key);if(key==='reaction'){if(value!==''&&!MESSAGE_REACTIONS.includes(value as any))throw Error('Choose a supported reaction')}else if(typeof value!=='boolean')throw Error(key+' must be boolean')}return patch}
export function messengerRequest(command:string,args:Record<string,any>={}){
 authorize(command,args);requireAppAdministrator()
 const state=read()
 switch(command){
  case 'messenger.gallery':return galleryPage(args,state)
  case 'messenger.reference':return resolveConversationReply(args.conversation,args.id,args.quote,args.textOnly)
  case 'messenger.state':return state
  case 'messenger.forward-draft':{
   if(requestContext().principal.kind!=='operator')throw Error('Only the user may manage forwarding attempts')
   const {value,expectedClientMessageId}=args,current=state.pendingForward
   if(expectedClientMessageId!==undefined&&(typeof expectedClientMessageId!=='string'||!expectedClientMessageId||expectedClientMessageId.length>160))throw Error('Invalid forwarding request ID')
   if(expectedClientMessageId!==undefined&&current?.clientMessageId!==expectedClientMessageId)return state
   if(value===null){if(!current)return state;delete state.pendingForward;return write(state)}
   if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['clientMessageId','messages','to','comment','textOnly','preview','attempted'].includes(key)))throw Error('Invalid forwarding setup')
   if(typeof value.clientMessageId!=='string'||!value.clientMessageId||value.clientMessageId.length>160)throw Error('Invalid forwarding request ID')
   if(!Array.isArray(value.messages)||!value.messages.length||value.messages.length>50||value.messages.some((ref:any)=>!ref||typeof ref.conversation!=='string'||!/^(employee|group|channel):[a-zA-Z0-9_-]+$/.test(ref.conversation)||typeof ref.id!=='string'||!ref.id))throw Error('Choose 1–50 source messages')
   if(value.to!==undefined&&(typeof value.to!=='string'||!/^(employee|group):[a-zA-Z0-9_-]+$/.test(value.to)))throw Error('Choose a destination conversation')
   if(typeof value.comment!=='string'||value.comment.length>16000||typeof value.textOnly!=='boolean'||typeof value.attempted!=='boolean'||value.attempted&&!value.to)throw Error('Invalid forwarding setup')
   if(!value.preview||typeof value.preview.text!=='string'||Array.from(value.preview.text).length>1200||!Number.isSafeInteger(value.preview.images)||value.preview.images<0)throw Error('Invalid forwarding preview')
   if(current&&current.clientMessageId!==value.clientMessageId)throw Error('Resume or discard the saved forwarding attempt first')
   const draft={clientMessageId:value.clientMessageId,messages:value.messages.map((ref:any)=>({conversation:ref.conversation,id:ref.id})),...(value.to?{to:value.to}:{}),comment:value.comment,textOnly:value.textOnly,preview:{text:value.preview.text,images:value.preview.images},attempted:value.attempted}
   if(current){const {updatedAt:_,...saved}=current;if(JSON.stringify(saved)===JSON.stringify(draft))return state;if(current.attempted)throw Error('An attempted forward cannot be changed; discard its setup to start another')}
   state.pendingForward={...draft,updatedAt:Date.now()};return write(state)
  }
  case 'messenger.folder-save':{
   if(typeof args.name!=='string'||!args.name.trim()||args.name.trim().length>80)throw Error('Folder name must be between 1 and 80 characters')
   if(!Array.isArray(args.conversations)||args.conversations.length>2000)throw Error('Choose up to 2000 conversations')
   if(args.id!==undefined&&(typeof args.id!=='string'||!/^mf_[a-f0-9-]{36}$/.test(args.id)))throw Error('Invalid conversation folder ID')
   const conversations=[...new Set<string>(args.conversations.map((value:unknown)=>resolve(value).key))].sort(),folders=state.folders??=[]
   const existing=args.id===undefined?undefined:folders.find(folder=>folder.id===args.id)
   if(existing&&existing.name===args.name.trim()&&JSON.stringify([...existing.conversations].sort())===JSON.stringify(conversations))return state
   if(args.id!==undefined&&!existing&&args.expectedRevision!==0)throw Error('Unknown conversation folder')
   if(args.expectedRevision!==undefined&&args.expectedRevision!==(existing?.revision??0))throw Error('Folder changed; reload before saving')
   const value={id:existing?.id??args.id??'mf_'+randomUUID(),name:args.name.trim(),conversations,revision:(existing?.revision??0)+1}
   state.folders=existing?folders.map(folder=>folder.id===existing.id?value:folder):[...folders,value]
   return write(state)
  }
  case 'messenger.folder-delete':{
   const folder=state.folders?.find(folder=>folder.id===args.id);if(!folder)throw Error('Unknown conversation folder')
   if(args.expectedRevision!==undefined&&args.expectedRevision!==folder.revision)throw Error('Folder changed; reload before saving')
   state.folders=state.folders!.filter(value=>value.id!==folder.id);return write(state)
  }
  case 'messenger.conversation':{
   if(!Array.isArray(args.conversations)||!args.conversations.length||args.conversations.length>200)throw Error('Choose 1–200 conversations')
   const keys=[...new Set(args.conversations.map((value:unknown)=>resolve(value).key))],patch=patchFields(args.patch,['pinned','favorite','archived','unread']) as ConversationPreferences
   for(const key of keys)state.conversations[key]={...state.conversations[key],...patch}
   return write(state)
  }
  case 'messenger.message':{
   const ref=resolve(args.conversation),patch=patchFields(args.patch,['saved','pinned','hidden','reaction']) as MessagePreferences
   if(args.id!==undefined&&args.ids!==undefined)throw Error('Choose id or ids, not both')
   const ids=args.ids??[args.id];if(!Array.isArray(ids)||!ids.length||ids.length>200||ids.some((id:unknown)=>typeof id!=='string'))throw Error('Choose 1–200 message IDs')
   if(ref.kind==='channel'){
    const selected=[...new Set<string>(ids)].map(id=>channelMessage(ref.id,id,state))
    if(selected.some(message=>message.news)&&Object.keys(patch).some(key=>key!=='saved'))throw Error('Use news actions to manage a channel post')
    for(const message of selected){if(message.news)channelRequest('channel.save',{id:message.id,saved:patch.saved});else {const key=messageKey(ref.key,message.id);state.messages[key]={...state.messages[key],...patch}}}
    return write(state,ref.key)
   }
   const known=new Set(publicMessages(ref.key,state).map(message=>message.id));if(ids.some((id:string)=>!known.has(id)))throw Error('Unknown public message')
   for(const id of new Set<string>(ids)){const key=messageKey(ref.key,id);state.messages[key]={...state.messages[key],...patch}}
   return write(state,ref.key)
  }
  case 'messenger.draft':{
   for(const key of Object.keys(args))if(args[key]!==undefined&&!['conversation','text','images','files','mentions','replyTo','replyQuote','replyConversation','replyTextOnly','clientMessageId','viewId','expectedClientMessageId'].includes(key))throw Error('Unknown draft field: '+key)
   const ref=resolve(args.conversation)
   if(typeof args.text!=='string'||args.text.length>100000)throw Error('Draft text must be at most 100000 characters')
   const files=attachmentPaths(args.files);if(files.length+(args.images?.length??0)>16)throw Error('Choose at most 16 attachments')
   if(ref.kind==='channel'&&(files.length||args.images?.length||args.replyQuote!==undefined||args.replyConversation!==undefined||args.replyTextOnly!==undefined))throw Error('Channel drafts support text, mentions and a reply within this channel')
   if(args.images!==undefined&&(!Array.isArray(args.images)||args.images.length>16||args.images.some((value:unknown)=>typeof value!=='string')))throw Error('Invalid draft images')
   if(args.mentions!==undefined&&args.mentions!=='all'&&(!Array.isArray(args.mentions)||args.mentions.length>200||args.mentions.some((value:unknown)=>typeof value!=='string')))throw Error('Invalid draft mentions')
   if(args.replyTo!==undefined&&typeof args.replyTo!=='string')throw Error('Invalid draft reply')
   if(args.replyQuote!==undefined){if(!args.replyTo)throw Error('A selected quote requires a reply message');args.replyQuote=quoteShape(args.replyQuote)}
   if(args.replyConversation!==undefined){if(!args.replyTo||typeof args.replyConversation!=='string'||!/^(employee|group|channel):[a-zA-Z0-9_-]+$/.test(args.replyConversation))throw Error('A source conversation requires a valid reply')}
   if(args.replyTextOnly!==undefined&&typeof args.replyTextOnly!=='boolean')throw Error('replyTextOnly must be boolean')
   for(const key of ['clientMessageId','viewId','expectedClientMessageId'])if(args[key]!==undefined&&(typeof args[key]!=='string'||!args[key]||args[key]!==args[key].trim()||args[key].length>160))throw Error('Invalid draft '+key)
   if(ref.kind==='channel'&&args.viewId!==undefined)throw Error('Channel drafts do not use a task view')
   const draft={text:args.text,images:args.images,files,mentions:args.mentions,replyTo:args.replyTo,replyQuote:args.replyQuote,replyConversation:args.replyConversation,replyTextOnly:args.replyTextOnly,clientMessageId:args.clientMessageId,viewId:args.viewId,updatedAt:Date.now()}
   if(args.expectedClientMessageId!==undefined&&state.drafts[ref.key]?.clientMessageId!==args.expectedClientMessageId)return state
   if(!hasDraftContent(draft))delete state.drafts[ref.key]
   else state.drafts[ref.key]=draft
   return write(state,ref.key)
  }
  case 'messenger.search':{
   const filter=args.filter??'all',author=args.author??'all',offset=args.offset??0,limit=args.limit??50,query=args.query??''
   if(!['all','saved','pinned','media','audio','files','links'].includes(filter)||!['all','you','employee'].includes(author))throw Error('Invalid message search filter')
   if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100||typeof query!=='string'||query.length>500)throw Error('Invalid message search pagination or query')
   const selected=args.conversation?resolve(args.conversation):undefined
   const conversations=selected?(selected.kind==='channel'?[]:[selected.key]):[...visibleEmployees().map(card=>conversationKey('employee',card.id)),...listChatGroups().map(group=>conversationKey('group',group.id))],term=query.trim().toLocaleLowerCase()
   const discussion=!selected||selected.kind==='channel'?queryChannelMessages({...(selected?{channelId:selected.id}:{}),limit:-1}).messages.map(message=>discussionMessage(message,state)):[]
   const found=[...conversations.flatMap(ref=>publicMessages(ref,state)),...discussion].filter(message=>!message.preferences.hidden&&(!term||[message.text,...(message.files??[]).map(file=>file.name)].join(' ').toLocaleLowerCase().includes(term))&&(author==='all'||message.authorIdentity?.kind===(author==='you'?'operator':'agent'))&&(filter==='all'||filter==='saved'&&message.preferences.saved||filter==='pinned'&&message.preferences.pinned||filter==='media'&&(message.images.length>0||message.files?.some(file=>file.mimeType.startsWith('video/')))||filter==='audio'&&message.files?.some(file=>file.mimeType.startsWith('audio/'))||filter==='files'&&!!message.files?.length||filter==='links'&&/https?:\/\/\S+/i.test(message.text))).sort((a,b)=>(b.createdAt??0)-(a.createdAt??0)||a.conversation.localeCompare(b.conversation)||a.id.localeCompare(b.id))
   const news=author==='all'&&(!selected||selected.kind==='channel')&&['all','saved','media','links'].includes(filter)?queryChannelPosts({...(selected?{channelId:selected.id}:{}),...(term?{query:term}:{}),...(filter==='saved'?{saved:true}:filter==='media'?{media:true}:filter==='links'?{links:true}:{}),messageOrder:true,limit:offset+limit}):{posts:[],total:0}
   const combined=[...found,...news.posts.map(newsMessage)].sort((a,b)=>(b.createdAt??0)-(a.createdAt??0)||a.conversation.localeCompare(b.conversation)||a.id.localeCompare(b.id)),total=found.length+news.total
   return {messages:combined.slice(offset,offset+limit),total,hasMore:offset+limit<total}
  }
  default:throw Error('Unknown messenger command')
 }
}

/** Cursors refer to public message identities, never to a mutable UI page number. */
function galleryPage(args:Record<string,any>,state:MessengerState):import('../shared/messenger').MessengerGalleryPage{
 const limit=args.limit??40,query=args.query??'',author=args.author??'all',order=args.order??'oldest',direction=args.direction??(args.anchor?'around':'last')
 if(!Number.isInteger(limit)||limit<1||limit>100||typeof query!=='string'||query.length>500||!['all','you','employee'].includes(author)||!['oldest','newest'].includes(order)||!['around','before','after','first','last'].includes(direction))throw Error('Invalid gallery query or page size')
 const cursor=(value:unknown)=>{if(!value||typeof value!=='object'||typeof (value as any).messageId!=='string'||!(value as any).messageId||typeof (value as any).path!=='string'||!(value as any).path)throw Error('A gallery cursor requires messageId and path');const source=(value as any).conversation??args.conversation;if(typeof source!=='string'||!/^(employee|group):[a-zA-Z0-9_-]+$/.test(source))throw Error('A gallery cursor requires its source conversation');return {conversation:source,messageId:(value as any).messageId,path:(value as any).path}}
 const anchor=args.anchor===undefined?undefined:cursor(args.anchor),boundary=args.through===undefined?undefined:cursor(args.through)
 if(['around','before','after'].includes(direction)!==!!anchor)throw Error('Choose an anchor for around/before/after, or an unanchored first/last page')
 const refs=args.conversation?[resolve(args.conversation).key]:[...visibleEmployees().map(card=>conversationKey('employee',card.id)),...listChatGroups().map(group=>conversationKey('group',group.id))]
 let messages=refs.flatMap(ref=>publicMessages(ref,state))
 if(!args.conversation)messages.sort((a,b)=>(a.createdAt??0)-(b.createdAt??0)||b.conversation.localeCompare(a.conversation)||b.id.localeCompare(a.id))
 const all=messages.flatMap(message=>[...new Set(message.images)].map((path,position)=>({message,path,position}))),same=(entry:typeof all[number],ref:ReturnType<typeof cursor>)=>entry.message.conversation===ref.conversation&&entry.message.id===ref.messageId&&entry.path===ref.path
 const end=boundary?all.findIndex(entry=>same(entry,boundary)):all.length-1
 if(boundary&&end<0)throw Error('Gallery boundary is unavailable; refresh the gallery')
 const bounded=all.slice(0,end+1),last=all[end],through=last?{conversation:last.message.conversation,messageId:last.message.id,path:last.path}:null
 if(order==='newest')bounded.sort((a,b)=>(b.message.createdAt??0)-(a.message.createdAt??0)||a.message.conversation.localeCompare(b.message.conversation)||a.message.id.localeCompare(b.message.id)||a.position-b.position)
 const anchorAt=anchor?bounded.findIndex(entry=>same(entry,anchor)):-1
 if(anchor&&anchorAt<0)throw Error('Unknown gallery image cursor')
 const term=query.trim().toLocaleLowerCase(),visible=bounded.map((entry,position)=>({...entry,position})).filter(({message})=>!message.preferences.hidden&&(!term||[message.text,...(message.files??[]).map(file=>file.name)].join(' ').toLocaleLowerCase().includes(term))&&(author==='all'||message.authorIdentity?.kind===(author==='you'?'operator':'agent')))
 const selected=anchor?visible.findIndex(entry=>same(entry,anchor)):-1
 if(direction==='around'&&selected<0)throw Error('Image is unavailable or hidden')
 let offset=0
 if(direction==='around')offset=Math.max(0,Math.min(selected-Math.floor(limit/2),visible.length-limit))
 else if(direction==='last')offset=Math.max(0,visible.length-limit)
 else if(direction==='before')offset=Math.max(0,visible.filter(entry=>entry.position<anchorAt).length-limit)
 else if(direction==='after'){const found=visible.findIndex(entry=>entry.position>anchorAt);offset=found<0?visible.length:found}
 const page=visible.slice(offset,direction==='before'?Math.min(offset+limit,visible.filter(entry=>entry.position<anchorAt).length):offset+limit)
 return {images:page.map(({message,path})=>({...(message.conversation.startsWith('employee:')?{employee:message.conversation.slice(9)}:{group:message.conversation.slice(6)}),messageId:message.id,path,caption:message.text,editRevision:message.editRevision,conversationTitle:message.conversationTitle})),offset,total:visible.length,index:direction==='around'?selected-offset:direction==='before'||direction==='last'?Math.max(0,page.length-1):0,through}
}
