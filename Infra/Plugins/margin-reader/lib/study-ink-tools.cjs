'use strict';
const {randomUUID}=require('node:crypto');
const {assert}=require('./safety.cjs'),M=require('./study-model.cjs'),G=require('./ink-geometry.cjs');
const A=require('./study-advanced.cjs'),D=require('./documents.cjs'),I=require('./image-ink.cjs');
const methods=new Set(['study.map.ink.add','study.ink.binding.set','study.ink.ruler.set','study.ink.settings','study.ink.batch','study.ink.erase','study.ink.bind','study.ink.detach','study.ink.toCard']);
function width(set,p,scope){
  const s=set.inkSettings||{},value=p.width??(scope==='canvas'?(s.canvasWidth??3):scope==='card'?(s.cardWidth??s.width??.004):(s.width??.004));
  assert(Number.isFinite(value)&&value>=(scope==='canvas'?.1:scope==='document'?.0005:.001)&&value<=(scope==='canvas'?30:.03),'INVALID_PARAMS','Invalid stroke width for this drawing area.');return value;
}
function attributes(p){
  const brush=p.brush||'pen';assert(['pen','pencil','highlighter'].includes(brush),'INVALID_PARAMS','Choose pen, pencil or highlighter for a saved stroke.');
  const opacity=p.opacity??(brush==='highlighter'?.35:brush==='pencil'?.7:1);assert(Number.isFinite(opacity)&&opacity>=.05&&opacity<=1,'INVALID_PARAMS','Opacity must be 0.05–1.');return {brush,opacity};
}
function scope(set,p){
  if(p.scope==='card'){const card=M.card(set,p.cardId);card.ink??=[];return {all:card.ink,save:value=>card.ink=value,max:1,limit:500,card};}
  if(p.scope==='canvas'){set.canvasInk??=[];return {all:set.canvasInk,save:value=>set.canvasInk=value,max:100000,limit:2000};}
  assert(p.scope==='document','INVALID_PARAMS','Choose document, canvas or card ink.');set.ink??=[];return {all:set.ink,save:value=>set.ink=value,max:1,limit:2000};
}
function selected(target,ids){
  assert(Array.isArray(ids)&&ids.length>0&&ids.length<=2000&&ids.every(id=>typeof id==='string'),'INVALID_PARAMS','Select 1–2000 strokes.');
  const unique=new Set(ids);return [...unique].map(id=>{const s=target.all.find(s=>s.id===id);assert(s,'NOT_FOUND','A selected stroke no longer exists.');return s;});
}
async function editable(store,state,set,strokes){
  const docs=new Map();for(const s of strokes){A.editable(set,s.layerId);require('./study-notebooks.cjs').editable(set,s.documentId?s:null);if(s.documentId){const d=D.findDocument(state,s.documentId);assert(d.hash===s.sourceHash,'SOURCE_CHANGED','The source changed; old handwriting was not moved.');docs.set(d.id,d);}}
  for(const d of docs.values())assert(!(await D.sourceStatus(store,d)).changed,'SOURCE_CHANGED','Reopen the original before editing handwriting.');
}
function permitted(s,max){
  if(I.bound(s))return I.check(s);
  const bound=s.space==='card-relative'?1000:max,minimum=s.space==='card-relative'?-1000:0;
  assert(s.points.length>=2&&s.points.length<=2048&&s.points.every(pt=>pt.every(Number.isFinite)&&pt[0]>=minimum&&pt[0]<=bound&&pt[1]>=minimum&&pt[1]<=bound),'INVALID_PARAMS','Transformed handwriting would leave the permitted coordinate space.');
}
async function mapBox(set,cardId){
  const {layoutStudy}=await import('../ui/study-map-layout.mjs'),layout=layoutStudy(set.cards,set.map,set.appearance),box=layout.positions.get(cardId);
  assert(box,'INVALID_PARAMS','Make the destination card visible in the current mind map first.');return box;
}
async function imageFrame(set,card,p){
 if(p.imageBounds){assert(card&&require('./study-emphasis.cjs').rect(p.imageBounds),'INVALID_PARAMS','Supply current image bounds inside the card.');return p.imageBounds;}
 return card?I.cardFrame(set,card):null;
}
function unbind(s){const value={...s};delete value.imageBound;delete value.imageBounds;delete value.aspectRatio;return value;}
function unmap(s){const value=unbind(s);delete value.focusBound;delete value.mapHidden;delete value.mapBound;delete value.reviewSide;return value;}
function validateErase(p){
    assert(Array.isArray(p.path)&&p.path.length>=2&&p.path.length<=256&&p.path.every(pt=>Array.isArray(pt)&&pt.length===2&&pt.every(Number.isFinite)),'INVALID_PARAMS','An eraser path needs 2–256 finite points.');
    if(p.side!==undefined)assert(p.scope==='card'&&['front','back'].includes(p.side),'INVALID_PARAMS','Review sides apply only to card ink.');
    const mode=p.mode||'partial';assert(['partial','stroke'].includes(mode),'INVALID_PARAMS','Choose partial or complete stroke erasing.');
    if(p.bands!==undefined)assert(p.scope==='document'&&Array.isArray(p.bands)&&p.bands.length<=128&&p.bands.every(b=>b&&Object.keys(b).every(k=>['start','end'].includes(k))&&Number.isFinite(b.start)&&Number.isFinite(b.end)&&b.start>=0&&b.end<=1&&b.end>b.start),'INVALID_PARAMS','Visible bands must be original-page intervals.');
}
async function request(store,state,set,method,p){
  if(method==='study.ink.erase')validateErase(p);
  if(method==='study.map.ink.add')return require('./map-ink.cjs').add(store,state,set,p,true);
  if(method==='study.ink.binding.set'){require('./map-ink.cjs').settings(set,p);return;}
  if(method==='study.ink.ruler.set'){require('./study-ruler.cjs').request(set,p);return;}
  if(method==='study.ink.settings'){
    const {setId,expectedRevision,...patch}=p;assert(Object.keys(patch).length,'INVALID_PARAMS','Supply a handwriting setting.');
    if(p.color)M.color(p.color);if(p.brush&&p.brush!=='laser')attributes(p);
    if(p.brush&&p.brush!==(set.inkSettings?.brush||'pen')&&set.activeTools?.ink)set.activeTools={...set.activeTools,ink:null};
    set.inkSettings={cardWidth:set.inkSettings?.cardWidth??set.inkSettings?.width??.004,...set.inkSettings,...patch};return;
  }
  if(method==='study.ink.detach'){
    const card=M.card(set,p.cardId),target=scope(set,{scope:'card',cardId:card.id}),strokes=selected(target,p.strokeIds),box=await mapBox(set,card.id);await editable(store,state,set,strokes);
    set.canvasInk??=[];assert(set.canvasInk.length+strokes.length<=2000,'TOO_LARGE','Canvas stroke capacity exceeded.');
    const frame=await imageFrame(set,card,p);assert(!strokes.some(I.bound)||frame,'INVALID_PARAMS','Show the image or provide imageBounds before detaching image ink.');
    const values=strokes.map(s=>{const value=unmap(I.bound(s)?I.project(s,frame):s);return {...value,id:randomUUID(),space:undefined,width:value.width*box.width,points:value.points.map(pt=>[box.x+pt[0]*box.width,box.y+pt[1]*box.height,...pt.slice(2)])};});values.forEach(s=>permitted(s,100000));
    set.canvasInk.push(...values);if(p.copy!==true)target.save(target.all.filter(s=>!strokes.includes(s)));set.lastInk={scope:'canvas',strokeIds:values.map(s=>s.id)};return;
  }
  if(method==='study.ink.erase'&&p.scope==='map'){
    const {layoutStudy}=await import('../ui/study-map-layout.mjs'),layout=layoutStudy(set.cards.map(c=>M.effective(state,set,c)),set.map,set.appearance);let erased=0;
    if(!set.map?.focusId){await request(store,state,set,method,{...p,scope:'canvas',aspectRatio:1});erased+=set.lastInk.erased;}
    for(const card of set.cards){const box=layout.positions.get(card.id);if(!box||!card.ink?.length)continue;
      try{require('./study-notebooks.cjs').guard(set,method,{cardId:card.id});if(card.anchor?.layerId)A.editable(set,card.anchor.layerId);}catch(error){if(['NOTEBOOK_LOCKED','LAYER_LOCKED'].includes(error.code))continue;throw error;}
      await request(store,state,set,method,{scope:'card',cardId:card.id,mapView:true,side:'back',mode:p.mode||'partial',path:p.path.map(q=>[(q[0]-box.x)/box.width,(q[1]-box.y)/box.height]),radius:p.radius/box.width,aspectRatio:box.height/box.width});erased+=set.lastInk.erased;
    }
    set.lastInk={scope:'map',strokeIds:[],erased,mode:p.mode||'partial'};return;
  }
  const target=scope(set,p);
  if(method==='study.ink.erase'){
    if(p.scope==='document'){assert(p.documentId&&Number.isInteger(p.page),'INVALID_PARAMS','Document erasing requires a document and page.');const doc=D.findDocument(state,p.documentId);assert(set.documentIds.includes(doc.id),'NOT_MEMBER','Document is not in this study.');require('./outline.cjs').validateLocator({page:p.page},await D.parsedDocument(store,doc));}
    const mode=p.mode||'partial';
    const frame=p.scope==='card'?await imageFrame(set,target.card,p):null;
    const displayed=new Map(target.all.map(s=>[s.id,I.bound(s)&&frame?I.project(s,frame):s]));
    const aspect=p.aspectRatio||1,bounds=G.bounds(p.path),radius=p.radius;
    const {mapInkVisibility}=await import('../ui/ink-binding.mjs');
    const strokes=target.all.filter(s=>{if(p.mapView&&mapInkVisibility(s,target.card?.id,{focusId:set.map?.focusId,hideFocusInk:set.inkBinding?.hideFocusInk})!==1)return false;const l=A.layers(set).find(l=>l.id===(s.layerId||'default'));if(!l||l.deletedAt||l.locked||!l.visible||s.hidden)return false;if(p.side){const side=s.reviewSide||(I.bound(s)?'both':'back');if(side!==p.side&&side!=='both')return false;}if(p.scope==='document'&&(s.documentId!==p.documentId||s.page!==p.page))return false;if(p.scope==='document'&&(!require('./study-notebooks.cjs').visible(set,s)||require('./study-notebooks.cjs').forSource(set,s)?.locked))return false;if(I.bound(s)&&!frame)return false;const value=displayed.get(s.id),b=G.bounds(value.points),pad=radius+value.width;return !(b.right<bounds.x-pad||b.x>bounds.right+pad||b.bottom<bounds.y-pad/aspect||b.y>bounds.bottom+pad/aspect);});
    assert(strokes.reduce((n,s)=>n+s.points.length,0)*(p.path.length+(p.bands?.length||0))<=2000000,'TOO_LARGE','Use a shorter eraser gesture or smaller stroke selection.');await editable(store,state,set,strokes);
    const replacements=new Map(),changed=[];
    for(const s of strokes){const value=displayed.get(s.id),parts=G.erase(value.points,p.path,radius+value.width/2,aspect,p.bands);if(parts.length===1&&JSON.stringify(parts[0])===JSON.stringify(value.points))continue;
      const values=mode==='stroke'?[]:parts.map(points=>({...value,id:randomUUID(),points}));replacements.set(s.id,values);changed.push(...values.map(s=>s.id));}
    const final=target.all.flatMap(s=>replacements.get(s.id)||[s]);assert(final.length<=target.limit,'TOO_LARGE','Partial erasure would exceed the stroke capacity.');target.save(final);set.lastInk={scope:p.scope,strokeIds:changed,erased:replacements.size,mode};return;
  }
  const strokes=selected(target,p.strokeIds);await editable(store,state,set,strokes);
  if(method==='study.ink.bind'){
    assert(p.scope==='canvas','INVALID_PARAMS','Bind free canvas handwriting to a card.');const card=M.card(set,p.cardId),box=await mapBox(set,card.id);if(card.anchor?.layerId)A.editable(set,card.anchor.layerId);card.ink??=[];assert(card.ink.length+strokes.length<=500,'TOO_LARGE','Card handwriting capacity exceeded.');
    const copies=strokes.map(s=>({...unmap(s),id:randomUUID(),mapBound:true,space:'card-relative',width:s.width/box.width,points:s.points.map(pt=>[(pt[0]-box.x)/box.width,(pt[1]-box.y)/box.height,...pt.slice(2)])}));copies.forEach(s=>permitted(s,1));card.ink.push(...copies);if(p.copy!==true)target.save(target.all.filter(s=>!strokes.includes(s)));set.lastInk={scope:'card',cardId:card.id,strokeIds:copies.map(s=>s.id)};return;
  }
  if(method==='study.ink.toCard'){
    assert(strokes.length<=500,'TOO_LARGE','A handwriting card can contain at most 500 strokes.');
    assert(p.scope==='document'||p.scope==='canvas','INVALID_PARAMS','Make a card from document or canvas handwriting.');
    assert(new Set(strokes.map(s=>`${s.documentId||''}/${s.page||''}`)).size===1,'INVALID_PARAMS','Select handwriting on one source page.');
    const bounds=G.bounds(strokes.flatMap(s=>s.points)),pad=Math.max(...strokes.map(s=>s.width))*2,w=Math.max(bounds.right-bounds.x+2*pad,.001),h=Math.max(bounds.bottom-bounds.y+2*pad,.001),card=A.note(set,p.title||'手写笔记');
    card.ink=strokes.map(s=>({id:randomUUID(),layerId:s.layerId,points:s.points.map(pt=>[(pt[0]-bounds.x+pad)/w,(pt[1]-bounds.y+pad)/h,...pt.slice(2)]),color:s.color,width:Math.min(.03,s.width/w),...attributes(s)}));
    if(strokes[0].documentId)card.anchor={documentId:strokes[0].documentId,notebookId:strokes[0].notebookId||'default',sourceHash:strokes[0].sourceHash,locator:{page:strokes[0].page,pageOffset:bounds.y},display:'collapsed'};
    if(p.copy===false)target.save(target.all.filter(s=>!strokes.includes(s)));set.lastInk={scope:'card',cardId:card.id,strokeIds:card.ink.map(s=>s.id)};return;
  }
  assert(method==='study.ink.batch','METHOD_NOT_FOUND','Unknown ink operation.');
  if(p.action==='remove'){target.save(target.all.filter(s=>!strokes.includes(s)));set.lastInk={scope:p.scope,strokeIds:[],removed:strokes.length};return;}
  assert(['copy','transform'].includes(p.action),'INVALID_PARAMS','Choose transform, copy or remove.');
  if(p.color)M.color(p.color);if(p.layerId)A.editable(set,p.layerId);
  if(p.imageBound!==undefined)assert(p.scope==='card'&&(p.imageBound===false||target.card.image&&!target.card.reference),'INVALID_PARAMS','Image binding is available on owned image cards.');
  if(p.mapHidden!==undefined)assert(p.scope==='card','INVALID_PARAMS','Map visibility belongs to bound card ink.');
  const geometric=Boolean(p.dx||p.dy||p.angle||p.scaleX!==undefined&&p.scaleX!==1||p.scaleY!==undefined&&p.scaleY!==1||p.imageBound!==undefined);
  const frame=p.scope==='card'&&geometric?await imageFrame(set,target.card,p):null;
  assert(!geometric||!strokes.some(I.bound)||frame,'INVALID_PARAMS','Show the image or provide imageBounds for image-bound geometry.');
  const working=geometric?strokes.map(s=>I.bound(s)?I.project(s,frame):s):strokes;
  const all=working.flatMap(s=>s.points),box=G.bounds(all),origin=p.origin||[(box.x+box.right)/2,(box.y+box.bottom)/2];
  assert(Array.isArray(origin)&&origin.length===2&&origin.every(Number.isFinite),'INVALID_PARAMS','Invalid transform center.');
  const values=working.flatMap(s=>{let value={...s,...(p.color?{color:p.color}:{}),...(p.opacity!==undefined?{opacity:p.opacity}:{}),...(p.layerId?{layerId:p.layerId}:{}),...(p.hidden!==undefined?{hidden:p.hidden}:{}),...(p.mapHidden!==undefined?{mapHidden:p.mapHidden}:{}),points:geometric?G.transform(s.points,{...p,origin}):s.points};if(p.action==='copy')value.id=randomUUID();
    if(p.imageBound===false)value={...unbind(value),imageBound:false};
    if(p.imageBound===true){assert(frame,'INVALID_PARAMS','Provide a visible image frame before binding ink.');value={...value,imageBound:true,imageBounds:frame,aspectRatio:1/(p.aspectRatio||1)};const parts=I.clipped(value,frame);assert(parts.length,'INVALID_PARAMS','The selected handwriting does not cross the image.');parts.forEach(s=>permitted(s,target.max));return parts;}
    permitted(value,target.max);return [value];});
  if(p.action==='copy'){assert(target.all.length+values.length<=target.limit,'TOO_LARGE','Stroke capacity exceeded.');target.all.push(...values);}else{const byId=new Map(values.map(s=>[s.id,s]));const selectedIds=new Set(strokes.map(s=>s.id)),extra=values.filter(s=>!selectedIds.has(s.id));assert(target.all.length+extra.length<=target.limit,'TOO_LARGE','Binding would exceed the stroke capacity.');target.save([...target.all.map(s=>byId.get(s.id)||s),...extra]);}
  set.lastInk={scope:p.scope,cardId:p.cardId||null,strokeIds:values.map(s=>s.id)};
}
module.exports={methods,request,attributes,width};
