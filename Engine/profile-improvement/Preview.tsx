import {useEffect,useRef,useState} from 'react'

/** Sandboxed, network-disabled preview. It is not the Word pagination acceptance check. */
export function Preview({bytes,label}:{bytes:Uint8Array|null;label:string}){
 const frame=useRef<HTMLIFrameElement>(null),[ready,setReady]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('')
 useEffect(()=>{
  let alive=true;const iframe=frame.current,doc=iframe?.contentDocument
  if(!bytes||!doc||!ready)return
  setLoading(true);setError('');doc.body.replaceChildren();for(const node of Array.from(doc.head.querySelectorAll('[data-preview-style]')))node.remove()
  const style=doc.createElement('div');style.dataset.previewStyle='true';doc.head.append(style)
  const root=doc.createElement('div');root.className='preview-pages';doc.body.append(root)
  const resize=()=>{const wrapper=root.querySelector<HTMLElement>('.pi-word-wrapper'),page=root.querySelector<HTMLElement>('section.pi-word');if(wrapper&&page&&iframe){const width=page.offsetWidth||794;wrapper.style.zoom=String(Math.min(1,(iframe.clientWidth-24)/width))}}
  const observer=new ResizeObserver(resize);observer.observe(iframe!)
  void import('docx-preview').then(({renderAsync})=>renderAsync(bytes.slice().buffer,root,style,{className:'pi-word',inWrapper:true,ignoreWidth:false,ignoreHeight:false,ignoreFonts:false,breakPages:true,renderHeaders:true,renderFooters:true,renderFootnotes:true,renderEndnotes:true,useBase64URL:true,renderChanges:false,renderComments:false,renderAltChunks:false})).then(()=>{
   if(!alive)return
   root.querySelectorAll('script,iframe,object,embed').forEach(node=>node.remove());root.querySelectorAll('a').forEach(a=>{a.removeAttribute('href');a.removeAttribute('target')});resize();setLoading(false)
  }).catch(()=>{if(alive){setError('此模板暂无法在浏览器完整预览，Word 原件不会被重排。');setLoading(false)}})
  return()=>{alive=false;observer.disconnect()}
 },[bytes,ready])
 if(!bytes)return <div className="pi-preview-empty"><div className="pi-paper-sample" aria-hidden="true"><i/><b/><span/><span/><hr/><b/><span/><span/><span/><hr/><b/><span/><span/></div><strong>你的版式，原样保留</strong><p>上传后在这里预览。团队只修改有依据的文字，不套用新模板。</p></div>
 return <div className="pi-preview"><div className="pi-preview-caption"><span>{label}</span><small>{loading?'正在打开 Word…':'浏览器预览 · 最终文件另经版式验收'}</small></div>{error&&<p className="pi-error" role="alert">{error}</p>}<iframe ref={frame} title={label} sandbox="allow-same-origin" onLoad={()=>setReady(n=>n+1)} srcDoc={'<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob:; font-src data: blob:; style-src \'unsafe-inline\';"><style>html,body{margin:0;background:#edf0f2;overflow-x:hidden}body{font-family:Arial,sans-serif}.pi-word-wrapper{background:transparent!important;padding:16px 0!important}.pi-word-wrapper>section{margin-bottom:16px!important;box-shadow:0 3px 14px #1d29301a!important}a{pointer-events:none}</style></head><body></body></html>'}/></div>
}
