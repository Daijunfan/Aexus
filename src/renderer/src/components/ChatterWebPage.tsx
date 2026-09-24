import {useEffect,useRef,useState} from 'react'
import {api} from '../api'

/** The provider's own website, with its native controls and one employee URL. */
export function ChatterWebPage({employee,reloadKey}:{employee:string;reloadKey:number}){
  const host=useRef<HTMLDivElement>(null),[error,setError]=useState('')
  useEffect(()=>{
    let cancelled=false,guest:HTMLElement|undefined
    setError('')
    void api.call<{url:string;partition:string}>('chatter.view',{id:employee}).then(({url,partition})=>{
      if(cancelled||!host.current)return
      guest=document.createElement('webview')
      guest.setAttribute('partition',partition)
      guest.setAttribute('src',url)
      guest.setAttribute('allowpopups','')
      guest.style.cssText='width:100%;height:100%;display:flex;min-height:0'
      const navigated=(event:Event)=>{const next=(event as Event&{url?:string}).url;if(next)void api.call('chatter.bind',{id:employee,url:next}).catch(()=>{})}
      const failed=(event:Event)=>{const issue=event as Event&{errorCode?:number;errorDescription?:string};if(issue.errorCode!==-3)setError(issue.errorDescription||'网页加载失败')}
      guest.addEventListener('did-navigate',navigated)
      guest.addEventListener('did-navigate-in-page',navigated)
      guest.addEventListener('did-fail-load',failed)
      guest.addEventListener('dom-ready',()=>{const contentsId=(guest as HTMLElement&{getWebContentsId?:()=>number}).getWebContentsId?.();if(contentsId)void api.call('chatter.attach',{id:employee,webContentsId:contentsId}).catch(()=>{})})
      host.current.appendChild(guest)
    }).catch(reason=>{if(!cancelled)setError(String((reason as Error).message||reason))})
    return()=>{cancelled=true;guest?.remove()}
  },[employee,reloadKey])
  return <div className="chatter-web-page" ref={host}>{error&&<div className="chatter-web-error" role="alert">{error}</div>}</div>
}
