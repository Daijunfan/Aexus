import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {useEffect,useState} from 'react'
import {api} from '../api'
import {FileWorkspace} from './FileWorkspace'
import {Icon} from './Icon'
export function SharedDrawer({onClose}:{onClose:()=>void}){
  useI18n()

  const [root,setRoot]=useState(''),[error,setError]=useState('')
  useEffect(()=>{
    let active=true
    void api.call<{path:string}>('shared.info').then(x=>{if(active)setRoot(x.path)}).catch(e=>{if(active)setError(e.message)})
    return()=>{active=false}
  },[])
  return <aside className="shared-drawer" aria-label={uiText("Shared transfer files")}>
    <header><div><strong>{uiText("Shared transfer area")}</strong><small>{uiText("Drop to save · Drag out to upload")}</small></div><button aria-label={uiText("Close shared transfer area")} onClick={onClose}><Icon name="close"/></button></header>
    <p className="shared-location" title={root}>{root||uiText("Preparing folder…")}</p>
    {error&&<div className="workspace-error" role="alert">{error}</div>}
    <FileWorkspace shared/>
  </aside>
}
