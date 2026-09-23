// A headless mirror of each session's conversation, built with the same
// reducers the GUI uses. This is what lets the CLI read a transcript for a
// session no window has open — and it is the reason the reducers live in
// shared/ rather than in the component.

import { apply, applyCodex, renderTranscript } from '../shared/transcript'
import type { Item, Session } from '../shared/types'
import { mkdirSync, readFileSync, writeFileSync,rmSync } from 'node:fs'
import { join } from 'node:path'
import { APP_HOME } from '../shared/protocol'

const directory = join(APP_HOME, 'transcripts')
const cards = new Map<string, string>()

export function restoreTranscript(id: string, cardId: string, engine: 'claude' | 'codex'): void {
  const s = { ...empty(id), engine }
  try { s.items = JSON.parse(readFileSync(join(directory, `${cardId}.json`), 'utf8')) } catch {}
  conversations.set(id, s)
  cards.set(id, cardId)
}

export function saveTranscript(id: string): void {
  const cardId = cards.get(id)
  if (!cardId) return
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, `${cardId}.json`), JSON.stringify(transcriptItems(id)), 'utf8')
}

export function copyTranscript(source:string,target:string){
  mkdirSync(directory,{recursive:true})
  writeFileSync(join(directory,`${target}.json`),JSON.stringify(transcriptItems(source).map(item=>item.role==='assistant'?{...item,blocks:item.blocks.map(block=>block.kind==='tool'?{...block,running:false}:block.kind==='thinking'?{...block,done:true}:block)}:item)),'utf8')
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

export function setEngine(sessionId: string, engine: 'claude' | 'codex'): void {
  conv(sessionId).engine = engine
}

/** Fold a Claude SDK message into the mirror. */
export function recordClaude(sessionId: string, message: unknown): void {
  conversations.set(sessionId, apply(conv(sessionId), message))
}

/** Fold a Codex event into the mirror. */
export function recordCodex(sessionId: string, event: unknown): void {
  conversations.set(sessionId, applyCodex(conv(sessionId), event))
}

/** Note the user's own turn, which the engines echo but the mirror needs at once. */
export function recordUser(sessionId: string, text: string,images?:string[]): void {
  const s = conv(sessionId)
  conversations.set(sessionId, {
    ...s,
    busy: true,
    error: undefined,
    open: false,
    items: [...s.items, { role: 'user', id: `u${Date.now()}`, text,images }]
  })
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
  try{const items=JSON.parse(readFileSync(join(directory,`${sessionId}.json`),'utf8'));return Array.isArray(items)?items:[]}catch{return []}
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
  rmSync(join(directory,`${cardId}.json`),{force:true})
}
