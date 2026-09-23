import {AppSelect} from '../components/AppSelect'
import {useState} from 'react'
import type {RemoteTarget} from '../../../shared/remote'
import {api} from '../api'

export function RemoteConnectionFields({value,onChange}:{value:RemoteTarget;onChange:(remote:RemoteTarget)=>void}){
  const [checking,setChecking]=useState(false),[message,setMessage]=useState('')
  const patch=(next:Partial<RemoteTarget>)=>{setMessage('');onChange({...value,...next})}
  return <fieldset className="remote-fields"><legend>云主机连接 · Team 统一配置</legend>
    <label>SSH 主机 / IP<input name="remote-host" required value={value.host} placeholder="ubuntu@203.0.113.10 或 SSH 别名" onChange={e=>patch({host:e.target.value})}/></label>
    <label>团队的云端根目录<input name="remote-directory" required value={value.directory} placeholder="/home/ubuntu/project" onChange={e=>patch({directory:e.target.value})}/></label>
    <div className="form-row"><label>操作系统<AppSelect name="remote-os" value={value.os} onChange={e=>patch({os:e.target.value as RemoteTarget['os'],distribution:undefined})}><option value="linux">Linux</option><option value="macos">macOS</option><option value="windows">Windows</option></AppSelect></label><label>SSH 端口<input name="ssh-port" type="number" min="1" max="65535" value={value.port??''} placeholder="22" onChange={e=>patch({port:e.target.value?Number(e.target.value):undefined})}/></label></div>
    {value.os==='linux'&&<label>Linux 发行版<AppSelect name="remote-distribution" value={value.distribution??''} onChange={e=>patch({distribution:e.target.value||undefined})}><option value="">自动识别</option><option value="kali">Kali Linux</option><option value="ubuntu">Ubuntu</option><option value="debian">Debian</option><option value="fedora">Fedora</option>{value.distribution&&!['kali','ubuntu','debian','fedora'].includes(value.distribution)&&<option value={value.distribution}>{value.distribution}</option>}</AppSelect></label>}
    <details><summary>密钥、跳板机与高级连接设置</summary>{([['identityFile','私钥文件'],['knownHosts','known_hosts 文件'],['sshConfig','SSH 配置文件'],['jump','跳板机']] as const).map(([key,label])=><label key={key}>{label}<input name={key} value={value[key]??''} placeholder={key==='jump'?'user@jump-host':'留空使用现有 SSH 配置'} onChange={e=>patch({[key]:e.target.value})}/></label>)}</details>
    <small>此 Team 内的员工自动继承主机。员工默认创建同名云端子目录，也可绑定团队根目录内已有的文件夹。请先准备 SSH 密钥、可信主机及已存在的团队根目录。</small>
    <button type="button" className="btn" disabled={checking} onClick={async()=>{setChecking(true);setMessage('');try{await api.call('remote.check',{remote:value});setMessage('连接成功，可以使用此云端工作目录。')}catch(e){setMessage((e as Error).message)}finally{setChecking(false)}}}>{checking?'正在连接…':'测试连接'}</button>
    {message&&<p className="workspace-note" role="status">{message}</p>}
  </fieldset>
}
