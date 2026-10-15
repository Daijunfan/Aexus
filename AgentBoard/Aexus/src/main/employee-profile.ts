import {channelOffices,channelMemberIds} from './channel-members'
import {groupRole} from '../shared/conversation-controls'
import {conversationMuted} from './conversation-policy'
import {authorize,requestContext,isAppAdministrator} from './authorization'
import {readStore} from './store'
import {catalog} from './chat-group-store'
import {all} from './channel-store'
import {workspaceForMember} from './conversation-workspaces'
import {planRequest} from './plan'
import {scheduleRequest} from './scheduler/service'
import {effectiveChatMute} from '../shared/chat-groups'
import {employeeSettings,teamSettings} from '../shared/types'
import type {PlanQuery} from '../shared/plan'
import type {EmployeeProfileData,ProfileMembership} from '../shared/employee-profile'

/** Compose current identities, never a second membership or workspace registry. */
export async function employeeProfile(args:Record<string,unknown>):Promise<EmployeeProfileData>{
 for(const key of Object.keys(args))if(!['id','offset','limit'].includes(key))throw Error('Unknown profile field: '+key)
 const {id,offset=0,limit=12}=args
 if(typeof id!=='string'||!id||!Number.isSafeInteger(offset)||Number(offset)<0||!Number.isSafeInteger(limit)||Number(limit)<1||Number(limit)>100)throw Error('Choose an employee ID, nonnegative offset and limit 1–100')
 authorize('card.profile',args,id)
 let plans:EmployeeProfileData['plans']={rows:[],total:0,offset:Number(offset),hasMore:false,counts:{scheduled:0,running:0,paused:0,completed:0,attention:0},eventTriggersSupported:false}
 try{
  const query=await planRequest('query',{filter:{employee:id},offset,limit}) as PlanQuery
  const capabilities=await scheduleRequest('schema',{}) as {rule?:Record<string,unknown>}
  plans.eventTriggersSupported=!!capabilities.rule?.event
  plans={...plans,total:query.total,hasMore:query.hasMore,counts:query.counts,rows:query.rows.map(job=>({id:job.id,name:job.name,status:job.status,enabled:job.enabled,nextAt:job.nextAt,rule:job.rule,occurrences:job.occurrences??0,maxOccurrences:job.maxOccurrences,...(job.lastRun?{lastRun:{status:job.lastRun.status,at:job.lastRun.startedAt}}:{})}))}
 }catch(error){plans.error=(error as Error).message}
 // Authorization and memberships may change while the scheduler projection is awaited.
 authorize('card.profile',args,id)
 const store=readStore(),card=store.sessions.find(card=>card.id===id&&!card.deleting)
 if(!card)throw Error('Employee no longer exists')
 const principal=requestContext().principal,admin=isAppAdministrator(),settings=employeeSettings(store,card),team=teamSettings(store,card.group)
 const groups=catalog().groups.filter(g=>g.memberIds.includes(id)&&(principal.kind==='operator'||principal.kind==='agent'&&g.memberIds.includes(principal.employeeId))).map(g=>({id:g.id,name:g.name,kind:'group' as const,role:groupRole(g,id)!,muted:effectiveChatMute(g,id)!==undefined,canOpenWorkspace:principal.kind==='operator'||principal.kind==='agent'&&g.memberIds.includes(principal.employeeId)}))
 const channels=all('SELECT id,name,admin_ids FROM channels').filter(c=>{const members=channelMemberIds(c.id);return members.includes(id)&&(principal.kind==='operator'||principal.kind==='agent'&&members.includes(principal.employeeId))}).map(c=>({id:c.id as string,name:c.name as string,kind:'channel' as const,role:groupRole(channelOffices(c.id),id)!,muted:conversationMuted('channel:'+c.id,id)!==undefined,canOpenWorkspace:principal.kind==='operator'||principal.kind==='agent'&&channelMemberIds(c.id).includes(principal.employeeId)}))
 const memberships:ProfileMembership[]=[...groups,...channels].map(item=>{
  const conversation=item.kind+':'+item.id
  try{return {...item,conversation,workspace:workspaceForMember(conversation,id,false)}}catch(error){return {...item,conversation,workspace:null,workspaceError:(error as Error).message}}
 })
 return {employee:{id:card.id,title:card.title,avatar:card.avatar,color:card.color,accessory:card.accessory,role:card.role,engine:card.engine,model:card.model,managementRole:card.managementRole??'employee',kind:card.kind??'worker',createdAt:card.createdAt},company:{team:card.group,mode:team.mode,teamRoot:store.teamRoots?.[card.group]??null,workspace:card.cwd,location:settings.mode==='cloud'?'remote':'core',host:settings.mode==='cloud'?settings.remote?.host??null:null},memberships,plans,canEditProfile:admin}
}
