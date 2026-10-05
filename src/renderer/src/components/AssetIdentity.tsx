import {useId} from 'react'
import type {AssetNode} from '../../../shared/asset-schema'
import {TeamOSIcon} from '../office/TeamOSIcon'
import {EmployeePortrait} from './EmployeePortrait'
import {Icon} from './Icon'
import {translate as t} from '../i18n'
export const assetOwnerLine=(node:AssetNode)=>[node.owner?.view?t(node.owner.view):undefined,node.owner?.conversationName??node.owner?.team,!(node.directory&&(node.kind==='member'||node.kind==='employee'))?node.owner?.employeeName:undefined,...(!node.owner?.team&&!node.owner?.conversationName&&!node.owner?.employeeName&&node.owner?.label?[t(node.owner.label)]:[])].filter((value,index,all)=>value&&all.indexOf(value)===index).join(' · ')
export function AssetHostBadge({node}:{node:AssetNode}){
 if(!node.host&&!node.storage)return null
 const remote=node.storage==='remote'||node.storage==='cloud',label=remote?node.host?.name??t('Remote host'):t('Local'),os=node.host?.os
 return <span className={'asset-host-badge '+(remote?'is-remote':'is-local')} data-storage={node.storage??'local'} data-host-id={node.host?.id} title={[remote?t(node.storage==='cloud'?'Cloud only':'Remote host'):t('Core host'),label,os==='macos'?'macOS':os==='windows'?'Windows':os==='linux'?'Linux':undefined].filter(Boolean).join(' · ')}>{os?<TeamOSIcon os={os} distribution={node.host?.distribution}/>:<Icon name={remote?'server':'device-desktop'}/>}<span>{label}</span>{node.storage==='cloud'&&<Icon name="cloud"/>}</span>
}
function FolderArt(){const id=useId();return <svg viewBox="0 0 120 96" className="asset-folder-art" fill="none" aria-hidden="true"><defs><linearGradient id={id+'b'} x1="60" y1="8" x2="60" y2="90" gradientUnits="userSpaceOnUse"><stop stopColor="var(--folder-back)"/><stop offset="1" stopColor="var(--folder-front)"/></linearGradient><linearGradient id={id+'f'} x1="60" y1="32" x2="60" y2="87" gradientUnits="userSpaceOnUse"><stop stopColor="var(--folder-light)"/><stop offset="1" stopColor="var(--folder-front)"/></linearGradient></defs><path d="M11 22a9 9 0 0 1 9-9h28l12 11h40a9 9 0 0 1 9 9v45a9 9 0 0 1-9 9H20a9 9 0 0 1-9-9Z" fill={'url(#'+id+'b)'}/><path d="M20 31h80v43H20z" fill="var(--folder-paper)"/><path d="M9 44a8 8 0 0 1 8-9h86a8 8 0 0 1 8 9l-4 35a9 9 0 0 1-9 8H22a9 9 0 0 1-9-8Z" fill={'url(#'+id+'f)'} stroke="var(--folder-edge)" strokeWidth=".8"/><path d="M18 39h84" stroke="#fff" strokeOpacity=".52" strokeLinecap="round"/></svg>}
export function AssetGlyph({node,large=false}:{node:AssetNode;large?:boolean}){
 const personal=!!node.owner?.employee&&(node.kind==='member'||node.kind==='employee'),icon=node.kind==='image'?'file-media':node.kind==='audio'?'music':node.kind==='video'?'play-circle':node.kind==='code'?'code':/\.pdf$/i.test(node.name)?'file-pdf':'file-text'
 return <span className={'asset-identity '+(large?'large ':'')+(node.directory?'is-folder':'is-file')} data-view={node.owner?.view} data-kind={node.kind}>
  {node.directory?<FolderArt/>:<span className="asset-document-art"><Icon name={icon}/><small>{node.name.split('.').at(-1)?.toUpperCase().slice(0,7)}</small></span>}
  {personal&&<span className="asset-owner-portrait" aria-label={node.owner?.employeeName}><EmployeePortrait avatar={node.owner?.avatar} color={node.owner?.color} large={large}/></span>}
  {node.directory&&!personal&&node.host?.kind==='remote'&&<span className="asset-folder-emblem">{node.host.os?<TeamOSIcon os={node.host.os} distribution={node.host.distribution}/>:<Icon name="server"/>}</span>}
 </span>
}
export function assetError(message:string){return message.replace(/(?:[A-Za-z]:[\\/]|\/)[^\s'"<>]+/g,t('storage location'))}
