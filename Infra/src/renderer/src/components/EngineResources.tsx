import {useEffect,useRef,useState} from 'react'
import {api} from '../api'
import {Icon} from './Icon'
import {useDialogFocus} from '../office/useDialogFocus'
import '../styles/engine-resources.css'
type Kind='teams'|'employees'|'groups'|'channels'|'schedules'
type Entry={id:string;name:string;team?:string;employeeId?:string}
type Selection=Record<Kind,string[]>
type Scope={engineId:string;revision:number;explicit:Selection;available:Record<Kind,Entry[]>}
const tabs:[Kind,string][]=[['teams','Teams'],['employees','Employees'],['groups','Groups'],['channels','Channels'],['schedules','Schedules']]
const empty=():Selection=>({teams:[],employees:[],groups:[],channels:[],schedules:[]})
/** Linking is an explicit operator action; it never clones a resource or grants employee authority. */
export function EngineResources({engineId}:{engineId:string}){
 const [open,setOpen]=useState(false),[scope,setScope]=useState<Scope>(),[kind,setKind]=useState<Kind>('teams'),[selected,setSelected]=useState<Selection>(empty),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[discard,setDiscard]=useState(false),[refresh,setRefresh]=useState(0)
 const trigger=useRef<HTMLButtonElement>(null),active=useRef(false),saving=useRef(false),generation=useRef(0)
 const dirty=!!scope&&tabs.some(([key])=>[...(scope.explicit[key]??[])].sort().join('\n')!==[...selected[key]].sort().join('\n'))
 const close=()=>{if(saving.current)return;if(dirty){setDiscard(true);return}setOpen(false)}
 useDialogFocus('.engine-links',open,()=>trigger.current)
 useEffect(()=>{active.current=true;return()=>{active.current=false;generation.current++}},[])
 useEffect(()=>{
  if(!open)return
  const ticket=++generation.current;setBusy(true);setError('');setDiscard(false)
  void api.call<Scope>('infra.scope',{engineId,available:true}).then(value=>{if(active.current&&generation.current===ticket){setScope(value);setSelected(Object.fromEntries(tabs.map(([key])=>[key,[...(value.explicit[key]??[])]])) as Selection)}}).catch(e=>{if(active.current&&generation.current===ticket)setError(e.message)}).finally(()=>{if(active.current&&generation.current===ticket)setBusy(false)})
  return()=>{generation.current++}
 },[open,engineId,refresh])
 const save=async()=>{
  if(!scope||busy||saving.current||!dirty)return
  saving.current=true;setBusy(true);setError('')
  try{
   let revision=scope.revision
   for(const [command,remove] of [['infra.bind',false],['infra.unbind',true]] as const){
    const resources=Object.fromEntries(tabs.map(([key])=>[key,(remove?scope.explicit[key]??[]:selected[key]).filter(id=>!(remove?selected[key]:scope.explicit[key]??[]).includes(id))]).filter(([,ids])=>(ids as string[]).length))
    if(Object.keys(resources).length)revision=(await api.call<Scope>(command,{engineId,resources,expectedRevision:revision})).revision
   }
   if(active.current)setOpen(false)
  }catch(e){if(active.current)setError((e as Error).message)}finally{saving.current=false;if(active.current)setBusy(false)}
 }
 const entries=(scope?.available[kind]??[]).filter(e=>(e.name+' '+(e.team??'')+' '+(e.employeeId??'')).toLowerCase().includes(query.trim().toLowerCase()))
 return <><button ref={trigger} className="engine-resource-button" title="Manage this Engine's linked resources" aria-label="Linked Engine resources" onClick={()=>{setOpen(true);setDiscard(false)}}><span className="engine-current-dot"/><span>{engineId}</span><Icon name="settings-gear"/></button>{open&&<div className="engine-links-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><div className="engine-links" role="dialog" aria-modal="true" aria-label="Linked Engine resources" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}}}><header><button aria-label="Close linked resources" onClick={close} disabled={busy}><Icon name="arrow-left"/></button><div><small>ENGINE WORKSPACE</small><h2>{engineId}</h2></div></header><p>Link existing resources to this engine. Original identities, files and permissions stay unchanged. Sharing a Team includes its employees. Unlinking never deletes your work.</p><nav role="tablist" aria-label="Resource types">{tabs.map(([id,label])=><button key={id} role="tab" aria-selected={kind===id} aria-pressed={kind===id} onClick={()=>{setKind(id);setQuery('')}}>{label}<small>{selected[id]?.length??0}</small></button>)}</nav><label className="engine-links-search"><Icon name="search"/><input type="search" aria-label="Search resources to link" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find existing resources"/></label>{error&&<div className="engine-links-error" role="alert">{error}<button onClick={()=>setRefresh(n=>n+1)} disabled={busy}>Reload current links</button></div>}<div className="engine-links-list">{!scope?<p role="status">{busy?'Reading existing resources…':'Could not read resources.'}</p>:entries.length?entries.map(entry=><label key={entry.id}><input type="checkbox" checked={selected[kind].includes(entry.id)} disabled={busy} onChange={()=>{setDiscard(false);setSelected(old=>({...old,[kind]:old[kind].includes(entry.id)?old[kind].filter(id=>id!==entry.id):[...old[kind],entry.id]}))}}/><div><strong>{entry.name}</strong><small>{entry.team?'Team · '+entry.team:entry.employeeId?'Employee · '+entry.employeeId:kind==='teams'?'Includes current and future employees':entry.id}</small></div></label>):<p>No matching resources.</p>}</div><footer>{discard?<><span>Discard unsaved selection?</span><button className="engine-links-secondary" onClick={()=>setDiscard(false)}>Keep editing</button><button onClick={()=>setOpen(false)} disabled={busy}>Discard & close</button></>:<><span>New resources created here are linked automatically.</span><button disabled={busy||!scope||!dirty} onClick={()=>void save()}>{busy?'Saving…':'Save links'}</button></>}</footer></div></div>}</>
}
