import { useRef } from 'react'
import { DEFAULT_POLYGON, type Point } from '../../../shared/canvas'
export function PolygonEditor({points,onChange}:{points:Point[];onChange:(points:Point[])=>void}) {
  const svg=useRef<SVGSVGElement>(null), dragging=useRef<number|null>(null)
  const point=(e:React.PointerEvent|React.MouseEvent)=>{const r=svg.current!.getBoundingClientRect();return {x:Math.max(.01,Math.min(.99,(e.clientX-r.left)/r.width)),y:Math.max(.01,Math.min(.99,(e.clientY-r.top)/r.height))}}
  return <div className="polygon-editor"><svg ref={svg} viewBox="0 0 300 180" preserveAspectRatio="none" onPointerMove={e=>{if(dragging.current===null)return;const p=point(e);onChange(points.map((v,i)=>i===dragging.current?p:v))}} onPointerUp={()=>{dragging.current=null}}
    onDoubleClick={e=>{const p=point(e);let edge=0,distance=Infinity;points.forEach((a,i)=>{const b=points[(i+1)%points.length],vx=b.x-a.x,vy=b.y-a.y;const t=Math.max(0,Math.min(1,((p.x-a.x)*vx+(p.y-a.y)*vy)/(vx*vx+vy*vy||1)));const d=(p.x-a.x-t*vx)**2+(p.y-a.y-t*vy)**2;if(d<distance){edge=i;distance=d}});const next=[...points];next.splice(edge+1,0,p);onChange(next)}}>
    <defs><pattern id="shape-grid" width="15" height="15" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#bccaa433" /></pattern></defs><rect width="300" height="180" fill="url(#shape-grid)" />
    <polygon points={points.map(p=>`${p.x*300},${p.y*180}`).join(' ')} fill="#bbd1ab15" stroke="#c1d6b0" strokeWidth="1.5" />
    {points.map((p,i)=><circle key={i} cx={p.x*300} cy={p.y*180} r="5" fill="#d7ddbc" stroke="#405949" strokeWidth="2" onPointerDown={e=>{e.stopPropagation();dragging.current=i;e.currentTarget.setPointerCapture(e.pointerId)}} onContextMenu={e=>{e.preventDefault();if(points.length>3)onChange(points.filter((_,j)=>i!==j))}} />)}
  </svg><small>拖动圆点改变外框 · 双击添加顶点 · 右键移除顶点</small><button type="button" onClick={()=>onChange(DEFAULT_POLYGON.map(p=>({...p})))}>重置外框</button></div>
}
