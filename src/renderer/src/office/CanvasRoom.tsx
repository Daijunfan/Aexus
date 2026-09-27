import type {CanvasSelection} from './OfficeCanvas'
import {ConnectorSelection} from './ConnectorEditor'
import type {ConnectorSettings} from '../../../shared/connector'
import type {CrossTeamRoute} from '../../../shared/cross-team-routing'
import {roomOutline} from '../../../shared/room-geometry'
import {api} from '../api'
import {type ManagementAccess,type ManagementInteraction} from '../../../shared/management'
import { useCallback,useRef,useContext,useId, type CSSProperties } from 'react'
import { roomDesign, type RoomDesign } from '../../../shared/office'
import { EMPLOYEE_SIZE, shapeContains, resizeEdge, type ResizeEdge, type PlannedRoom, type RoomBounds } from '../../../shared/canvas'
import type { ActivityPreview,StoredSession } from '../../../shared/types'
import type {RemoteHealth,RemoteTarget} from '../../../shared/remote'
import type {PluginDescriptor} from '../../../shared/plugins'
import {PluginIcon} from '../components/PluginIcon'
import {ActivityBubble} from './ActivityBubble'
import { Employee } from './Employee'
import { Bookshelf, Pendant, Plant, Poster, WindowWall } from './Furniture'
import {TeamOSIcon} from './TeamOSIcon'
export function CanvasRoom({selection,room,access,interactions,crossRoutes,connectorAnchors,index,design:custom,root,mode,plugin,pluginId,remote,health,busyIds,disconnectedIds,activities,draggingId,visible,onOpen,onEdit,onStart}:{selection?:CanvasSelection;room:PlannedRoom;connectorAnchors?:ConnectorSettings;crossRoutes:CrossTeamRoute[];access?:ManagementAccess;interactions:ManagementInteraction[];index:number;design?:Partial<RoomDesign>;root?:string;mode?:'work'|'build'|'cloud';plugin?:PluginDescriptor;pluginId?:string;remote?:RemoteTarget;health?:RemoteHealth&{checkedAt?:number;error?:string};activities:Record<string,ActivityPreview>;busyIds:Set<string>;disconnectedIds:Set<string>;draggingId?:string;visible:{x:number;y:number;width:number;height:number};onOpen:(card:StoredSession)=>void;onEdit:()=>void;onStart:(kind:'team'|'employee'|'resize',e:React.PointerEvent,id?:string,edge?:ResizeEdge)=>void}) {
  const startRef=useRef(onStart);startRef.current=onStart
  const startEmployee=useCallback((event:React.PointerEvent,id:string)=>startRef.current('employee',event,id),[])
  const {select}=useContext(ConnectorSelection)
  const id=useId().replace(/:/g,''),design=roomDesign(index,custom),b=room.bounds,path=roomOutline(b)
  const edgeAt=(e:React.PointerEvent<SVGPathElement>)=>{const rect=e.currentTarget.ownerSVGElement!.getBoundingClientRect();return resizeEdge((e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height)}
  const color=design.background,light=color?[1,3,5].reduce((sum,i,j)=>sum+parseInt(color.slice(i,i+2),16)*[.2126,.7152,.0722][j],0)>150:undefined
  const surface={ ...(color?{'--sleep-ink':light?'#526bad':'#c5d7ff'}:{}), '--room-floor-top':color||'color-mix(in srgb,var(--room-accent) 16%,var(--floor-top))','--room-floor-bottom':color?`color-mix(in srgb,${color} 88%,var(--bg))`:'color-mix(in srgb,var(--room-accent) 9%,var(--floor-bottom))','--room-ink':color?(light?'#263541':'#f0f4fa'):'var(--fg-dim)'}
  return <section onPointerDown={e=>{const r=e.currentTarget.getBoundingClientRect();if(shapeContains(b,{x:(e.clientX-r.left)*b.width/r.width,y:(e.clientY-r.top)*b.height/r.height}))onStart('team',e)}} data-edit-selected={selection?.mode==='team'&&selection.ids.has(room.name)?'true':undefined} className={`world-room theme-${design.theme}`} data-department={room.name} data-shape={b.shape} data-arrangement={b.arrangement} style={{...surface,left:b.x,top:b.y,width:b.width,height:b.height} as CSSProperties}>
    <svg className="room-outline" width={b.width} height={b.height} aria-hidden="true"><defs>
      <linearGradient id={`${id}-floor`} x2="0" y2="1"><stop stopColor="var(--room-floor-top)"/><stop offset="1" stopColor="var(--room-floor-bottom)"/></linearGradient>
      <pattern id={`${id}-texture`} width={design.pattern==='dots'?24:72} height={design.pattern==='boards'?44:design.pattern==='dots'?24:72} patternUnits="userSpaceOnUse">
        {design.pattern==='dots'?<circle cx="12" cy="12" r="1.5" fill="var(--room-ink)" opacity=".17"/>:design.pattern!=='plain'&&<path d={design.pattern==='boards'?'M0 0V44 M36 0V44 M0 43H72':'M0 0H72V72'} fill="none" stroke="var(--room-ink)" strokeOpacity=".1"/>}
      </pattern>
    </defs><path d={path} fill={`url(#${id}-floor)`} stroke="var(--room-accent)" strokeWidth="3" strokeOpacity=".8"/><path d={path} fill={`url(#${id}-texture)`}/></svg>
    {design.scenery&&<div className="room-scenery" style={{clipPath:`path('${path}')`}} aria-hidden="true"><WindowWall wall={design.wall}/><div className="room-ceiling-glow"/>{design.shelf&&<Bookshelf/>}{design.lamp&&<Pendant/>}{design.art&&<Poster theme={design.theme}/>} {design.plants&&<><Plant className="room-plant plant-left"/><Plant className="room-plant plant-right" variant="fern"/></>}</div>}
    <svg className="room-resize-outline" width={b.width} height={b.height}><path className="room-resize-edge" d={path} fill="none" stroke="transparent" strokeWidth="18" vectorEffect="non-scaling-stroke" aria-label={`拖动 ${room.name} 边缘调整大小`} onPointerMove={e=>{e.currentTarget.style.cursor=`${edgeAt(e)}-resize`}} onPointerDown={e=>onStart('resize',e,undefined,edgeAt(e))}/></svg>
    <div className="team-header" style={{clipPath:`path('${path}')`}}>
      <button className="team-title" data-team={room.name} onPointerDown={e=>onStart('team',e)} onClick={e=>{if(e.detail===0)onEdit()}} aria-label={`打开 ${room.name||'待分配员工'} Team`} title="点击名称打开工作空间 · 拖动团队内部移动"><strong>{room.name||'待分配员工'}</strong></button>
      <div className="team-badges"><span className={`team-kind team-kind-${mode??'build'}`}>{mode==='cloud'?'Cloud':mode==='work'?'Plugin':'Local'}</span><span className="team-cloud-meta">{mode==='cloud'&&<span className="team-health" data-connected={health?String(health.connected):'unknown'} title={health?`${health.connected?'上次检查已连接':'上次检查未连接'}${health.checkedAt?' · '+new Date(health.checkedAt).toLocaleString():''}${health.error?'\n'+health.error:''}\n点击左下方刷新主机状态`:'尚未检查；点击左下方刷新主机状态'}><i/>{health?health.connected?'已连接':'未连接':'未检查'}</span>}{mode==='work'?<span className="team-os team-plugin-icon" data-plugin={pluginId??''} title={plugin?.name??pluginId??'插件'} aria-label={plugin?.name??pluginId??'插件'}><PluginIcon id={pluginId??''}/></span>:<TeamOSIcon os={mode==='cloud'?remote?.os??'linux':api.platform??'macos'} distribution={health?.environment?.distribution||remote?.distribution}/>}</span></div>
      <span className={`team-root-label ${root?'':'unbound'}`} title={root??'请绑定外部文件夹'}>{root ? `⌂ ${root}` : '⌂ 先绑定 Team 外部文件夹'}</span>
    </div>
    <div className="free-employees">{room.employees.map(({card,position})=>{
      const x=b.x+position.x,y=b.y+position.y
      const hints=crossRoutes.filter(route=>route.status==='hidden'&&(route.managerId===card.id||route.employeeId===card.id)).map(route=>(route.status==='hidden'?'跨视图 · ':'线路受阻 · ')+(route.managerId===card.id?`${route.targetTeam} / ${route.targetName}`:`${route.sourceTeam} / ${route.sourceName}`))
      if(x+EMPLOYEE_SIZE.width<visible.x||y+EMPLOYEE_SIZE.height<visible.y||x>visible.x+visible.width||y>visible.y+visible.height)return null
      return <div className="employee-location" data-edit-selected={selection?.mode==='employee'&&selection.ids.has(card.id)?'true':undefined} key={card.id} style={{left:position.x,top:position.y,width:EMPLOYEE_SIZE.width,height:EMPLOYEE_SIZE.height}}><Employee cloudWorkspace={mode==='cloud'&&card.workEnvironment!=='local'} employee={card} working={busyIds.has(card.id)} disconnected={disconnectedIds.has(card.id)} dragging={draggingId===card.id} desk={design.desk} onOpen={selection?()=>selection.toggle(selection.mode==='team'?room.name:card.id):onOpen} onStart={startEmployee} />{selection?.mode==='employee'&&<button className="employee-select-toggle" aria-label={`选中员工 ${card.title}`} aria-pressed={selection.ids.has(card.id)} onPointerDown={e=>e.stopPropagation()} onClick={()=>selection.toggle(card.id)}><span aria-hidden="true">{selection.ids.has(card.id)?'✓':'＋'}</span></button>}{card.initialization?.status==='failed'&&<button className="employee-initialization-retry" onPointerDown={event=>event.stopPropagation()} onClick={()=>void api.call('view.open',{kind:'initialization',employee:card.id})}>查看初始化错误 / 重试</button>}{activities[card.id]&&<ActivityBubble activity={activities[card.id]}/>}{hints.length>0&&<button onPointerDown={e=>e.stopPropagation()} onClick={()=>{const edge=crossRoutes.find(route=>route.status==='hidden'&&(route.managerId===card.id||route.employeeId===card.id));if(edge)select(edge)}} className="cross-team-hint" title={hints.join("\n")} aria-label={hints.join("；")}>{hints.length===1?hints[0]:`${hints[0]} 等 ${hints.length} 个连接`}</button>}</div>
    })}</div>
    {!room.employees.length&&<div className="empty-room-note"><span>YOUR NEXT GREAT TEAM</span><p>给好想法，留足空间。</p><small>从一位伙伴开始，随时拖动边缘扩展空间。</small></div>}
    {selection?.mode==='team'&&<>
      <button className="team-select-toggle" style={{clipPath:`path('${path}')`}} aria-label={`选中团队 ${room.name}`} aria-pressed={selection.ids.has(room.name)} onPointerDown={e=>e.stopPropagation()} onClick={()=>selection.toggle(room.name)}/>
      {selection.ids.has(room.name)&&<svg className="team-selection-outline" width={b.width} height={b.height} aria-hidden="true"><path d={path} fill="none" stroke="var(--accent)" strokeWidth="4" vectorEffect="non-scaling-stroke"/></svg>}
    </>}
    <div className="room-dimension" aria-hidden="true">{Math.round(b.width)} × {Math.round(b.height)} <span>·</span> {room.employees.length} 伙伴</div>

  </section>
}
