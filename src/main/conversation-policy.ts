import {catalog,indexFile} from './chat-group-store'
import {atomicJson} from './atomic-file'
import {one,run,changed,transaction} from './channel-store'
import {readStore} from './store'
import {requestContext} from './request-context'
import type {PrincipalRef} from '../shared/management'
import type {ChatGroup} from '../shared/chat-groups'
import {effectiveChatMute} from '../shared/chat-groups'
import {groupRole,type ConversationPolicy,type ConversationRole} from '../shared/conversation-controls'

let notify:(conversation:string)=>void=()=>{}
export const setConversationPolicyEmitter=(callback:typeof notify)=>{notify=callback}
export function controlChanged(conversation:string){notify(conversation)}
export function conversationIdentity(value:unknown){
 if(typeof value!=='string'||!/^(group|channel):[a-zA-Z0-9_-]+$/.test(value))throw Error('Choose a group:ID or channel:ID conversation')
 const [kind,id]=value.split(':')
 const group=kind==='group'?catalog().groups.find(group=>group.id===id):undefined
 const channel=kind==='channel'?one('SELECT id,name,admin_ids,revision FROM channels WHERE id=?',id):undefined
 if(!group&&!channel)throw Error('Conversation no longer exists')
 const existing=new Set(readStore().sessions.filter(card=>!card.deleting).map(card=>card.id))
 const members=(group?group.memberIds:JSON.parse(channel!.admin_ids) as string[]).filter(id=>existing.has(id))
 const controls=channel?one('SELECT * FROM channel_conversation_controls WHERE channel_id=?',id):undefined
 const role=(employeeId:string):ConversationRole|undefined=>!members.includes(employeeId)?undefined:group?groupRole(group,employeeId):'admin'
 return {conversation:value,kind:kind as 'group'|'channel',id,name:group?.name??String(channel!.name),group,members,role,revision:group?.revision??Number(channel!.revision),mutes:group?.mutes??(controls?JSON.parse(controls.mutes):{}) as Record<string,number|null>,silent:group?.silent??!!controls?.silent}
}
export function requireConversation(value:unknown,capability:'read'|'admin'|'owner'='read',principal:PrincipalRef=requestContext().principal){
 const current=conversationIdentity(value)
 if(principal.kind==='operator')return current
 const role=current.role(principal.employeeId)
 if(!role)throw Error('Forbidden: not a member of this conversation')
 if(capability==='owner'&&role!=='owner'||capability==='admin'&&role!=='admin'&&role!=='owner')throw Error('Forbidden: conversation '+(capability==='owner'?'Owner':'Owner/Admin')+' required; Company rank does not grant this office')
 return current
}
export function conversationMuted(value:string,employeeId:string){
 const current=conversationIdentity(value)
 // Group-wide announcement mode leaves its actual Owner/Admin able to publish.
 const mutes=current.kind==='group'&&current.role(employeeId)!=='member'?Object.fromEntries(Object.entries(current.mutes).filter(([id])=>id!=='all')):current.mutes
 return effectiveChatMute({mutes},employeeId)
}
export function requireConversationPublisher(value:string,id:string){
 const current=requireConversation(value,'admin',{kind:'agent',employeeId:id})
 if(conversationMuted(value,id)!==undefined)throw Error('Publisher is muted in this conversation')
 return current
}
function revise(value:ReturnType<typeof conversationIdentity>,expected:unknown,update:(group?:ChatGroup)=>void){
 if(!Number.isSafeInteger(expected)||expected!==value.revision)throw Error('Conversation changed; reload before saving')
 if(value.group){const store=catalog(),group=store.groups.find(group=>group.id===value.id)!;update(group);group.revision++;group.updatedAt=Date.now();atomicJson(indexFile,store,true)}
 else{transaction(()=>{update();run('UPDATE channels SET revision=revision+1,updated_at=? WHERE id=?',Date.now(),value.id)});changed('channels',{channelIds:[value.id]})}
 notify(value.conversation)
 return projectPolicy(conversationIdentity(value.conversation))
}
export function conversationPolicy(value:unknown):ConversationPolicy{return projectPolicy(requireConversation(value))}
function projectPolicy(current:ReturnType<typeof conversationIdentity>):ConversationPolicy{
 const principal=requestContext().principal,role=principal.kind==='operator'?'operator':current.role(principal.employeeId)??null,admin=['operator','owner','admin'].includes(role??'')
 const cards=readStore().sessions
 return {conversation:current.conversation,name:current.name,kind:current.kind,revision:current.revision,ownerId:current.group?.ownerId&&current.members.includes(current.group.ownerId)?current.group.ownerId:null,silent:current.silent,mutes:current.mutes,actorRole:role,members:current.members.map(id=>({id,name:cards.find(card=>card.id===id)!.title,role:current.role(id)!,mutedUntil:conversationMuted(current.conversation,id)})),allowedActions:[...(admin?['roles','mute','silence','notices']:[]),...(current.kind==='group'&&(role==='operator'||role==='owner')?['transfer-owner','delete-group']:[])]}
}
export function changeConversationRole(args:Record<string,any>){
 const current=requireConversation(args.conversation,'admin'),principal=requestContext().principal,id=args.employee,role=args.role
 if(!['owner','admin','member'].includes(role)||typeof id!=='string'||!readStore().sessions.some(card=>card.id===id&&!card.deleting))throw Error('Choose an existing Agent and Owner, Admin or Member')
 if(current.group){
  if(!current.members.includes(id))throw Error('Add this employee to the group before assigning an office')
  if(role==='owner')requireConversation(args.conversation,'owner')
  if(current.group.ownerId===id&&role!=='owner')throw Error('Transfer ownership before changing the Owner office')
 }else if(role==='owner')throw Error('Channels use Admin publishers; Owner is a group-only office')
 return revise(current,args.expectedRevision,group=>{
  if(group){const admins=new Set(group.adminIds??[]);if(role==='owner'){if(group.ownerId&&group.memberIds.includes(group.ownerId))admins.add(group.ownerId);group.ownerId=id;admins.delete(id)}else if(role==='admin')admins.add(id);else admins.delete(id);group.adminIds=[...admins].filter(value=>group.memberIds.includes(value)&&value!==group.ownerId)}
  else{const ids=new Set(current.members);if(role==='admin')ids.add(id);else ids.delete(id);run('UPDATE channels SET admin_ids=? WHERE id=?',JSON.stringify([...ids]),current.id)}
 })
}
export function moderateConversation(args:Record<string,any>,silence=false){
 const current=requireConversation(args.conversation,'admin'),principal=requestContext().principal
 const mutes={...current.mutes};let silent=current.silent
 if(silence){if(typeof args.silent!=='boolean')throw Error('silent must be boolean');silent=args.silent}
 else{
  if(typeof args.member!=='string'||args.member!=='all'&&!current.members.includes(args.member))throw Error('Choose a current member or all')
  if(typeof args.muted!=='boolean')throw Error('muted must be boolean')
  if(args.member===current.group?.ownerId&&principal.kind==='agent'&&principal.employeeId!==current.group.ownerId)throw Error('An Admin cannot mute the Owner')
  if(args.durationSeconds!==undefined&&(!args.muted||!Number.isSafeInteger(args.durationSeconds)||args.durationSeconds<1||args.durationSeconds>31536000))throw Error('Mute duration must be 1–31536000 seconds')
  if(args.muted)mutes[args.member]=args.durationSeconds===undefined?null:Date.now()+args.durationSeconds*1000;else delete mutes[args.member]
 }
 return revise(current,args.expectedRevision,group=>{if(group){group.mutes=mutes;group.silent=silent}else run('INSERT INTO channel_conversation_controls(channel_id,mutes,silent) VALUES(?,?,?) ON CONFLICT(channel_id) DO UPDATE SET mutes=excluded.mutes,silent=excluded.silent',current.id,JSON.stringify(mutes),silent?1:0)})
}
