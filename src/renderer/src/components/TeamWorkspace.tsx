import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {useState} from 'react'
import {flushPlugins} from '../plugins'
import {useDialogFocus} from '../office/useDialogFocus'
import type {TeamSettings} from '../../../shared/types'
import {FileWorkspace} from './FileWorkspace'
import '../assets/plugins.css'

/** Every Team opens its scoped files. Software plugins have their own native windows. */
export function TeamWorkspace({name,root,settings,onClose,onSettings}:{name:string;root:string;settings:TeamSettings;onClose:()=>void;onSettings?:()=>void}) {
  useI18n()

  const [closing,setClosing]=useState(false),[error,setError]=useState('')
  useDialogFocus('.team-workspace',true)
  const leave=async(action:()=>void)=>{if(closing)return;setClosing(true);try{await flushPlugins();action()}catch(e){setError((e as Error).message)}finally{setClosing(false)}}
  return <div className="team-workspace-wrap" onKeyDown={e=>{if(e.key==='Escape')void leave(onClose)}}>
    <div className="panel-backdrop" onClick={()=>void leave(onClose)}/>
    <section className="team-workspace" role="dialog" aria-modal="true" aria-label={uiText("{0} workspace",[name])}>
      <header className="workspace-header"><div className="workspace-identity"><span className="workspace-mark">▧</span><div><h2>{name}</h2><p title={root}>{root}</p></div></div>
        <div className="workspace-tools"><span className="plugin-label">{settings.mode==='work'?uiText("Work · Work files"):settings.mode==='cloud'?uiText("Cloud host · {0}",[settings.remote?.host]):uiText("Build · Project files")}</span>
        {onSettings&&<button className="team-settings" disabled={closing} onClick={()=>void leave(onSettings)}>{uiText("Team settings")}</button>}<button className="panel-close" disabled={closing} onClick={()=>void leave(onClose)} aria-label={uiText("Close workspace")}>×</button></div>
      </header>
      {error&&<div className="workspace-error" role="alert">{error}</div>}
      <FileWorkspace key={name} team={name}/>
    </section>
  </div>
}
