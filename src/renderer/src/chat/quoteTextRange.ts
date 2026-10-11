import {normalizeQuoteText,QUOTE_BLOCKS,QUOTE_LIMIT,quoteText,type MessageQuote} from '../../../shared/message-quotes'
type Point={node:Text;offset:number}
type Unit={start:Point;end:Point}

/** Match the shared Markdown text projection while retaining exact DOM boundaries. */
function textMap(row:Element){
  let text='';const units:Unit[]=[]
  const add=(value:string,node:Text,start:number,end:number)=>{const space=/\s/u.test(value);if(space&&(!text||text.endsWith(' ')))return;text+=space?' ':value;units.push({start:{node,offset:start},end:{node,offset:end}})}
  const gap=()=>{const last=units.at(-1);if(last)add(' ',last.end.node,last.end.offset,last.end.offset)}
  const walk=(node:Node)=>{
    if(node instanceof Element&&node.hasAttribute('data-quote-ignore'))return
    // KaTeX exposes visual and accessibility trees. Neither is an exact source range.
    if(node instanceof Element&&node.hasAttribute('data-quote-atomic')){gap();return}
    if(node.nodeType===Node.TEXT_NODE){const value=node.nodeValue??'';for(let i=0;i<value.length;i++)add(value[i],node as Text,i,i+1);return}
    const block=node instanceof Element&&QUOTE_BLOCKS.has(node.tagName.toLowerCase());if(block)gap()
    for(const child of node.childNodes)walk(child)
    if(block)gap()
  }
  for(const root of row.querySelectorAll('[data-quote-text]')){gap();walk(root)}
  if(text.endsWith(' ')){text=text.slice(0,-1);units.pop()}
  return {text,units}
}
const occurrences=(text:string,value:string)=>{const result:number[]=[];let at=0;while((at=text.indexOf(value,at))>=0){result.push(at);at++}return result}
function boundary(units:Unit[],node:Node,offset:number){
  const edge=document.createRange(),point=document.createRange();edge.setStart(node,offset);edge.collapse(true)
  for(let i=0;i<units.length;i++){point.setStart(units[i].start.node,units[i].start.offset);point.collapse(true);if(point.compareBoundaryPoints(Range.START_TO_START,edge)>=0)return i}
  return units.length
}
export function selectedQuote(row:Element,source:string|string[],range:Range,projected=quoteText(source)):MessageQuote|null{
  const element=(node:Node)=>node instanceof Element?node:node.parentElement
  if(element(range.startContainer)?.closest('[data-quote-ignore]')||element(range.endContainer)?.closest('[data-quote-ignore]'))return null
  if(!element(range.startContainer)?.closest('[data-quote-text]')||!element(range.endContainer)?.closest('[data-quote-text]'))return null
  if([...row.querySelectorAll('[data-quote-atomic]')].some(node=>range.intersectsNode(node)))return null
  const map=textMap(row),start=boundary(map.units,range.startContainer,range.startOffset),end=boundary(map.units,range.endContainer,range.endOffset)
  const raw=map.text.slice(start,end),text=normalizeQuoteText(raw),offset=start+(raw.length-raw.trimStart().length)
  if(!text||Array.from(text).length>QUOTE_LIMIT)return null
  const walker=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);let node:Node|null
  while((node=walker.nextNode()))if(node.textContent?.trim()&&range.intersectsNode(node)&&!node.parentElement?.closest('[data-quote-text]'))return null
  const canonical=projected
  if(canonical===map.text)return {text,offset}
  // Non-text result views may contribute a different layout. Only map occurrences
  // when their count and order agree; never silently choose a different repeated phrase.
  const visible=occurrences(map.text,text),original=occurrences(canonical,text),index=visible.indexOf(offset)
  return index>=0&&visible.length===original.length?{text,offset:original[index]}:null
}

export function highlightQuote(row:HTMLElement,source:string|string[],quote:MessageQuote){
  const map=textMap(row),canonical=quoteText(source)
  if(canonical.slice(quote.offset,quote.offset+quote.text.length)!==quote.text)return()=>{}
  let offset=quote.offset
  if(canonical!==map.text){const original=occurrences(canonical,quote.text),visible=occurrences(map.text,quote.text),index=original.indexOf(offset);if(index<0||original.length!==visible.length)return()=>{};offset=visible[index]}
  const start=map.units[offset]?.start,end=map.units[offset+quote.text.length-1]?.end;if(!start||!end)return()=>{}
  const range=document.createRange();range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset)
  CSS.highlights.set('agents-message-quote',new Highlight(range));row.dataset.quoteHighlighted='true'
  // The highlighted line, rather than just the top of a long message, is the destination.
  const box=range.getBoundingClientRect(),scroller=row.closest<HTMLElement>('.transcript,.group-transcript')
  if(scroller){const view=scroller.getBoundingClientRect();scroller.scrollTop+=box.top-view.top-(view.height-box.height)/2}
  return()=>{CSS.highlights.delete('agents-message-quote');delete row.dataset.quoteHighlighted}
}
