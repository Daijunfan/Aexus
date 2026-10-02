import {memo,useMemo,type ComponentProps} from 'react'
import Markdown,{type ExtraProps} from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import {unified} from 'unified'
import katex from 'katex'
import {api} from '../api'
import {MessageCodeBlock} from './MessageCodeBlock'
import 'katex/dist/katex.min.css'
import '../styles/rich-message-text.css'

type MarkdownNode={type:string;position?:{start:{offset?:number};end:{offset?:number}};children?:MarkdownNode[]}
const delimiterParser=unified().use(remarkParse).use(remarkGfm).use(remarkMath)

/** Adapt TeX delimiters only outside Markdown code, HTML, links and existing math. */
export function mathMarkdown(text:string):string{
  if(!/\\[([]/.test(text))return text
  const protectedRanges:[number,number][]=[]
  const visit=(node:MarkdownNode)=>{
    if(['code','inlineCode','html','link','image','definition','math','inlineMath'].includes(node.type)){
      const start=node.position?.start.offset,end=node.position?.end.offset
      if(start!==undefined&&end!==undefined)protectedRanges.push([start,end])
    }else node.children?.forEach(visit)
  }
  visit(delimiterParser.parse(text) as MarkdownNode)
  const escaped=(at:number)=>{let count=0;while(at>0&&text[--at]==='\\')count++;return count%2===1}
  return text.replace(/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g,(raw,inline:string|undefined,block:string|undefined,offset:number)=>{
    if(escaped(offset)||escaped(offset+raw.length-2)||protectedRanges.some(([start,end])=>start<offset+raw.length&&end>offset))return raw
    const value=inline??block??''
    // A dollar in the expression would introduce a second Markdown delimiter grammar.
    if(value.includes('$'))return raw
    return inline!==undefined?'$'+value+'$':'\n\n$$\n'+value.trim()+'\n$$\n\n'
  })
}

const MathFormula=memo(function MathFormula({text,display=false}:{text:string;display?:boolean}){
  const html=useMemo(()=>katex.renderToString(text,{displayMode:display,throwOnError:false,trust:false,strict:'ignore',maxSize:20,maxExpand:1000,macros:{}}),[text,display])
  return <span className={'rich-math '+(display?'rich-math-block':'rich-math-inline')} data-quote-atomic dangerouslySetInnerHTML={{__html:html}}/>
})

// A stable component preserves wrapping and focus while a response streams.
function MessagePre({node,children,stateKey,...props}:ComponentProps<'pre'>&ExtraProps&{stateKey:string}){
 const child=node?.children[0]
 if(child?.type!=='element'||child.tagName!=='code')return <pre {...props}>{children}</pre>
 const classes=Array.isArray(child.properties.className)?child.properties.className:[],text=child.children.map(node=>node.type==='text'?node.value:'').join('')
 if(classes.includes('language-math'))return <MathFormula display text={text}/>
 const language=classes.find(value=>typeof value==='string'&&value.startsWith('language-'))?.toString().slice(9)
 // mdast-util-to-hast adds one structural newline to nonempty code values.
 return <MessageCodeBlock text={text.replace(/\n$/,'')} language={language} stateKey={stateKey+':'+(node?.position?.start.offset??0)}/>
}

/** Shared display only: callers retain the original text for copy, save and forwarding. */
export const RichMessageText=memo(function RichMessageText({text,className='',images=true,onOpenLink,quoteText=false,stateKey='body'}:{text:string;className?:string;images?:boolean;onOpenLink?:(url:string)=>void;quoteText?:boolean;stateKey?:string}){
  const markdown=useMemo(()=>mathMarkdown(text),[text])
  const pre=useMemo(()=>function CodePre(props:ComponentProps<'pre'>&ExtraProps){return <MessagePre {...props} stateKey={stateKey}/>},[stateKey])
  return <div className={'rich-message-text markdown '+className} data-quote-text={quoteText||undefined}><Markdown remarkPlugins={[remarkGfm,remarkMath]} components={{
    a:({href,children})=>href&&/^https?:\/\//i.test(href)?<a href={href} onClick={event=>{event.preventDefault();if(onOpenLink)onOpenLink(href);else void api.call('external.open',{url:href})}}>{children}</a>:<span>{children}</span>,
    ...(!images?{img:()=>null}:{}),
    code:({node,className,children})=>{
      if(!className?.split(' ').includes('math-inline'))return <code className={className}>{children}</code>
      const start=node?.position?.start.offset,end=node?.position?.end.offset
      // Common prices such as "$5 and $10" are prose, not a formula ending before a digit.
      if(start!==undefined&&end!==undefined&&markdown[start+1]!=='$'&&/\d/.test(markdown[end]??''))return <span>{markdown.slice(start,end)}</span>
      return <MathFormula text={String(children)}/>
    },
    pre,
  }}>{markdown}</Markdown></div>
})
