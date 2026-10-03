import {CONVERSATION_CONTROL_GUIDANCE} from './conversation-controls.ts'
import type {MessageAttachment} from './message-attachments'
import type {MessageReply} from './types'
import type {MessageQuote} from './message-quotes'
import type {PrincipalRef} from './management'
export type ChatTaskContext={groupId:string;messageId:string}
export type SharedTaskContext=ChatTaskContext|import('./channels').ChannelTaskContext
export type ChatDelivery={employeeId:string;mode?:'work'|'awareness';status:'pending'|'routing'|'queued'|'running'|'completed'|'failed'|'interrupted';sessionId?:string;queueId?:string;taskId?:string;error?:string;deliveredAt?:number;readAt?:number;ackMessageId?:string}
export type ChatAcknowledgment={acknowledged:true;groupId:string;messageId:string;employeeId:string;deliveredAt:number;readAt:number;ackMessageId?:string}
export type ChatAcknowledgmentPolicy={mode:'work'|'awareness';required:'visible'|'silent-or-visible'|'silent-only';acknowledged:boolean;muted:boolean;deliveredAt?:number;readAt?:number;ackMessageId?:string}
export type ChatMessage={notice?:import('./conversation-controls').NoticeReceipt;id:string;sequence:number;createdAt:number;author:PrincipalRef;authorName:string;text:string;editRevision?:number;editedAt?:number;attachments?:MessageAttachment[];kind:'message'|'summary'|'decision'|'blocker'|'question'|'result';mentions:string[];broadcast?:true;acknowledgmentOf?:string;deliveries:ChatDelivery[];replyTo?:string;replyQuote?:MessageQuote;reply?:MessageReply;clientMessageId:string;fingerprint:string}
export type ChatGroup={ownerId?:string|null;adminIds?:string[];silent?:boolean;id:string;name:string;memberIds:string[];sourceTeam?:string;createdAt:number;updatedAt:number;revision:number;readSequence:number;lastIncomingSequence:number;mutes?:Record<string,number|null>;lastMessage?:Pick<ChatMessage,'id'|'sequence'|'text'|'createdAt'|'authorName'>&{author?:PrincipalRef}}
/** Undefined means unmuted, null means indefinite; all/member deadlines combine without timers. */
export function effectiveChatMute(group:Pick<ChatGroup,'mutes'|'ownerId'|'adminIds'>,employeeId:string,now=Date.now()):number|null|undefined{
 const all=group.ownerId===employeeId||group.adminIds?.includes(employeeId)?undefined:group.mutes?.all,member=group.mutes?.[employeeId]
 if(all===null||member===null)return null
 const until=Math.max(all??0,member??0);return until>now?until:undefined
}
export type ChatMember={conversationRole?:import('./conversation-controls').ConversationRole;id:string;title:string;group:string;managementRole:string;avatar?:string;engine:string;mutedUntil?:number|null}
export type ChatGroupView=ChatGroup&{members:ChatMember[];unread:boolean}
export type ChatHistory={messages:ChatMessage[];nextBefore:number|null}
export const emptyAgentPost=(value:unknown)=>typeof value!=='string'||!value.trim()||/^(?:null|undefined|none)$/i.test(value.trim())
export const GROUP_PUBLISH_POLICY={maxCharacters:2000,kinds:['summary','decision','blocker','question','result'],guidance:CONVERSATION_CONTROL_GUIDANCE+' Every public group message reaches other current members. Replies and mentions identify work targets; everyone else receives context only. Core records receipt automatically after the private reading turn completes. Do not call any tool to acknowledge or remain silent. Awareness never invites another public reply. Ordinary assistant text, reasoning and final output stay in the employee conversation and are never posted to a group. To share a useful result, decision, blocker or answer, explicitly call chat.post with the exact group ID, replyTo and nonempty human-facing text, or use the bound agents_company_discussion_post tool during the response stage. Do not send null, undefined, empty text, or a message explaining that you will remain silent. Silence requires no API call. Use stable destination IDs, never display names or the active UI. Keep full reasoning, credentials, tool traces and large logs in the employee conversation. Group work does not create private-conversation unread badges. Group membership does not grant control of other employees.'} as const
