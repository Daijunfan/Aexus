import {useEffect,useState,type ReactNode} from 'react'
import type {WorkspaceChoice} from '../../../shared/message-collaboration'
import {api} from '../api'
import {flushPlugins} from '../plugins'
import {translate as uiText} from '../i18n'
import {FileWorkspace} from './FileWorkspace'
import {EmployeeTerminal} from './EmployeeTerminal'

/** Messages never opens a terminal or polls a file tree. The workbench remains explicit. */
export function ConversationBody({messages,...props}:{messages:boolean;employee:string;explorerWidth?:number;terminalHeight?:number;onAttachImage:(path:string)=>void;children:ReactNode}){
 if(messages)return <div className="message-chat-body">{props.children}</div>
 return <EmployeeWorkbench {...props}/>
}
function EmployeeWorkbench({employee,explorerWidth,terminalHeight,onAttachImage,children}:Omit<Parameters<typeof ConversationBody>[0],'messages'>){
 const [locations,setLocations]=useState<WorkspaceChoice[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState('')
 const load=()=>void api.call<{workspaces:WorkspaceChoice[]}>('workspace.catalog',{employee}).then(value=>setLocations(value.workspaces)).catch(cause=>setError(cause.message))
 useEffect(()=>{let active=true;void api.call<{workspaces:WorkspaceChoice[]}>('workspace.catalog',{employee}).then(value=>{if(active)setLocations(value.workspaces)}).catch(cause=>{if(active)setError(cause.message)});return()=>{active=false}},[employee])
 const choose=async(value:string)=>{try{await flushPlugins();setSelected(value);setError('')}catch(cause){setError((cause as Error).message)}}
 const location=locations.find(value=>selected?value.conversation===selected:value.view==='company')
 return <div className="employee-workbench">
  {locations.length>0&&<div className="employee-workspace-switch"><label>{uiText('Work files')}<select aria-label={uiText('Employee work folder')} value={selected} onFocus={load} onChange={event=>void choose(event.target.value)}><option value="">{uiText('Personal workspace')}</option>{locations.filter(value=>value.view==='messages').map(value=><option key={value.id} value={value.conversation}>Messages · {value.name}</option>)}</select></label><small title={location?.path}>{location?.path??uiText('Original employee workspace')}</small></div>}
  {error&&<p className="workspace-error" role="alert">{error}</p>}
  <FileWorkspace explorerWidth={explorerWidth} onAttachImage={selected?undefined:onAttachImage} key={'files-'+employee+'/'+selected} employee={employee} conversation={selected||undefined} initialFolder={location?.memberDirectory}>{children}</FileWorkspace>
  <EmployeeTerminal terminalHeight={terminalHeight} key={'terminal-'+employee} employee={employee}/>
 </div>
}
