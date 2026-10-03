import type {PrincipalRef} from './management'

/** Conversation offices confer no Company, Plan or workspace authority. */
export const CONVERSATION_ROLES=['owner','admin','member'] as const
export type ConversationRole=typeof CONVERSATION_ROLES[number]
export const CONVERSATION_ROLE_LABELS:Record<ConversationRole,string>={owner:'Owner',admin:'Admin',member:'Member'}
export function groupRole(group:{ownerId?:string|null;adminIds?:string[];memberIds:string[]},id:string):ConversationRole|undefined{
 if(!group.memberIds.includes(id))return undefined
 return group.ownerId===id?'owner':group.adminIds?.includes(id)?'admin':'member'
}
export type ConversationPolicy={conversation:string;name:string;kind:'group'|'channel';revision:number;ownerId:string|null;silent:boolean;mutes:Record<string,number|null>;actorRole:ConversationRole|'operator'|null;members:{id:string;name:string;role:ConversationRole;mutedUntil?:number|null}[];allowedActions:string[]}
export type NoticeRule={kind:'once';at:string}|{kind:'interval';everySeconds:number;anchor:string}|{kind:'weekly';time:string;days:number[];timezone:string}
export type NoticeSpec={name:string;text:string;publisherId:string;rule:NoticeRule;enabled:boolean}
export type ConversationNotice=NoticeSpec&{id:string;conversation:string;revision:number;createdAt:number;updatedAt:number;createdBy:PrincipalRef;nextAt:string|null;disabledReason?:string;status:'scheduled'|'paused'|'completed'|'attention'}
export type NoticeReceipt={noticeId:string;occurrenceId:string;scheduledFor:string;automatic:true;silent:boolean}
export type NoticeOccurrence={id:string;noticeId:string;scheduledFor:string;status:'pending'|'published'|'skipped'|'cancelled';messageId?:string;publishedAt?:number;error?:string}
export const CONVERSATION_CONTROL_GUIDANCE='Conversation Owner/Admin/Member is independent of Company role. conversation.policy returns current authority. Owner/Admin manage moderation and fixed-text notices; schedule.* runs employee work.'
