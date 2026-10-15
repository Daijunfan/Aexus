import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import type {OfficeConnection} from '../../../shared/office-connections'
import {createContext,useContext,useEffect,useRef,useState,type PointerEvent} from 'react'
import {createPortal} from 'react-dom'
import {connectorPoints,nearestConnectorPoint,connectorSetting,type ConnectorAnchor,type ConnectorSetting,type ConnectorSettings} from '../../../shared/connector'
import {EMPLOYEE_SIZE,type PlannedRoom,type Point} from '../../../shared/canvas'
import {employeePorts} from '../../../shared/management-routing'
import type {ManagementRelation,ManagementInteraction} from '../../../shared/management'
import type {CrossTeamRoute} from '../../../shared/cross-team-routing'
import {AppSelect} from '../components/AppSelect'
export type ConnectionSelection={managerId:string;employeeId:string}
export const ConnectorSelection=createContext<{selected:ConnectionSelection|null;select:(value:ConnectionSelection)=>void}>({selected:null,select:()=>{}})
const sides=[['auto','自动'],['top','头顶 / 上方'],['right','右侧'],['bottom','脚下 / 下方'],['left','左侧']]
export function ConnectorEditor({selected,connections,rooms,settings,relations,interactions,crossRoutes,world,zoom,onClose,onPreview,onSave}:{selected:ConnectionSelection;connections:OfficeConnection[];rooms:PlannedRoom[];settings?:ConnectorSettings;relations:ManagementRelation[];interactions:ManagementInteraction[];zoom:number;crossRoutes:CrossTeamRoute[];world:HTMLDivElement|null;onClose:()=>void;onPreview:(value:ConnectorSetting|null)=>void;onSave:(value:ConnectorSetting,reset?:boolean)=>Promise<unknown>}){
  useI18n()

  const [expanded,setExpanded]=useState(false)
  const {select}=useContext(ConnectorSelection)
  const choices=[...new Map([...relations,...crossRoutes,selected].map(edge=>[JSON.stringify([edge.managerId,edge.employeeId]),edge])).values()].filter(edge=>rooms.some(r=>r.employees.some(e=>e.card.id===edge.managerId)))
  const name=(id:string)=>rooms.flatMap(r=>r.employees).find(e=>e.card.id===id)?.card.title??id
  const current=connectorSetting(settings,selected.managerId,selected.employeeId),[form,setForm]=useState(current),[error,setError]=useState(''),[saving,setSaving]=useState(false)
  const [dragging,setDragging]=useState<'source'|'target'|null>(null)
  const moving=useRef<{end:'source'|'target';setting:ConnectorSetting}|null>(null)
  useEffect(()=>setForm(current),[JSON.stringify(current)])
  const save=async(value:ConnectorSetting,reset=false)=>{setSaving(true);setError('');try{await onSave(value,reset);onPreview(null)}catch(error){setError((error as Error).message);onPreview(null)}finally{setSaving(false)}}
  const nodes=Object.fromEntries(['source','target'].map(end=>{const id=end==='source'?selected.managerId:selected.employeeId,room=rooms.find(r=>r.employees.some(e=>e.card.id===id)),item=room?.employees.find(e=>e.card.id===id);return [end,room&&item?{room,item,box:{x:room.bounds.x+item.position.x,y:room.bounds.y+item.position.y,...EMPLOYEE_SIZE}}:undefined]}))
  const displayed=connections.find(c=>c.managerId===selected.managerId&&c.employeeId===selected.employeeId)
  const status=displayed?.warning?'constrained':'routed'
  const fixedPoint=(end:'source'|'target',anchor:ConnectorAnchor)=>{const n=nodes[end]!,p=employeePorts({...n.item.position,...EMPLOYEE_SIZE},anchor,end==='target')[0].point;return {x:n.room.bounds.x+p.x,y:n.room.bounds.y+p.y}}
  const pins=(end:'source'|'target')=>connectorPoints.map(anchor=>({anchor,point:fixedPoint(end,anchor)}))
  const point=(end:'source'|'target')=>{if(current[end].side!=='auto')return fixedPoint(end,current[end]);return (end==='source'?displayed?.points[0]:displayed?.points.at(-1))??fixedPoint(end,current[end])}
  const coords=(e:PointerEvent<SVGCircleElement>)=>{const svg=e.currentTarget.ownerSVGElement!,matrix=svg.getScreenCTM()!;return new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse())}
  const begin=(end:'source'|'target',e:PointerEvent<SVGCircleElement>,anchor?:ConnectorAnchor)=>{e.preventDefault();e.stopPropagation();if(saving)return;const next=anchor?{...current,[end]:anchor}:current;moving.current={end,setting:next};setDragging(end);e.currentTarget.setPointerCapture(e.pointerId);if(anchor)onPreview(next)}
  const move=(e:PointerEvent<SVGCircleElement>)=>{if(!moving.current)return;e.preventDefault();e.stopPropagation();const {end}=moving.current,{anchor}=nearestConnectorPoint(pins(end),coords(e)),next={...moving.current.setting,[end]:anchor};moving.current.setting=next;onPreview(next)}
  const finish=(e:PointerEvent<SVGCircleElement>,cancel=false)=>{if(!moving.current)return;e.stopPropagation();const next=moving.current.setting;moving.current=null;setDragging(null);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(cancel)onPreview(null);else void save(next)}
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){moving.current=null;setDragging(null);onPreview(null);onClose()}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[onClose])
  const patch=(end:'source'|'target',anchor:ConnectorAnchor)=>{const next={...form,[end]:anchor};setForm(next);onPreview(next)}
  return <>
    {world&&createPortal(<svg className="connector-handles" width="1" height="1" aria-label={uiText("Connection point editing")}>
      {(['source','target'] as const).map(end=>{const n=nodes[end];if(!n)return null;const p=point(end),label=uiText(end==='source'?'Source':'Target endpoint');return <g key={end} className="connector-pin-group" data-end={end} data-dragging={dragging===end}>
        <rect className="connector-boundary" x={n.box.x} y={n.box.y} width={n.box.width} height={n.box.height} rx="0" vectorEffect="non-scaling-stroke"/>
        <text className="connector-end-label" x={n.box.x+n.box.width/2} y={n.box.y-15/zoom} textAnchor="middle" fontSize={11/zoom}>{label}</text>
        {pins(end).map(({anchor,point:q})=>{const chosen=current[end].side===anchor.side&&current[end].offset===anchor.offset,side=sides.find(s=>s[0]===anchor.side)![1];return <g key={`${anchor.side}-${anchor.offset}`} className="connector-pin" data-selected={chosen}>
          <circle className="connector-snap-point" cx={q.x} cy={q.y} r={3.5/zoom} vectorEffect="non-scaling-stroke"/>
          <circle className="connector-pin-hit" cx={q.x} cy={q.y} r={Math.min(8/zoom,18)} data-side={anchor.side} data-offset={anchor.offset} role="button" tabIndex={saving?-1:0} aria-disabled={saving} aria-label={`${label} · ${side} ${Math.round(anchor.offset!*100)}%`} onPointerDown={e=>begin(end,e,anchor)} onPointerMove={move} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onKeyDown={e=>{if(!saving&&(e.key==='Enter'||e.key===' ')){e.preventDefault();void save({...current,[end]:anchor})}}}><title>{label} · {side} {Math.round(anchor.offset!*100)}{uiText("% · Click or drag")}</title></circle>
        </g>})}
        <circle className="connector-handle" data-end={end} aria-label={uiText("Drag {0}",[label])} role="button" tabIndex={0} aria-disabled={saving} cx={p.x} cy={p.y} r={7/zoom} style={{strokeWidth:2.5/zoom}} onPointerDown={e=>begin(end,e)} onPointerMove={move} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)}><title>{label}  {uiText("· Drag to any connection point")}</title></circle>
      </g>})}
    </svg>,world)}
    <aside className={`connector-editor ${expanded?'':'is-collapsed'}`} aria-label={uiText("Connection point settings")} onPointerDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
      <header><strong>{uiText("Edit connection")}</strong><button onClick={()=>void save({...current,route:null})} disabled={saving}>{uiText("Automatic routing")}</button><button aria-label={uiText("Expand connection settings")} onClick={()=>setExpanded(!expanded)}>{uiText("Settings")}</button><button aria-label={uiText("Close connection point settings")} onClick={()=>{onPreview(null);onClose()}}>×</button></header>
      <div className="connector-settings-body" hidden={!expanded}><div className="connector-names"><AppSelect aria-label={uiText("Choose connection")} value={JSON.stringify([selected.managerId,selected.employeeId])} onChange={e=>{const [managerId,employeeId]=JSON.parse(e.target.value);select({managerId,employeeId})}}>{choices.map(edge=><option key={JSON.stringify([edge.managerId,edge.employeeId])} value={JSON.stringify([edge.managerId,edge.employeeId])}>{name(edge.managerId)} → {name(edge.employeeId)}</option>)}</AppSelect></div>
      {(['source','target'] as const).map(end=><section key={end}><label>{end==='source'?uiText("Source"):uiText("Target endpoint")}<AppSelect aria-label={end==='source'?uiText("Source position"):uiText("Target position")} value={form[end].side} onChange={e=>patch(end,{side:e.target.value as ConnectorAnchor['side'],offset:form[end].offset??.5})}>{sides.map(([value,label])=><option key={value} value={value}>{uiText(label)}</option>)}</AppSelect></label>
        {form[end].side!=='auto'&&<label className="connector-offset">{uiText("Position along edge")}<input aria-label={end==='source'?uiText("Source offset"):uiText("Target offset")} type="range" min="0" max="100" step="1" value={Math.round((form[end].offset??.5)*100)} onChange={e=>patch(end,{...form[end],offset:Number(e.target.value)/100})}/><output>{Math.round((form[end].offset??.5)*100)}%</output></label>}
      </section>)}
      <p className={status==='constrained'?'connector-error':''}>{status==='constrained'?uiText("The line stays in front. Drag its segments to avoid crowded areas."):uiText("Change either endpoint; move horizontal segments vertically and vertical segments horizontally. Nearby segments snap together and merge bends.")}</p>
      {error&&<p className="connector-error" role="alert">{error}</p>}
      <footer><span className="connector-save-state" role="status">{saving?uiText("Saving…"):''}</span><button disabled={saving} onClick={()=>void save(current,true)}>{uiText("Restore automatic routing")}</button><button className="primary" disabled={saving} onClick={()=>void save(form)}>{uiText("Apply")}</button></footer></div>
    </aside>
  </>
}
