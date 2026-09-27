import {roomExtent,type PlannedRoom,type Point,type Viewport} from '../../../shared/canvas'

const WIDTH=210,HEIGHT=132,PADDING=12
export function CanvasOverview({rooms,view,size,onFocus,onFit}:{rooms:PlannedRoom[];view:Viewport;size:Point;onFocus:(room:PlannedRoom)=>void;onFit:()=>void}){
  if(!rooms.length)return null
  const bounds=rooms.map(roomExtent)
  const left=Math.min(...bounds.map(room=>room.x)),top=Math.min(...bounds.map(room=>room.y))
  const worldWidth=Math.max(1,Math.max(...bounds.map(room=>room.x+room.width))-left)
  const worldHeight=Math.max(1,Math.max(...bounds.map(room=>room.y+room.height))-top)
  const scale=Math.min((WIDTH-2*PADDING)/worldWidth,(HEIGHT-2*PADDING)/worldHeight)
  const offsetX=(WIDTH-worldWidth*scale)/2-left*scale,offsetY=(HEIGHT-worldHeight*scale)/2-top*scale
  const mapX=(value:number)=>offsetX+value*scale,mapY=(value:number)=>offsetY+value*scale
  const clip=(value:number,max:number)=>Math.max(0,Math.min(max,value))
  const camera={left:clip(mapX(-view.x/view.zoom),WIDTH),top:clip(mapY(-view.y/view.zoom),HEIGHT),right:clip(mapX((size.x-view.x)/view.zoom),WIDTH),bottom:clip(mapY((size.y-view.y)/view.zoom),HEIGHT)}
  const visible=camera.right>camera.left&&camera.bottom>camera.top
  return <aside className="canvas-overview" aria-label="团队索引" onPointerDown={event=>event.stopPropagation()} onWheelCapture={event=>event.stopPropagation()}>
    <header><strong>团队索引</strong><button type="button" onClick={onFit}>定位全部</button></header>
    <div className="canvas-overview-map" role="group" aria-label="点击团队定位" style={{width:WIDTH,height:HEIGHT}}>
      {bounds.map((room,index)=>{const width=Math.max(24,room.width*scale),height=Math.max(18,room.height*scale),x=clip(mapX(room.x+room.width/2)-width/2,WIDTH-width-2),y=clip(mapY(room.y+room.height/2)-height/2,HEIGHT-height-2)
        return <button key={rooms[index].name} type="button" className="canvas-overview-room" data-team={rooms[index].name} title={rooms[index].name} aria-label={`定位 ${rooms[index].name}`} style={{left:x,top:y,width,height}} onClick={()=>onFocus(rooms[index])}><span>{width>45&&height>20?rooms[index].name:rooms[index].name.slice(0,1)}</span></button>
      })}
      {visible&&<div className="canvas-overview-viewport" aria-hidden="true" style={{left:camera.left,top:camera.top,width:camera.right-camera.left,height:camera.bottom-camera.top}}/>}
      {!visible&&<span className="canvas-overview-outside">视野已离开团队区域</span>}
    </div>
  </aside>
}
