import type {MessageDraft} from './messenger'
export type DraftKind='employee'|'group'|'channel'
type Draft=Omit<MessageDraft,'updatedAt'>
/** Identity follows the actual accepted payload, not keystrokes, display names or UI location. */
export function draftContent(value:Partial<Draft>,kind:DraftKind='employee'){
 const text=(value.text??'').trim()
 return JSON.stringify(kind==='channel'?[text,value.mentions??[],value.replyTo??null,...(value.images?.length||value.files?.length?[value.images??[],value.files??[]]:[])]:[text,value.images??[],value.files??[],...(kind==='group'?[value.mentions??[]]:[]),value.replyTo??null,value.replyQuote??null,value.replyConversation??null,!!value.replyTextOnly])
}
export function reuseDraft<T extends Draft>(value:T,previous:Draft|undefined,kind:DraftKind='employee'):T&{clientMessageId:string}{
 const same=previous&&draftContent(previous,kind)===draftContent(value,kind)
 return {...value,clientMessageId:same&&previous.clientMessageId||crypto.randomUUID(),...(same&&previous.viewId?{viewId:previous.viewId}:{}),...(same&&kind==='employee'&&previous.sourceView?{sourceView:previous.sourceView}:{})}
}
