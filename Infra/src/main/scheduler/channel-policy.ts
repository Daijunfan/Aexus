import {one} from '../channel-store'
import {readStore} from '../store'
import {rolePolicy} from '../../shared/roles'
import type {Delegation,PrincipalRef} from '../../shared/management'

/** Channel participation is separate from management authority; both must remain valid. */
export function validateScheduleChannels(employeeId:string,scope:NonNullable<Delegation['schedule']>,principal:PrincipalRef){
 const admins=(id:string)=>{
  const row=one('SELECT admin_ids FROM channels WHERE id=?',id)
  if(!row)throw Error('Scheduled channel is unavailable')
  const members=JSON.parse(row.admin_ids) as string[]
  if(!members.includes(employeeId))throw Error('Scheduled employee is no longer a channel member')
  return members
 }
 if(scope.channelId){
  admins(scope.channelId)
  const row=one('SELECT config FROM channel_engines WHERE channel_id=?',scope.channelId)
  if(!row||JSON.parse(row.config).kind!=='employees')throw Error('Publishing schedules require an employee channel')
 }
 if(scope.eventChannelId){
  const members=admins(scope.eventChannelId),caller=principal.kind==='agent'?readStore().sessions.find(card=>card.id===principal.employeeId):undefined
  if(principal.kind==='agent'&&!rolePolicy(caller?.managementRole).appAdministrator&&!members.includes(principal.employeeId))throw Error('Event source channel is outside your membership')
  if(scope.channelId===scope.eventChannelId)throw Error('A publishing schedule cannot listen to its own destination channel')
 }
}
