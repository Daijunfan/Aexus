import {AppSelect} from '../components/AppSelect'
import {useEffect,useState} from 'react'
import type {CloudHost} from '../../../shared/remote'
import type {TeamSettings} from '../../../shared/types'
import {api} from '../api'
export function RemoteConnectionFields({value,onChange}:{value:TeamSettings;onChange:(settings:TeamSettings)=>void}){
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
  return <fieldset className="remote-fields cloud-host-binding"><legend>绑定已有云主机</legend>
    <label>云主机<AppSelect name="cloud-host-id" disabled={busy} required value={value.hostId??''} onChange={e=>choose(e.target.value)}><option value="" disabled>选择已登记的主机</option>{hosts.map(host=><option key={host.id} value={host.id}>{host.name} · {host.host}</option>)}</AppSelect></label>
    <div className="host-binding-actions"><button type="button" className="btn" onClick={()=>void api.call('plugin.open',{id:'cloud-hosts'})}>打开 Cloud Hosts 管理</button><button type="button" className="btn" onClick={()=>void load()}>刷新列表</button></div>
    {!hosts.length&&<p className="workspace-note">还没有云主机。请先在 Cloud Hosts 插件中添加，Team 不单独保存或编辑账号。</p>}
    {selected&&<p className="workspace-note">{selected.os==='windows'?'Windows':selected.os==='macos'?'macOS':selected.distribution||'Linux'} · {selected.host} · 端口 {selected.port??22}</p>}
    <label>Team 的云端工作目录<div className="folder-input"><input name="remote-directory" disabled={busy} required value={directory} placeholder="选择云主机中已存在的目录" onChange={e=>{setListing(null);onChange({...value,directory:e.target.value,remote:value.remote?{...value.remote,directory:e.target.value}:undefined})}}/><button type="button" disabled={!value.hostId||busy} onClick={()=>void browse()}>{busy?'读取中…':'浏览目录'}</button></div></label>
    {listing&&<div className="remote-directory-browser"><header><button type="button" disabled={busy} onClick={()=>void browse(parent(listing.path))}>↑ 上一级</button><code>{listing.path}</code><button type="button" disabled={busy} onClick={()=>{onChange({...value,directory:listing.path,remote:value.remote?{...value.remote,directory:listing.path}:undefined});setListing(null)}}>绑定此目录</button></header>{listing.entries.map(entry=><button type="button" disabled={busy} key={entry.path} onClick={()=>void browse(join(listing.path,entry.name))}>▱ {entry.name}</button>)}{!listing.entries.length&&<small>此目录没有子文件夹，可直接绑定。</small>}</div>}
    <small>仅绑定现有文件夹；员工继承主机，并在该目录内创建或绑定自己的工作文件夹。更改账号请前往管理插件。</small>
    {message&&<p className="workspace-note" role="alert">{message}</p>}
  </fieldset>
}
