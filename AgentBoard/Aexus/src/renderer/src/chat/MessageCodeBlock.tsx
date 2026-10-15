import {memo,useEffect,useMemo,useState} from 'react'
import type {HLJSApi} from 'highlight.js'
import {Icon} from '../components/Icon'
import {translate as uiText,useI18n} from '../i18n'
import {useMessageCopy} from './MessageActionRail'
import {useMessageRowState} from './MessageViewport'

let syntaxLibrary:Promise<HLJSApi>|undefined
let loadedSyntax:HLJSApi|null=null

/** Plain text stays complete; very large payloads avoid synchronous syntax detection. */
export const MessageCodeBlock=memo(function MessageCodeBlock({text,language='',stateKey='code'}:{text:string;language?:string;stateKey?:string}){
 useI18n()
 const [wrap,setWrap]=useMessageRowState('code-wrap:'+stateKey,false),[highlight,setHighlight]=useState(()=>loadedSyntax),clipboard=useMessageCopy(text)
 useEffect(()=>{if(loadedSyntax){setHighlight(loadedSyntax);return}let alive=true;void (syntaxLibrary??=import('highlight.js/lib/common').then(module=>loadedSyntax=module.default)).then(value=>{if(alive)setHighlight(value)}).catch(()=>{});return()=>{alive=false}},[])
 const syntax=useMemo(()=>{
  if(!highlight||text.length>100000)return null
  if(language)return highlight.getLanguage(language)?highlight.highlight(text,{language,ignoreIllegals:true}):null
  return text.length<=20000?highlight.highlightAuto(text):null
 },[text,language,highlight])
 const name=highlight?.getLanguage(language||syntax?.language||'')?.name||language||uiText('Plain text')
 const codeLanguage=language||syntax?.language||'plaintext'
 return <div className="rich-code-block" data-code-language={codeLanguage}>
  <div className="rich-code-toolbar" data-quote-ignore>
   <span className="rich-code-language" title={name}><Icon name="code"/>{name}</span>
   <button type="button" aria-label={uiText('Wrap code lines')} title={uiText('Wrap code lines')} aria-pressed={wrap} onClick={()=>setWrap(!wrap)}><Icon name="word-wrap"/></button>
   <button type="button" className="rich-code-copy" aria-label={uiText('Copy code')} title={uiText('Copy code')} onClick={()=>void clipboard.copy()}><Icon name={clipboard.status==='Copied'?'check':'copy'}/><span role="status">{uiText(clipboard.status||'Copy code')}</span></button>
  </div>
  <pre tabIndex={0} aria-label={uiText('Code block')} data-wrap={wrap||undefined}>{syntax?<code className={'hljs language-'+codeLanguage} dangerouslySetInnerHTML={{__html:syntax.value}}/>:<code className={'language-'+codeLanguage}>{text}</code>}</pre>
 </div>
})
