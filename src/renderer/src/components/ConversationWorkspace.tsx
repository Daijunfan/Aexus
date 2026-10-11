import {useEffect,useState} from 'react'
import {createPortal} from 'react-dom'
import type {ConversationWorkspace as Workspace} from '../../../shared/conversation-workspaces'
import {api} from '../api'
import {flushPlugins} from '../plugins'
import {useDialogFocus} from '../office/useDialogFocus'
import {translate as uiText} from '../i18n'
import {FileWorkspace} from './FileWorkspace'
import {Icon} from './Icon'
import {BackButton} from './BackButton'
import '../assets/plugins.css'

/** One file browser over the same authenticated Core workspace APIs used by Agents. */
export function ConversationWorkspace({conversation,onClose,initialFolder='',backLabel='Back to conversation'}:{conversation:string;onClose:()=>void;initialFolder?:string;backLabel?:string}){
 const [workspace,setWorkspace]=useState<Workspace|null>(null),[error,setError]=useState(''),[folder,setFolder]=useState(initialFolder),[closing,setClosing]=useState(false)
 useDialogFocus('.conversation-workspace',true)
 useEffect(()=>{let active=true;void api.call<Workspace>('conversation.workspace',{conversation}).then(value=>{if(active)setWorkspace(value)}).catch(cause=>{if(active)setError(cause.message)});return()=>{active=false}},[conversation])
 const leave=async()=>{if(closing)return;setClosing(true);try{await flushPlugins();onClose()}catch(cause){setError((cause as Error).message)}finally{setClosing(false)}}
 const choose=async(value:string)=>{try{await flushPlugins();setFolder(value);setError('')}catch(cause){setError((cause as Error).message)}}
 return createPortal(<div className="conversation-workspace-overlay" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();void leave()}}}>
  <div className="panel-backdrop" onClick={()=>void leave()}/>
  <section className="team-workspace conversation-workspace" role="dialog" aria-modal="true" aria-label={uiText('Shared workspace')}>
   <header className="workspace-header"><BackButton label={backLabel} ariaLabel="Close shared workspace" disabled={closing} onClick={()=>void leave()}/><div className="workspace-identity"><span className="workspace-mark"><Icon name="files"/></span><div><h2>{workspace?.name??uiText('Shared workspace')}</h2><p title={workspace?.root}>{workspace?.root??uiText('Loading…')}</p></div></div></header>
   {error&&<div className="workspace-error" role="alert">{error}</div>}
   {workspace&&<><div className="conversation-workspace-locations"><label>{uiText('Folder')}<select aria-label={uiText('Shared workspace folder')} value={folder} onChange={event=>void choose(event.target.value)}><option value="">{uiText('User uploads and shared files')}</option>{workspace.members.map(member=><option key={member.employeeId} value={member.directory}>{member.name} · {member.directory}</option>)}</select></label><small>{uiText('Members can edit their own named folder. Only a member Secretary can also edit direct root files.')}</small></div><FileWorkspace key={conversation+'/'+folder} conversation={conversation} initialFolder={folder}/></>}
  </section>
 </div>,document.body)
}
