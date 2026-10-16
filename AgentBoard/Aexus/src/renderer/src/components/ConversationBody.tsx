import {useEffect,useState,type ReactNode} from 'react'
import type {WorkspaceChoice} from '../../../shared/message-collaboration'
import {api} from '../api'
import {flushPlugins} from '../plugins'
import {translate as uiText} from '../i18n'
import {FileWorkspace} from './FileWorkspace'
import {EmployeeTerminal} from './EmployeeTerminal'
import {Icon} from './Icon'

/** Messages never opens a terminal or polls a file tree. The workbench remains explicit. */
export function ConversationBody({messages,...props}:{messages:boolean;employee:string;explorerWidth?:number;terminalHeight?:number;onAttachImage:(path:string)=>void;children:ReactNode}){
 if(messages)return <div className="message-chat-body">{props.children}</div>
 return <EmployeeWorkbench {...props}/>
}
function EmployeeWorkbench({employee,explorerWidth,terminalHeight,onAttachImage,children}:Omit<Parameters<typeof ConversationBody>[0],'messages'>){
 const [locations,setLocations]=useState<WorkspaceChoice[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState('')
 const panelKey='aexus:workbench-panels:'+employee
 const [panels,setPanels]=useState<{files:boolean;terminal:boolean}>(()=>{try{return JSON.parse(localStorage.getItem(panelKey)||'{"files":false,"terminal":false}')}catch{return {files:false,terminal:false}}})
 const togglePanel=(name:'files'|'terminal')=>{const next={...panels,[name]:!panels[name]};setPanels(next);try{localStorage.setItem(panelKey,JSON.stringify(next))}catch{}}
 const load=()=>void api.call<{workspaces:WorkspaceChoice[]}>('workspace.catalog',{employee}).then(value=>setLocations(value.workspaces)).catch(cause=>setError(cause.message))
 useEffect(()=>{let active=true;void api.call<{workspaces:WorkspaceChoice[]}>('workspace.catalog',{employee}).then(value=>{if(active)setLocations(value.workspaces)}).catch(cause=>{if(active)setError(cause.message)});return()=>{active=false}},[employee])
 const choose=async(value:string)=>{try{await flushPlugins();setSelected(value);setError('')}catch(cause){setError((cause as Error).message)}}
 const location=locations.find(value=>selected?value.conversation===selected:value.view==='company')
 return <div className="employee-workbench" data-files-panel={panels.files?'open':'closed'} data-terminal-panel={panels.terminal?'open':'closed'}>
  <div className="workbench-panel-bar">
   {locations.length>0&&<div className="employee-workspace-switch"><label>{uiText('Work files')}<select aria-label={uiText('Employee work folder')} value={selected} onFocus={load} onChange={event=>void choose(event.target.value)}><option value="">{uiText('Personal workspace')}</option>{locations.filter(value=>value.view==='messages').map(value=><option key={value.id} value={value.conversation}>Messages · {value.name}</option>)}</select></label><small title={location?.path}>{location?.path?.split(/[\\/]/).filter(Boolean).at(-1)||uiText('Original employee workspace')}</small></div>}
   <span className="workbench-panel-toggles">
    <button type="button" data-panel-toggle="files" aria-pressed={panels.files} title={uiText(panels.files?'Hide files panel':'Show files panel')} onClick={()=>togglePanel('files')}><Icon name="files"/>{uiText('Files')}</button>
    <button type="button" data-panel-toggle="terminal" aria-pressed={panels.terminal} title={uiText(panels.terminal?'Hide terminal':'Show terminal')} onClick={()=>togglePanel('terminal')}><Icon name="terminal"/>{uiText('Terminal')}</button>
   </span>
  </div>
  {error&&<p className="workspace-error" role="alert">{error}</p>}
  <FileWorkspace explorerWidth={explorerWidth} onAttachImage={selected?undefined:onAttachImage} key={'files-'+employee+'/'+selected} employee={employee} conversation={selected||undefined} initialFolder={location?.memberDirectory}>{children}</FileWorkspace>
  {panels.terminal&&<EmployeeTerminal terminalHeight={terminalHeight} key={'terminal-'+employee} employee={employee}/>}
 </div>
}
