import {validateQuote,type MessageQuote} from './message-quotes'
import type {PrincipalRef} from './management'
import type {EmployeeReply,Item,MessageReply} from './types'

export type MessagePreview={text:string;author?:PrincipalRef;role:'user'|'assistant'|null;updatedAt:number|null;hasMessages:boolean}
export type InboxEntry=MessagePreview&{employeeId:string;unread:boolean;error?:string}
/** Display only timestamps actually recorded by the transcript/reply protocol. */
export function messageTime(item:Item,reply?:EmployeeReply):number|null{
  if(typeof item.createdAt==='number'&&Number.isFinite(item.createdAt)&&item.createdAt>0)return item.createdAt
  if(item.id===reply?.itemId)return reply.createdAt
  if(item.role==='user'&&/^u\d{13}$/.test(item.id))return Number(item.id.slice(1))
  return null
}
/** UI and Core share an excerpt shape; Core resolves the source itself on send. */
export function messageReply(item:Item,quote?:MessageQuote):MessageReply|null{
  if(item.role==='notice')return null
  const text=item.role==='user'?item.text:item.blocks.filter(block=>block.kind==='text').map(block=>block.text).join('\n\n'),images=item.role==='user'?item.images:undefined
  const files=item.role==='user'?item.files:undefined
  if(!text.trim()&&!images?.length&&!files?.length)return null
  const selected=quote===undefined?undefined:validateQuote(item.role==='user'?item.text:item.blocks.filter(block=>block.kind==='text').map(block=>block.text),quote)
  const characters=Array.from(text)
  return {id:item.id,role:item.role,...(item.role==='user'&&item.author?{author:item.author}:{}),text:selected?.text??characters.slice(0,1200).join(''),...(selected?{quote:selected}:{}),...(images?.length?{images}:{}),...(files?.length?{files}:{}),...(!selected&&characters.length>1200?{truncated:true}:{})}
}
export function messagePreview(items:Item[],reply?:EmployeeReply):MessagePreview{
  for(let i=items.length-1;i>=0;i--){
    const item=items[i]
    if(item.role==='notice')continue
    const text=item.role==='user'?(item.text||item.files?.map(file=>file.name).join(', ')||((item.images?.length??0)>0?'Photo':'')):item.blocks.filter(b=>b.kind==='text').map(b=>b.text).join(' ')
    if(!text.trim())continue
    return {text:Array.from(text.replace(/\s+/g,' ').trim()).slice(0,240).join(''),role:item.role,updatedAt:item.id===reply?.itemId?reply.createdAt:messageTime(item,reply),hasMessages:true,...(item.role==='user'&&item.author?{author:item.author}:{})}
  }
  return {text:'',role:null,updatedAt:null,hasMessages:false}
}
