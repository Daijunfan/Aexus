import type {MessageAttachment} from './message-attachments'
import type {MessageReply} from './types'
import type {MessageQuote} from './message-quotes'
import type {PrincipalRef} from './management'
export type ChatTaskContext={groupId:string;messageId:string}
export type SharedTaskContext=ChatTaskContext|import('./channels').ChannelTaskContext
export type ChatDelivery={employeeId:string;mode?:'work'|'awareness';status:'pending'|'routing'|'queued'|'running'|'completed'|'failed'|'interrupted';sessionId?:string;queueId?:string;taskId?:string;error?:string;deliveredAt?:number;readAt?:number;ackMessageId?:string}
export type ChatAcknowledgment={acknowledged:true;groupId:string;messageId:string;employeeId:string;deliveredAt:number;readAt:number;ackMessageId?:string}
export type ChatAcknowledgmentPolicy={mode:'work'|'awareness';required:'visible'|'silent-or-visible'|'silent-only';acknowledged:boolean;muted:boolean;deliveredAt?:number;readAt?:number;ackMessageId?:string}
export type ChatMessage={id:string;sequence:number;createdAt:number;author:PrincipalRef;authorName:string;text:string;editRevision?:number;editedAt?:number;attachments?:MessageAttachment[];kind:'message'|'summary'|'decision'|'blocker'|'question'|'result';mentions:string[];broadcast?:true;acknowledgmentOf?:string;deliveries:ChatDelivery[];replyTo?:string;replyQuote?:MessageQuote;reply?:MessageReply;clientMessageId:string;fingerprint:string}
export type ChatGroup={id:string;name:string;memberIds:string[];sourceTeam?:string;createdAt:number;updatedAt:number;revision:number;readSequence:number;lastIncomingSequence:number;mutes?:Record<string,number|null>;lastMessage?:Pick<ChatMessage,'id'|'sequence'|'text'|'createdAt'|'authorName'>&{author?:PrincipalRef}}
/** Undefined means unmuted, null means indefinite; all/member deadlines combine without timers. */
export function effectiveChatMute(group:Pick<ChatGroup,'mutes'>,employeeId:string,now=Date.now()):number|null|undefined{
 const all=group.mutes?.all,member=group.mutes?.[employeeId]
 if(all===null||member===null)return null
 const until=Math.max(all??0,member??0);return until>now?until:undefined
}
export type ChatMember={id:string;title:string;group:string;managementRole:string;avatar?:string;engine:string;mutedUntil?:number|null}
export type ChatGroupView=ChatGroup&{members:ChatMember[];unread:boolean}
export type ChatHistory={messages:ChatMessage[];nextBefore:number|null}
export const GROUP_PUBLISH_POLICY={maxCharacters:2000,kinds:['summary','decision','blocker','question','result'],guidance:'Every public group message reaches all other current members. Replies and mentions identify the main participants; everyone else receives context only. During the reading stage, explicitly call the provided agents_company_discussion_post tool with the supplied conversationType, conversationId, messageId and normally text:null. One employee may belong to multiple groups and channels; use stable destination IDs, never display names or the active UI. Ordinary assistant text, JSON and thoughts are never publication or read-confirmation requests. A silent receipt does not dismiss an addressed user request: questions, stories and casual conversation are valid requests as well as tasks. Once acknowledgment is recorded, do not acknowledge again. In the response stage, use chat.post with replyTo to deliberately publish a relevant, concise reply addressed to the participants. Public text must be the reply itself, not private planning or decisions about whether or how to answer. If addressed to someone else, normally acknowledge silently and do not begin their work or interrupt them. Acknowledgment-derived messages require silent receipts. Keep private analysis, credentials, tool traces and large logs in the employee conversation. Group awareness does not grant permission to direct or control other employees.'} as const
