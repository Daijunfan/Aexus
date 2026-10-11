import {strokeSvg} from './ink-shapes.mjs';
export function imageBounds(element,metadata){
 const img=element?.querySelector('img'),outer=element?.getBoundingClientRect(),box=img?.getBoundingClientRect();if(!box?.width||!box.height||!outer.width||!outer.height)return null;
 const style=getComputedStyle(img),width=img.naturalWidth||metadata?.width,height=img.naturalHeight||metadata?.height;if(!width||!height)return null;
 const px=name=>parseFloat(style[name])||0,zoom=box.width/px('width'),inner={x:box.x+(px('borderLeftWidth')+px('paddingLeft'))*zoom,y:box.y+(px('borderTopWidth')+px('paddingTop'))*zoom,width:(px('width')-px('borderLeftWidth')-px('borderRightWidth')-px('paddingLeft')-px('paddingRight'))*zoom,height:(px('height')-px('borderTopWidth')-px('borderBottomWidth')-px('paddingTop')-px('paddingBottom'))*zoom};
 const fit=style.objectFit==='contain'?Math.min(inner.width/width,inner.height/height):null,w=fit?width*fit:inner.width,h=fit?height*fit:inner.height;
 const result={x:(inner.x+(inner.width-w)/2-outer.x)/outer.width,y:(inner.y+(inner.height-h)/2-outer.y)/outer.height,width:w/outer.width,height:h/outer.height};
 return result.x>=0&&result.y>=0&&result.x+result.width<=1.000001&&result.y+result.height<=1.000001?result:null;
}
// Display projection only; persistent clipping and editing remain in Core.
export function projectInk(stroke,to={x:0,y:0,width:1,height:1}){if(!stroke.imageBound)return stroke;const from=stroke.imageBounds;return {...stroke,width:stroke.width/from.width*to.width,points:stroke.points.map(p=>[to.x+(p[0]-from.x)/from.width*to.width,to.y+(p[1]-from.y)/from.height*to.height,...p.slice(2)])};}
export function imageInkContent(card,ink,colors){return ink.map(s=>strokeSvg(projectInk({...s,imageBound:true}),{width:card.image.width,height:card.image.height,color:colors[s.color]||s.color,attribute:'data-card-stroke'})).join('');}
export function imageInkHtml(card,ink,colors){return !card.image||!ink?.length?'':`<svg class="image-bound-overlay" viewBox="0 0 ${card.image.width} ${card.image.height}" preserveAspectRatio="none" aria-label="图片手写">${imageInkContent(card,ink,colors)}</svg>`;}
