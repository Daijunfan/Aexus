import {escapeXml as E} from './mindmap-style.mjs';
import {pitchScene} from './mindmap-pitch.mjs';
export function pitchSvg(set,frame,options={},image=()=>null){
 const s=pitchScene(set,frame,options),c=set.cards.find(c=>c.id===frame.cardId),text=(lines,x,y,size,color=s.ink,weight=400)=>lines.map((line,i)=>`<text x="${x}" y="${y+i*size*1.45}" font-size="${size}" font-weight="${weight}" fill="${color}" font-family="system-ui">${E(line)}</text>`).join('');
 let content=`<rect width="${s.w}" height="${s.h}" fill="${s.paper}"/>${text([s.subtitle],62,34,15,s.accent)}${text(s.title.lines,62,72+s.title.fontSize,s.title.fontSize,s.ink,700)}<rect x="62" y="${s.top-23}" width="72" height="4" rx="2" fill="${s.accent}"/>`;
 if(options.diagram){const d=options.diagram;content+=d.svg.replace(/^<svg\b([^>]*)>/,(_,attrs)=>'<svg'+attrs.replace(/\s(?:x|y|width|height)="[^"]*"/g,'')+` x="62" y="${s.top}" width="${s.w-124}" height="${s.bottom-s.top}" preserveAspectRatio="xMidYMid meet">`);}
 if(!options.diagram)for(const box of s.boxes)content+=`<g data-pitch-card="${box.cardId}"><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="15" fill="${box.fill}"/>${text(box.lines,box.x+18,box.y+22+box.fontSize,box.fontSize,box.ink,600)}</g>`;
 if(!options.diagram&&!s.boxes.length){
  if(s.body?.lines.length)content+=text(s.body.lines,70,s.top+25,s.body.fontSize);
  const src=s.showImage?image(c):null;if(src){const x=s.w/2+30,w=s.w/2-96,h=s.bottom-s.top;content+=`<image x="${x}" y="${s.top}" width="${w}" height="${h}" href="${E(src)}" preserveAspectRatio="xMidYMid meet"/>`;}
  if(c.mindmap?.equation&&!src){const q=c.mindmap.equation,scale=Math.min(4,850/q.width,240/q.height),width=q.width*scale,height=q.height*scale;content+=(c.equationSvg||`<svg data-math-latex="${E(q.latex)}"></svg>`).replace('<svg ',`<svg x="${(s.w-width)/2}" y="${Math.max(s.top+60,s.bottom-height-35)}" width="${width}" height="${height}" color="${s.ink}" `);}
 }
 if(s.body?.truncated)content+=text(['完整内容保留在演讲者笔记中'],62,s.h-22,13,s.accent);
 return {svg:`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}" role="img" aria-label="${E(c.title)}">${content}</svg>`,scene:s};
}
