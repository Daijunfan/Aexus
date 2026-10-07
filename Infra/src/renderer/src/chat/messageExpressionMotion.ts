import {useEffect,useLayoutEffect,useRef,type RefObject} from 'react'
import {motionAllowed,playMessageMotion} from './surfaceMotion'

export type ReactionAcknowledgement={emoji:string;from:DOMRect}

/** Explicit, accepted gestures only. History and ordinary renders never request motion. */
export function useMessageExpression(root:RefObject<HTMLDivElement|null>,reaction:string|undefined,acknowledgement:ReactionAcknowledgement|null){
  const running=useRef(new Set<Animation>()),played=useRef<ReactionAcknowledgement|null>(null)
  const cancel=()=>{for(const animation of running.current)animation.cancel();running.current.clear()}
  const play=(element:Element,frames:Keyframe[],duration:number,done?:()=>void)=>{
    let animation:Animation|undefined
    animation=playMessageMotion(element,frames,duration,()=>{if(animation)running.current.delete(animation);done?.()})
    if(animation)running.current.add(animation)
  }
  useEffect(()=>cancel,[])
  useLayoutEffect(()=>{
    if(!acknowledgement||played.current===acknowledgement||reaction!==acknowledgement.emoji)return
    played.current=acknowledgement
    const owner=root.current?.closest('[data-chat-item]'),target=owner?.querySelector<HTMLElement>('.message-reaction')
    if(!target||!motionAllowed())return
    const box=target.getBoundingClientRect()
    if(box.bottom<=0||box.top>=innerHeight||box.right<=0||box.left>=innerWidth)return
    cancel()
    const glyph=document.createElement('span');glyph.className='message-expression-flight';glyph.textContent=acknowledgement.emoji;glyph.setAttribute('aria-hidden','true');glyph.inert=true;document.body.append(glyph)
    // Body overlays share page zoom; convert viewport points to the overlay's CSS units.
    const scale=glyph.getBoundingClientRect().width/glyph.offsetWidth,from=acknowledgement.from
    const x=(from.left+from.width/2)/scale-18,y=(from.top+from.height/2)/scale-18,toX=(box.left+box.width/2)/scale-18,toY=(box.top+box.height/2)/scale-18
    const transform=(left:number,top:number,rotation:number,size:number)=>`translate(${left}px,${top}px) rotate(${rotation}deg) scale(${size})`
    play(glyph,[{transform:transform(x,y,-10,.85),opacity:.8},{transform:transform((x+toX)/2,Math.min(y,toY)-44,8,1.2),opacity:1,offset:.42},{transform:transform(toX,toY,0,.65),opacity:1,offset:.85},{transform:transform(toX,toY,0,.5),opacity:0}],650,()=>glyph.remove())
    play(target,[{transform:'none'},{transform:'none',offset:.62},{transform:'scale(1.17)',offset:.77},{transform:'scale(.97)',offset:.9},{transform:'none'}],780)
    return cancel
  },[acknowledgement,reaction])
  return ()=>{
    const message=root.current?.closest('[data-chat-item][data-emoji-count]'),emoji=message?.querySelector<HTMLElement>('.markdown')
    if(!emoji||!motionAllowed())return
    cancel()
    play(emoji,[{transform:'none',transformOrigin:'50% 85%'},{transform:'translateY(2px) rotate(-7deg) scale(.94)',offset:.14},{transform:'translateY(-9px) rotate(5deg) scale(1.12)',offset:.4},{transform:'translateY(1px) rotate(-2deg) scale(.99)',offset:.72},{transform:'none'}],680)
  }
}
