import {useId} from 'react'
import type {PlannedRoom} from '../../../shared/canvas'
import type {ManagementAccess} from '../../../shared/management'
import {managementRoutes} from '../../../shared/management-layout'

export function ManagementEdges({room,access}:{room:PlannedRoom;access?:ManagementAccess}){
  const marker=useId().replaceAll(':',''),routes=managementRoutes(room,access?.relations??[])
  return <svg className="management-edges" width={room.bounds.width} height={room.bounds.height} aria-label="有效管理关系">
    <defs><marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L8 4L0 8Z" fill="currentColor"/></marker></defs>
    {routes.map(route=><path key={route.id} data-relation={route.id} data-routing="orthogonal" d={route.path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" markerEnd={`url(#${marker})`}/>)}
  </svg>
}
