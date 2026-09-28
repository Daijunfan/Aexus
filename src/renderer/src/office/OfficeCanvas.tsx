import {api} from '../api'
import {cachedConnectionPlan} from './routing-cache'
import {CanvasMotion} from './motion'
import {ConnectionLayer} from './ConnectionLayer'
import {officeConnectionPlan,connectionGeometryKey} from '../../../shared/office-connections'
import {ConnectorEditor,ConnectorSelection,type ConnectionSelection} from './ConnectorEditor'
import {connectorKey,rerouteTeamConnections,type ConnectorSetting} from '../../../shared/connector'
import {crossTeamRoutes} from '../../../shared/cross-team-routing'
import type {ManagementInteraction} from '../../../shared/management'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { teamSettings,type ActivityPreview,type Store,type StoredSession } from '../../../shared/types'
import type {PluginDescriptor} from '../../../shared/plugins'
import type {RemoteHealth} from '../../../shared/remote'
import { DEFAULT_VIEW, EMPLOYEE_SIZE, fitViewport, constrainEmployee, planOffice, planRoom, snapEmployee, roomExtent, resizeRoom, resizeOccupiedRoom, type ResizeEdge, type SnapGuide, type PlannedRoom, type Point, type RoomBounds, type Viewport } from '../../../shared/canvas'
import {DEFAULT_PREFERENCES} from '../../../shared/preferences'
import { CanvasRoom } from './CanvasRoom'
import {CanvasOverview} from './CanvasOverview'

type Drag = { kind:'team'|'employee'|'resize'|'pan'; name:string; id?:string; edge?:ResizeEdge; resized?:RoomBounds; start:Point; origin:Point; room?:PlannedRoom; moved:boolean; x:number; y:number; rooms:PlannedRoom[]; sequence:number; guide?:SnapGuide;openOnClick?:boolean }
export type CanvasSelection={mode:'employee'|'team';ids:Set<string>;toggle:(id:string)=>void}
type Props={obscured?:boolean;selection?:CanvasSelection;interactions:ManagementInteraction[];activities:Record<string,ActivityPreview>;cloudStatus:Record<string,RemoteHealth>;plugins:PluginDescriptor[];store:Store;busyIds:Set<string>;disconnectedIds:Set<string>;act:(cmd:string,args?:Record<string,unknown>)=>Promise<any>;onOpen:(card:StoredSession)=>void;onEdit:(name:string)=>void;onView:(view:Viewport,size:Point)=>void}
export const OfficeCanvas=memo(function OfficeCanvas({obscured=false,selection,store,busyIds,disconnectedIds,activities,interactions,cloudStatus,plugins,act,onOpen,onEdit,onView}:Props) {
  const [windowVisible,setWindowVisible]=useState(true)
  const animated=windowVisible&&!obscured
  useEffect(()=>api.onEvent(event=>{if(event.channel==='desktop:visibility'&&typeof event.payload.visible==='boolean')setWindowVisible(event.payload.visible)}),[])
  const [connection,setConnection]=useState<ConnectionSelection|null>(null),[anchorDraft,setAnchorDraft]=useState<ConnectorSetting|null>(null),worldRef=useRef<HTMLDivElement>(null)
  const selectConnection=useCallback((value:ConnectionSelection)=>{if(selection)return;setAnchorDraft(null);setConnection(value)},[!!selection])
  const closeConnection=useCallback(()=>{setAnchorDraft(null);setConnection(null)},[])
  useEffect(()=>{if(selection)closeConnection()},[selection?.mode,closeConnection])
  const preferences={...DEFAULT_PREFERENCES,...store.preferences}
  const selectedView=store.teamViews?.find(item=>item.id===store.activeTeamViewId)
  const savedViewport=selectedView?selectedView.viewport:store.viewport
  const viewport=useRef<HTMLDivElement>(null)
  const [size,setSize]=useState({x:1200,y:800})
  const [view,setView]=useState(savedViewport??DEFAULT_VIEW)
  const viewRef=useRef(view), dragRef=useRef<Drag|null>(null), space=useRef(false)
  const [draft,setDraft]=useState<Drag|null>(null)
  const [panning,setPanning]=useState(false)
  const [settled,setSettled]=useState(0)
  const positioned=useRef(false),sequence=useRef(0),viewSequence=useRef(0),viewPending=useRef(false)
  const frame=useRef(0),cameraFrame=useRef(0)
  useEffect(()=>()=>{cancelAnimationFrame(frame.current);cancelAnimationFrame(cameraFrame.current)},[])
  const pendingCamera=useRef<(Viewport&{viewId:string})|undefined>(undefined)
  const saveTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
  const updateView=useCallback((next:Viewport,save=true)=>{
    viewRef.current=next;cancelAnimationFrame(cameraFrame.current);cameraFrame.current=requestAnimationFrame(()=>setView(viewRef.current))
    if(save) {const request={...next,viewId:store.activeTeamViewId??'all'};pendingCamera.current=request;const token=++viewSequence.current;viewPending.current=true;clearTimeout(saveTimer.current);saveTimer.current=setTimeout(()=>{pendingCamera.current=undefined;void act('canvas.set',request).finally(()=>{if(token===viewSequence.current){viewPending.current=false;setSettled(v=>v+1)}})},250)}
  },[act,store.activeTeamViewId])
  useEffect(()=>{if(savedViewport&&!dragRef.current&&!viewPending.current)updateView(savedViewport,false)},[savedViewport?.x,savedViewport?.y,savedViewport?.zoom,updateView,settled])
  useEffect(()=>{const el=viewport.current!;const observer=new ResizeObserver(()=>setSize({x:el.clientWidth,y:el.clientHeight}));observer.observe(el);return()=>{observer.disconnect();clearTimeout(saveTimer.current);if(pendingCamera.current){void act('canvas.set',pendingCamera.current);pendingCamera.current=undefined}}},[])
  useEffect(()=>onView(view,size),[view,size,onView])
  const allRooms=useMemo(()=>planOffice(store),[store.groups,store.sessions,store.rooms])
  const baseRooms=useMemo(()=>selectedView?allRooms.filter(room=>selectedView.teams.includes(room.name)):allRooms,[allRooms,selectedView?.teams])
  useEffect(()=>{
    if(positioned.current)return
    if(savedViewport){positioned.current=true;return}
    if(selectedView&&baseRooms.length){positioned.current=true;const el=viewport.current;updateView(fitViewport(baseRooms,el?.clientWidth||size.x,el?.clientHeight||size.y),false);return}
    const occupied=baseRooms.find(room=>room.employees.length)
    if(occupied){positioned.current=true;updateView({x:70-occupied.bounds.x,y:110-occupied.bounds.y,zoom:1},false)}
  },[baseRooms,savedViewport,selectedView,size,updateView])
  const rooms=useMemo(()=>{
    if(!draft || draft.kind==='pan')return baseRooms
    const preview=draft.rooms.map(room=>{
      if(room.name!==draft.name)return room
      if(draft.kind==='team')return {...room,bounds:{...room.bounds,x:draft.x,y:draft.y,pinned:true}}
      if(draft.kind==='resize')return resizeOccupiedRoom(room,draft.resized??room.bounds)
      const cards=room.employees.map(({card,position})=>({...card,position:draft.kind==='employee'&&card.id===draft.id?{x:draft.x,y:draft.y}:position}))
      const bounds={...room.bounds,arrangement:'free' as const}
      return planRoom(room.name,cards,bounds)
    })
    return preview
  },[baseRooms,draft])
  const routingRooms=useMemo(()=>allRooms.map(room=>rooms.find(preview=>preview.name===room.name)??room),[allRooms,rooms])
  const connectorAnchors=useMemo(()=>{
    let settings=anchorDraft?{...store.connectorAnchors,[connectorKey(anchorDraft.managerId,anchorDraft.employeeId)]:anchorDraft}:store.connectorAnchors
    for(const room of routingRooms){const before=allRooms.find(item=>item.name===room.name)!
      if(room.bounds.x!==before.bounds.x||room.bounds.y!==before.bounds.y)settings=rerouteTeamConnections(settings,room.name,store.sessions)
    }
    return settings
  },[store.connectorAnchors,store.sessions,anchorDraft,routingRooms,allRooms])
  const visibleTeams=new Set(rooms.map(room=>room.name))
  const routingKey=connectionGeometryKey(routingRooms,store.access?.relations??[],interactions,visibleTeams,connectorAnchors)
  // Geometry and edge membership trigger A*. Activity only recolors existing paths.
  const routing=useMemo(()=>cachedConnectionPlan(routingKey,()=>officeConnectionPlan(routingRooms,store.access?.relations??[],interactions,visibleTeams,connectorAnchors)),[routingKey])
  const currentInteraction=(r:{managerId:string;employeeId:string})=>interactions.find(i=>i.managerId===r.managerId&&i.employeeId===r.employeeId)
  const crossRoutes=useMemo(()=>routing.crossTeamConnections.map(r=>({...r,active:!!currentInteraction(r),command:currentInteraction(r)?.command})),[routing,interactions])
  const displayConnections=useMemo(()=>routing.connections.map(r=>({...r,active:!!currentInteraction(r)})),[routing,interactions])
  const connectorContext=useMemo(()=>({selected:connection,select:selectConnection}),[connection,selectConnection])
  const saveConnection=useCallback((value:ConnectorSetting)=>act('connector.set',{manager:value.managerId,employee:value.employeeId,source:value.source,target:value.target,route:value.route}),[act])
  const zoomAt=useCallback((factor:number,x:number,y:number)=>{
    const old=viewRef.current,zoom=Math.min(3,Math.max(.08,old.zoom*factor))
    updateView({x:x-(x-old.x)*zoom/old.zoom,y:y-(y-old.y)*zoom/old.zoom,zoom})
  },[updateView])
  useEffect(()=>{
    const el=viewport.current!
    const wheel=(event:WheelEvent)=>{if((event.target as Element).closest('.connector-editor'))return;event.preventDefault();if(dragRef.current)return;const unit=event.deltaMode===1?16:event.deltaMode===2?el.clientHeight:1;if(event.ctrlKey||event.metaKey){const r=el.getBoundingClientRect();zoomAt(Math.exp(-event.deltaY*unit*.005*preferences.zoomSensitivity),event.clientX-r.left,event.clientY-r.top)}else updateView({...viewRef.current,x:viewRef.current.x-event.deltaX*unit*preferences.panSensitivity,y:viewRef.current.y-event.deltaY*unit*preferences.panSensitivity})}
    const key=(event:KeyboardEvent)=>{
      if(document.querySelector('[role="dialog"],[role="alertdialog"],.plugin-page') || (event.target as HTMLElement).matches('input,select,textarea'))return
      if(event.code==='Space'){event.preventDefault();space.current=true;setPanning(true)}
      if(event.key==='0'){event.preventDefault();updateView(fitViewport(baseRooms,el.clientWidth,el.clientHeight))}
      if(event.key==='+'||event.key==='='){event.preventDefault();zoomAt(1.2,el.clientWidth/2,el.clientHeight/2)}
      if(event.key==='-'){event.preventDefault();zoomAt(1/1.2,el.clientWidth/2,el.clientHeight/2)}
    }
    const up=(e:KeyboardEvent)=>{if(e.code==='Space'){space.current=false;setPanning(false)}}
    el.addEventListener('wheel',wheel,{passive:false});window.addEventListener('keydown',key);window.addEventListener('keyup',up)
    return()=>{el.removeEventListener('wheel',wheel);window.removeEventListener('keydown',key);window.removeEventListener('keyup',up)}
  },[baseRooms,updateView,zoomAt,preferences.panSensitivity,preferences.zoomSensitivity])
  const begin=useCallback((kind:Drag['kind'],room:PlannedRoom|undefined,e:React.PointerEvent,id?:string,edge:ResizeEdge='se')=>{
    if(e.button!==0&&e.button!==1)return
    closeConnection()
    e.preventDefault();e.stopPropagation();viewport.current!.setPointerCapture(e.pointerId)
    if(selection||space.current||e.button===1)kind='pan'
    const origin=kind==='pan'?viewRef.current:kind==='employee'?room!.employees.find(p=>p.card.id===id)!.position:kind==='resize'?{x:room!.bounds.width,y:room!.bounds.height}:room!.bounds
    cancelAnimationFrame(frame.current)
    const drag:Drag={rooms,sequence:++sequence.current,openOnClick:!!(e.target as Element).closest('.team-title'),kind,name:room?.name??'',id,edge,room,start:{x:e.clientX,y:e.clientY},origin:{x:origin.x,y:origin.y},moved:false,x:origin.x,y:origin.y}
    dragRef.current=drag;setDraft(drag);if(kind==='pan')setPanning(true)
  },[rooms,closeConnection,!!selection])
  const move=(e:React.PointerEvent)=>{
    const drag=dragRef.current;if(!drag)return
    const dx=e.clientX-drag.start.x,dy=e.clientY-drag.start.y
    if(!drag.moved && Math.hypot(dx,dy)<5)return
    const scale=drag.kind==='pan'?1:viewRef.current.zoom
    const next={...drag,moved:true,x:drag.origin.x+dx/scale,y:drag.origin.y+dy/scale}
    if(next.kind==='resize'){
      const candidate=resizeRoom(next.room!.bounds,next.edge!,{x:dx/scale,y:dy/scale})
      next.resized=resizeOccupiedRoom(next.room!,candidate).bounds
    }
    if(next.kind==='employee'){
      const point={x:next.x,y:next.y}
      const snapped=preferences.snapEmployees&&!e.altKey?snapEmployee(next.room!,next.id!,point,scale,drag.guide):{position:point,guide:{}}
      const bounded=constrainEmployee(next.room!.bounds,snapped.position,{x:drag.x,y:drag.y})
      next.x=bounded.x;next.y=bounded.y;next.guide=bounded.x===snapped.position.x&&bounded.y===snapped.position.y?snapped.guide:{}
    }
    dragRef.current=next
    if(next.kind==='pan')updateView({...viewRef.current,x:next.x,y:next.y})
    else {cancelAnimationFrame(frame.current);frame.current=requestAnimationFrame(()=>setDraft(next))}
  }
  const finish=async(e:React.PointerEvent)=>{
    const drag=dragRef.current;if(!drag)return
    cancelAnimationFrame(frame.current)
    if(viewport.current?.hasPointerCapture(e.pointerId))viewport.current.releasePointerCapture(e.pointerId)
    dragRef.current=null;setPanning(space.current)
    setDraft(drag)
    if(e.type==='pointercancel'){setDraft(null);return}
    if(!drag.moved){setDraft(null);if(drag.kind==='employee')onOpen(drag.room!.employees.find(p=>p.card.id===drag.id)!.card);else if(drag.kind==='team'&&drag.openOnClick)onEdit(drag.name);return}
    try {
      if(drag.kind==='team')await act('room.bounds',{name:drag.name,bounds:{x:drag.x,y:drag.y}})
      else if(drag.kind==='resize'){const {x,y,width,height}=drag.resized!;await act('room.bounds',{name:drag.name,bounds:{x,y,width,height}})}
      else if(drag.kind==='employee')await act('card.place',{id:drag.id,x:drag.x,y:drag.y,snap:false})
    } finally {if(sequence.current===drag.sequence)setDraft(null)}
  }
  // A stable overscan window avoids rebuilding all room children for each pixel.
  const cellX=Math.floor(-view.x/view.zoom/200),cellY=Math.floor(-view.y/view.zoom/200),columns=Math.ceil(size.x/view.zoom/200),rows=Math.ceil(size.y/view.zoom/200)
  const visible=useMemo(()=>({x:cellX*200-400,y:cellY*200-400,width:columns*200+1000,height:rows*200+1000}),[cellX,cellY,columns,rows])
  const scene=useMemo(()=><>
      <ConnectionLayer bounds={visible} connections={displayConnections} rooms={rooms} settings={connectorAnchors} zoom={view.zoom} onPreview={setAnchorDraft} onSave={saveConnection}/>
      {rooms.map((room,i)=>{
        const b=roomExtent(room)
        if(draft?.name!==room.name&&(b.x+b.width<visible.x||b.y+b.height<visible.y||b.x>visible.x+visible.width||b.y>visible.y+visible.height))return null
        return <CanvasRoom selection={selection} connectorAnchors={connectorAnchors} crossRoutes={crossRoutes} interactions={interactions} key={room.name} room={room} access={store.access} index={i} design={store.rooms?.[room.name]?.design} root={store.teamRoots?.[room.name]} mode={teamSettings(store,room.name).mode} plugin={plugins.find(item=>item.id===teamSettings(store,room.name).pluginId)} pluginId={teamSettings(store,room.name).pluginId} remote={teamSettings(store,room.name).remote} health={cloudStatus[room.name]} activities={activities} busyIds={busyIds} disconnectedIds={disconnectedIds} draggingId={draft?.moved?draft.id:undefined} visible={visible}
          onOpen={onOpen} onEdit={()=>onEdit(room.name)} onStart={(kind,e,id,edge)=>begin(kind,room,e,id,edge)} />
      })}
    </>,[visible,displayConnections,rooms,connectorAnchors,view.zoom,saveConnection,selection,crossRoutes,interactions,store.access,store.rooms,store.teamRoots,store.teamSettings,plugins,cloudStatus,activities,busyIds,disconnectedIds,draft?.name,draft?.id,draft?.moved,onOpen,onEdit,begin])
  return <CanvasMotion.Provider value={animated}><ConnectorSelection.Provider value={connectorContext}><div data-animated={animated} ref={viewport} className={`infinite-canvas ${panning?'is-panning':''} ${selection?'is-editing-canvas':''}`} data-zoom={view.zoom.toFixed(3)} onPointerDown={e=>begin('pan',undefined,e)} onPointerMove={move} onPointerUp={e=>void finish(e)} onPointerCancel={e=>void finish(e)} onDoubleClick={e=>{if(e.target===e.currentTarget)updateView(fitViewport(baseRooms,size.x,size.y))}}>
    <div className="canvas-grid" style={{backgroundSize:`${32*view.zoom}px ${32*view.zoom}px`,backgroundPosition:`${view.x}px ${view.y}px`}} />
    <div ref={worldRef} className="canvas-world" style={{transform:`translate(${view.x}px,${view.y}px) scale(${view.zoom})`}}>
      {scene}
      {draft?.moved&&draft.kind==='employee'&&(draft.guide?.x!==undefined||draft.guide?.y!==undefined)&&<div className="employee-snap-guide" aria-hidden="true" style={{left:draft.room!.bounds.x+draft.x,top:draft.room!.bounds.y+draft.y,width:EMPLOYEE_SIZE.width,height:EMPLOYEE_SIZE.height}}/>}
    </div>
    {connection&&<ConnectorEditor connections={displayConnections} zoom={view.zoom} interactions={interactions} selected={connection} rooms={rooms} settings={connectorAnchors} relations={store.access?.relations??[]} crossRoutes={crossRoutes} world={worldRef.current} onClose={closeConnection} onPreview={setAnchorDraft} onSave={(value,reset)=>act(reset?'connector.reset':'connector.set',{manager:value.managerId,employee:value.employeeId,...(reset?{}:{source:value.source,target:value.target,route:value.route})})}/>}
    {preferences.showTeamOverview&&<CanvasOverview rooms={rooms} view={view} size={size} onFocus={room=>updateView(fitViewport([room],size.x,size.y))} onFit={()=>updateView(fitViewport(rooms,size.x,size.y))}/>}
    {!rooms.length&&<div className="canvas-empty"><span>ROOM FOR EVERY POSSIBILITY</span>{selectedView?<><h1>这个视图还没有团队</h1><p>点击视图标签旁的编辑图标，<br />从 All Team 中选择已有团队加入。</p></>:<><h1>从一个 Team 开始，<br />把想法放进更大的世界。</h1><p>添加 Team，绑定项目文件夹。<br />然后邀请你的第一位伙伴。</p></>}</div>}
    <div className="canvas-hud"><button className="snap-toggle" aria-pressed={preferences.snapEmployees} title="磁吸工位；按住 Option / Alt 可临时自由拖动" onPointerDown={e=>e.stopPropagation()} onClick={()=>void act('settings.set',{snapEmployees:!preferences.snapEmployees})}>磁吸 {preferences.snapEmployees?'开':'关'}</button><span>拖动空白平移 · 双指滑动 · ⌘ / Ctrl + 滚轮缩放 · 0 总览</span><span>{Math.round(view.zoom*100)}% <b>·</b> {rooms.length} TEAMS <b>·</b> {rooms.reduce((sum,room)=>sum+room.employees.length,0)} TEAMMATES</span></div>
  </div></ConnectorSelection.Provider></CanvasMotion.Provider>
})
