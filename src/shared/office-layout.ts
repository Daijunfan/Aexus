import type {Store,RoomLayout} from './types'
import {planOffice,type PlannedRoom,type RoomBounds} from './canvas'
import {reflowChangedManagement} from './management-layout'

export const TEAM_GAP=60
export function roomsOverlap(a:RoomBounds,b:RoomBounds,gap=TEAM_GAP){
  return a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y
}
/** Keep the edited room anchored. Move only colliding neighbors, deterministically. */
export function separateRooms(rooms:PlannedRoom[],priority:Iterable<string>=[]):PlannedRoom[]{
  const preferred=new Set(priority),placed:PlannedRoom[]=[],result=new Map<string,PlannedRoom>()
  const order=[...rooms.filter(r=>preferred.has(r.name)),...rooms.filter(r=>!preferred.has(r.name))]
  for(const room of order){
    let bounds={...room.bounds}
    if(placed.some(other=>roomsOverlap(bounds,other.bounds))){
      const candidates=placed.flatMap(({bounds:b})=>[
        {...bounds,x:b.x+b.width+TEAM_GAP},{...bounds,x:b.x-bounds.width-TEAM_GAP},
        {...bounds,y:b.y+b.height+TEAM_GAP},{...bounds,y:b.y-bounds.height-TEAM_GAP}
      ])
      const distance=(b:RoomBounds)=>(b.x-room.bounds.x)**2+(b.y-room.bounds.y)**2
      candidates.sort((a,b)=>distance(a)-distance(b)||a.y-b.y||a.x-b.x)
      const available=candidates.find(candidate=>placed.every(other=>!roomsOverlap(candidate,other.bounds)))
      if(!available)throw new Error('Unable to separate Team bounds')
      bounds=available
    }
    const next={...room,bounds};placed.push(next);result.set(room.name,next)
  }
  return rooms.map(room=>result.get(room.name)!)
}
const geometry=(room?:RoomLayout)=>room?{col:room.col,row:room.row,w:room.w,h:room.h,bounds:room.bounds}:null
const signature=(store:Store)=>JSON.stringify([
  store.groups,store.groups.map(name=>[name,geometry(store.rooms?.[name])]),
  store.sessions.map(card=>[card.id,card.group,!!card.deleting,card.position]),
  store.access?.relations.filter(r=>r.state==='active').map(r=>[r.id,r.managerId,r.employeeId])
])
const visual=(b:RoomBounds)=>JSON.stringify([b.x,b.y,b.width,b.height,b.shape,b.points])
/** Only geometry/roster commits pack rooms. Tokens and read receipts do not reflow. */
export function reconcileOfficeLayout(store:Store,previous?:Store,force=false){
  if(!force&&previous&&signature(store)===signature(previous))return
  const oldRooms=previous?planOffice(previous):[],oldByName=new Map(oldRooms.map(room=>[room.name,room]))
  const priority=new Set<string>()
  store.rooms??={}
  // Preserve previous visible positions before growth can shift an automatic row.
  for(const name of store.groups){
    const old=oldByName.get(name)
    if(old&&JSON.stringify(geometry(store.rooms[name]))===JSON.stringify(geometry(previous?.rooms?.[name])))
      store.rooms[name]={...(store.rooms[name]??{col:0,row:0,w:1,h:1}),bounds:{...old.bounds,pinned:true}}
  }
  for(const name of reflowChangedManagement(store,previous))priority.add(name)
  const planned=planOffice(store)
  for(const room of planned){const old=oldByName.get(room.name);if(!old||visual(old.bounds)!==visual(room.bounds))priority.add(room.name)}
  for(const room of separateRooms(planned,priority))
    store.rooms[room.name]={...(store.rooms[room.name]??{col:0,row:0,w:1,h:1}),bounds:{...room.bounds,pinned:true}}
}
