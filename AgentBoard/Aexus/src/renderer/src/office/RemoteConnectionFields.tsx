import {directoryName} from '../../../shared/directory-names'
import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {AppSelect} from '../components/AppSelect'
import {useEffect,useState} from 'react'
import type {CloudHost} from '../../../shared/remote'
import type {TeamSettings} from '../../../shared/types'
import {api} from '../api'
import {isCloudHostsEmbedded} from '../web/host'
export function RemoteConnectionFields({value,onChange,directoryMode,teamName}:{value:TeamSettings;onChange:(settings:TeamSettings)=>void;directoryMode:'default'|'bind';teamName:string}){
  useI18n()

  const [hosts,setHosts]=useState<CloudHost[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
  const [listing,setListing]=useState<{path:string;entries:{name:string;path:string}[]}|null>(null)
  const bind=directoryMode==='bind'
  const directory=bind?(value.directory??value.remote?.directory??''):(value.parent??value.remote?.directory??'')
  const load=()=>api.call<CloudHost[]>('host.list').then(value=>{setHosts(value);setMessage('')}).catch(e=>setMessage(e.message))
  useEffect(()=>{void load();return api.onEvent(event=>{if(event.channel==='store:changed'||event.channel==='hosts:changed'||event.channel==='access:changed')void load()})},[])
  const selected=hosts.find(h=>h.id===value.hostId)
  const choose=(id:string)=>{const host=hosts.find(h=>h.id===id);if(!host)return;setListing(null);setMessage('');onChange(bind?{mode:'cloud',hostId:id,directory:host.defaultDirectory,remote:{...host,directory:host.defaultDirectory}}:{...value,mode:'cloud',hostId:id,parent:value.parent??host.defaultDirectory,directory:undefined,remote:{...host,directory:host.defaultDirectory}})}
  const browse=async(path=directory)=>{if(!value.hostId)return;setBusy(true);setMessage('');try{setListing(await api.call('host.directories',{id:value.hostId,path}))}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
  const join=(base:string,name:string)=>base.replace(/[\\/]$/,'')+(selected?.os==='windows'?'\\':'/')+name
  const parent=(path:string)=>{const value=path.replace(/[\\/]+$/,'').replace(/[\\/][^\\/]+$/,'');return selected?.os==='windows'?value.length<=2?value+'\\':value:value||'/'}
  const selectDirectory=(path:string)=>{if(bind)onChange({...value,directory:path,remote:value.remote?{...value.remote,directory:path}:undefined});else onChange({...value,parent:path,directory:undefined});setListing(null)}
  return <fieldset className="remote-fields cloud-host-binding"><legend>{bind?uiText("Bind an existing cloud host"):uiText("Generate a Team folder on a cloud host")}</legend>
    <label>{uiText("Cloud host")}<AppSelect name="cloud-host-id" disabled={busy} required value={value.hostId??''} onChange={e=>choose(e.target.value)}><option value="" disabled>{uiText("Choose a registered host")}</option>{hosts.map(host=><option key={host.id} value={host.id}>{host.name} · {host.host}</option>)}</AppSelect></label>
    <div className="host-binding-actions">{!isCloudHostsEmbedded&&<button type="button" className="btn" onClick={()=>void api.call('plugin.open',{id:'cloud-hosts'})}>{uiText("Open Cloud Hosts management")}</button>}<button type="button" className="btn" onClick={()=>void load()}>{uiText("Refresh list")}</button></div>
    {!hosts.length&&!message&&<p className="workspace-note">{isCloudHostsEmbedded?(interfaceLanguage()==='en'?'No hosts registered. Add hosts in CloudHosts, then refresh this list.':'尚未注册主机。请在云主机 中添加主机，然后刷新列表。'):uiText("No cloud hosts yet. Add one in Cloud Hosts first; Teams do not store or edit accounts separately.")}</p>}
    {selected&&<p className="workspace-note">{selected.os==='windows'?'Windows':selected.os==='macos'?'macOS':selected.distribution||'Linux'} · {selected.host}  {uiText("· Port")} {selected.port??22}</p>}
    <label>{bind?uiText("Team cloud working directory"):uiText("Parent folder on the cloud host")}<div className="folder-input"><input name="remote-directory" disabled={busy} required={bind} value={directory} placeholder={bind?uiText("Choose an existing directory on the cloud host"):uiText("Choose the parent folder that will contain the new Team folder")} onChange={e=>{setListing(null);const path=e.target.value;if(bind)onChange({...value,directory:path,remote:value.remote?{...value.remote,directory:path}:undefined});else onChange({...value,parent:path,directory:undefined})}}/><button type="button" disabled={!value.hostId||busy} onClick={()=>void browse()}>{busy?uiText("Reading sessions…"):uiText("Browse directories")}</button></div></label>
    {!bind&&<label>{uiText("New folder on the cloud host")}<code className="default-employee-path">{directory.replace(/[\\/]+$/,'')+(selected?.os==='windows'?'\\':'/')+directoryName(teamName||'team','team')}</code><small>{uiText("The Team folder is created inside the chosen parent when you save.")}</small></label>}
    {listing&&<div className="remote-directory-browser"><header><button type="button" disabled={busy} onClick={()=>void browse(parent(listing.path))}>{uiText("↑ Parent folder")}</button><code>{listing.path}</code><button type="button" disabled={busy} onClick={()=>selectDirectory(listing.path)}>{bind?uiText("Bind this directory"):uiText("Use this folder as parent")}</button></header>{listing.entries.map(entry=><button type="button" disabled={busy} key={entry.path} onClick={()=>void browse(join(listing.path,entry.name))}>▱ {entry.name}</button>)}{!listing.entries.length&&<small>{uiText("No subfolders here. You can bind this directory directly.")}</small>}</div>}
    <small>{bind?uiText(isCloudHostsEmbedded?(interfaceLanguage()==='en'?'Only existing folders can be bound. Employees inherit the chosen host and directory. Manage host accounts in CloudHosts.':'只能绑定已有目录。员工继承所选主机与目录。请在云主机 管理主机账号。'):"Only existing folders can be bound. Employees inherit the host and create or bind their own working folders within this directory. Manage accounts in the host plugin."):uiText("A new Team folder is generated inside the selected parent. The parent must already exist on the cloud host.")}</small>
    {message&&<p className="workspace-note" role="alert">{message}</p>}
  </fieldset>
}
