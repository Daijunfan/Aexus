import {scopeAllows,assertScope,claimEngineResource} from './engine-scope'
import {requireConversation,conversationPolicy,moderateConversation,controlChanged} from './conversation-policy'
import {groupRole,type NoticeReceipt} from '../shared/conversation-controls'
import {sharedAttachments,conversationFileEndpoint,workspaceForMember} from './conversation-workspaces'
import {WORKSPACE_FILE_PREFIX,sharedUploadNotice} from '../shared/conversation-workspaces'
import {removeIndexedConversation} from './message-index-client'
import {SingleFlight} from './single-flight'
import {nextDelivery,routeRecipients} from './delivery'
import {fileVersion} from './read-cache'
import fs from 'node:fs'
import {workspaceFiles} from './files'
import {attachmentPaths,attachmentInfo,type MessageAttachment} from '../shared/message-attachments'
import {quoteShape,validateQuote} from '../shared/message-quotes'
import {randomUUID,createHash} from 'node:crypto'
import {join} from 'node:path'
import {atomicJson} from './atomic-file'
import {readStore} from './store'
import {authorize,callerEmployee,requestContext,delegationFor,validateDelegation,isAppAdministrator,requireAppAdministrator} from './authorization'
import {employeeReady} from '../shared/types'
import {taskViewId} from './task-view'
import type {Delegation,PrincipalRef} from '../shared/management'
import {GROUP_PUBLISH_POLICY,effectiveChatMute,emptyAgentPost,type ChatGroup,type ChatGroupView,type ChatMessage,type ChatDelivery,type ChatTaskContext,type ChatAcknowledgment,type ChatAcknowledgmentPolicy} from '../shared/chat-groups'
export {effectiveChatMute} from '../shared/chat-groups'
import {directory,indexFile,catalog,groupId,historyFile,messages,type Catalog} from './chat-group-store'
const idString=(value:unknown,label:string)=>{if(typeof value!=='string'||!value.trim()||value!==value.trim())throw Error('Provide a valid '+label);return value}
let emit:(id:string,editedMessageId?:string,messageId?:string)=>void=()=>{}
export function setChatEmitter(handler:typeof emit){emit=handler}
const operator=()=>{if(requestContext().principal.kind!=='operator')throw Error('Only the user may manage chat groups or read receipts')}
const fields=(args:Record<string,any>,allowed:string[])=>{for(const key of Object.keys(args))if(args[key]!==undefined&&!allowed.includes(key))throw Error('Unknown chat field: '+key)}
function requireGroup(id:unknown,administrative=false){
 const group=catalog().groups.find(group=>group.id===groupId(id));if(!group)throw Error('Unknown chat group')
 assertScope('groups',group.id)
 const caller=callerEmployee();if(caller&&!group.memberIds.includes(caller.id))throw Error('Not a member of this chat group')
 return group
}
function project(group:ChatGroup):ChatGroupView{
 const cards=readStore().sessions.filter(card=>!card.deleting&&group.memberIds.includes(card.id))
 return {...group,memberIds:cards.map(card=>card.id),members:cards.map(card=>({conversationRole:groupRole(group,card.id),id:card.id,title:card.title,group:card.group,managementRole:card.managementRole??'employee',avatar:card.avatar,engine:card.engine,mutedUntil:effectiveChatMute(group,card.id)})),unread:group.lastIncomingSequence>group.readSequence}
}
function mutateGroup(id:string,change:(group:ChatGroup)=>void){
 const store=catalog(),group=store.groups.find(group=>group.id===id);if(!group)throw Error('Unknown chat group')
 change(group);group.revision++;group.updatedAt=Date.now();atomicJson(indexFile,store,true);emit(id);return group
}
function memberIds(input:unknown,teams:unknown=[]){
 if(!Array.isArray(input)||input.some(id=>typeof id!=='string')||!Array.isArray(teams)||teams.some(name=>typeof name!=='string'))throw Error('Members and teams must be arrays')
 const store=readStore();for(const team of teams)if(!store.groups.includes(team))throw Error('Unknown Team: '+team)
 const ids=[...new Set([...input,...store.sessions.filter(card=>!card.deleting&&teams.includes(card.group)).map(card=>card.id)])] as string[]
 if(ids.length>200)throw Error('A group supports up to 200 employees')
 for(const id of ids)if(!store.sessions.some(card=>card.id===id&&!card.deleting))throw Error('Unknown employee: '+id)
 return ids
}
export function listChatGroups(){authorize('chat.list');const caller=callerEmployee();return catalog().groups.filter(group=>scopeAllows('groups',group.id)&&(!caller||group.memberIds.includes(caller.id))).map(project)}
export function getChatGroup(id:unknown){authorize('chat.get');return project(requireGroup(id,true))}
export function createChatGroup(args:Record<string,any>){
 authorize('chat.create');fields(args,['name','members','team','ownerId'])
 const name=idString(args.name,'group name');if(name.length>80)throw Error('Group name is too long')
 const ids=memberIds(args.members??[],args.team===undefined?[]:[args.team]);if(!ids.length)throw Error('Choose at least one employee')
 const principal=requestContext().principal,ownerId=args.ownerId??(principal.kind==='agent'?principal.employeeId:ids[0]);if(!ids.includes(ownerId))throw Error('Choose an Owner from the selected Agent members');if(principal.kind==='agent'&&ownerId!==principal.employeeId)throw Error('Agent creators must be their new group Owner')
 const now=Date.now(),group:ChatGroup={id:'cg_'+randomUUID(),ownerId,adminIds:[],name,memberIds:ids,sourceTeam:args.team,createdAt:now,updatedAt:now,revision:1,readSequence:0,lastIncomingSequence:0}
 claimEngineResource('groups',group.id)
 const store=catalog();store.groups.push(group);atomicJson(indexFile,store,true);emit(group.id);return project(group)
}
export function updateChatGroup(args:Record<string,any>){
 authorize('chat.update',{id:args.id});requireConversation('group:'+args.id,'admin');fields(args,['id','name','members','addTeams','expectedRevision']);const current=requireGroup(args.id,true)
 if(args.expectedRevision!==undefined&&args.expectedRevision!==current.revision)throw Error('Group changed; reload before saving')
 const name=args.name===undefined?current.name:idString(args.name,'group name');if(name.length>80)throw Error('Group name is too long')
 const ids=memberIds(args.members??project(current).memberIds,args.addTeams??[])
 if(current.ownerId&&current.memberIds.includes(current.ownerId)&&readStore().sessions.some(card=>card.id===current.ownerId&&!card.deleting)&&!ids.includes(current.ownerId))throw Error('Transfer ownership before removing the Owner')
 const result=project(mutateGroup(current.id,group=>{group.name=name;group.memberIds=ids;group.adminIds=group.adminIds?.filter(id=>ids.includes(id));group.mutes=Object.fromEntries(Object.entries(group.mutes??{}).filter(([id])=>id==='all'||ids.includes(id)))}));controlChanged('group:'+current.id);return result
}
export function muteChatMember(args:Record<string,any>){
 authorize('chat.mute',{id:args.id});fields(args,['id','member','muted','durationSeconds','expectedRevision'])
 const current=requireConversation('group:'+args.id,'admin');moderateConversation({conversation:current.conversation,member:args.member,muted:args.muted,durationSeconds:args.durationSeconds,expectedRevision:args.expectedRevision??current.revision});return project(requireGroup(args.id))
}
export function deleteChatGroup(id:unknown){
 authorize('chat.delete',{id});requireConversation('group:'+id,'owner');const group=requireGroup(id,true),store=catalog();store.groups=store.groups.filter(item=>item.id!==group.id)
 // Keep the conversation file recoverable; employees and private histories are untouched.
 atomicJson(indexFile,store,true);removeIndexedConversation('group:'+group.id);emit(group.id);controlChanged('group:'+group.id);return {removed:true,id:group.id}
}
/** Uploaded group media stays separate from every employee workspace. */
export function groupMediaRoot(id:unknown){
 const group=requireGroup(id,true),root=join(directory,'media',group.id);fs.mkdirSync(root,{recursive:true})
 if(fs.lstatSync(join(directory,'media')).isSymbolicLink()||fs.lstatSync(root).isSymbolicLink())throw Error('Group media directory cannot be a symlink')
 return fs.realpathSync(root)
}
export function groupAttachment(args:Record<string,any>){
 authorize('chat.file',args);const shared=typeof args.path==='string'&&args.path.startsWith(WORKSPACE_FILE_PREFIX)?conversationFileEndpoint('group:'+args.id,args.path):undefined;const root=shared?.root??groupMediaRoot(args.id)
 if(typeof args.path!=='string'||!args.path)throw Error('Choose a group attachment')
 if(requestContext().principal.kind!=='operator'&&!messages(String(args.id)).some(message=>message.attachments?.some(file=>file.path===args.path)))throw Error('Only published group attachments are readable')
 const operation=args.operation??'info'
 if(!['info','image','read','chunk'].includes(operation))throw Error('Unknown attachment operation')
 return workspaceFiles(root,({info:'copy-info',image:'read-image',read:'read',chunk:'copy-read'} as Record<string,string>)[operation],{path:shared?.path??args.path,offset:Number(args.offset??0),length:262144})
}
function groupAttachments(id:string,images:unknown,files:unknown):MessageAttachment[]{
 const photos=attachmentPaths(images),documents=attachmentPaths(files)
 if(photos.length+documents.length>16)throw Error('Choose at most 16 attachments')
 if(!photos.length&&!documents.length)return []
 if(requestContext().principal.kind==='agent')return sharedAttachments('group:'+id,images,files)
 operator();const root=groupMediaRoot(id)
 const file=(value:string,kind:'image'|'file')=>{const end=value.startsWith(WORKSPACE_FILE_PREFIX)?conversationFileEndpoint('group:'+id,value):{root,path:value};return attachmentInfo(value,workspaceFiles(end.root,'copy-info',{path:end.path}),kind,kind==='image'?workspaceFiles(end.root,'read-image',{path:end.path}).mimeType:undefined)}
 return [...photos.map(value=>file(value,'image')),...documents.map(value=>file(value,'file'))]
}
export function chatMessagesVersion(id:unknown){authorize('chat.history');return fileVersion(historyFile(requireGroup(id,true).id))}
export function readChatMessages(id:unknown){authorize('chat.history');return messages(requireGroup(id,true).id)}
export function chatHistory(args:Record<string,any>){
 authorize('chat.history');fields(args,['id','before','limit','around']);const group=requireGroup(args.id,true),limit=args.limit??50,before=args.before??Infinity
 if(!Number.isInteger(limit)||limit<1||limit>100||before!==Infinity&&(!Number.isSafeInteger(before)||before<1))throw Error('Invalid history cursor or limit (1–100)')
 if(args.around!==undefined&&args.before!==undefined)throw Error('Choose around or before, not both')
 const history=messages(group.id)
 if(args.around!==undefined){const index=history.findIndex(message=>message.id===args.around);if(index<0)throw Error('Unknown group message');const start=Math.max(0,index-Math.floor(limit/2)),page=history.slice(start,start+limit);return {messages:page,nextBefore:start?page[0].sequence:null}}
 const all=history.filter(message=>message.sequence<before),page=all.slice(-limit)
 return {messages:page,nextBefore:all.length>page.length?page[0].sequence:null}
}
function authorEquals(a:PrincipalRef,b:PrincipalRef){return a.kind===b.kind&&(a.kind==='operator'||b.kind==='agent'&&a.employeeId===b.employeeId)}
function messageKey(value:unknown){
 const id=value===undefined?requestContext().requestId:idString(value,'client message ID');if(id.length>160)throw Error('Client message ID too long');return id
}
function messageText(value:unknown,hasAttachments:boolean,max:number){
 if(typeof value!=='string'||value!==value.trim()||!value&&!hasAttachments)throw Error('Provide a message or attachment')
 if(Array.from(value).length>max)throw Error('Message exceeds '+max+' characters; keep group updates concise')
 return value
}
function append(group:ChatGroup,args:Record<string,any>,targets:string[],kind:ChatMessage['kind'],broadcast=false,workTargets:string[]=[],acknowledgment=false){
 const principal=requestContext().principal,attachments=groupAttachments(group.id,args.images,args.files)
 const text=messageText(typeof args.text==='string'?args.text:'',attachments.length>0,principal.kind==='agent'?GROUP_PUBLISH_POLICY.maxCharacters:16000)
 const clientMessageId=messageKey(args.clientMessageId)
 const all=messages(group.id),quote=args.replyQuote===undefined?undefined:quoteShape(args.replyQuote),fingerprint=createHash('sha256').update(JSON.stringify([text,broadcast?[]:[...targets].sort(),kind,args.replyTo??null,args.viewId??null,...(quote?[quote]:[]),...(args.replyConversation?[args.replyConversation,!!args.replyTextOnly]:[]),...(attachments.length?[attachments.map(file=>[file.path,file.bytes,file.kind])]:[])])).digest('hex')
 const previous=all.find(message=>message.clientMessageId===clientMessageId&&authorEquals(message.author,principal))
 if(previous){if(previous.fingerprint!==fingerprint)throw Error('Client message ID already used with different content');return {message:previous,created:false}}
 if(principal.kind==='agent'&&emptyAgentPost(args.text))throw Error('Public replies require nonempty text')
  if(principal.kind==='agent'&&effectiveChatMute(group,principal.employeeId)!==undefined)throw Error('You are muted in this group; reading and private work remain available')
 if(args.crossReply&&principal.kind!=='operator')throw Error('Only the user may quote another conversation')
 const original=args.replyTo===undefined||args.crossReply?undefined:all.find(message=>message.id===args.replyTo)
 if(args.replyTo!==undefined&&!args.crossReply&&!original)throw Error('Unknown group reply target')
 if(quote&&!args.crossReply){if(!original)throw Error('A selected quote requires a reply message');validateQuote(original.text,quote)}
 const message:ChatMessage={id:'gm_'+randomUUID(),sequence:(all.at(-1)?.sequence??0)+1,createdAt:Date.now(),author:principal,authorName:callerEmployee()?.title??'You',text,...(attachments.length?{attachments}:{}),kind,mentions:broadcast?[]:targets,...(broadcast?{broadcast:true as const}:{}),...(acknowledgment?{acknowledgmentOf:args.replyTo}:{}),deliveries:project(group).memberIds.filter(id=>principal.kind!=='agent'||id!==principal.employeeId).map(employeeId=>({employeeId,mode:workTargets.includes(employeeId)?'work':'awareness',status:'pending'})),replyTo:args.replyTo,...(args.crossReply?{reply:args.crossReply}:{}),...(quote?{replyQuote:quote}:{}),clientMessageId,fingerprint}
 atomicJson(historyFile(group.id),[...all,message],true)
 mutateGroup(group.id,value=>{value.lastMessage={id:message.id,sequence:message.sequence,text:Array.from(text||attachments.map(file=>file.name).join(', ')).slice(0,240).join(''),createdAt:message.createdAt,authorName:message.authorName,author:message.author};if(principal.kind==='agent')value.lastIncomingSequence=message.sequence})
 return {message,created:true}
}
/** Corrections change published text only; accepted tasks retain their original queued prompt. */
export function editChatMessage(args:Record<string,any>):ChatMessage{
 authorize('chat.edit');operator();fields(args,['id','messageId','text','expectedRevision'])
 if(!Number.isSafeInteger(args.expectedRevision)||args.expectedRevision<0)throw Error('Provide a non-negative expected message revision')
 const group=requireGroup(args.id),all=messages(group.id),messageId=idString(args.messageId,'message ID'),message=all.find(item=>item.id===messageId)
 if(!message)throw Error('Unknown group message')
 if(message.author.kind!=='operator')throw Error('Only messages authored by the user can be edited')
 const text=messageText(args.text,!!message.attachments?.length,16000)
 if(text===message.text)return message
 if(args.expectedRevision!==(message.editRevision??0))throw Error('Message changed; reload before saving')
 message.text=text;message.editRevision=(message.editRevision??0)+1;message.editedAt=Date.now()
 atomicJson(historyFile(group.id),all,true)
 if(group.lastMessage?.id===message.id){
  const store=catalog(),current=store.groups.find(item=>item.id===group.id)!
  current.lastMessage!.text=Array.from(text||message.attachments!.map(file=>file.name).join(', ')).slice(0,240).join('');current.lastMessage!.author=message.author;current.revision++
  atomicJson(indexFile,store,true)
 }
 emit(group.id,message.id);return message
}
function acknowledgmentPolicy(group:ChatGroup,message:ChatMessage,delivery:ChatDelivery):ChatAcknowledgmentPolicy{
 const muted=effectiveChatMute(group,delivery.employeeId)!==undefined
 return {mode:delivery.mode??'work',required:'silent-only',acknowledged:delivery.readAt!==undefined,muted,deliveredAt:delivery.deliveredAt,readAt:delivery.readAt,ackMessageId:delivery.ackMessageId}
}
/** Read-only policy for the execution gate; reading context is not itself an acknowledgment. */
export function chatAcknowledgmentPolicy(context:ChatTaskContext,employeeId:string):ChatAcknowledgmentPolicy{
 const group=catalog().groups.find(group=>group.id===context.groupId),message=messages(context.groupId).find(message=>message.id===context.messageId),delivery=message?.deliveries.find(delivery=>delivery.employeeId===employeeId)
 if(!group||!group.memberIds.includes(employeeId)||!message||!delivery)throw Error('Group membership or message routing is no longer valid')
 return acknowledgmentPolicy(group,message,delivery)
}
function acknowledgeDelivery(group:ChatGroup,messageId:unknown,employeeId:string,ackMessageId?:string):ChatAcknowledgment{
 const all=messages(group.id),id=idString(messageId,'request message ID'),message=all.find(message=>message.id===id),delivery=message?.deliveries.find(delivery=>delivery.employeeId===employeeId)
 if(!message||!delivery)throw Error('Only a routed recipient can acknowledge this group request')
 const changed=delivery.readAt===undefined||delivery.deliveredAt===undefined||!!ackMessageId&&!delivery.ackMessageId,now=Date.now()
 delivery.deliveredAt??=now;delivery.readAt??=now;if(ackMessageId)delivery.ackMessageId??=ackMessageId
 if(changed){atomicJson(historyFile(group.id),all,true);emit(group.id,undefined,message.id)}
 return {acknowledged:true,groupId:group.id,messageId:message.id,employeeId,deliveredAt:delivery.deliveredAt,readAt:delivery.readAt,...(delivery.ackMessageId?{ackMessageId:delivery.ackMessageId}:{})}
}
export function postChatMessage(args:Record<string,any>,acknowledgment=false,prepare?:PrepareGroupAttachments){
 authorize('chat.post');fields(args,['id','text','kind','replyTo','replyQuote','replyConversation','replyTextOnly','crossReply','images','files','clientMessageId']);const group=requireGroup(args.id),kind=args.kind??'summary'
 if(kind==='message')operator();else if(!GROUP_PUBLISH_POLICY.kinds.includes(kind))throw Error('Use summary, decision, blocker, question or result')
 const principal=requestContext().principal
 if(args.text===null)throw Error('Null publication is not supported')
 const appended=append(group,args,[],kind,false,[],acknowledgment),message=appended.message
 if(principal.kind==='agent'&&args.replyTo&&!args.crossReply&&messages(group.id).some(item=>item.id===args.replyTo&&item.deliveries.some(delivery=>delivery.employeeId===principal.employeeId)))acknowledgeDelivery(group,args.replyTo,principal.employeeId,message.id)
 if(appended.created)void routeChatMessage(group,message,new Map(),new Map(),prepare).catch(error=>console.error('[Group publication delivery failed]',(error as Error).message))
 return message
}
export function acknowledgeChat(args:Record<string,any>){
 authorize('chat.acknowledge');operator();fields(args,['id','messageId']);const group=requireGroup(args.id),message=messages(group.id).find(item=>item.id===args.messageId)
 if(!message)throw Error('Unknown group message')
 if(group.readSequence<message.sequence)mutateGroup(group.id,value=>{value.readSequence=message.sequence})
 return {acknowledged:true,messageId:message.id}
}
export function chatContext(args:Record<string,any>){
 authorize('chat.context');fields(args,['id','messageId']);const group=project(requireGroup(args.id,true)),all=messages(group.id)
 const message=args.messageId===undefined?undefined:all.find(message=>message.id===args.messageId);if(args.messageId!==undefined&&!message)throw Error('Unknown group message')
 const caller=callerEmployee(),delivery=caller&&message?.deliveries.find(delivery=>delivery.employeeId===caller.id)
 return {group,message,...(!caller||group.memberIds.includes(caller.id)?{workspace:workspaceForMember('group:'+group.id,caller?.id)}:{}),policy:GROUP_PUBLISH_POLICY,...(message&&delivery?{acknowledgment:acknowledgmentPolicy(group,message,delivery)}:{}),recentMessages:all.slice(-20),privateDetails:'Use the original employee conversation for full work details. Group membership never grants access to other private conversations.'}
}
export function updateChatDelivery(employeeId:string,context:ChatTaskContext|undefined,patch:Partial<ChatDelivery>,onlyPending=false){
 if(!context||!catalog().groups.some(group=>group.id===context.groupId))return
 const all=messages(context.groupId),message=all.find(item=>item.id===context.messageId),delivery=message?.deliveries.find(item=>item.employeeId===employeeId)
 if(!delivery)return
 const next=nextDelivery(delivery,patch,onlyPending);if(!next)return
 Object.assign(delivery,next)
 atomicJson(historyFile(context.groupId),all,true);emit(context.groupId,undefined,context.messageId)
}
/** Group context reaches only a frozen recipient's existing session, with the original sender. */
export function chatTaskPrompt(context:ChatTaskContext|undefined,employeeId:string,delegation:Delegation|undefined,text:string,reading=false){
 if(!context)return text
 const group=catalog().groups.find(group=>group.id===context.groupId),message=messages(context.groupId).find(item=>item.id===context.messageId)
 if(!group||!group.memberIds.includes(employeeId)||!message?.deliveries.some(delivery=>delivery.employeeId===employeeId)||!delegation||!authorEquals(message.author,delegation.requestedBy))throw Error('Group membership or message routing is no longer valid')
 if(message.author.kind==='agent'&&!group.memberIds.includes(message.author.employeeId))throw Error('Group sender is no longer a member')
 // append validated this immutable quote; a later source correction must not invalidate accepted work.
 if(message.replyQuote&&!message.reply&&!messages(group.id).some(item=>item.id===message.replyTo))throw Error('Unknown group reply target')
 const original=message.replyTo&&!message.reply?messages(group.id).find(item=>item.id===message.replyTo):undefined
 const addressedTo=[...new Set([...message.mentions,...(original?.author.kind==='agent'?[original.author.employeeId]:[])])].filter(id=>group.memberIds.includes(id))
 const reply=message.reply??(original?{id:original.id,author:original.author,authorName:original.authorName,text:message.replyQuote?.text??original.text,...(message.replyQuote?{quote:message.replyQuote}:{})}:undefined)
 const base='[Group request]\n'+JSON.stringify({conversationType:'group',conversationId:group.id,groupId:group.id,groupName:group.name,messageId:message.id,sequence:message.sequence,sender:message.authorName,author:message.author,createdAt:message.createdAt,broadcast:!!message.broadcast,addressedTo,directlyAddressed:addressedTo.includes(employeeId),acknowledgment:chatAcknowledgmentPolicy(context,employeeId),...(reply?{replyTo:message.replyTo,reply}:{})})+'\n'+text
 if(reading)return base
 return base+'\n\n[Group reporting]\n'+GROUP_PUBLISH_POLICY.guidance+'\n[Shared workspace]\n'+JSON.stringify(workspaceForMember('group:'+group.id,employeeId))+'\nRead shared context with agents chat context '+group.id+' --message '+message.id+' --json. Older messages: agents chat history '+group.id+' --before '+message.sequence+' --limit 50 --json; use nextBefore for the next page. Publish with agents chat post '+group.id+' --reply-to '+message.id+' --text "Reply text" --json. Use workspace.catalog for your available locations and permissions. Read shared files with agents conversation file; use the returned memberDirectory paths.'
}
type PrepareGroupAttachments=(employee:string,groupId:string,message:ChatMessage)=>Promise<{images:string[];files:string[]}>
const sending=new SingleFlight<ChatMessage>()
/** The shared lifecycle retains this source's membership, attachments and work policy. */
function routeChatMessage(group:ChatGroup,message:ChatMessage,delegations:Map<string,Delegation>,targetViews:Map<string,string|undefined>,prepare?:PrepareGroupAttachments):Promise<ChatMessage>{
 const caller=requestContext(),context={groupId:group.id,messageId:message.id}
 return sending.run(message.id,async()=>{
  await routeRecipients({context,recipients:message.deliveries,concurrency:3,
   scope:target=>({delegation:delegations.get(target.employeeId)??{requestedBy:message.author,requestId:caller.requestId,credentialHash:caller.credentialHash,groupNotice:{...context,employeeId:target.employeeId}},viewId:targetViews.get(target.employeeId)}),
   validate:(id,delegation)=>{validateDelegation(delegation,id);chatTaskPrompt(context,id,delegation,message.text)},
   input:()=>({text:sharedUploadNotice(message.text,message.attachments)}),

   update:(id,patch,onlyPending)=>updateChatDelivery(id,context,patch,onlyPending)
  })
  return messages(group.id).find(item=>item.id===message.id)!
 })
}
export async function sendChatMessage(args:Record<string,any>,prepare?:PrepareGroupAttachments):Promise<ChatMessage>{
 authorize('chat.send');fields(args,['id','text','mentions','clientMessageId','viewId','replyTo','replyQuote','replyConversation','replyTextOnly','crossReply','images','files'])
 const group=project(requireGroup(args.id)),mention=args.mentions??[]
 if(mention!=='all'&&(!Array.isArray(mention)||mention.some(id=>typeof id!=='string')))throw Error('Mentions must be employee IDs or all')
 const principal=requestContext().principal,clientId=messageKey(args.clientMessageId),inputBroadcast=principal.kind==='operator'&&Array.isArray(mention)&&mention.length===0
 const history=messages(group.id),previous=history.find(message=>message.clientMessageId===clientId&&authorEquals(message.author,principal))
 const original=args.replyTo&&!args.crossReply?history.find(message=>message.id===args.replyTo):undefined
 const replyTarget=principal.kind==='operator'&&original?.author.kind==='agent'&&group.memberIds.includes(original.author.employeeId)?original.author.employeeId:undefined
 const broadcast=inputBroadcast&&!replyTarget
 if(previous){
  if(previous.broadcast&&!inputBroadcast)throw Error('Client message ID already used with different content')
  const retried=append(group,args,mention==='all'?previous.mentions:[...new Set<string>(mention)],'message',!!previous.broadcast).message
  return sending.get(retried.id)??retried
 }
 const explicit=mention==='all'?group.memberIds:[...new Set<string>(mention)]
 for(const id of explicit)if(!group.memberIds.includes(id))throw Error('Mentioned employee is not a group member: '+id)
 const targets=broadcast?group.memberIds:[...new Set([...explicit,...(replyTarget?[replyTarget]:[])])]
 const store=readStore(),delegations=new Map<string,Delegation>(),targetViews=new Map<string,string|undefined>()
 for(const id of targets){
  const card=store.sessions.find(card=>card.id===id&&!card.deleting)
  if(!card||!employeeReady(card))throw Error('Mentioned employee is not ready: '+id)
  delegations.set(id,delegationFor(id));targetViews.set(id,taskViewId(id,card.managementRole==='governor'?args.viewId:undefined))
 }
 const appended=append(group,args,explicit,'message',broadcast,targets)
 if(!appended.created)return appended.message
 return routeChatMessage(group,appended.message,delegations,targetViews,prepare)
}
/** A group storage failure must not prevent private history persistence or engine cleanup. */
export function recordChatDelivery(...args:Parameters<typeof updateChatDelivery>){
 try{updateChatDelivery(...args)}catch(error){console.error('[Group delivery update failed]',(error as Error).message)}
}
/** Recover the summary projection, but never replay uncertain model requests after a restart. */
export function recoverChatDeliveries(){
 let store:Catalog
 try{store=catalog()}catch(error){console.error('[Group catalog unavailable]',(error as Error).message);return}
 let indexChanged=false
 for(const group of store.groups){try{
  const all=messages(group.id);let changed=false
  for(const message of all)for(const delivery of message.deliveries)if(['pending','routing','queued','running'].includes(delivery.status)){delivery.status='interrupted';delivery.error='Core restarted. Check the private conversation before resending.';changed=true}
  if(changed)atomicJson(historyFile(group.id),all,true)
  const last=all.at(-1),incoming=all.filter(message=>message.author.kind==='agent').at(-1)?.sequence??0
  if(last&&(group.lastMessage?.sequence!==last.sequence||group.lastIncomingSequence!==incoming)){
   group.lastMessage={id:last.id,sequence:last.sequence,text:Array.from(last.text).slice(0,240).join(''),createdAt:last.createdAt,authorName:last.authorName,author:last.author};group.lastIncomingSequence=incoming;group.revision++;indexChanged=true
  }
 }catch(error){console.error('[Group history unavailable]',group.id,(error as Error).message)}}
 if(indexChanged)atomicJson(indexFile,store,true)
}

/** Static notice publication never routes employee deliveries or invokes an engine. */
export function publishGroupNotice(id:string,text:string,publisherId:string,notice:NoticeReceipt){
 const group=requireConversation('group:'+id,'admin',{kind:'agent',employeeId:publisherId}).group!,all=messages(id),messageId='gm_'+notice.occurrenceId
 let message=all.find(message=>message.id===messageId)
 if(!message){const card=readStore().sessions.find(card=>card.id===publisherId&&!card.deleting)!;message={id:messageId,sequence:(all.at(-1)?.sequence??0)+1,createdAt:Date.now(),author:{kind:'agent',employeeId:publisherId},authorName:card.title,text,kind:'message',mentions:[],deliveries:[],notice,clientMessageId:notice.occurrenceId,fingerprint:createHash('sha256').update(text).digest('hex')};atomicJson(historyFile(id),[...all,message],true)}
 const published=message
 if(!group.lastMessage||group.lastMessage.sequence<published.sequence)mutateGroup(id,value=>{value.lastMessage={id:published.id,sequence:published.sequence,text:published.text.slice(0,240),createdAt:published.createdAt,authorName:published.authorName,author:published.author};value.lastIncomingSequence=Math.max(value.lastIncomingSequence,published.sequence)})
 emit(id,undefined,messageId);return published
}
