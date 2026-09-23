import {useRef} from 'react'
import type {PluginDescriptor} from '../../../shared/plugins'
import {teamSettings,type Store,type StoredSession} from '../../../shared/types'
import {DEFAULT_PREFERENCES,SIDEBAR_MIN,SIDEBAR_MAX} from '../../../shared/preferences'
import {Mascot} from '../office/Mascot'
type Props={plugins:PluginDescriptor[];active:string|null;store:Store;busyIds:Set<string>;selected?:string;onOpen:(id:string)=>void;onEmployee:(card:StoredSession)=>void;onHome:()=>void;onSettings:()=>void;onResize:(width:number|undefined)=>void;act:(cmd:string,args?:Record<string,unknown>)=>Promise<any>}
export function PluginDirectory({plugins,active,store,busyIds,selected,onOpen,onEmployee,onHome,onSettings,onResize,act}:Props) {
  const sidebar=useRef<HTMLElement>(null),drag=useRef<{x:number;width:number;next:number;sequence:number}|null>(null),sequence=useRef(0)
  const employees=store.sessions.filter(card=>teamSettings(store,card.group).pluginId===active)
  const width=store.preferences?.sidebarWidth??DEFAULT_PREFERENCES.sidebarWidth
  const limit=(value:number)=>Math.round(Math.max(SIDEBAR_MIN,Math.min(SIDEBAR_MAX,value)))
  const finish=async(cancel=false)=>{const current=drag.current;if(!current)return;drag.current=null;if(cancel){onResize(undefined);return}try{await act('settings.set',{sidebarWidth:current.next})}finally{if(sequence.current===current.sequence)onResize(undefined)}}
  return <aside ref={sidebar} className={`plugin-directory ${active?'has-project':''}`} aria-label="已集成插件目录">
    <button className={`directory-home ${active===null?'active':''}`} onClick={onHome} title="返回 Agents Company" aria-label="返回 Agents Company"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/></svg></button>
    <nav className="plugin-icons" aria-label="工作应用">{plugins.map(plugin=><div className={`plugin-directory-item ${active===plugin.id?'active':''}`} key={plugin.id}><button className="plugin-directory-button" title={plugin.name} aria-label={`打开 ${plugin.name}`} aria-pressed={active===plugin.id} data-plugin={plugin.id} onClick={()=>onOpen(plugin.id)}><span className="plugin-monogram" aria-hidden="true">{plugin.name.slice(0,1)}</span></button></div>)}</nav>
    {active&&employees.length>0&&<nav className="project-agents" aria-label="项目员工会话">{employees.map(card=><div key={card.id} className={`plugin-agent-row ${selected===card.id?'selected':''}`} data-agent-id={card.id}>
      <button className="agent-avatar-button" onClick={()=>onEmployee(card)} aria-label={`打开 ${card.title} 的会话`} title={`${card.title} · ${busyIds.has(card.id)?'工作中':'休息中'}`}><Mascot subtle kind={card.avatar} color={card.color} accessory={card.accessory} working={busyIds.has(card.id)} pose={busyIds.has(card.id)?'type':'sleep'}/><i className={busyIds.has(card.id)?'working':''}/></button>
    </div>)}</nav>}
    <footer><button className="directory-settings" onClick={onSettings} title="设置" aria-label="应用设置"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 3v6m8 0v6m-6 0v6" strokeWidth="3"/></svg></button></footer>
    <div className="sidebar-resizer" role="separator" aria-label="调整侧栏宽度" aria-orientation="vertical" aria-valuemin={SIDEBAR_MIN} aria-valuemax={SIDEBAR_MAX} aria-valuenow={width} tabIndex={0}
      onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);const w=sidebar.current!.getBoundingClientRect().width;drag.current={x:e.clientX,width:w,next:w,sequence:++sequence.current};onResize(w)}}
      onPointerMove={e=>{if(drag.current){drag.current.next=limit(drag.current.width+e.clientX-drag.current.x);onResize(drag.current.next)}}}
      onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);void finish()}} onPointerCancel={()=>void finish(true)}
      onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();void act('settings.set',{sidebarWidth:limit(e.key==='Home'?SIDEBAR_MIN:e.key==='End'?SIDEBAR_MAX:width+(e.key==='ArrowLeft'?-4:4))})}}} onDoubleClick={()=>void act('settings.set',{sidebarWidth:DEFAULT_PREFERENCES.sidebarWidth})}/>
  </aside>
}
