import {translate as uiText,useI18n,interfaceLanguage} from '../i18n'
import {useRef,useState} from 'react'
import type {PluginDescriptor} from '../../../shared/plugins'
import {PluginIcon} from './PluginIcon'
import {type Store} from '../../../shared/types'
import {DEFAULT_PREFERENCES,SIDEBAR_MIN,SIDEBAR_MAX} from '../../../shared/preferences'
import {Icon} from './Icon'
import {hasFileDrop,dropFiles} from '../file-transfers'
type Props={english?:boolean;editing:boolean;onToggleEdit:()=>void;checkingHosts:boolean;onRefreshHosts:()=>void;plugins:PluginDescriptor[];active:string|null;store:Store;sharedOpen:boolean;onOpen:(id:string)=>void;onHome:()=>void;onSettings:()=>void;onResize:(width:number|undefined)=>void;act:(cmd:string,args?:Record<string,unknown>)=>Promise<any>}
export function PluginDirectory({english=false,editing,onToggleEdit,checkingHosts,onRefreshHosts,plugins,active,store,sharedOpen,onOpen,onHome,onSettings,onResize,act}:Props) {
  useI18n()
  const label=(en:string,zh:string)=>interfaceLanguage()==='en'?en:zh
  const sidebar=useRef<HTMLElement>(null),drag=useRef<{x:number;width:number;next:number;sequence:number}|null>(null),sequence=useRef(0)
  const [transferError,setTransferError]=useState('')
  const width=store.preferences?.sidebarWidth??DEFAULT_PREFERENCES.sidebarWidth
  const overview=store.preferences?.showTeamOverview??DEFAULT_PREFERENCES.showTeamOverview
  const limit=(value:number)=>Math.round(Math.max(SIDEBAR_MIN,Math.min(SIDEBAR_MAX,value)))
  const finish=async(cancel=false)=>{const current=drag.current;if(!current)return;drag.current=null;if(cancel){onResize(undefined);return}try{await act('settings.set',{sidebarWidth:current.next})}finally{if(sequence.current===current.sequence)onResize(undefined)}}
  return <aside ref={sidebar} className={`plugin-directory ${active?'has-project':''}`} aria-label={label('Company applications','已集成插件目录')}>
    <button className={`directory-home ${active===null?'active':''}`} onClick={onHome} title={label('Back to company','返回 Agents Company')} aria-label={label('Back to company','返回 Agents Company')}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/></svg></button>
    <nav className="plugin-icons" aria-label={label('Applications','工作应用')}>{plugins.map(plugin=><div className={`plugin-directory-item ${active===plugin.id?'active':''}`} key={plugin.id}><button className="plugin-directory-button" title={plugin.name} aria-label={`${label('Open','打开')} ${plugin.name}`} aria-pressed={active===plugin.id} data-plugin={plugin.id} onClick={()=>onOpen(plugin.id)}><PluginIcon id={plugin.id}/></button></div>)}</nav>
    <button className={`directory-edit ${editing?'active':''}`} aria-label={label('Edit canvas','编辑画布')} title={editing?label('Leave canvas editing','退出画布编辑'):label('Edit canvas · Select employees or teams','编辑画布 · 多选员工或团队')} aria-pressed={editing} onClick={onToggleEdit}><Icon name="edit"/></button>
    <button className={`directory-shared ${sharedOpen?'active':''}`} aria-label={label('Files and assets','文件与资产')} title={label('Files and assets · Drop to Shared','文件与资产 · 拖入文件保存到 Shared')} aria-pressed={sharedOpen} onClick={()=>{setTransferError('');void act('view.shared',{enabled:!sharedOpen})}}
      onDragOver={e=>{if(hasFileDrop(e.dataTransfer)){e.preventDefault();e.dataTransfer.dropEffect='copy'}}}
      onDrop={e=>{if(!hasFileDrop(e.dataTransfer))return;e.preventDefault();setTransferError('');void dropFiles(e.dataTransfer,{shared:true,path:'.'}).then(()=>act('view.shared',{enabled:true})).catch(error=>setTransferError(error.message))}}><Icon name="folder"/></button>
    <button className={`directory-overview ${overview?'active':''}`} aria-label={label('Team overview','团队索引')} title={overview?label('Hide team overview','隐藏团队索引'):label('Show team overview','显示团队索引')} aria-pressed={overview} onClick={()=>void act('settings.set',{showTeamOverview:!overview})}><Icon name="location"/></button>
    {transferError&&<div className="directory-transfer-error" role="alert">{transferError}</div>}
    <footer><button className="directory-settings directory-refresh" onClick={onRefreshHosts} disabled={checkingHosts} aria-busy={checkingHosts} title={checkingHosts?label('Checking hosts…','正在检查主机状态…'):label('Refresh hosts in this company view','刷新当前视图的主机状态')} aria-label={label('Refresh host status','刷新主机状态')}><Icon name="refresh"/></button><button className="directory-settings" onClick={onSettings} title={label('Settings','设置')} aria-label={label('Application settings','应用设置')}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 3v6m8 0v6m-6 0v6" strokeWidth="3"/></svg></button></footer>
    <div className="sidebar-resizer" role="separator" aria-label={label('Resize sidebar','调整侧栏宽度')} aria-orientation="vertical" aria-valuemin={SIDEBAR_MIN} aria-valuemax={SIDEBAR_MAX} aria-valuenow={width} tabIndex={0}
      onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const w=sidebar.current!.getBoundingClientRect().width;drag.current={x:e.clientX,width:w,next:w,sequence:++sequence.current};onResize(w)}}
      onPointerMove={e=>{if(drag.current){drag.current.next=limit(drag.current.width+e.clientX-drag.current.x);onResize(drag.current.next)}}}
      onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);void finish()}} onPointerCancel={()=>void finish(true)}
      onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();void act('settings.set',{sidebarWidth:limit(e.key==='Home'?SIDEBAR_MIN:e.key==='End'?SIDEBAR_MAX:width+(e.key==='ArrowLeft'?-4:4))})}}} onDoubleClick={()=>void act('settings.set',{sidebarWidth:DEFAULT_PREFERENCES.sidebarWidth})}/>
  </aside>
}
