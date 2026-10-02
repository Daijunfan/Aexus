import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {useEffect,useState} from 'react'
import type {StoredSession} from '../../../shared/types'
import {api} from '../api'
import {Mascot} from '../office/Mascot'

export function CloneEmployeeForm({source,root,onCreated}:{source:StoredSession;root:string;onCreated:(employee:StoredSession)=>void}){
  useI18n()

  const [title,setTitle]=useState(source.title+' 副本'),[mode,setMode]=useState<'default'|'bind'>('default'),[cwd,setCwd]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [localRoot,setLocalRoot]=useState(root)
  useEffect(()=>{if(source.localWorkspaceRoot){setLocalRoot(source.localWorkspaceRoot);return}if(source.workEnvironment==='local')void api.call<{path:string}>('workspace.suggest',{team:source.group,workEnvironment:'local'}).then(result=>setLocalRoot(result.path)).catch(cause=>setError(cause.message));else setLocalRoot(root)},[root,source.group,source.workEnvironment])
  return <form className="employee-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{onCreated(await api.call('card.clone',{id:source.id,title,directoryMode:mode,cwd:mode==='bind'?cwd:undefined}))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>
    <div className="employee-preview"><Mascot kind={source.avatar} color={source.color} accessory={source.accessory}/><span>{source.title}</span><small>{source.engine==='codex'?'Codex':'Claude Agent'} · {source.group}</small></div>
    <p className="workspace-note">{uiText("Copies the character, model settings and conversation context into an independent employee and conversation. Deleting one does not delete the other. Work files and background processes are not copied automatically; binding the same directory shares its files.")}</p>
    <label>{uiText("New employee name")}<input name="clone-title" required value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <div className="directory-mode-options">{(['default','bind'] as const).map(value=><button key={value} type="button" aria-pressed={mode===value} onClick={()=>setMode(value)}>{value==='default'?uiText("Create automatically"):uiText("Bind an existing folder")}</button>)}</div>
    {mode==='default'?<label>{uiText("New working directory")}<code className="default-employee-path">{localRoot}/{title.trim()}</code></label>:<label>{uiText("Bound working directory")}<div className="folder-input"><input name="clone-cwd" required value={cwd} onChange={e=>setCwd(e.target.value)} placeholder={uiText("Enter an existing directory within the allowed scope")}/>{!source.remote&&<button type="button" onClick={async()=>{try{const r=await api.call<{path:string}>('workspace.choose',{path:localRoot});if(r.path)setCwd(r.path)}catch(e){setError((e as Error).message)}}}>{uiText("Choose directory")}</button>}</div></label>}
    {error&&<p role="alert" className="employee-form-error">{error}</p>}
    <div className="form-footer"><button className="btn primary clone-submit" disabled={busy||!title.trim()}>{busy?uiText("Cloning…"):uiText("Clone employee")}</button></div>
  </form>
}
