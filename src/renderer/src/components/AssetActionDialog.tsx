import {useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {api} from '../api'
import {useDialogFocus} from '../office/useDialogFocus'
import {useSurfaceMotion} from '../chat/surfaceMotion'
import {translate as t} from '../i18n'
import {assetTitle} from '../../../shared/asset-presentation'
import type {AssetNode} from '../../../shared/asset-schema'
import {assetError} from './AssetIdentity'
import {Icon} from './Icon'
export function AssetActionDialog({node,kind,onClose,onDone}:{node:AssetNode;kind:'rename'|'trash'|'new-file'|'new-folder';onClose:()=>void;onDone:(value:any)=>void}){
 const [name,setName]=useState(kind==='rename'?node.name:''),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false),root=useSurfaceMotion<HTMLDivElement>('dialog');useDialogFocus('.asset-action-dialog',true)
 const title=t(kind==='rename'?'Rename':kind==='trash'?'Move to Trash':kind==='new-file'?'New file':'New folder')
 const save=async()=>{
  if(lock.current)return
  if(kind!=='trash'&&(!name.trim()||/[\\/\x00-\x1f]/.test(name)||['.','..'].includes(name))){setError(t('Enter a valid file or folder name'));return}
  lock.current=true;setBusy(true);setError('')
  try{const location=node.location!,base=location.path==='.'?'':location.path,parent=kind==='rename'?base.split('/').slice(0,-1).join('/'):base,target=[parent,name.trim()].filter(Boolean).join('/');const args=kind==='trash'?{operation:'trash',path:base}:kind==='rename'?{operation:'move',path:base,to:target}:kind==='new-folder'?{operation:'mkdir',path:target}:{operation:'write',path:target,content:'',create:true};onDone(await api.call('assets.file',{id:location.asset,...args}))}catch(cause){setError((cause as Error).message)}finally{lock.current=false;setBusy(false)}
 }
 return createPortal(<div ref={root} className="asset-info-overlay" onKeyDown={event=>{if(event.key==='Escape'&&!event.nativeEvent.isComposing&&!busy){event.preventDefault();event.stopPropagation();onClose()}}}><div className="panel-backdrop" onClick={()=>!busy&&onClose()}/><form className="asset-action-dialog" role="dialog" aria-modal="true" aria-label={title} onSubmit={event=>{event.preventDefault();void save()}}><h2><Icon name={kind==='trash'?'trash':kind==='rename'?'edit':'add'}/>{title}</h2><p>{assetTitle(node)}</p>{kind==='trash'?<p>{t('This item can be restored with Undo. Its workspace and other items stay unchanged.')}</p>:<label>{t('Name')}<input aria-label={t('Name')} autoFocus value={name} disabled={busy} onChange={event=>setName(event.target.value)} maxLength={240}/></label>}{error&&<p role="alert">{assetError(error)}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>{t('Cancel')}</button><button className={kind==='trash'?'danger':'primary'} disabled={busy}>{t(busy?'Saving…':'Confirm')}</button></footer></form></div>,document.body)
}
