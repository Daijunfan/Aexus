import {useState} from 'react'
import {flushPlugins} from '../plugins'
import {useDialogFocus} from '../office/useDialogFocus'
import type {TeamSettings} from '../../../shared/types'
import {FileWorkspace} from './FileWorkspace'
import '../assets/plugins.css'

/** Every Team opens its scoped files. Software plugins have their own native windows. */
export function TeamWorkspace({name,root,settings,onClose,onSettings}:{name:string;root:string;settings:TeamSettings;onClose:()=>void;onSettings?:()=>void}) {
  const [closing,setClosing]=useState(false),[error,setError]=useState('')
  useDialogFocus('.team-workspace',true)
  const leave=async(action:()=>void)=>{if(closing)return;setClosing(true);try{await flushPlugins();action()}catch(e){setError((e as Error).message)}finally{setClosing(false)}}
  return <div className="team-workspace-wrap" onKeyDown={e=>{if(e.key==='Escape')void leave(onClose)}}>
    <div className="panel-backdrop" onClick={()=>void leave(onClose)}/>
    <section className="team-workspace" role="dialog" aria-modal="true" aria-label={`${name} 工作空间`}>
      <header className="workspace-header"><div className="workspace-identity"><span className="workspace-mark">▧</span><div><h2>{name}</h2><p title={root}>{root}</p></div></div>
        <div className="workspace-tools"><span className="plugin-label">{settings.mode==='work'?'Work · 工作文件':settings.mode==='cloud'?`云主机 · ${settings.remote?.host}`:'Build · 项目文件'}</span>
        {onSettings&&<button className="team-settings" disabled={closing} onClick={()=>void leave(onSettings)}>Team 设置</button>}<button className="panel-close" disabled={closing} onClick={()=>void leave(onClose)} aria-label="关闭工作空间">×</button></div>
      </header>
      {error&&<div className="workspace-error" role="alert">{error}</div>}
      <FileWorkspace key={name} team={name}/>
    </section>
  </div>
}
