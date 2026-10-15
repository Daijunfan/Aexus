import type {SharedTaskContext} from '../shared/chat-groups'
import type {Delegation} from '../shared/management'
import type {ChatDelivery} from '../shared/chat-groups'
import {chatAcknowledgmentPolicy,chatTaskPrompt,postChatMessage,recordChatDelivery} from './chat-groups'
import {channelAcknowledgmentPolicy,channelTaskPrompt,postChannelMessage,recordChannelDelivery} from './channel-discussion'
export const discussionPolicy=(context:SharedTaskContext,employeeId:string)=>'channelId' in context?channelAcknowledgmentPolicy(context,employeeId):chatAcknowledgmentPolicy(context,employeeId)
export const discussionPrompt=(context:SharedTaskContext|undefined,employeeId:string,delegation:Delegation|undefined,text:string,reading=false)=>!context?text:'channelId' in context?channelTaskPrompt(context,employeeId,delegation,text,reading):chatTaskPrompt(context,employeeId,delegation,text,reading)
export const discussionEntryId=(context:SharedTaskContext)=>'channelId' in context?context.entryId:context.messageId
export const discussionTarget=(context:SharedTaskContext)=>({conversationType:'channelId' in context?'channel':'group',conversationId:'channelId' in context?context.channelId:context.groupId,messageId:discussionEntryId(context)})
export const postDiscussionMessage=(context:SharedTaskContext,text:string,clientMessageId:string)=>'channelId' in context?postChannelMessage({id:context.channelId,replyTo:context.entryId,text,clientMessageId}):postChatMessage({id:context.groupId,replyTo:context.messageId,text,clientMessageId})
export function recordDiscussionDelivery(employeeId:string,context:SharedTaskContext|undefined,patch:Partial<ChatDelivery>,onlyPending=false){if(!context)return;try{if('channelId' in context)recordChannelDelivery(employeeId,context,patch,onlyPending);else recordChatDelivery(employeeId,context,patch,onlyPending)}catch(error){console.error('[Shared delivery update failed]',(error as Error).message)}}
