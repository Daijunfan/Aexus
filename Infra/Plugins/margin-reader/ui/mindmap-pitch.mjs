import {mapStyle,wrapLabel,mix} from './mindmap-style.mjs';
export function pitchPlan(cards,options={}){
 const byId=new Map(cards.map(c=>[c.id,c])),children=new Map(),frames=[],delivery=options.delivery||'topics';
 for(const c of cards){if(!children.has(c.parentId))children.set(c.parentId,[]);children.get(c.parentId).push(c);}
 for(const card of cards){if(card.mindmap?.pitch?.visible===false)continue;const own=children.get(card.id)||[],isRoot=!byId.has(card.parentId);
  if(delivery==='branches'&&!own.length&&!isRoot&&!card.note&&!card.text&&!card.image)continue;
  const layout=card.mindmap?.pitch?.layout||options.layout||'auto',count=layout==='list'?8:6;
  if(!own.length){frames.push({id:card.id+':0',cardId:card.id,childIds:[],layout,part:1,parts:1});continue;}
  const parts=Math.ceil(own.length/count);for(let at=0;at<own.length;at+=count){const group=own.slice(at,at+count),steps=delivery==='step'?group.length:1;for(let step=0;step<steps;step++)frames.push({id:card.id+':'+at+':'+step,cardId:card.id,childIds:group.slice(0,delivery==='step'?step+1:group.length).map(c=>c.id),layout,part:at/count+1,parts});}
 }
 return frames;
}
const fitted=(value,width,height,size)=>{let rows;for(;size>12;size--){rows=wrapLabel(value,width,size);if(rows.length*size*1.45<=height)break;}rows=wrapLabel(value,width,size);const limit=Math.max(1,Math.floor(height/(size*1.45))),truncated=rows.length>limit,lines=rows.slice(0,limit).map(r=>r.text);if(truncated)lines[lines.length-1]+='…';return {lines,fontSize:size,truncated};};
export function pitchScene(set,frame,options={}){
 const c=set.cards.find(c=>c.id===frame.cardId),items=frame.childIds.map(id=>set.cards.find(c=>c.id===id)).filter(Boolean),w=1280,h=options.ratio==='4:3'?960:720,theme=mapStyle(set.map?.mindmap),paper=options.theme==='dark'?'#182332':options.theme==='light'?'#FFFFFF':theme.paper,ink=options.theme==='dark'?'#EDF2F8':options.theme==='light'?'#243042':theme.ink;
 const title=fitted(c.title,w-112,110,40),titleH=title.lines.length*title.fontSize*1.45,top=Math.max(166,62+titleH),bottom=h-54,boxes=[];
 const layout=frame.layout==='auto'?items.length?'grid':c.image?'split':'focus':frame.layout;
 if(layout==='list'){
  const height=(bottom-top)/Math.max(1,items.length);items.forEach((item,i)=>boxes.push({cardId:item.id,x:62,y:top+i*height,w:w-124,h:height-10,fill:mix(paper,theme.palette[i%theme.palette.length],.12),ink,...fitted(item.title,w-176,height-22,24)}));
 }else if(items.length){
  const cols=items.length===1?1:items.length===2?2:3,rows=Math.ceil(items.length/cols),width=(w-124-(cols-1)*20)/cols,height=(bottom-top-(rows-1)*18)/rows;
  items.forEach((item,i)=>boxes.push({cardId:item.id,x:62+(i%cols)*(width+20),y:top+Math.floor(i/cols)*(height+18),w:width,h:height,fill:mix(paper,theme.palette[i%theme.palette.length],.15),ink,...fitted(item.title,width-36,height-34,Math.min(30,items.length<=2?30:24))}));
 }
 const text=c.note||c.editedText||c.text||'',body=!items.length?fitted(text,w-(c.image&&options.images!==false?660:140),Math.max(90,bottom-top-(c.mindmap?.equation?270:24)),26):null;
 return {w,h,paper,ink,accent:theme.palette[0],title,titleH,top,bottom,layout,cardId:c.id,heading:c.title,subtitle:set.title+(frame.parts>1?` · ${frame.part}/${frame.parts}`:''),boxes,body,showImage:options.images!==false&&Boolean(c.image),showNotes:options.notes!==false};
}
