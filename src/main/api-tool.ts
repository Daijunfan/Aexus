import {randomUUID} from 'node:crypto'
import {apiReadOnly} from '../shared/api-effects'
import {allowedCommands,withCaller} from './authorization'
import {documentationIdentity} from './documentation-tool'
import {approvalHandler} from './approvals'
import type {Live} from './sessions'

export const API_TOOL={
 name:'agents_company_api',
 description:'Call an existing Agents Company Core API as your authenticated employee, without a shell. Start Plan work with command="plan.query", args={}: rows contain real task IDs, assigned roles/Teams, timing and allowedActions. Discover other operations with api.list (prefix/search) and the documentation tool describe. Use the exact returned IDs and revision guards; read back after edits. schedule.* is the only employee scheduler. Conversation Owner/Admin/Member is independent of Company rank: read conversation.policy, and use conversation.notice-* for literal scheduled announcements, conversation.mute and conversation.silence for conversation moderation. Notices never execute Agents or appear in Plan. plugin.call invokes a documented plugin method in its authorized workspace. This tool cannot impersonate the user or bypass permissions. Read calls need no approval; writes respect the current Ask/Full access and native planning mode. A lost response is not proof of failure; never blindly repeat a non-idempotent call.',
 inputSchema:{type:'object',additionalProperties:false,required:['command'],properties:{command:{type:'string',minLength:1,description:'Exact existing Core command, e.g. plan.query, schedule.delete or plugin.call'},args:{type:'object',additionalProperties:true,description:'That command’s API arguments; no token, identity or wrapper. Omit for {}.'}}}
} as const
const approvals=new WeakMap<Live,ReturnType<typeof approvalHandler>>()
export function prepareApiTool(state:Live,sessionId:string,changed:()=>void){approvals.set(state,approvalHandler(sessionId,changed))}
export async function invokeApiTool(state:Live,input:unknown,callId:string,signal?:AbortSignal):Promise<unknown>{
 if(!callId||!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['command','args'].includes(key)))throw Error('Provide command and optional args')
 const value=input as {command?:unknown;args?:unknown}
 if(typeof value.command!=='string'||!value.command||value.command.length>120||value.args!==undefined&&(!value.args||typeof value.args!=='object'||Array.isArray(value.args)))throw Error('Choose a Core command and an object of arguments')
 const command=value.command,args=JSON.parse(JSON.stringify(value.args??{})) as Record<string,unknown>,task=state.currentTask?.messageId
 const active=()=>{signal?.throwIfAborted();if(!task||!state.running||state.privateInitialization||state.acknowledging||state.currentTask?.messageId!==task)throw Error('Core API calls require the current employee work turn; unavailable during initialization or private context reading')}
 active()
 const context=documentationIdentity(state)
 const available=()=>withCaller(context,()=>{documentationIdentity(state);if(!allowedCommands(context).some(item=>item.name===command))throw Error('API not available to this caller: '+command)})
 available()
 const writing=!apiReadOnly(command,args)
 let approved=false
 if(writing){
  if(state.planMode||state.permissionMode==='plan')throw Error('Native planning mode is read-only; switch to execution mode before changing application data')
  if(state.permissionMode==='dontAsk')throw Error('Write approval is disabled in this execution mode')
  if(state.permissionMode!=='bypassPermissions'){
   const approve=approvals.get(state);if(!approve)throw Error('Employee API approval is unavailable; reopen this employee')
   const answer=await approve(API_TOOL.name,{command,args},{signal:signal??new AbortController().signal,toolUseID:callId+':'+randomUUID(),requestId:callId,title:'Agents Company: '+command})
   if(answer?.behavior!=='allow')throw Error('Declined by user')
   approved=true;active();available()
   if(state.planMode||['plan','dontAsk'].includes(state.permissionMode))throw Error('Execution permissions changed while awaiting approval')
  }
 }
 const {handleRequest}=await import('./server')
 active();available()
 if(writing&&(state.planMode||['plan','dontAsk'].includes(state.permissionMode)||state.permissionMode!=='bypassPermissions'&&!approved))throw Error('Execution permissions changed before dispatch')
 // Dispatcher binds authors, rechecks target authorization and validates all domain arguments.
 const data=await handleRequest({cmd:command,args},{...context,requestId:'native:'+state.cardId+':'+callId,...(signal?{signal}:{})})
 return {ok:true,data}
}
