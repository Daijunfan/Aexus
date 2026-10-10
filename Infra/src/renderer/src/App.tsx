import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react'
import {api,selectEngineScope} from './api'
import {EngineLibrary} from './components/EngineLibrary'
import type {ViewState} from '../../shared/view'
const WorkspaceApp=lazy(()=>import('./WorkspaceApp'))

export default function App(){
 const [location,setLocation]=useState<ViewState|null>(null),[failure,setFailure]=useState('')
 const revision=useRef(-1)
 const accept=useCallback((next:ViewState)=>{
  if(next.revision<revision.current)return
  revision.current=next.revision
  selectEngineScope(next.layer==='launcher'?null:next.engineId??null,next.revision)
  setLocation(next)
 },[])
 const reload=useCallback(()=>{setFailure('');void api.call<ViewState>('view.get').then(accept).catch(error=>setFailure(error.message))},[accept])
 useEffect(()=>{selectEngineScope(null);api.rendererReady();const off=api.onEvent(event=>{if(event.channel==='view:changed')accept(event.payload);if(event.channel==='client:authentication'&&!event.payload.authenticated){selectEngineScope(null);revision.current=-1;setLocation(null)}});reload();return off},[accept,reload])
 if(!location)return <main className="aexus-boot" role="status"><strong>Aexus</strong><p>{failure||'Opening your engine library…'}</p>{failure&&<button onClick={reload}>Retry</button>}</main>
 if(location.layer==='launcher'||!location.engineId)return <EngineLibrary onLoad={async id=>{const value=await api.call<ViewState>('view.load-engine',{engineId:id});accept(value)}}/>
 return <Suspense fallback={<main className="aexus-boot" role="status"><strong>Aexus</strong><p>Opening workspace…</p></main>}><WorkspaceApp key={location.engineId} initialView={location}/></Suspense>
}
