import type {Point} from './canvas'
export type AnchorSide='auto'|'top'|'right'|'bottom'|'left'
export type ConnectorAnchor={side:AnchorSide;offset?:number}
export type ConnectorSetting={managerId:string;employeeId:string;source:ConnectorAnchor;target:ConnectorAnchor;route?:Point[]|null}
export type ConnectorSettings=Record<string,ConnectorSetting>
export const connectorPoints:ConnectorAnchor[]=(['top','right','bottom','left'] as const).flatMap(side=>(side==='top'||side==='bottom'?[0,.1,.3,.5,.7,.9,1]:[.1,.3,.5,.7,.9]).map(offset=>({side,offset})))
export const connectorKey=(managerId:string,employeeId:string)=>JSON.stringify([managerId,employeeId])
export const connectorSetting=(settings:ConnectorSettings|undefined,managerId:string,employeeId:string):ConnectorSetting=>settings?.[connectorKey(managerId,employeeId)]??{managerId,employeeId,source:{side:'auto'},target:{side:'auto'}}
/** Moving a Team invalidates cross-Team rails, but preserves the chosen employee docks. */
export function rerouteTeamConnections(settings:ConnectorSettings|undefined,team:string,employees:Array<{id:string;group:string}>){
  if(!settings)return settings
  const groups=new Map(employees.map(card=>[card.id,card.group]));let next=settings
  for(const [key,setting] of Object.entries(settings)){
    const source=groups.get(setting.managerId),target=groups.get(setting.employeeId)
    if(setting.route?.length&&source!==target&&(source===team||target===team)){
      if(next===settings)next={...settings}
      const {route,...anchors}=setting;next[key]=anchors
    }
  }
  return next
}
/** Twenty edge points plus four unique corners, shared by CLI and mouse snapping. */
export function nearestConnectorPoint<T extends {point:Point}>(points:T[],position:Point):T{
  return points.reduce((best,next)=>Math.hypot(next.point.x-position.x,next.point.y-position.y)<Math.hypot(best.point.x-position.x,best.point.y-position.y)?next:best)
}
/** Convert an actual dock into a fixed anchor before a user edits its segment geometry. */
export function anchorForDock(box:Point&{width:number;height:number},p:Point):ConnectorAnchor{
 const side=([{side:'top',distance:Math.abs(p.y-box.y)},{side:'bottom',distance:Math.abs(p.y-box.y-box.height)},{side:'left',distance:Math.abs(p.x-box.x)},{side:'right',distance:Math.abs(p.x-box.x-box.width)}] as {side:Exclude<AnchorSide,'auto'>;distance:number}[]).sort((a,b)=>a.distance-b.distance)[0].side
 return {side,offset:Math.max(0,Math.min(1,side==='top'||side==='bottom'?(p.x-box.x)/box.width:(p.y-box.y)/box.height))}
}
