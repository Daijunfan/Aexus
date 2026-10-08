import {Component,Suspense,lazy,useEffect,useMemo,useState,type ComponentType,type ReactNode} from 'react'
import type {EngineEntry} from '../../../../../Contract/engine'
import {createContractClient,type ContractClient} from '../../../../../Contract/protocol'
import {api} from '../api'
import {Icon} from './Icon'
import '../styles/application-layers.css'
const pages=import.meta.glob<{default:ComponentType<{client:ContractClient}>}>('../../../../../Engine/*/Page.tsx')
class EngineBoundary extends Component<{children:ReactNode},{error:string}>{
 state={error:''}
 static getDerivedStateFromError(error:Error){return {error:error.message}}
 render(){return this.state.error?<div className="engine-error" role="alert"><h2>Engine could not open</h2><p>{this.state.error}</p><p>Infra and its workspaces are still available.</p></div>:this.props.children}
}
export function EngineWorkspace({engineId,onSelect}:{engineId?:string;onSelect:(id:string|null)=>void}){
 const [catalog,setCatalog]=useState<{engines:EngineEntry[];errors:{directory:string;error:string}[]}>(),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const client=useMemo(()=>createContractClient((command,args)=>api.call(command,args,{engineScope:engineId}),handler=>api.onEvent(handler)),[engineId])
 useEffect(()=>{let active=true;void api.call<NonNullable<typeof catalog>>('contract.engines').then(data=>{if(active){setCatalog(data);setError('')}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[revision])
 const selected=catalog?.engines.find(e=>e.id===engineId),Page=useMemo(()=>{const key=selected&&'../../../../../Engine/'+selected.directory+'/'+selected.ui;return key&&pages[key]?lazy(pages[key]):undefined},[selected?.directory,selected?.ui])
 return <main className="engine-surface" aria-label="Engine workspace"><header className="engine-context"><button onClick={()=>onSelect(null)} aria-label="Engine catalog"><Icon name={selected?'arrow-left':'extensions'}/><span>{selected?'All engines':'Engine'}</span></button><span>CONTRACT 1.0</span><button aria-label="Refresh engines" onClick={()=>setRevision(r=>r+1)}><Icon name="refresh"/></button></header>{error&&<p className="engine-error" role="alert">{error}</p>}{selected?<EngineBoundary key={selected.id}><Suspense fallback={<p className="engine-loading">Opening {selected.name}…</p>}>{Page?<Page client={client}/>:<div className="engine-error"><h2>{selected.name}</h2><p>This Engine is installed but its UI is not in this build. Rebuild Aexus after adding an Engine.</p></div>}</Suspense></EngineBoundary>:<div className="engine-catalog"><p className="engine-eyebrow">PURPOSE-BUILT APPLICATIONS</p><h1>Choose a goal.<br/>Keep your infrastructure.</h1><p>Each Engine owns its starting input, workflow, interface and verifiable delivery. Your teams, conversations and schedules remain in Infra.</p><div className="engine-cards">{catalog?.engines.map(engine=><button key={engine.id} className="engine-card" onClick={()=>onSelect(engine.id)}><span className="engine-card-icon"><Icon name="extensions"/></span><strong>{engine.name}</strong><p>{engine.description}</p><footer><span>v{engine.version}</span><span>Open Engine <Icon name="arrow-right"/></span></footer></button>)}</div>{catalog&&!catalog.engines.length&&<p>No Engines installed. Add an Engine directory using the Contract authoring guide.</p>}{!catalog&&!error&&<p>Reading available Engines…</p>}{catalog?.errors.map(item=><p key={item.directory} className="engine-error" role="alert">{item.directory}: {item.error}</p>)}</div>}</main>
}
