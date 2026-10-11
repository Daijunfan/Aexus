import {resolveStroke} from './ink-recognition.mjs';
import {TransientInk} from './transient-ink.js';
import {$,escape,field,showDialog,closeDialog,run} from './dom.js';
import {base} from './transport.js';
import {strokeSvg} from './ink-shapes.mjs';
const mediaHtml=m=>!m?'':m.kind==='image'?`<img class="comment-image" src="${new URL('data/'+m.asset,base).href}" alt="${escape(m.name)}">`:`<audio controls preload="none" src="${new URL('data/'+m.asset,base).href}" aria-label="${escape(m.name)}"></audio>`;
const strokes=(ink,colors)=>(ink||[]).map(s=>strokeSvg(s,{color:colors[s.color]||s.color})).join('');
export function faceHtml(face,ink,colors){return `<div class="review-rich-content">${face.html}</div>${face.comments.map(c=>`<section class="review-face-comment" data-comment-id="${c.id}">${c.html}${mediaHtml(c.media)}</section>`).join('')}${ink?.length?`<svg class="review-handwriting" viewBox="0 0 1 1" preserveAspectRatio="none" aria-label="手写批注">${strokes(ink,colors)}</svg>`:''}`;}
export function editHandwriting(study,card,side){
 const setId=study.current.id,colors=study.current.colors;let revision=study.current.revision;const pending=[];let drawing=false;
 const initial=study.inkTools.settings;
 const old=(card.ink||[]).filter(s=>!s.imageBound&&(s.reviewSide===side||s.reviewSide==='both'));
 showDialog({title:(side==='front'?'正面':'背面')+'手写批注',html:field('color','颜色',initial.color,{choices:study.colors.some(c=>c[0]===initial.color)?study.colors:[...study.colors,[initial.color,initial.color]]})+'<svg id="review-ink-editor" class="review-handwriting editor" viewBox="0 0 1 1" preserveAspectRatio="none" aria-label="手写编辑区域"></svg><button type="button" id="review-ink-brush">笔刷</button><button type="button" id="review-ink-undo">撤销本次一笔</button><button type="button" id="review-ink-manage">管理已保存笔迹</button><p class="dialog-note">普通笔迹保存后与这张卡片一起保留，可撤销。消失模式沿用当前笔刷，停笔一秒后消失，不会保存。背面卡片内容仍通过同一卡片编辑器修改。</p>',onSubmit:async()=>{if(study.current?.id!==setId)throw Error('学习集已切换，请重新打开手写编辑器。');if(drawing)throw Error('请先结束当前笔画。');if(!pending.length){if(study.inkTools.settings.vanish||study.inkTools.settings.brush==='laser')return;throw Error('请先书写一笔。');}while(pending.length){const {rawPoints,...stroke}=pending[0],next=await study.change('study.card.ink.add',{cardId:card.id,reviewSide:side,geometry:{shape:'free',straighten:'off',perfectShape:false},...stroke,points:rawPoints||stroke.points},revision);revision=next.revision;pending.shift();}},afterOpen:()=>{
  $('review-ink-manage').onclick=run(()=>{if(drawing||pending.length)throw Error('请先保存或撤销本次笔迹。');if(study.current?.id!==setId)throw Error('学习集已切换。');closeDialog();return study.inkTools.all(card);});
  const svg=$('review-ink-editor'),draw=()=>{svg.innerHTML=strokes([...old,...pending,...transient.strokes],colors);},transient=new TransientInk(draw);draw();
  const owner={},toolbar=study.inkTools.toolbar,colorSelect=$('dialog-fields').querySelector('[name=color]'),syncColor=()=>{const color=study.inkTools.settings.color;if(![...colorSelect.options].some(o=>o.value===color))colorSelect.add(new Option(color,color));colorSelect.value=color;};
  const showToolbar=()=>{if(study.current?.id!==setId)throw Error('学习集已切换，请重新打开编辑器。');toolbar.show('review',{controller:owner,parent:$('dialog'),root:()=>svg,mode:()=>"pen",drawing:()=>drawing,refreshed:syncColor,changed:(set,before)=>{if(revision===before)revision=set.revision;}});};showToolbar();study.inkTools.rulers.bind('review',()=>svg,{parent:$('dialog'),owner,drawing:()=>drawing,changed:(set,before)=>{if(revision===before)revision=set.revision;}});$('review-ink-brush').onclick=run(showToolbar);
  colorSelect.onchange=run(()=>{const color=colorSelect.value;if(toolbar.owner?.controller!==owner)showToolbar();return toolbar.perform(()=>({method:'study.ink.settings',params:{color}}));});
  $('dialog').addEventListener('close',()=>{transient.clear();toolbar.hide(owner);study.inkTools.rulers.unbind('review',owner);},{once:true});
  $('review-ink-undo').onclick=()=>{if(drawing)return;pending.pop();draw();svg.dispatchEvent(new Event('input',{bubbles:true}));};
  svg.onpointerdown=e=>{
   if(e.button!==0||drawing||toolbar.busy||study.inkTools.rulers.drag||study.inkTools.rulers.busy)return;e.preventDefault();drawing=true;svg.setPointerCapture(e.pointerId);
   const settings=study.inkTools.settings,laser=settings.brush==='laser',temporary=laser||settings.vanish,box=svg.getBoundingClientRect(),point=ev=>[Math.max(0,Math.min(1,(ev.clientX-box.left)/box.width)),Math.max(0,Math.min(1,(ev.clientY-box.top)/box.height)),...(settings.pressure&&ev.pointerType==='pen'?[ev.pressure]:[])];
   const raw=[point(e)],ruler=study.inkTools.rulers.guide('review',{point:(x,y)=>[(x-box.left)/box.width,(y-box.top)/box.height],scale:1/box.width,clip:box}),geometry={shape:'free',straighten:'off',perfectShape:false,aspectRatio:box.height/box.width,...(ruler?{ruler}:{})},stroke={points:raw,rawPoints:raw,geometry,color:laser?'red':settings.color,width:settings.cardWidth,brush:laser?'pen':settings.brush,opacity:laser?1:settings.opacity,layerId:study.current.activeLayer||'default'};
   if(temporary)transient.touch(stroke);else pending.push(stroke);
   const move=ev=>{if(ev.pointerId!==e.pointerId)return;if(temporary&&!transient.has(stroke))raw.length=0;const previous=raw.at(-1),next=point(ev);if(raw.length<2048)raw.push(next);if(temporary&&(!previous||next.some((v,i)=>i<2&&v!==previous[i])))transient.touch(stroke);stroke.points=resolveStroke(raw,geometry).points;study.inkTools.rulers.measure('review',ev.clientX,ev.clientY);draw();};
   svg.onpointermove=move;svg.onpointerup=ev=>{if(ev.pointerId!==e.pointerId)return;if(!temporary||transient.has(stroke))move(ev);svg.onpointermove=svg.onpointerup=svg.onpointercancel=null;drawing=false;draw();if(!temporary)svg.dispatchEvent(new Event('input',{bubbles:true}));};
   svg.onpointercancel=ev=>{if(ev.pointerId!==e.pointerId)return;if(temporary)transient.remove(stroke);else pending.pop();svg.onpointermove=svg.onpointerup=svg.onpointercancel=null;drawing=false;draw();};
  };
 }});
}
