import {channelOffices,saveChannelOffices} from './channel-members'
import {catalog,indexFile} from './chat-group-store'
import {atomicJson} from './atomic-file'
import {one,all,run,changed,transaction} from './channel-store'
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
 const offices=group??channelOffices(id)
 const members=offices.memberIds.filter(id=>existing.has(id)),ownerId=offices.ownerId&&members.includes(offices.ownerId)?offices.ownerId:null
 const controls=channel?one('SELECT * FROM channel_conversation_controls WHERE channel_id=?',id):undefined
 const role=(employeeId:string):ConversationRole|undefined=>!members.includes(employeeId)?undefined:groupRole({...offices,memberIds:members},employeeId)
 return {conversation:value,kind:kind as 'group'|'channel',id,ownerId,name:group?.name??String(channel!.name),group,members,role,revision:group?.revision??Number(channel!.revision),mutes:group?.mutes??(controls?JSON.parse(controls.mutes):{}) as Record<string,number|null>,silent:group?.silent??!!controls?.silent}
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
function revise(value:ReturnType<typeof conversationIdentity>,expected:unknown,update:(group?:ChatGroup)=>void,action='update',details:Record<string,unknown>={}){
 if(!Number.isSafeInteger(expected)||expected!==value.revision)throw Error('Conversation changed; reload before saving')
 if(value.group){const store=catalog(),group=store.groups.find(group=>group.id===value.id)!;update(group);group.revision++;group.updatedAt=Date.now();atomicJson(indexFile,store,true)}
 else{transaction(()=>{update();run('UPDATE channels SET revision=revision+1,updated_at=? WHERE id=?',Date.now(),value.id)});changed('channels',{channelIds:[value.id]})}
 run('INSERT INTO conversation_audit(conversation,actor,action,details,created_at) VALUES(?,?,?,?,?)',value.conversation,JSON.stringify(requestContext().principal),action,JSON.stringify(details),Date.now())
 notify(value.conversation)
 return projectPolicy(conversationIdentity(value.conversation))
}
export function conversationPolicy(value:unknown):ConversationPolicy{return projectPolicy(requireConversation(value))}
function projectPolicy(current:ReturnType<typeof conversationIdentity>):ConversationPolicy{
 const principal=requestContext().principal,role=principal.kind==='operator'?'operator':current.role(principal.employeeId)??null,admin=['operator','owner','admin'].includes(role??'')
 const cards=readStore().sessions
 return {conversation:current.conversation,name:current.name,kind:current.kind,revision:current.revision,ownerId:current.ownerId,silent:current.silent,mutes:current.mutes,actorRole:role,members:current.members.map(id=>({id,name:cards.find(card=>card.id===id)!.title,role:current.role(id)!,mutedUntil:conversationMuted(current.conversation,id)})),allowedActions:[...(admin?['members','roles','mute','silence','notices','audit']:[]),...((role==='operator'||role==='owner')?['transfer-owner',...(current.kind==='group'?['delete-group']:[])]:[])]}
}
export function changeConversationRole(args:Record<string,any>){
 const current=requireConversation(args.conversation,'admin'),principal=requestContext().principal,id=args.employee,role=args.role
 if(!['owner','admin','member'].includes(role)||typeof id!=='string'||!readStore().sessions.some(card=>card.id===id&&!card.deleting))throw Error('Choose an existing Agent and Owner, Admin or Member')
 if(current.group){
  if(!current.members.includes(id))throw Error('Add this employee to the group before assigning an office')
  if(role==='owner')requireConversation(args.conversation,'owner')
  if(current.group.ownerId===id&&role!=='owner')throw Error('Transfer ownership before changing the Owner office')
 }else{
  if(!current.members.includes(id)&&current.members.length>=200)throw Error('A conversation supports up to 200 members')
  if(role==='owner')requireConversation(args.conversation,'owner')
  if(current.ownerId===id&&role!=='owner')throw Error('Transfer ownership before changing the Owner office')
 }
 return revise(current,args.expectedRevision,group=>{
  if(group){const admins=new Set(group.adminIds??[]);if(role==='owner'){if(group.ownerId&&group.memberIds.includes(group.ownerId))admins.add(group.ownerId);group.ownerId=id;admins.delete(id)}else if(role==='admin')admins.add(id);else admins.delete(id);group.adminIds=[...admins].filter(value=>group.memberIds.includes(value)&&value!==group.ownerId)}
  else{const offices=channelOffices(current.id),members=new Set(offices.memberIds),admins=new Set(offices.adminIds);members.add(id);if(role==='member')admins.delete(id);else admins.add(id);saveChannelOffices(current.id,{memberIds:[...members],adminIds:[...admins],ownerId:role==='owner'?id:offices.ownerId})}
 },'role',{employee:id,role})
}
export function moderateConversation(args:Record<string,any>,silence=false){
 const current=requireConversation(args.conversation,'admin'),principal=requestContext().principal
 const mutes={...current.mutes};let silent=current.silent
 if(silence){if(typeof args.silent!=='boolean')throw Error('silent must be boolean');silent=args.silent}
 else{
  if(typeof args.member!=='string'||args.member!=='all'&&!current.members.includes(args.member))throw Error('Choose a current member or all')
  if(typeof args.muted!=='boolean')throw Error('muted must be boolean')
  if(args.member===current.ownerId&&principal.kind==='agent'&&principal.employeeId!==current.ownerId)throw Error('An Admin cannot mute the Owner')
  if(args.durationSeconds!==undefined&&(!args.muted||!Number.isSafeInteger(args.durationSeconds)||args.durationSeconds<1||args.durationSeconds>31536000))throw Error('Mute duration must be 1–31536000 seconds')
  if(args.muted)mutes[args.member]=args.durationSeconds===undefined?null:Date.now()+args.durationSeconds*1000;else delete mutes[args.member]
 }
 return revise(current,args.expectedRevision,group=>{if(group){group.mutes=mutes;group.silent=silent}else run('INSERT INTO channel_conversation_controls(channel_id,mutes,silent) VALUES(?,?,?) ON CONFLICT(channel_id) DO UPDATE SET mutes=excluded.mutes,silent=excluded.silent',current.id,JSON.stringify(mutes),silent?1:0)},silence?'silence':'mute',silence?{silent}:{member:args.member,muted:args.muted,durationSeconds:args.durationSeconds})
}

export function changeConversationMember(args:Record<string,any>){
 const current=requireConversation(args.conversation,'admin'),id=args.employee
 if(!['add','remove'].includes(args.action)||typeof id!=='string'||!readStore().sessions.some(card=>card.id===id&&!card.deleting))throw Error('Choose an existing employee and add or remove')
 if(args.action==='remove'&&id===current.ownerId)throw Error('Transfer ownership before removing the Owner')
 if(args.action==='add'&&!current.members.includes(id)&&current.members.length>=200)throw Error('A conversation supports up to 200 members')
 return revise(current,args.expectedRevision,group=>{
  const ids=new Set(current.members);if(args.action==='add')ids.add(id);else ids.delete(id)
  if(group){group.memberIds=[...ids];group.adminIds=group.adminIds?.filter(id=>ids.has(id));if(args.action==='remove'&&group.mutes)delete group.mutes[id]}
  else{const offices=channelOffices(current.id);saveChannelOffices(current.id,{...offices,memberIds:[...ids],adminIds:offices.adminIds.filter(id=>ids.has(id))});const mutes={...current.mutes};if(args.action==='remove')delete mutes[id];run('UPDATE channel_conversation_controls SET mutes=? WHERE channel_id=?',JSON.stringify(mutes),current.id)}
 },'member',{employee:id,action:args.action})
}
export function conversationAudit(args:Record<string,any>){
 const current=requireConversation(args.conversation,'admin'),limit=args.limit??50,before=args.before??Number.MAX_SAFE_INTEGER
 if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(before)||before<1)throw Error('Use limit 1–100 and a positive audit cursor')
 const rows=all('SELECT * FROM conversation_audit WHERE conversation=? AND id<? ORDER BY id DESC LIMIT ?',current.conversation,before,limit+1)
 return {rows:rows.slice(0,limit).map(row=>({id:row.id,actor:JSON.parse(row.actor),action:row.action,details:JSON.parse(row.details),createdAt:row.created_at})),nextBefore:rows.length>limit?rows[limit-1].id:null}
}
