import {useId} from 'react'
import type {PlannedRoom} from '../../../shared/canvas'
import type {ManagementAccess} from '../../../shared/management'
export function ManagementEdges({room,access}:{room:PlannedRoom;access?:ManagementAccess}){
  const marker=useId().replaceAll(':',''),positions=new Map(room.employees.map(({card,position})=>[card.id,position]))
  return <svg className="management-edges" width={room.bounds.width} height={room.bounds.height} aria-label="有效管理关系"><defs><marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="currentColor"/></marker></defs>{access?.relations.filter(edge=>edge.state==='active'&&positions.has(edge.managerId)&&positions.has(edge.employeeId)).map(edge=>{
    const a=positions.get(edge.managerId)!,b=positions.get(edge.employeeId)!,right=b.x>=a.x,horizontal=Math.abs(b.x-a.x)>=Math.abs(b.y-a.y),r=6
    let route:string
    if(horizontal){const x1=a.x+(right?193:-3),x2=b.x+(right?-8:198),y1=a.y+215,y2=b.y+215,mid=(x1+x2)/2,dx=right?1:-1,dy=y2>=y1?1:-1;route=Math.abs(y2-y1)<16?`M${x1} ${y2} H${x2}`:`M${x1} ${y1} H${mid-dx*r} Q${mid} ${y1} ${mid} ${y1+dy*r} V${y2-dy*r} Q${mid} ${y2} ${mid+dx*r} ${y2} H${x2}`}
    else{const down=b.y>=a.y,x1=a.x+95,x2=b.x+95,y1=a.y+(down?253:-3),y2=b.y+(down?-8:258),mid=(y1+y2)/2,dx=right?1:-1,dy=down?1:-1;route=Math.abs(x2-x1)<16?`M${x2} ${y1} V${y2}`:`M${x1} ${y1} V${mid-dy*r} Q${x1} ${mid} ${x1+dx*r} ${mid} H${x2-dx*r} Q${x2} ${mid} ${x2} ${mid+dy*r} V${y2}`}
    return <path key={edge.id} data-relation={edge.id} d={route} fill="none" stroke="currentColor" strokeWidth="2" markerEnd={`url(#${marker})`}/>
  })}</svg>
}
