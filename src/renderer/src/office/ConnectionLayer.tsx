import {useContext,useEffect,useId,useRef,useState,type PointerEvent,type CSSProperties} from 'react'
import type {PlannedRoom,Point} from '../../../shared/canvas'
import {connectorSetting,connectorPoints,nearestConnectorPoint,anchorForDock,type ConnectorSetting,type ConnectorSettings} from '../../../shared/connector'
import {movePathSegment} from '../../../shared/connector-path'
import {connectionNodes,nodePorts,type OfficeConnection} from '../../../shared/office-connections'
import {ConnectorSelection} from './ConnectorEditor'
type Gesture={pointerId:number;connection:OfficeConnection;kind:'source'|'target'|'segment';index:number;start:Point;setting:ConnectorSetting;moved:boolean}
export function ConnectionLayer({connections,rooms,settings,zoom,bounds,onPreview,onSave}:{connections:OfficeConnection[];rooms:PlannedRoom[];settings?:ConnectorSettings;zoom:number;bounds:Point&{width:number;height:number};onPreview:(s:ConnectorSetting|null)=>void;onSave:(s:ConnectorSetting)=>Promise<unknown>}){
 const {selected,select}=useContext(ConnectorSelection),marker=useId().replaceAll(':',''),nodes=connectionNodes(rooms),gesture=useRef<Gesture|null>(null),epoch=useRef(0),svg=useRef<SVGSVGElement>(null)
 const [hover,setHover]=useState(''),[dragging,setDragging]=useState(false),[error,setError]=useState('')
 useEffect(()=>{document.body.classList.toggle('is-connector-dragging',dragging);return()=>document.body.classList.remove('is-connector-dragging')},[dragging])
 useEffect(()=>{const cancel=(e:KeyboardEvent)=>{if(e.key!=='Escape'||!gesture.current)return;const id=gesture.current.pointerId;gesture.current=null;epoch.current++;setDragging(false);if(svg.current?.hasPointerCapture(id))svg.current.releasePointerCapture(id);onPreview(null)};window.addEventListener('keydown',cancel);return()=>window.removeEventListener('keydown',cancel)},[onPreview])
 const coordinate=(e:PointerEvent)=>{const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());return {x:p.x,y:p.y}}
 const begin=(e:PointerEvent,r:OfficeConnection,kind:Gesture['kind'],index=0)=>{
  if(e.button!==0)return;e.preventDefault();e.stopPropagation();epoch.current++;select(r);setError('');gesture.current={pointerId:e.pointerId,connection:r,kind,index,start:coordinate(e),setting:connectorSetting(settings,r.managerId,r.employeeId),moved:false};svg.current!.setPointerCapture(e.pointerId);setDragging(true)
 }
 const move=(e:PointerEvent)=>{
  const g=gesture.current;if(!g)return;e.preventDefault();e.stopPropagation();const p=coordinate(e),r=g.connection
  if(!g.moved&&Math.hypot(p.x-g.start.x,p.y-g.start.y)*zoom<3)return;g.moved=true
  if(g.kind==='segment'){
   const source=nodes.get(r.managerId)!,target=nodes.get(r.employeeId)!,current=connectorSetting(settings,r.managerId,r.employeeId)
   g.setting={...current,source:current.source.side==='auto'?anchorForDock(source.box,r.points[0]):current.source,target:current.target.side==='auto'?anchorForDock(target.box,r.points.at(-1)!):current.target,route:movePathSegment(r.points,g.index,p,8/zoom).map(p=>({x:p.x-r.origin.x,y:p.y-r.origin.y}))}
  }else{
   const n=nodes.get(g.kind==='source'?r.managerId:r.employeeId)!,pins=connectorPoints.map(anchor=>({anchor,point:nodePorts(n,anchor,g.kind==='target')[0].point}));g.setting={...g.setting,[g.kind]:nearestConnectorPoint(pins,p).anchor}
  }
  onPreview(g.setting)
 }
 const finish=async(e:PointerEvent,cancel=false)=>{
  const g=gesture.current;if(!g)return;e.stopPropagation();gesture.current=null;setDragging(false);if(svg.current!.hasPointerCapture(e.pointerId))svg.current!.releasePointerCapture(e.pointerId)
  if(cancel||!g.moved){onPreview(null);return}const token=++epoch.current
  try{await onSave(g.setting);if(token===epoch.current&&!gesture.current)onPreview(null)}catch(e){if(token===epoch.current){setError((e as Error).message);onPreview(null)}}
 }
 return <>
 <svg ref={svg} className="office-connections" data-dragging={dragging} width={bounds.width} height={bounds.height} viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} style={{left:bounds.x,top:bounds.y}} aria-label="员工协作连线" onPointerMove={move} onPointerUp={e=>void finish(e)} onPointerCancel={e=>void finish(e,true)} onKeyDown={e=>{if(e.key==='Escape'){gesture.current=null;epoch.current++;setDragging(false);onPreview(null)}}}>
  <defs><marker id={marker} markerWidth="8" markerHeight="8" viewBox="0 0 8 8" refX="8" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L8 4L0 8Z" fill="var(--accent)"/></marker></defs>
  {[...connections].sort((a,b)=>Number(a.managerId===selected?.managerId&&a.employeeId===selected?.employeeId)-Number(b.managerId===selected?.managerId&&b.employeeId===selected?.employeeId)).map(r=>{
   const chosen=r.managerId===selected?.managerId&&r.employeeId===selected?.employeeId
   const end=r.points.at(-1)!,previous=r.points.at(-2)!,length=Math.abs(end.x-previous.x)+Math.abs(end.y-previous.y)
   // Stay within the final straight section, beyond the route's rounded corner.
   const lead=Math.min(10/zoom,length/2),terminalStart={x:end.x-Math.sign(end.x-previous.x)*lead,y:end.y-Math.sign(end.y-previous.y)*lead}
   const lineWidth=Math.max(3.2,2.2/zoom),portRadius=Math.max(2.5,1.8/zoom)
   return <g key={r.id} className="management-connection" data-connection={r.id} data-manager={r.managerId} data-employee={r.employeeId} data-active={r.active} data-temporary={r.temporary} data-selected={chosen} data-manual={r.manual} data-warning={!!r.warning}>
    <title>{r.sourceName} → {r.targetName}{r.warning?' · '+r.warning:''}</title>
    <path className="management-line-halo" d={r.path} fill="none" style={{strokeWidth:Math.max(6,3/zoom)}}/>
    <path className="management-line" data-relation={r.temporary?undefined:r.id} data-routing="orthogonal" d={r.path} fill="none" stroke="currentColor" style={{strokeWidth:r.active?lineWidth:Math.max(2,1/zoom),...(r.active?{strokeDasharray:`${10/zoom} ${7/zoom}`,'--flow-distance':`${-17/zoom}px`}:{})} as CSSProperties} strokeLinecap={r.active?'round':undefined} strokeLinejoin="round" markerEnd={r.active?undefined:`url(#${marker})`}/>
    {r.active&&<g className="management-terminal" aria-hidden="true">
     <path d={`M${terminalStart.x} ${terminalStart.y}L${end.x} ${end.y}`} fill="none" stroke="currentColor" strokeWidth={lineWidth} strokeLinecap="butt"/>
     <circle cx={end.x} cy={end.y} r={portRadius} fill="var(--bg)" stroke="currentColor" strokeWidth={Math.max(1.5,1/zoom)}/>
    </g>}
    {r.points.slice(1).map((b,i)=>{const a=r.points[i],id=r.id+':'+i,mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};return <g key={i} data-segment={i}>
     <rect className="management-line-hit connector-segment-hit" x={Math.min(a.x,b.x)-(a.x===b.x?8/zoom:0)} y={Math.min(a.y,b.y)-(a.y===b.y?8/zoom:0)} width={a.x===b.x?16/zoom:Math.abs(a.x-b.x)} height={a.y===b.y?16/zoom:Math.abs(a.y-b.y)} fill="transparent" tabIndex={0} role="button" aria-label={`拖动线段 ${i+1} · ${r.sourceName} → ${r.targetName}`} onPointerEnter={()=>setHover(id)} onPointerLeave={()=>setHover('')} onPointerDown={e=>begin(e,r,'segment',i)} onKeyDown={e=>{if(e.key==='Enter')select(r)}}/>
     {(hover===id||chosen)&&<rect className="connector-segment-grip" x={mid.x-3/zoom} y={mid.y-3/zoom} width={6/zoom} height={6/zoom} rx={1/zoom}/>}
    </g>})}
    {(['source','target'] as const).map(end=>{const p=end==='source'?r.points[0]:r.points.at(-1)!;return <g key={end} className="connector-direct-end" data-end={end}>
     <circle className="connector-end-grip" cx={p.x} cy={p.y} r={6/zoom} style={{strokeWidth:2/zoom}}/>
     <circle className="connector-end-hit" cx={p.x} cy={p.y} r={12/zoom} role="button" tabIndex={0} aria-label={`拖动${end==='source'?'起点':'终点'} · ${r.sourceName} → ${r.targetName}`} onPointerDown={e=>begin(e,r,end)}/>
    </g>})}
   </g>
  })}
 </svg>
 {error&&<div className="connector-layer-error" role="alert">{error}</div>}
 </>
}
