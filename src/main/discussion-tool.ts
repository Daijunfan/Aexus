import {createHash} from 'node:crypto'
import {agentCredential,authenticate} from './agent-access'
import {withCaller,validateDelegation} from './authorization'
import {discussionPolicy,discussionTarget,postDiscussionAcknowledgment} from './discussion-context'
import type {SharedTaskContext} from '../shared/chat-groups'
import type {Live} from './sessions'

export const DISCUSSION_TOOL={
 name:'agents_company_discussion_post',
 description:'Explicitly acknowledge the shared message identified by conversationType, conversationId and messageId. Copy all three from this reading stage; they must match its source. text:null records a silent read; a text value publishes exactly that human-facing reply there. Never publish private reasoning. After success immediately end this turn with OK and no more tools. Core will dispatch any response-stage task separately.',
 inputSchema:{type:'object',additionalProperties:false,required:['conversationType','conversationId','messageId','text'],properties:{conversationType:{type:'string',enum:['group','channel'],description:'The supplied source type, never inferred from its display name.'},conversationId:{type:'string',minLength:1,description:'The exact groupId or channelId from this reading stage. Membership in another conversation does not make it the destination.'},messageId:{type:'string',description:'The exact messageId/entryId inside that conversation.'},text:{type:['string','null'],maxLength:2000,description:'Use null unless a brief public reply is useful. Public text must be addressed to people, not internal deliberation.'}}}
} as const

type Scope={context:SharedTaskContext;taskId:string;credential:string;clientMessageId:string;decision?:{text:string|null;result:unknown}}
const scopes=new WeakMap<Live,Scope>()

/** Capture identity and target before the turn; a later call cannot renew a revoked credential. */
export function openDiscussionTool(state:Live,context:SharedTaskContext){
 if(!state.currentTask)throw Error('Shared reading task is unavailable')
 const taskId=state.currentTask.messageId
 const scope:Scope={context,taskId,credential:agentCredential(state.cardId).token,clientMessageId:'ack-tool-'+createHash('sha256').update(JSON.stringify([context,state.cardId])).digest('hex')}
 scopes.set(state,scope)
 return()=>{if(scopes.get(state)===scope)scopes.delete(state)}
}

/** Native tool calls only. Model output is never accepted as publication intent. */
export async function invokeDiscussionTool(state:Live,input:unknown,callId:string,signal?:AbortSignal):Promise<unknown>{
 signal?.throwIfAborted()
 const scope=scopes.get(state),task=state.currentTask
 if(!state.acknowledging||!scope||!task||task.messageId!==scope.taskId||!task.chat||JSON.stringify(task.chat)!==JSON.stringify(scope.context))throw Error('This shared-message tool is unavailable outside its active reading stage')
 if(!callId||!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['conversationType','conversationId','messageId','text'].includes(key)))throw Error('Provide conversationType, conversationId, messageId and text for an explicit shared-message tool call')
 const value=input as {conversationType?:unknown;conversationId?:unknown;messageId?:unknown;text?:unknown},target=discussionTarget(scope.context)
 if(value.conversationType!==target.conversationType||value.conversationId!==target.conversationId||value.messageId!==target.messageId)throw Error('Shared-message tool target does not match the current reading stage')
 if(value.text!==null&&typeof value.text!=='string')throw Error('Shared-message tool text must be a public reply or null')
 validateDelegation(task.delegation,state.cardId)
 return withCaller(authenticate(scope.credential),()=>{
  const policy=discussionPolicy(scope.context,state.cardId)
  if(scope.decision){if(scope.decision.text!==value.text)throw Error('This message was already acknowledged; do not publish another reading confirmation');return scope.decision.result}
  if(policy.acknowledged)throw Error('This message was already acknowledged through the API; no further reading confirmation is needed')
  if(value.text!==null&&(policy.muted||policy.required==='silent-only'))throw Error('This reading confirmation must stay silent; call the tool with text:null')
  const text=value.text as string|null,receipt=postDiscussionAcknowledgment(scope.context,text,scope.clientMessageId)
  const result={...receipt,nextAction:'end_turn' as const,instruction:'Acknowledgment complete. End this turn now with only OK; do not call any more tools or begin the request. Core will dispatch a separate response-stage task when applicable.'}
  scope.decision={text,result}
  return result
 })
}
