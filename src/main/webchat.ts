import {readStore} from './store'
import {callPlugin} from './plugins/runtime'
import {conversation,restoreTranscript,forget} from './transcripts'
import type {Session,StoredSession} from '../shared/types'

type Emitter=(channel:string,payload:unknown)=>void
let emit:Emitter=()=>{}
const opened=new Set<string>(),running=new Set<string>()
export const setWebChatEmitter=(emitter:Emitter)=>{emit=emitter}
export const isWebChat=(id:string)=>readStore().sessions.find(card=>card.id===id)?.kind==='chatter'
function card(id:string):StoredSession{
  const found=readStore().sessions.find(card=>card.id===id)
  if(!found||found.kind!=='chatter'||!found.chatProvider)throw new Error('Unknown web chat employee')
  return found
}
export function openWebChat(id:string){
  const employee=card(id)
  if(!opened.has(id)){restoreTranscript(id,id,'claude');opened.add(id)}
  emit('session:changed',{sessionId:id})
  return {sessionId:id,cwd:employee.cwd,engine:employee.engine}
}
export function webChatSnapshot(id:string):Session{
  const employee=card(id)
  if(!opened.has(id))throw new Error('Web chat is not open')
  return {...conversation(id),id,cardId:id,title:employee.title,group:employee.group,cwd:employee.cwd,createdAt:employee.createdAt,
    engine:employee.engine,models:[],commands:[],thinking:false,thinkingSupported:false,permissionMode:'default',busy:running.has(id)}
}
export function webChatInfo(id:string){const c=card(id);if(!opened.has(id))throw new Error('Web chat is not open');return {id,engine:c.engine,kind:'chatter',provider:c.chatProvider,model:c.chatProvider,models:[],commands:[],busy:running.has(id)}}
export function listWebChats(){return [...opened].map(webChatSnapshot)}
export async function webChatRequest(id:string,method:string,params:Record<string,unknown>={}){
  const c=card(id)
  return callPlugin('browser',c.cwd,'browser.chat.'+method,{...params,provider:c.chatProvider})
}
export async function webChatView(id:string){
  const current=await webChatRequest(id,'current') as {url:string}
  return {url:current.url,mode:'chrome'}
}
export function attachWebChat(id:string,_contentsId:number){card(id);return {attached:false,reason:'Embedded web chat was replaced by managed Google Chrome'}}
export async function sendWebChat(id:string,text:string){
  const c=card(id)
  if(!opened.has(id))throw new Error('Open this employee before sending a message')
  if(running.has(id))throw new Error('Web chat is busy')
  if(!text.trim())throw new Error('Message is required')
  running.add(id)
  conversation(id).error=undefined
  emit('session:turn-start',{sessionId:id})
  try{
    const reply=await callPlugin('browser',c.cwd,'browser.chat.send',{provider:c.chatProvider,prompt:text}) as {text:string;url?:string}
    if(reply.url)await webChatRequest(id,'bind',{url:reply.url})
    emit('session:user',{sessionId:id,text})
    emit('session:message',{sessionId:id,message:{type:'assistant',message:{content:[{type:'text',text:reply.text}]}}})
    emit('session:turn-end',{sessionId:id})
    return true
  }catch(error){emit('session:error',{sessionId:id,message:String((error as Error).message)});throw error}
  finally{running.delete(id)}
}
export async function interruptWebChat(id:string){const c=card(id);if(!running.has(id))return false;await callPlugin('browser',c.cwd,'browser.chat.cancel',{provider:c.chatProvider});running.delete(id);emit('session:interrupted',{sessionId:id});return true}
export async function closeWebChat(id:string){if(!opened.has(id))return false;if(running.has(id))await interruptWebChat(id);opened.delete(id);forget(id);emit('session:closed',{sessionId:id});return true}
export async function closeWebChats(){for(const id of [...opened])await closeWebChat(id)}
