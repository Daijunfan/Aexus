import {useEffect,useRef,useState,type CSSProperties,type PointerEvent} from 'react'
import type {EngineEntry} from '../../../../../Contract/engine'
import {api} from '../api'
import brand from '../../../resources/icon.png'
import '../styles/engine-library.css'

const MIME='application/x-aexus-engine'
const colors=['#91a7ff','#78d8c6','#f7ba84','#eaa5d4']
function Symbol({index}:{index:number}){
 const k=index%4
 return <svg viewBox="0 0 120 120" fill="none" aria-hidden="true" className="el-symbol">
  <circle cx="60" cy="60" r="47" stroke="currentColor" strokeOpacity=".22"/>
  {k===0?<><circle cx="60" cy="60" r="29" stroke="currentColor" strokeWidth="1.7"/><ellipse cx="60" cy="60" rx="46" ry="17" stroke="currentColor" strokeWidth="1.5" transform="rotate(-32 60 60)"/><path d="m48 63 8-9 10 15 10-15" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><circle cx="98" cy="29" r="4" fill="currentColor"/></>:k===1?<><path d="M60 17 97 39v43L60 104 23 82V39zM23 39l37 23 37-23M60 62v42" stroke="currentColor" strokeWidth="1.7"/><path d="m46 46 14-8 14 8v15L60 69l-14-8V46z" fill="currentColor" fillOpacity=".2"/></>:k===2?<><rect x="32" y="24" width="55" height="69" rx="7" stroke="currentColor" strokeWidth="1.8" transform="rotate(10 32 24)"/><path d="M42 47h32M42 56h30M42 65h18M42 74h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="m80 81 8 7 14-17" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></>:<><rect x="28" y="28" width="64" height="64" rx="14" stroke="currentColor" strokeWidth="1.8"/><circle cx="60" cy="52" r="13" fill="currentColor" fillOpacity=".24"/><path d="M40 79c0-20 40-20 40 0" stroke="currentColor" strokeWidth="2"/><circle cx="90" cy="28" r="7" fill="currentColor"/></>}
 </svg>
}
export function EngineLibrary({loading=false,error:outerError='',onLoad}:{loading?:boolean;error?:string;onLoad:(id:string)=>Promise<void>}){
 const [engines,setEngines]=useState<EngineEntry[]>([]),[fetching,setFetching]=useState(true),[issue,setIssue]=useState(''),[revision,setRevision]=useState(0),[page,setPage]=useState(0),[dragging,setDragging]=useState<string|null>(null),[over,setOver]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ghost,setGhost]=useState<{id:string;x:number;y:number}|null>(null)
 const dock=useRef<HTMLDivElement>(null),gesture=useRef<{id:string;x:number;y:number;active:boolean}|null>(null),lock=useRef(false),alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{let open=true;setFetching(true);void api.call<{engines:EngineEntry[];errors:{directory:string;error:string}[]}>('contract.engines').then(value=>{if(open){setEngines(value.engines);setPage(0);setIssue(value.errors.map(e=>e.directory+': '+e.error).join('\n'))}}).catch(e=>{if(open)setIssue((e as Error).message)}).finally(()=>{if(open)setFetching(false)});return()=>{open=false}},[revision])
 const count=Math.ceil(engines.length/4),visible=engines.slice(page*4,page*4+4),dragged=engines.find(e=>e.id===dragging)
 const load=async(id:string)=>{if(lock.current||loading||!engines.some(e=>e.id===id))return;lock.current=true;setBusy(true);setError('');setOver(false);setGhost(null);try{await onLoad(id)}catch(e){if(alive.current)setError((e as Error).message)}finally{lock.current=false;if(alive.current){setBusy(false);setDragging(null)}}}
 const touchDown=(event:PointerEvent<HTMLButtonElement>,id:string)=>{
  if(event.pointerType==='mouse'||busy)return
  gesture.current={id,x:event.clientX,y:event.clientY,active:false};event.currentTarget.setPointerCapture(event.pointerId)
 }
 const inside=(x:number,y:number)=>{const bounds=dock.current?.getBoundingClientRect();return !!bounds&&x>=bounds.left&&x<=bounds.right&&y>=bounds.top&&y<=bounds.bottom}
 const touchMove=(event:PointerEvent<HTMLButtonElement>)=>{const value=gesture.current;if(!value)return;if(!value.active&&Math.hypot(event.clientX-value.x,event.clientY-value.y)<9)return;value.active=true;setDragging(value.id);setGhost({id:value.id,x:event.clientX,y:event.clientY});setOver(inside(event.clientX,event.clientY))}
 const touchEnd=(event:PointerEvent<HTMLButtonElement>)=>{const value=gesture.current;gesture.current=null;if(!value)return;const landed=value.active&&inside(event.clientX,event.clientY);setGhost(null);setOver(false);if(value.active){event.preventDefault();if(landed)void load(value.id);else setDragging(null)}}
 const pick=(id:string)=>{if(busy||loading)return;setDragging(id);dock.current?.focus()}
 return <main className="engine-library" data-engine-loaded="false" data-dragging={!!dragging} aria-label="Engine library">
  <div className="el-sky" aria-hidden="true"><span/><span/><span/><span/></div>
  <header className="el-header"><div className="el-brand"><img src={brand} alt=""/><span>AEXUS</span><i/> <small>ENGINE LIBRARY</small></div><div className="el-header-right"><span className="el-system-dot"/> SYSTEM READY <span className="el-header-count">{String(engines.length).padStart(2,'0')} ENGINES</span></div></header>
  <div className="el-heading"><div className="el-eyebrow"><span/> YOUR WORKSPACE, YOUR ORBIT <span/></div><h1>Everything begins with an engine<span className="el-title-period">.</span></h1><p>将引擎拖入中央启动舱，开启独立工作空间。</p></div>
  {(error||outerError)&&<div className="el-error" role="alert">{error||outerError}<button type="button" onClick={()=>setError('')} aria-label="Dismiss load error">×</button></div>}
  <section className="el-stage" aria-label="Drag an engine to the center to load it">
   <div className="el-guides" aria-hidden="true"><i/><i/><i/><i/></div>
   {visible.map((item,slot)=>{const i=engines.indexOf(item);return <button key={item.id} type="button" className={'el-card el-slot-'+slot} data-engine-id={item.id} aria-label={'Drag '+item.name+' to launch'} aria-grabbed={dragging===item.id} title={'拖入中央启动舱 · '+item.name} style={{'--card-accent':colors[i%colors.length]} as CSSProperties} disabled={loading||busy} draggable onDragStart={event=>{event.dataTransfer.setData(MIME,item.id);event.dataTransfer.effectAllowed='copy';setDragging(item.id)}} onDragEnd={()=>{setDragging(null);setOver(false)}} onPointerDown={event=>touchDown(event,item.id)} onPointerMove={touchMove} onPointerUp={touchEnd} onPointerCancel={()=>{gesture.current=null;setGhost(null);setDragging(null);setOver(false)}} onKeyDown={event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();pick(item.id)}}}>
     <span className="el-card-beam"/><span className="el-card-index">{String(i+1).padStart(2,'0')} / ENGINE</span><span className="el-card-icon"><Symbol index={i}/></span><span className="el-card-title">{item.name}</span><span className="el-card-summary">{item.description}</span><span className="el-card-footer"><span>V {item.version}</span><span>DRAG TO CENTER <b aria-hidden="true">↗</b></span></span>
    </button>})}
   <div ref={dock} className={'el-dock'+(over?' is-over':'')+(busy?' is-loading':'')} data-testid="engine-load-dock" tabIndex={0} role="button" aria-label="Engine launch bay. Drag an engine here to load it." aria-disabled={!dragging||busy||loading} onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&dragging){event.preventDefault();void load(dragging)}else if(event.key==='Escape'){setDragging(null);setOver(false)}}} onDragOver={event=>{if([...event.dataTransfer.types].includes(MIME)){event.preventDefault();event.dataTransfer.dropEffect='copy';setOver(true)}}} onDragLeave={event=>{if(!(event.relatedTarget instanceof Node)||!event.currentTarget.contains(event.relatedTarget))setOver(false)}} onDrop={event=>{event.preventDefault();const id=event.dataTransfer.getData(MIME);setOver(false);if(engines.some(e=>e.id===id))void load(id)}}>
    <div className="el-dock-eyebrow"><i/> CORE 00 / LAUNCH BAY <i/></div><div className="el-rings"><i/><i/><i/><i/><span className="el-ring-axis"/><div className="el-dock-center">{busy?<span className="el-spinner"/>:dragged?<Symbol index={engines.indexOf(dragged)}/>:<svg viewBox="0 0 90 90" fill="none" aria-hidden="true"><path d="m45 8 31 18v38L45 82 14 64V26L45 8ZM14 26l31 19 31-19M45 45v37" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><circle cx="45" cy="45" r="10" stroke="currentColor" strokeDasharray="3 4"/></svg>}</div><span className="el-ring-beacon"/></div>
    <strong>{busy?'ENGINE INITIALIZING':over?'RELEASE TO LAUNCH':dragged?'READY TO DROP':'DROP ENGINE HERE'}</strong><p>{busy?'正在载入所选引擎…':dragged?'松开鼠标或触控，即可载入 '+dragged.name:'拖拽四周任意引擎，进入你的工作空间'}</p><div className="el-dock-rule"><span/>DRAG · DROP · LAUNCH<span/></div>
   </div>
   {fetching&&!engines.length&&<div className="el-stage-status" role="status">正在读取引擎目录…</div>}
   {!fetching&&!engines.length&&<div className="el-stage-status" role="status">尚未安装引擎。添加引擎并重新构建即可使用。</div>}
  </section>
  <footer className="el-footer"><div className="el-page-controls">{count>1&&<><button disabled={page===0||busy} onClick={()=>setPage(v=>Math.max(0,v-1))} aria-label="Previous engines">‹</button><span>{page+1} / {count}</span><button disabled={page>=count-1||busy} onClick={()=>setPage(v=>Math.min(count-1,v+1))} aria-label="Next engines">›</button></>}<button className="el-refresh" disabled={fetching||busy} onClick={()=>setRevision(v=>v+1)} aria-label="Refresh engine library">↻ <span>刷新目录</span></button></div><span>ENGINE / INFRA / CONTRACT <i/> NO ENGINE LOADED</span></footer>
  {issue&&<div role="alert" className="el-catalog-warning">{issue}</div>}
  {ghost&&<div className="el-touch-ghost" style={{left:ghost.x,top:ghost.y}} aria-hidden="true">{engines.find(e=>e.id===ghost.id)?.name}</div>}
 </main>
}
