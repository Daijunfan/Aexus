import type {StoredSession,TeamSettings} from './types'
import type {ConversationWorkspace} from './conversation-workspaces'
import type {PlanState} from './plan'
import type {ScheduleRule} from './scheduler'

export type ProfilePlan={id:string;name:string;status:PlanState;enabled:boolean;nextAt:string|null;rule:ScheduleRule;occurrences:number;maxOccurrences?:number|null;lastRun?:{status:string;at:string}}
export type ProfileMembership={conversation:string;id:string;kind:'group'|'channel';name:string;role:import('./conversation-controls').ConversationRole|'administrator';muted:boolean;workspace:ConversationWorkspace|null;workspaceError?:string;canOpenWorkspace:boolean}
/** An authorized projection; it contains no credentials, private messages or execution handles. */
export type EmployeeProfileData={
 employee:Pick<StoredSession,'id'|'title'|'avatar'|'color'|'accessory'|'role'|'engine'|'model'|'managementRole'|'kind'|'createdAt'>
 company:{team:string;mode:TeamSettings['mode'];teamRoot:string|null;workspace:string;location:'core'|'remote';host:string|null}
 memberships:ProfileMembership[]
 plans:{rows:ProfilePlan[];total:number;offset:number;hasMore:boolean;counts:Record<PlanState,number>;eventTriggersSupported:boolean;error?:string}
 canEditProfile:boolean
}
