import type {MessageAttachment} from '../shared/message-attachments'
import type {MessageQuote} from '../shared/message-quotes'
import type {PrincipalRef} from '../shared/management'
// A headless mirror of each session's conversation, built with the same
// reducers the GUI uses. This is what lets the CLI read a transcript for a
// session no window has open — and it is the reason the reducers live in
// shared/ rather than in the component.

import {messagePreview,messageReply,type MessagePreview} from '../shared/messages'
import type {StoredSession} from '../shared/types'
import {statSync} from 'node:fs'
import {atomicJson,readJson} from './atomic-file'
import { apply, applyCodex, applyAgent, renderTranscript,uid } from '../shared/transcript'
import type { Item, Session,MessageReply } from '../shared/types'
import { mkdirSync, readFileSync, writeFileSync,rmSync } from 'node:fs'
import { join } from 'node:path'
import { APP_HOME } from '../shared/protocol'

const directory = join(APP_HOME, 'transcripts')
const cards = new Map<string, string>()

export function restoreTranscript(id: string, cardId: string, engine: import('../shared/types').Engine): void {
  const s = { ...empty(id), engine }
  s.items=readJson<Item[]>(join(directory,`${cardId}.json`),()=>[],Array.isArray)
  conversations.set(id, s)
  cards.set(id, cardId)
}

export function saveTranscript(id: string): void {
  const cardId = cards.get(id)
  if (!cardId) return
  mkdirSync(directory, { recursive: true })
  atomicJson(join(directory,`${cardId}.json`),transcriptItems(id),true)
}

export function copyTranscript(source:string,target:string){
  mkdirSync(directory,{recursive:true})
  atomicJson(join(directory,`${target}.json`),transcriptItems(source).map(item=>item.role==='assistant'?{...item,blocks:item.blocks.map(block=>block.kind==='tool'?{...block,running:false}:block.kind==='thinking'?{...block,done:true}:block)}:item),true)
}

/** Import a read-only native history once; ordinary turns continue through the same reducer. */
export function seedTranscript(cardId:string,items:Item[]){
  if(transcriptItems(cardId).length)throw new Error('员工已有会话历史，不能覆盖为另一条原生会话')
  mkdirSync(directory,{recursive:true})
  atomicJson(join(directory,`${cardId}.json`),items,true)
}

export function conversation(id: string): Session { return conv(id) }

export function recordError(id: string, message: string): void {
  const s = conv(id)
  conversations.set(id, { ...s, busy: false, error: message, open: false })
}

const empty = (id: string): Session =>
  ({
    id,
    engine: 'claude',
    title: '',
    group: '',
    createdAt: Date.now(),
    items: [],
    commands: [],
    models: [],
    permissionMode: 'default',
    thinking: false,
    thinkingSupported: true,
    busy: false
  }) as Session

const conversations = new Map<string, Session>()

function conv(sessionId: string): Session {
  let s = conversations.get(sessionId)
  if (!s) {
    s = empty(sessionId)
    conversations.set(sessionId, s)
  }
  return s
}

export function setEngine(sessionId: string, engine: import('../shared/types').Engine): void {
  conv(sessionId).engine = engine
}

/** Fold a Claude SDK message into the mirror. */
export function recordClaude(sessionId: string, message: unknown): void {
  recordUpdate(sessionId,apply(conv(sessionId), message))
}

/** Fold a Codex event into the mirror. */
export function recordCodex(sessionId: string, event: unknown): void {
  recordUpdate(sessionId,applyCodex(conv(sessionId), event))
}

export function recordAgent(sessionId:string,event:unknown){recordUpdate(sessionId,applyAgent(conv(sessionId),event))}

// Stamp only newly appended items. Streaming updates and restored histories retain metadata.
function recordUpdate(id:string,next:Session){
  const previous=conv(id)
  if(next.items.length>previous.items.length){const at=Date.now();next={...next,items:next.items.map((item,index)=>index>=previous.items.length?{...item,createdAt:at}:item)}}
  conversations.set(id,next)
}
export function resolveMessageReply(id:string,target:unknown,quote?:MessageQuote):MessageReply|undefined{
  if(target===undefined){if(quote!==undefined)throw Error('A selected quote requires a reply message');return}
  if(typeof target!=='string'||!target)throw Error('Provide a reply message ID')
  const item=transcriptItems(id).find(item=>item.id===target),reply=item&&messageReply(item,quote)
  if(!reply)throw Error('Reply target must be a public message in this conversation')
  return reply
}

/** Note the user's own turn, which the engines echo but the mirror needs at once. */
export function recordUser(sessionId: string, text: string,images?:string[],reply?:MessageReply,author?:PrincipalRef,files?:MessageAttachment[],taskId?:string) {
  const s = conv(sessionId)
  const item:Extract<Item,{role:'user'}>={role:'user',id:'u'+uid(),createdAt:Date.now(),text,images,...(taskId?{outbound:{taskId}}:{}),...(files?.length?{files}:{}),...(author?{author}:{}),...(reply?{reply}:{})}
  conversations.set(sessionId, {
    ...s,
    busy: true,
    error: undefined,
    open: false,
    items: [...s.items,item]
  })
  return item
}

/** Persist only first observed native milestones for the exact outbound task. */
export function recordOutboundReceipt(sessionId:string,taskId:string,stage:'delivered'|'read'){
  const s=conv(sessionId),index=s.items.findIndex(item=>item.role==='user'&&item.outbound?.taskId===taskId)
  if(index<0)return false
  const item=s.items[index] as Extract<Item,{role:'user'}>,receipt=item.outbound!
  if(stage==='read'?receipt.readAt!==undefined:receipt.deliveredAt!==undefined)return false
  const at=Date.now(),items=[...s.items]
  items[index]={...item,outbound:{...receipt,deliveredAt:receipt.deliveredAt??at,...(stage==='read'?{readAt:at}:{})}}
  conversations.set(sessionId,{...s,items});saveTranscript(sessionId);return true
}

export function markTurnStart(sessionId: string): void {
  const s = conv(sessionId)
  conversations.set(sessionId, { ...s, busy: true })
}

export function markTurnEnd(sessionId: string): void {
  const s = conv(sessionId)
  conversations.set(sessionId, { ...s, busy: false, open: false })
}

export function transcriptItems(sessionId: string): Item[] {
  const active=conversations.get(sessionId)??conversations.get([...cards].find(([,owner])=>owner===sessionId)?.[0]??'')
  if(active)return active.items
  if(!/^[a-z0-9_-]+$/i.test(sessionId))throw new Error('无效的会话 ID')
  return readJson<Item[]>(join(directory,`${sessionId}.json`),()=>[],Array.isArray)
}

export function transcriptText(sessionId: string): string {
  return renderTranscript(transcriptItems(sessionId))
}

export function isBusy(sessionId: string): boolean {
  return conversations.get(sessionId)?.busy ?? false
}

export function forget(sessionId: string): void {
  saveTranscript(sessionId)
  conversations.delete(sessionId)
  cards.delete(sessionId)
}

export function deleteTranscript(cardId:string):void {
  for(const [id,owner] of cards)if(owner===cardId){conversations.delete(id);cards.delete(id)}
  conversations.delete(cardId)
  rmSync(join(directory,`${cardId}.json`),{force:true});rmSync(join(directory,`${cardId}.json.previous`),{force:true})
}

// Cache bounded previews only. Open histories reuse their reducer array; closed histories use file revisions.
const previewCache=new Map<string,{stamp:string;items?:Item[];preview:MessagePreview}>()
export function transcriptPreview(card:StoredSession):MessagePreview{
  const active=conversations.get(card.id)??conversations.get([...cards].find(([,owner])=>owner===card.id)?.[0]??'')
  let stamp=card.lastReply?.id??''
  if(!active){
    try{const stat=statSync(join(directory,`${card.id}.json`));stamp+=`:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;stamp+=':missing'}
  }
  const previous=previewCache.get(card.id)
  if(previous?.stamp===stamp&&previous.items===active?.items)return previous.preview
  const preview=messagePreview(active?.items??transcriptItems(card.id),card.lastReply)
  previewCache.delete(card.id);previewCache.set(card.id,{stamp,items:active?.items,preview})
  if(previewCache.size>256)previewCache.delete(previewCache.keys().next().value!)
  return preview
}
