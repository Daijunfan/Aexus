import {useEffect,useState} from 'react'
import type {StoredSession} from '../../../shared/types'
import {api} from '../api'
import {Mascot} from '../office/Mascot'

export function CloneEmployeeForm({source,root,onCreated}:{source:StoredSession;root:string;onCreated:(employee:StoredSession)=>void}){
  const [title,setTitle]=useState(source.title+' 副本'),[mode,setMode]=useState<'default'|'bind'>('default'),[cwd,setCwd]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [localRoot,setLocalRoot]=useState(root)
  useEffect(()=>{if(source.localWorkspaceRoot){setLocalRoot(source.localWorkspaceRoot);return}if(source.workEnvironment==='local')void api.call<{path:string}>('workspace.suggest',{team:source.group,workEnvironment:'local'}).then(result=>setLocalRoot(result.path)).catch(cause=>setError(cause.message));else setLocalRoot(root)},[root,source.group,source.workEnvironment])
  return <form className="employee-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{onCreated(await api.call('card.clone',{id:source.id,title,directoryMode:mode,cwd:mode==='bind'?cwd:undefined}))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>
    <div className="employee-preview"><Mascot kind={source.avatar} color={source.color} accessory={source.accessory}/><span>{source.title}</span><small>{source.engine==='codex'?'Codex':'Claude Agent'} · {source.group}</small></div>
    <p className="workspace-note">复制角色、模型设置和会话上下文，生成独立的员工与会话。会话各自独立，删除其中一个不会删除另一个的会话。工作文件和后台进程不会自动复制；绑定同一目录时共享文件。</p>
    <label>新员工名称<input name="clone-title" required value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <div className="directory-mode-options">{(['default','bind'] as const).map(value=><button key={value} type="button" aria-pressed={mode===value} onClick={()=>setMode(value)}>{value==='default'?'默认生成':'绑定已有文件夹'}</button>)}</div>
    {mode==='default'?<label>新工作目录<code className="default-employee-path">{localRoot}/{title.trim()}</code></label>:<label>绑定工作目录<div className="folder-input"><input name="clone-cwd" required value={cwd} onChange={e=>setCwd(e.target.value)} placeholder="输入范围内已存在的目录"/>{!source.remote&&<button type="button" onClick={async()=>{try{const r=await api.call<{path:string}>('workspace.choose',{path:localRoot});if(r.path)setCwd(r.path)}catch(e){setError((e as Error).message)}}}>选择目录</button>}</div></label>}
    {error&&<p role="alert" className="employee-form-error">{error}</p>}
    <div className="form-footer"><button className="btn primary clone-submit" disabled={busy||!title.trim()}>{busy?'正在克隆…':'克隆员工'}</button></div>
  </form>
}
