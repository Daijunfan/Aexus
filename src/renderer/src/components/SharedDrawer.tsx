import {useEffect,useState} from 'react'
import {api} from '../api'
import {FileWorkspace} from './FileWorkspace'
import {Icon} from './Icon'
export function SharedDrawer({onClose}:{onClose:()=>void}){
  const [root,setRoot]=useState(''),[error,setError]=useState('')
  useEffect(()=>{
    let active=true
    void api.call<{path:string}>('shared.info').then(x=>{if(active)setRoot(x.path)}).catch(e=>{if(active)setError(e.message)})
    return()=>{active=false}
  },[])
  return <aside className="shared-drawer" aria-label="共享中转站文件">
    <header><div><strong>共享中转站</strong><small>拖入保存 · 拖出上传</small></div><button aria-label="收起共享中转站" onClick={onClose}><Icon name="close"/></button></header>
    <p className="shared-location" title={root}>{root||'正在准备文件夹…'}</p>
    {error&&<div className="workspace-error" role="alert">{error}</div>}
    <FileWorkspace shared/>
  </aside>
}
