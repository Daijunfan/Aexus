import {useEffect,useState} from 'react'
import {createPortal} from 'react-dom'
import {api} from '../api'
import {translate as t,useI18n,interfaceLocale} from '../i18n'
import {useDialogFocus} from '../office/useDialogFocus'
import {useSurfaceMotion} from '../chat/surfaceMotion'
import type {AssetInfo as Info,AssetNode} from '../../../shared/asset-schema'
import {assetTitle,assetSize} from '../../../shared/asset-presentation'
import {AssetGlyph,AssetHostBadge} from './AssetIdentity'
import {Icon} from './Icon'

export function AssetInfoDialog({node,onClose}:{node:AssetNode;onClose:()=>void}){
 useI18n();useDialogFocus('.asset-info-dialog',true)
 const motion=useSurfaceMotion<HTMLDivElement>('dialog'),[info,setInfo]=useState<Info>(),[error,setError]=useState(''),[copied,setCopied]=useState(false)
 useEffect(()=>{let live=true;void api.call<Info>('assets.info',{id:node.id}).then(value=>{if(live)setInfo(value)}).catch(cause=>live&&setError(cause.message));return()=>{live=false}},[node.id])
 const date=(value:number)=>new Date(value).toLocaleString(interfaceLocale())
 const details=info?[['Kind',t(node.directory?'Folder':'File')],['Location',info.logicalLocation.map(label=>t(label)).join(' › ')],['Employee',node.owner?.employeeName],['Team',node.owner?.team],['Stored on',info.host?.name],['Size',info.bytes===undefined?undefined:assetSize(info.bytes)],['Contents',info.fileCount===undefined?undefined:t('{0} files',[info.fileCount])],['Modified',info.modifiedAt?date(info.modifiedAt):undefined],['Created',info.createdAt?date(info.createdAt):undefined],['Access',t(info.readOnly?'Read-only originals':'Read and write')],['Verification',t(info.verified==='virtual'?'Logical collection':info.verified==='metadata'?'Saved metadata only':info.verified==='remote'?'Checked on remote host':'Checked on Core host')]]:[]
 return createPortal(<div ref={motion} className="asset-info-overlay" onKeyDown={event=>{if(event.key==='Escape'&&!event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();onClose()}}}><div className="panel-backdrop" onClick={onClose}/><section className="asset-info-dialog" role="dialog" aria-modal="true" aria-label={t('Get Info')}>
  <header><span>{t('Get Info')}</span><button aria-label={t('Close information')} onClick={onClose}><Icon name="close"/></button></header>
  <div className="asset-info-hero"><AssetGlyph node={info?.node??node} large/><h2>{assetTitle(node)}</h2><AssetHostBadge node={info?.node??node}/></div>
  {!info&&!error&&<p role="status">{t('Loading information…')}</p>}{error&&<p role="alert" className="asset-info-error">{error}</p>}
  {info&&<><dl>{details.filter(([,value])=>value!==undefined).map(([label,value])=><div className="asset-info-field" key={label}><dt>{t(label!)}</dt><dd>{value}</dd></div>)}</dl>
   {info.physicalPath&&<section className="asset-info-location"><h3>{t('Physical location')}</h3><p>{info.address}{info.host?.kind==='remote'&&info.port?' · SSH '+info.port:''}</p><code data-physical-path>{info.physicalPath}</code><button onClick={()=>void navigator.clipboard.writeText(info.physicalPath!).then(()=>setCopied(true)).catch(cause=>setError(cause.message))}><Icon name={copied?'check':'copy'}/>{t(copied?'Copied':'Copy path')}</button></section>}
   {info.exists===false&&<p role="status">{t('File not found')}</p>}{info.note&&<p className="asset-info-note">{t(info.note)}</p>}
  </>}
 </section></div>,document.body)
}
