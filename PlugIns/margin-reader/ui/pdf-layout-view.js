import { api, base } from './transport.js';
import { run, escape } from './dom.js';
import { displayY, pagePoint } from './page-slices.mjs';
const bounded=(n,a,b)=>Math.max(a,Math.min(b,n));
export function noteView(card,settings,geometry){
  const {page,top,left,width,height,scale=1}=geometry,collapsed=card.anchor.display==='collapsed';
  const note=document.createElement(collapsed?'button':'section');
  note.className=collapsed?'extend-note-marker pdf-note':'extend-note-'+(card.anchor.display==='margin'?'margin':card.anchor.display==='overlay'?'overlay':'block')+' pdf-note';
  note.dataset.noteCard=card.id;note.dataset.pageUi='note';
  Object.assign(note.style,{top:top+'px',left:left+'px',width:width+'px',height:height+'px'});
  if(collapsed){note.textContent='✎ '+card.title;note.title='展开 / 编辑留白';note.onclick=()=>settings.editExtendedNote?.(card);return note;}
  note.innerHTML=`<header><strong data-note-drag title="拖动以改变原文位置">${escape(card.title)}</strong><button data-note-edit title="编辑内容与布局">编辑</button><button data-note-collapse aria-label="折叠留白">−</button></header><div class="pdf-note-body"></div><button class="pdf-note-resize" aria-label="调整留白大小" title="拖动调整大小">↘</button>`;
  const body=note.querySelector('.pdf-note-body');body.textContent=card.editedText??card.text??'';
  if(card.imageAsset){const img=document.createElement('img');img.src=new URL('data/'+card.imageAsset,base).href;img.alt=card.title;body.prepend(img);}
  note.querySelector('[data-note-edit]').onclick=()=>settings.editExtendedNote?.(card);
  note.querySelector('[data-note-collapse]').onclick=run(()=>settings.moveExtendedNote?.(card,{display:'collapsed'}));
  if(settings.extendedSetId)api('study.card.render',{setId:settings.extendedSetId,cardId:card.id}).then(data=>{
    if(!note.isConnected)return;body.innerHTML=data.html+(data.noteHtml?'<hr>'+data.noteHtml:'');
    if(card.imageAsset){const img=document.createElement('img');img.src=new URL('data/'+card.imageAsset,base).href;img.alt=card.title;body.prepend(img);}
    settings.bindNoteLinks?.(body,data);
  }).catch(()=>{});
  const drag=resize=>event=>{
    if(event.button!==0||!settings.moveExtendedNote)return;event.preventDefault();event.stopPropagation();
    const x=event.clientX,y=event.clientY;note.setPointerCapture(event.pointerId);note.dataset.editing='true';
    let patch;
    const move=e=>{
      if(card.anchor.display==='overlay'){
        const rect={...card.anchor.rect},w=page.clientWidth,h=page.pageSlices?.sourceHeight||page.clientHeight;
        if(resize){rect.width=bounded(rect.width+(e.clientX-x)/w,.03,1-rect.x);rect.height=bounded(rect.height+(e.clientY-y)/h,.03,1-rect.y);}
        else{rect.x=bounded(rect.x+(e.clientX-x)/w,0,1-rect.width);rect.y=bounded(pagePoint(page,e.clientX,e.clientY)[1],0,1-rect.height);}
        patch={rect,locator:{...card.anchor.locator,pageOffset:rect.y}};
        Object.assign(note.style,{left:rect.x*w+'px',top:(page.pageSlices?displayY(page.pageSlices,rect.y):rect.y*h)+'px',width:rect.width*w+'px',height:rect.height*h+'px'});
      }else if(resize){patch={height:bounded((card.anchor.height||150)+(e.clientY-y)/scale,36,2000)};note.style.height=patch.height*scale+'px';}
      else{patch={locator:{...card.anchor.locator,pageOffset:pagePoint(page,e.clientX,e.clientY)[1]}};note.style.top=top+e.clientY-y+'px';}
    };
    const cleanup=()=>{delete note.dataset.editing;note.removeEventListener('pointermove',move);note.removeEventListener('pointerup',end);note.removeEventListener('pointercancel',cancel);if(note.hasPointerCapture(event.pointerId))note.releasePointerCapture(event.pointerId);};
    const restore=()=>Object.assign(note.style,{top:top+'px',left:left+'px',width:width+'px',height:height+'px'});
    const end=e=>{move(e);cleanup();restore();if(patch&&Math.hypot(e.clientX-x,e.clientY-y)>2)run(()=>settings.moveExtendedNote(card,patch))();};
    const cancel=()=>{cleanup();restore();};
    note.addEventListener('pointermove',move);note.addEventListener('pointerup',end,{once:true});note.addEventListener('pointercancel',cancel,{once:true});
  };
  note.querySelector('[data-note-drag]').onpointerdown=drag(false);note.querySelector('.pdf-note-resize').onpointerdown=drag(true);
  return note;
}
export function mountSlices(slot,record,viewport,settings,notes){
  const layout=slot.pageSlices,width=viewport.width,sourceHeight=viewport.height;
  if(layout.blocks.length>1||layout.blocks[0]?.type!=='source'){
    const layer=record.textLayerRoot,sourceCanvas=record.canvas,rect=layer.getBoundingClientRect(),children=[];
    let previous=.5;
    for(const child of [...layer.children]){const r=child.getBoundingClientRect();if(r.height)previous=(r.top-rect.top+r.height/2)/sourceHeight;children.push({node:child,center:previous});}
    const fragment=document.createDocumentFragment();record.tiles=[];
    for(const block of layout.blocks){
      if(block.type!=='source')continue;
      const clip=document.createElement('div');clip.className='pdf-source-slice';clip.dataset.sourceStart=block.start;clip.dataset.sourceEnd=block.end;
      Object.assign(clip.style,{top:block.top+'px',height:block.height+'px',width:width+'px'});
      const tile=document.createElement('canvas'),start=Math.round(block.start*sourceCanvas.height),end=Math.round(block.end*sourceCanvas.height);
      tile.width=sourceCanvas.width;tile.height=Math.max(1,end-start);tile.style.width=width+'px';tile.style.height=block.height+'px';
      tile.getContext('2d').drawImage(sourceCanvas,0,start,sourceCanvas.width,tile.height,0,0,tile.width,tile.height);record.tiles.push(tile);
      const text=layer.cloneNode(false);text.style.top=(-block.start*sourceHeight)+'px';text.style.height=sourceHeight+'px';
      for(const item of children)if(item.center>=block.start&&item.center<block.end)text.append(item.node);
      clip.append(tile,text);fragment.append(clip);
    }
    slot.replaceChildren(fragment);sourceCanvas.width=sourceCanvas.height=0;
  }
  for(const block of layout.blocks){
    if(block.type==='fold'){
      const bar=document.createElement('div');bar.className='pdf-fold-bar';bar.dataset.pageUi='fold';bar.style.top=block.top+'px';bar.style.height=block.height+'px';
      const button=document.createElement('button');button.textContent=`展开已折叠区域 · ${Math.round(block.start*100)}–${Math.round(block.end*100)}%`;
      button.onclick=run(()=>settings.unfoldRegion?.(block.fold.id));bar.append(button);slot.append(bar);
    }else if(block.type==='note')slot.append(noteView(block.card,settings,{page:slot,top:block.top,left:0,width,height:block.height,scale:viewport.scale}));
  }
  let marginBottom=0;
  for(const card of notes.filter(c=>c.anchor.display!=='embedded')){
    const y=card.anchor.locator.pageOffset||0,hidden=layout.blocks.some(b=>b.type==='fold'&&y>=b.start&&y<b.end);if(hidden)continue;
    const top=displayY(layout,y),mode=card.anchor.display;
    if(mode==='overlay'){
      const r=card.anchor.rect;if(!r)continue;slot.append(noteView(card,settings,{page:slot,top:displayY(layout,r.y),left:r.x*width,width:r.width*width,height:r.height*sourceHeight,scale:viewport.scale}));
    }else{
      const full=mode==='margin'&&settings.noteMarginWidth>0,h=full?(card.anchor.height||150)*viewport.scale:30,w=full?settings.noteMarginWidth-12:Math.min(180,width);
      const actualTop=full?Math.max(top,marginBottom):top;const note=noteView({...card,anchor:{...card.anchor,display:full?'margin':'collapsed'}},settings,{page:slot,top:actualTop,left:full?width+8:Math.max(0,width-w),width:w,height:h,scale:viewport.scale});
      slot.append(note);if(full)marginBottom=actualTop+h+8;
    }
  }
}
