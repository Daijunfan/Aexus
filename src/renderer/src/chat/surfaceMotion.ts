import {useLayoutEffect,useRef} from 'react'

export type SurfaceMotion='menu'|'panel'|'dialog'|'strip'
export const messageEase='cubic-bezier(.22,1,.36,1)'
export const motionAllowed=()=>!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches

/** Finite animations always release listeners and finish when motion is disabled. */
export function playMessageMotion(element:Element,frames:Keyframe[],duration:number,done?:()=>void){
  if(!motionAllowed()){done?.();return}
  const animation=element.animate(frames,{duration,easing:messageEase})
  const media=matchMedia('(prefers-reduced-motion: reduce)')
  let cleaned=false
  const finish=()=>{if(document.hidden||media.matches)animation.finish()}
  const clean=()=>{if(cleaned)return;cleaned=true;animation.removeEventListener('finish',clean);animation.removeEventListener('cancel',clean);media.removeEventListener('change',finish);document.removeEventListener('visibilitychange',finish);done?.()}
  animation.addEventListener('finish',clean,{once:true});animation.addEventListener('cancel',clean,{once:true})
  media.addEventListener('change',finish);document.addEventListener('visibilitychange',finish)
  return animation
}

/** An inert, short-lived visual snapshot lets React close immediately and restore focus. */
function exitSurface(node:HTMLElement,kind:SurfaceMotion){
  if(!node.isConnected||!motionAllowed())return
  const rect=node.getBoundingClientRect(),style=getComputedStyle(node),copy=node.cloneNode(true) as HTMLElement
  if(kind==='strip'){
    const height=rect.height+parseFloat(style.marginTop)+parseFloat(style.marginBottom),spacer=document.createElement('div');spacer.dataset.messageSpacer='strip';spacer.setAttribute('aria-hidden','true');spacer.style.cssText=`height:${height}px;flex:none;pointer-events:none;overflow:hidden`
    node.before(spacer);playMessageMotion(spacer,[{height:height+'px'},{height:'0px'}],200,()=>spacer.remove())
  }
  copy.inert=true;copy.setAttribute('aria-hidden','true');copy.dataset.messageExit=kind
  // Exit snapshots are visual only; never reopen a released media grant or blob URL.
  for(const media of copy.querySelectorAll<HTMLMediaElement>('audio,video')){media.removeAttribute('src');media.removeAttribute('autoplay');media.preload='none';for(const source of media.querySelectorAll('source'))source.removeAttribute('src')}
  for(const element of [copy,...copy.querySelectorAll('*')]){element.removeAttribute('id');element.removeAttribute('autofocus');element.removeAttribute('data-reply-id');element.removeAttribute('data-group-read')}
  Object.assign(copy.style,{position:'fixed',inset:'auto',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',maxWidth:'none',maxHeight:'none',margin:'0',boxSizing:'border-box',pointerEvents:'none',animation:'none',transform:'none',opacity:style.opacity,zIndex:kind==='menu'?'10100':kind==='dialog'?'10055':kind==='panel'?'35':'3'})
  copy.style.setProperty('--message-accent',style.getPropertyValue('--message-accent')||'#5873c7')
  document.body.append(copy)
  const sources=[node,...node.querySelectorAll<HTMLElement>('*')],targets=[copy,...copy.querySelectorAll<HTMLElement>('*')]
  sources.forEach((source,index)=>{if(source.scrollTop||source.scrollLeft){targets[index].scrollTop=source.scrollTop;targets[index].scrollLeft=source.scrollLeft}})
  const transform=kind==='panel'?'translateX(18px)':'none'
  if(kind==='dialog'){const card=copy.querySelector('[role=dialog]');if(card)playMessageMotion(card,[{transform:'none'},{transform:'translateY(6px) scale(.98)'}],250)}
  playMessageMotion(copy,[{opacity:Number(style.opacity),transform:'none'},{opacity:0,transform}],kind==='dialog'?250:kind==='menu'?200:150,()=>copy.remove())
}

/** Shared timing and interruption behavior for menus, drawers and dialogs. */
export function useSurfaceMotion<T extends HTMLElement>(kind:SurfaceMotion){
  const root=useRef<T>(null)
  useLayoutEffect(()=>{
    const node=root.current;if(!node)return
    // Reopening a surface replaces its previous closing snapshot.
    document.querySelectorAll(`[data-message-exit="${kind}"],[data-message-spacer="${kind}"]`).forEach(element=>element.remove())
    node.dataset.messageSurface=kind
    const transform=kind==='menu'?'scale(.1)':kind==='panel'?'translateX(24px)':'none'
    const animations:Animation[]=[]
    const style=getComputedStyle(node)
    const frames=kind==='strip'?[{height:'0px',paddingTop:'0px',paddingBottom:'0px',marginTop:'0px',marginBottom:'0px',opacity:0},{height:node.getBoundingClientRect().height+'px',paddingTop:style.paddingTop,paddingBottom:style.paddingBottom,marginTop:style.marginTop,marginBottom:style.marginBottom,opacity:1}]:[{opacity:kind==='menu'?.1:0,transform},{opacity:1,transform:'none'}]
    const enter=playMessageMotion(node,frames,kind==='panel'?250:200)
    if(enter)animations.push(enter)
    if(kind==='dialog'){const card=node.querySelector('[role=dialog]');if(card){const animation=playMessageMotion(card,[{transform:'translateY(10px) scale(.96)'},{transform:'none'}],250);if(animation)animations.push(animation)}}
    return()=>{exitSurface(node,kind);animations.forEach(animation=>animation.cancel())}
  },[kind])
  return root
}
