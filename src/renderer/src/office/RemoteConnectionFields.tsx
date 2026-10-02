import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {AppSelect} from '../components/AppSelect'
import {useEffect,useState} from 'react'
import type {CloudHost} from '../../../shared/remote'
import type {TeamSettings} from '../../../shared/types'
import {api} from '../api'
export function RemoteConnectionFields({value,onChange}:{value:TeamSettings;onChange:(settings:TeamSettings)=>void}){
  useI18n()

  const [hosts,setHosts]=useState<CloudHost[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
  const [listing,setListing]=useState<{path:string;entries:{name:string;path:string}[]}|null>(null)
  const directory=value.directory??value.remote?.directory??''
  const load=()=>api.call<CloudHost[]>('host.list').then(setHosts).catch(e=>setMessage(e.message))
  useEffect(()=>{void load();return api.onEvent(event=>{if(event.channel==='store:changed')void load()})},[])
  const selected=hosts.find(h=>h.id===value.hostId)
  const choose=(id:string)=>{const host=hosts.find(h=>h.id===id);if(!host)return;setListing(null);setMessage('');onChange({mode:'cloud',hostId:id,directory:host.defaultDirectory,remote:{...host,directory:host.defaultDirectory}})}
  const browse=async(path=directory)=>{if(!value.hostId)return;setBusy(true);setMessage('');try{setListing(await api.call('host.directories',{id:value.hostId,path}))}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
  const join=(base:string,name:string)=>base.replace(/[\\/]$/,'')+(selected?.os==='windows'?'\\':'/')+name
  const parent=(path:string)=>{const value=path.replace(/[\\/]+$/,'').replace(/[\\/][^\\/]+$/,'');return selected?.os==='windows'?value.length<=2?value+'\\':value:value||'/'}
  return <fieldset className="remote-fields cloud-host-binding"><legend>{uiText("Bind an existing cloud host")}</legend>
    <label>{uiText("Cloud host")}<AppSelect name="cloud-host-id" disabled={busy} required value={value.hostId??''} onChange={e=>choose(e.target.value)}><option value="" disabled>{uiText("Choose a registered host")}</option>{hosts.map(host=><option key={host.id} value={host.id}>{host.name} · {host.host}</option>)}</AppSelect></label>
    <div className="host-binding-actions"><button type="button" className="btn" onClick={()=>void api.call('plugin.open',{id:'cloud-hosts'})}>{uiText("Open Cloud Hosts management")}</button><button type="button" className="btn" onClick={()=>void load()}>{uiText("Refresh list")}</button></div>
    {!hosts.length&&<p className="workspace-note">{uiText("No cloud hosts yet. Add one in Cloud Hosts first; Teams do not store or edit accounts separately.")}</p>}
    {selected&&<p className="workspace-note">{selected.os==='windows'?'Windows':selected.os==='macos'?'macOS':selected.distribution||'Linux'} · {selected.host}  {uiText("· Port")} {selected.port??22}</p>}
    <label>{uiText("Team cloud working directory")}<div className="folder-input"><input name="remote-directory" disabled={busy} required value={directory} placeholder={uiText("Choose an existing directory on the cloud host")} onChange={e=>{setListing(null);onChange({...value,directory:e.target.value,remote:value.remote?{...value.remote,directory:e.target.value}:undefined})}}/><button type="button" disabled={!value.hostId||busy} onClick={()=>void browse()}>{busy?uiText("Reading sessions…"):uiText("Browse directories")}</button></div></label>
    {listing&&<div className="remote-directory-browser"><header><button type="button" disabled={busy} onClick={()=>void browse(parent(listing.path))}>{uiText("↑ Parent folder")}</button><code>{listing.path}</code><button type="button" disabled={busy} onClick={()=>{onChange({...value,directory:listing.path,remote:value.remote?{...value.remote,directory:listing.path}:undefined});setListing(null)}}>{uiText("Bind this directory")}</button></header>{listing.entries.map(entry=><button type="button" disabled={busy} key={entry.path} onClick={()=>void browse(join(listing.path,entry.name))}>▱ {entry.name}</button>)}{!listing.entries.length&&<small>{uiText("No subfolders here. You can bind this directory directly.")}</small>}</div>}
    <small>{uiText("Only existing folders can be bound. Employees inherit the host and create or bind their own working folders within this directory. Manage accounts in the host plugin.")}</small>
    {message&&<p className="workspace-note" role="alert">{message}</p>}
  </fieldset>
}
