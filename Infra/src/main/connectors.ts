import {roundedOrthogonalPath} from '../shared/management-layout'
import {managementRelations} from '../shared/management'
import {planOffice} from '../shared/canvas'
import {officeConnections,connectionNodes} from '../shared/office-connections'
import {movePathSegment,simplifyPath} from '../shared/connector-path'
import {connectorKey,connectorSetting,connectorPoints,anchorForDock,type ConnectorAnchor} from '../shared/connector'
import {rolePolicy} from '../shared/roles'
import {authorize} from './authorization'
import {readStore,writeStore} from './store'
function pair(managerId:string,employeeId:string){
  const store=readStore(),source=store.sessions.find(c=>c.id===managerId&&!c.deleting),target=store.sessions.find(c=>c.id===employeeId&&!c.deleting)
  if(!source||!target||managerId===employeeId)throw Error('Choose two existing, different employees')
  const policy=rolePolicy(source.managementRole)
  if(!policy.controls.includes(target.managementRole??'employee')||policy.scope!=='global'&&source.group!==target.group)throw Error('Invalid management connection')
  return store
}
function anchor(value:unknown):ConnectorAnchor{
  const a=value as ConnectorAnchor
  if(!a||!['auto','top','right','bottom','left'].includes(a.side))throw Error('Anchor side must be auto, top, right, bottom or left')
  if(a.offset!==undefined&&(typeof a.offset!=='number'||!Number.isFinite(a.offset)||a.offset<0||a.offset>1))throw Error('Anchor offset must be between 0 and 1')
  return a.side==='auto'?{side:'auto'}:{side:a.side,offset:a.offset??.5}
}
function geometry(store:ReturnType<typeof readStore>,managerId:string,employeeId:string){
 const edges=managementRelations(store.sessions,store.access?.bindings),extra=edges.some(e=>e.managerId===managerId&&e.employeeId===employeeId)?[]:[{managerId,employeeId,command:'connector.get',requestId:'geometry',startedAt:0}]
 return officeConnections(planOffice(store),edges,extra,undefined,store.connectorAnchors).find(r=>r.managerId===managerId&&r.employeeId===employeeId)!
}
export function getConnector(manager:string,employee:string){
  authorize('connector.get',{manager,employee});const store=pair(manager,employee),view=geometry(store,manager,employee)
  const points=view.points.map(p=>({x:p.x-view.origin.x,y:p.y-view.origin.y}))
  return {...connectorSetting(store.connectorAnchors,manager,employee),availablePoints:connectorPoints,geometry:{...view,space:'source-team',points,path:roundedOrthogonalPath(points),worldPath:view.path}}
}
export function setConnector(manager:string,employee:string,source?:unknown,target?:unknown,reset=false,route?:unknown){
  authorize(reset?'connector.reset':'connector.set',{manager,employee});const store=pair(manager,employee),key=connectorKey(manager,employee),current=connectorSetting(store.connectorAnchors,manager,employee)
  store.connectorAnchors={...store.connectorAnchors}
  if(reset)delete store.connectorAnchors[key]
  else {if(source===undefined&&target===undefined&&route===undefined)throw Error('Provide source, target or route');store.connectorAnchors[key]={...current,...(source===undefined?{}:{source:anchor(source)}),...(target===undefined?{}:{target:anchor(target)})}}
  if(!reset&&route!==undefined){
    const next=store.connectorAnchors[key];if(route===null)delete next.route
    else {
      if(!Array.isArray(route)||route.length<2||route.length>256||route.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e7||Math.abs(p.y)>1e7))throw Error('Route needs 2–256 finite points in source-Team coordinates')
      if(route.slice(1).some((p,i)=>p.x!==route[i].x&&p.y!==route[i].y))throw Error('Route segments must be orthogonal')
      const view=geometry(store,manager,employee),nodes=connectionNodes(planOffice(store))
      if(next.source.side==='auto')next.source=anchorForDock(nodes.get(manager)!.box,view.points[0])
      if(next.target.side==='auto')next.target=anchorForDock(nodes.get(employee)!.box,view.points.at(-1)!)
      next.route=simplifyPath(route)
    }
  }
  writeStore(store,{reconcileOffice:false});return connectorSetting(store.connectorAnchors,manager,employee)
}

export function moveConnectorSegment(manager:string,employee:string,index:number,x:number,y:number){
 authorize('connector.segment',{manager,employee});if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Segment position must be finite')
 const store=pair(manager,employee),view=geometry(store,manager,employee),points=view.points.map(p=>({x:p.x-view.origin.x,y:p.y-view.origin.y}))
 return setConnector(manager,employee,undefined,undefined,false,movePathSegment(points,index,{x,y}))
}
