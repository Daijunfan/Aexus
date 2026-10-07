import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'

export type MessageQuote={text:string;offset:number}
export const QUOTE_LIMIT=1200
export const QUOTE_SCHEMA={type:'object',additionalProperties:false,required:['text','offset'],properties:{text:{type:'string',minLength:1,maxLength:2400},offset:{type:'integer',minimum:0}}}
export const QUOTE_BLOCKS=new Set(['p','div','pre','li','tr','td','th','h1','h2','h3','h4','h5','h6','blockquote','ul','ol','table','thead','tbody','section','hr','br'])
export const normalizeQuoteText=(text:string)=>text.replace(/\s+/gu,' ').trim()
type QuoteNode={type:string;value?:string;tagName?:string;children?:QuoteNode[]}
// This is the renderer's Markdown pipeline. Raw HTML stays literal text, never executable.
const parser=unified().use(remarkParse).use(remarkGfm).use(remarkRehype,{allowDangerousHtml:true})
export function quoteText(markdown:string|string[]):string{
  const walk=(node:QuoteNode):string=>{
    if(node.type==='text'||node.type==='raw')return node.value??''
    const body=(node.children??[]).map(walk).join('')
    return node.tagName&&QUOTE_BLOCKS.has(node.tagName)?' '+body+' ':body
  }
  return normalizeQuoteText((Array.isArray(markdown)?markdown:[markdown]).map(text=>walk(parser.runSync(parser.parse(text)) as QuoteNode)).join(' '))
}
export function quoteShape(value:unknown):MessageQuote{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Provide a selected quote with text and offset')
  const quote=value as MessageQuote
  if(Object.keys(quote).some(key=>!['text','offset'].includes(key))||typeof quote.text!=='string'||!quote.text||quote.text!==normalizeQuoteText(quote.text)||Array.from(quote.text).length>QUOTE_LIMIT||!Number.isSafeInteger(quote.offset)||quote.offset<0)throw Error('Selected quote must contain 1–1200 characters and a valid text offset')
  return {text:quote.text,offset:quote.offset}
}
export function validateQuote(source:string|string[],value:unknown):MessageQuote{
  const quote=quoteShape(value),text=quoteText(source),end=quote.offset+quote.text.length
  const splits=(at:number)=>at>0&&at<text.length&&/[\uD800-\uDBFF]/u.test(text[at-1])&&/[\uDC00-\uDFFF]/u.test(text[at])
  if(text.slice(quote.offset,end)!==quote.text||splits(quote.offset)||splits(end))throw Error('The selected quote no longer matches the original message')
  return quote
}
