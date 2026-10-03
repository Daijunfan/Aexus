import {createHash} from 'node:crypto'
import {agentCredential,authenticate} from './agent-access'
import {withCaller,validateDelegation} from './authorization'
import {discussionPolicy,discussionTarget,postDiscussionMessage} from './discussion-context'
import {emptyAgentPost,type SharedTaskContext} from '../shared/chat-groups'
import type {Live} from './sessions'

export const DISCUSSION_TOOL={
 name:'agents_company_discussion_post',
 description:'Deliberately publish one useful public reply to the current shared work request. Copy its exact conversationType, conversationId and messageId. Text must be a nonempty human-facing answer. This is not an acknowledgment tool. To remain silent, do not call it: ordinary assistant output stays private. Unavailable during context-only reading.',
 inputSchema:{type:'object',additionalProperties:false,required:['conversationType','conversationId','messageId','text'],properties:{conversationType:{type:'string',enum:['group','channel']},conversationId:{type:'string',minLength:1},messageId:{type:'string',minLength:1},text:{type:'string',minLength:1,maxLength:2000,description:'An actual public reply, never null, undefined, empty text or private deliberation.'}}}
} as const

type Scope={context:SharedTaskContext;taskId:string;credential:string;clientMessageId:string;decision?:{text:string;result:unknown}}
const scopes=new WeakMap<Live,Scope>()
export function openDiscussionTool(state:Live,context:SharedTaskContext){
 if(!state.currentTask)throw Error('Shared work task is unavailable')
 const taskId=state.currentTask.messageId
 const scope:Scope={context,taskId,credential:agentCredential(state.cardId).token,clientMessageId:'discussion-post-'+createHash('sha256').update(JSON.stringify([context,state.cardId])).digest('hex')}
 scopes.set(state,scope)
 return()=>{if(scopes.get(state)===scope)scopes.delete(state)}
}

/** Publication requires an explicit, scoped tool call; reading and model text never publish. */
export async function invokeDiscussionTool(state:Live,input:unknown,callId:string,signal?:AbortSignal):Promise<unknown>{
 signal?.throwIfAborted()
 const scope=scopes.get(state),task=state.currentTask
 if(state.acknowledging||state.privateInitialization||!state.running||!scope||!task||task.messageId!==scope.taskId||!task.chat||JSON.stringify(task.chat)!==JSON.stringify(scope.context))throw Error('Publication is unavailable outside the active shared response stage. Reading needs no tool call')
 if(!callId||!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['conversationType','conversationId','messageId','text'].includes(key)))throw Error('Provide conversationType, conversationId, messageId and nonempty public text')
 const value=input as {conversationType?:unknown;conversationId?:unknown;messageId?:unknown;text?:unknown},target=discussionTarget(scope.context)
 if(value.conversationType!==target.conversationType||value.conversationId!==target.conversationId||value.messageId!==target.messageId)throw Error('Publication target does not match the current shared request')
 if(emptyAgentPost(value.text))throw Error('Public text must be nonempty, never null/undefined. To remain silent, do not call this tool')
 validateDelegation(task.delegation,state.cardId)
 return withCaller(authenticate(scope.credential),()=>{
  const policy=discussionPolicy(scope.context,state.cardId),text=value.text as string
  if(policy.mode==='awareness'||policy.muted)throw Error('Context-only or muted recipients cannot publish from this turn')
  if(scope.decision){if(scope.decision.text!==text)throw Error('A public reply was already posted by this tool; do not repeat it');return scope.decision.result}
  const result={...postDiscussionMessage(scope.context,text,scope.clientMessageId),nextAction:'end_turn' as const,instruction:'Your public reply was posted. Do not repeat it. Further ordinary output stays private.'}
  scope.decision={text,result};return result
 })
}
