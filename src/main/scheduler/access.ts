import {canSchedule,isAppAdministrator,isGlobal,requestContext} from '../authorization'
import {readStore} from '../store'
import type {ScheduledJob,ScheduleRun} from '../../shared/scheduler'

/** Managing an orphaned record must not grant authority to run a missing employee. */
export function scheduleAccess(item:ScheduledJob|ScheduleRun){
 const principal=requestContext().principal,administrator=isAppAdministrator(principal)
 const exists=readStore().sessions.some(card=>card.id===item.action.employeeId&&!card.deleting)
 const authored=principal.kind==='agent'&&item.delegation?.requestedBy.kind==='agent'&&item.delegation.requestedBy.employeeId===principal.employeeId
 const execute=canSchedule(principal,item.action.employeeId)&&(isGlobal(principal)||authored)
 return {read:administrator||execute,maintain:execute||administrator&&!exists,execute,exists}
}
