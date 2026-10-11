"use strict";
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { assert, readBounded, writeNew } = require('./safety.cjs');
const M = require('./study-model.cjs');
const Keywords = require('./title-keywords.cjs');
const { findDocument } = require('./documents.cjs');
const { note } = require('./study-advanced.cjs');
const history = require('./study-history.cjs');
const STYLES = ['tree0','tree1','tree2','tree3','tree4','line0','line1','line2','both','frame'];
const plain = (v, message) => assert(v && typeof v === 'object' && !Array.isArray(v), 'INVALID_PARAMS', message);
function selected(set, values, descendants = false) {
  assert(Array.isArray(values) && values.length > 0 && values.length <= 10000 && values.every(id => typeof id === 'string'), 'INVALID_PARAMS', 'Choose 1–10000 card IDs.');
  const byId = new Map(set.cards.map(c => [c.id, c])), children = new Map();
  for (const id of values) assert(byId.has(id), 'NOT_FOUND', 'Card does not exist in this study set.');
  if (descendants) for (const c of set.cards) {
    if (!children.has(c.parentId)) children.set(c.parentId, []);
    children.get(c.parentId).push(c.id);
  }
  const ids = new Set(), pending = [...values];
  while (pending.length) {
    const id = pending.pop(); if (ids.has(id)) continue; ids.add(id);
    if (descendants) pending.push(...(children.get(id) || []));
  }
  return set.cards.filter(c => ids.has(c.id));
}
function checkedFilter(input = {}, depth = 0) {
  plain(input, 'A filter must be an object.');
  assert(depth<=4, 'INVALID_PARAMS', 'Filter nesting exceeds four levels.');
  const allowed=['query','titleKeyword','tags','tagMode','colors','documentIds','kind','inMap','favorite','reviewEnabled','hasImage','createdAfter','createdBefore','any','all','not'];
  assert(Object.keys(input).every(key=>allowed.includes(key)), 'INVALID_PARAMS', 'Unknown filter field.');
  const out={...input};
  for(const key of ['query','createdAfter','createdBefore'])if(out[key]!==undefined)assert(typeof out[key]==='string'&&out[key].length<=1000,'INVALID_PARAMS',`Invalid ${key}.`);
  for(const key of ['createdAfter','createdBefore'])if(out[key]!==undefined)assert(Number.isFinite(Date.parse(out[key])),'INVALID_PARAMS','Invalid date boundary.');
  for(const key of ['tags','colors','documentIds'])if(out[key]!==undefined)assert(Array.isArray(out[key])&&out[key].length<=100&&out[key].every(v=>typeof v==='string'&&v.length<=200),'INVALID_PARAMS',`Invalid ${key}.`);
  if(out.titleKeyword!==undefined)assert(typeof out.titleKeyword==='string'&&out.titleKeyword.trim().length>=2&&out.titleKeyword.length<=200,'INVALID_PARAMS','A title keyword must contain 2–200 UTF-16 units.');
  if(out.tagMode!==undefined)assert(['all','any'].includes(out.tagMode),'INVALID_PARAMS','tagMode must be all or any.');
  if(out.kind!==undefined)assert(['note','excerpt'].includes(out.kind),'INVALID_PARAMS','Unknown card kind.');
  for(const key of ['inMap','favorite','reviewEnabled','hasImage'])if(out[key]!==undefined)assert(typeof out[key]==='boolean','INVALID_PARAMS',`Invalid ${key}.`);
  for(const key of ['any','all'])if(out[key]!==undefined){assert(Array.isArray(out[key])&&out[key].length>0&&out[key].length<=20,'INVALID_PARAMS','A compound filter needs 1–20 conditions.');out[key]=out[key].map(f=>checkedFilter(f,depth+1));}
  if(out.not!==undefined)out.not=checkedFilter(out.not,depth+1);
  return out;
}
function matches(card, f) {
  const values = [card.title,card.text,card.editedText,card.note,...(card.tags||[]),...(card.comments||[]).filter(c=>!c.deletedAt).map(c=>c.text||'')].join('\n').toLocaleLowerCase();
  if(f.query&&!values.includes(f.query.toLocaleLowerCase()))return false;
  if(f.titleKeyword&&!Keywords.terms(card.title).some(t=>t.toLocaleLowerCase()===f.titleKeyword.trim().toLocaleLowerCase()))return false;
  if(f.tags?.length&&!(f.tagMode==='any'?f.tags.some(t=>card.tags?.includes(t)):f.tags.every(t=>card.tags?.includes(t))))return false;
  if(f.colors?.length&&!f.colors.includes(card.color))return false;
  if(f.documentIds?.length&&!f.documentIds.includes(card.source?.documentId||card.anchor?.documentId))return false;
  if(f.kind&&(card.source?'excerpt':'note')!==f.kind)return false;
  if(f.inMap!==undefined&&(card.inMap!==false)!==f.inMap)return false;
  if(f.favorite!==undefined&&Boolean(card.favorite)!==f.favorite)return false;
  if(f.reviewEnabled!==undefined&&Boolean(card.review?.enabled)!==f.reviewEnabled)return false;
  if(f.hasImage!==undefined&&Boolean(card.image)!==f.hasImage)return false;
  if(f.createdAfter&&Date.parse(card.createdAt)<Date.parse(f.createdAfter))return false;
  if(f.createdBefore&&Date.parse(card.createdAt)>Date.parse(f.createdBefore))return false;
  return (!f.any||f.any.some(v=>matches(card,v)))&&(!f.all||f.all.every(v=>matches(card,v)))&&(!f.not||!matches(card,f.not));
}
function sorted(cards, sort='outline', direction='asc') {
  const get={title:c=>c.title.toLocaleLowerCase(),created:c=>c.createdAt||'',updated:c=>c.updatedAt||'',color:c=>c.color,source:c=>`${c.source?.path||''}:${String(c.source?.locator.page??c.source?.locator.section??0).padStart(10,'0')}:${c.source?.selection?.start??0}`};
  assert(sort==='outline'||Object.hasOwn(get,sort),'INVALID_PARAMS','Unknown sort.');
  const out=[...cards];if(sort!=='outline')out.sort((a,b)=>String(get[sort](a)).localeCompare(String(get[sort](b)))||a.id.localeCompare(b.id));
  if(direction==='desc')out.reverse();return out;
}
function grouped(state,set,cards,fields=[],depth=0) {
  if(depth>=fields.length)return cards.map(c=>c.id);
  const field=fields[depth],groups=new Map();
  for(const c of cards){let keys;
    if(field==='keyword')keys=Keywords.terms(c.title);
    else if(field==='tag')keys=c.tags?.length?c.tags:['未标记'];
    else if(field==='document')keys=[state.documents[c.source?.documentId||c.anchor?.documentId]?.title||'独立笔记'];
    else if(field==='chapter'){const doc=state.documents[c.source?.documentId],key=c.source?.locator.page??c.source?.locator.section??-1;const chapter=doc?.toc.filter(n=>(n.locator.page??n.locator.section??Infinity)<=key).at(-1);keys=[chapter?.title||'无目录'];}
    else if(field==='created'||field==='updated')keys=[String(c[field==='created'?'createdAt':'updatedAt']||'').slice(0,10)||'无日期'];
    else if(field==='kind')keys=[c.source?'摘录':'笔记'];
    else if(field==='inMap')keys=[c.inMap===false?'未加入脑图':'脑图内'];
    else keys=[c.color];
    if(!keys.length)keys=['无标题词条'];
    for(const key of keys){const index=field==='keyword'?key.toLocaleLowerCase():key;if(!groups.has(index))groups.set(index,{key,rows:[]});groups.get(index).rows.push(c);}
  }
  return [...groups.values()].map(({key,rows})=>({key,count:rows.length,children:grouped(state,set,rows,fields,depth+1)}));
}
async function query(store,p) {
  const state=await store.load(),set=M.findSet(state,p.setId),board=p.boardId?(set.boards||[]).find(b=>b.id===p.boardId):null;
  if(p.boardId)assert(board,'NOT_FOUND','Saved card board does not exist.');
  const filter=checkedFilter(p.filter||board?.filter||{}),groupBy=p.groupBy||board?.groupBy||[];
  assert(Array.isArray(groupBy)&&groupBy.length<=2&&groupBy.every(k=>['color','tag','keyword','document','chapter','created','updated','kind','inMap'].includes(k)),'INVALID_PARAMS','Choose at most two supported grouping fields.');
  const cards=sorted(set.cards.map(c=>M.effective(state,set,c)).filter(c=>matches(c,filter)),p.sort||board?.sort||'outline',p.direction||'asc');
  Keywords.grouping([set],cards,groupBy);
  const offset=p.offset||0,limit=p.limit||200;
  const described=await M.describe(store,state,{...set,cards:cards.slice(offset,offset+limit)});
  return {setId:set.id,revision:set.revision,total:cards.length,cards:described.cards,groups:grouped(state,set,cards,groupBy),nextOffset:offset+limit<cards.length?offset+limit:null};
}
function checkedStyle(patch) {
  plain(patch,'Card style must be an object.');const result={...patch};
  const allowed=['fontFamily','fontSize','fontScale','bold','background','width','height','branchStyle','titleOnly','uppercase','showLinks','compact'];
  assert(Object.keys(result).every(k=>allowed.includes(k)),'INVALID_PARAMS','Unknown card style property.');
  if(result.fontFamily!==undefined)assert(typeof result.fontFamily==='string'&&/^[\p{L}\p{N} _.,-]{1,100}$/u.test(result.fontFamily),'INVALID_PARAMS','Choose a valid local font family name.');
  for(const [key,min,max] of [['fontSize',10,36],['width',160,800],['height',100,1000],['fontScale',.5,2]])if(result[key]!==undefined)assert(Number.isFinite(result[key])&&result[key]>=min&&result[key]<=max,'INVALID_PARAMS',`${key} outside allowed range.`);
  for(const key of ['bold','titleOnly','uppercase','showLinks','compact'])if(result[key]!==undefined)assert(typeof result[key]==='boolean','INVALID_PARAMS',`${key} must be boolean.`);
  if(result.background!==undefined)assert(/^#[\da-f]{6}$/i.test(result.background),'INVALID_PARAMS','Use a six-digit hexadecimal background.');
  if(result.branchStyle!==undefined)assert(STYLES.includes(result.branchStyle),'INVALID_PARAMS','Unknown branch style.');
  return result;
}
function organizeByDocument(state,set,cardIds,byToc) {
  const cards=selected(set,cardIds),docs=new Map();
  for(const c of cards)if(c.source){if(!docs.has(c.source.documentId))docs.set(c.source.documentId,[]);docs.get(c.source.documentId).push(c);}
  for(const [id,rows] of docs){
    const doc=findDocument(state,id);let root=set.cards.find(c=>c.outlineSource?.documentId===id&&c.outlineSource.nodeId===null);
    if(!root){root=note(set,doc.title);root.outlineSource={documentId:id,nodeId:null};}
    const map=new Map();
    if(byToc){assert(doc.toc.length<=1000,'TOO_LARGE','Choose a document with at most 1000 outline nodes for this operation.');
      for(const chapter of doc.toc){let n=set.cards.find(c=>c.outlineSource?.documentId===id&&c.outlineSource.nodeId===chapter.id);
        if(!n){n=note(set,chapter.title);n.outlineSource={documentId:id,nodeId:chapter.id};n.anchor={documentId:id,sourceHash:doc.hash,locator:chapter.locator,display:'collapsed'};}
        n.parentId=map.get(chapter.parentId)?.id||root.id;map.set(chapter.id,n);
      }
    }
    for(const card of rows){const position=card.source.locator.page??card.source.locator.section;let parent=root;
      if(byToc){let best=-1;for(const chapter of doc.toc){const page=chapter.locator.page??chapter.locator.section;if(page<=position&&page>=best){best=page;parent=map.get(chapter.id);}}}
      card.parentId=parent.id;card.inMap=true;delete card.position;
    }
  }
  set.cards=M.order(set.cards);
}
async function request(store,state,set,method,p,rollback) {
  if(method==='study.cards.batch'){
    const cards=selected(set,p.cardIds,p.descendants===true),ids=new Set(cards.map(c=>c.id));
    const allowed=['color','tags','addTags','removeTags','favorite','collapsed','inMap','annotationVisible','editedText','style'];plain(p.patch,'Batch patch must be an object.');assert(Object.keys(p.patch).length&&Object.keys(p.patch).every(k=>allowed.includes(k)),'INVALID_PARAMS','Unknown or empty card patch.');
    for(const c of cards)if(c.anchor?.layerId)require('./study-advanced.cjs').editable(set,c.anchor.layerId);
    const patch=p.patch;if(patch.color!==undefined)M.color(patch.color);
    for(const key of ['tags','addTags','removeTags'])if(patch[key]!==undefined)M.tags(patch[key]);
    for(const key of ['favorite','collapsed','inMap','annotationVisible'])if(patch[key]!==undefined)assert(typeof patch[key]==='boolean','INVALID_PARAMS',`${key} must be boolean.`);
    if(patch.editedText!==undefined)assert(cards.length===1&&typeof patch.editedText==='string'&&patch.editedText.length<=20000,'INVALID_PARAMS','Edit one card body of at most 20000 characters.');
    const style=patch.style===undefined?null:checkedStyle(patch.style);
    const byId=new Map(set.cards.map(c=>[c.id,c]));
    if(patch.inMap===false)for(const c of selected(set,p.cardIds,true))c.inMap=false;
    if(patch.inMap===true){const visited=new Set();for(const c of cards){let parent=c.parentId;while(parent&&!visited.has(parent)){visited.add(parent);const ancestor=byId.get(parent);assert(ancestor,'INVALID_OUTLINE','Missing parent.');ancestor.inMap=true;parent=ancestor.parentId;}}}
    for(const card of cards){
      if(patch.color!==undefined)card.color=patch.color;
      if(patch.tags)card.tags=M.tags(patch.tags);
      if(patch.addTags)card.tags=M.tags([...new Set([...(card.tags||[]),...patch.addTags])]);
      if(patch.removeTags)card.tags=(card.tags||[]).filter(t=>!patch.removeTags.includes(t));
      for(const key of ['favorite','collapsed','inMap','editedText'])if(patch[key]!==undefined)card[key]=patch[key];
      if(patch.annotationVisible!==undefined&&card.source)card.annotation={...card.annotation,visible:patch.annotationVisible};
      if(style)card.style={...card.style,...style};card.updatedAt=new Date().toISOString();
    }
    return;
  }
  if(method==='study.cards.copy'){
    const initial=selected(set,p.cardIds,p.descendants!==false),cards=p.descendants!==false?require('./mindmap-items.cjs').expand(set,initial):initial,target=p.targetSetId?M.findSet(state,p.targetSetId):set,summaryRoots=require('./mindmap-items.cjs').summaryRoots(set);
    if(target!==set){M.revision(target,p.targetRevision);history.checkpoint(target);}
    assert(target.cards.length+cards.length<=10000,'TOO_LARGE','Destination card capacity exceeded.');
    if(p.parentId)M.card(target,p.parentId);
    const remap=new Map(cards.map(c=>[c.id,randomUUID()])),copies=cards.map(c=>{const x=structuredClone(c);x.id=remap.get(c.id);x.parentId=summaryRoots.has(c.id)?null:remap.get(c.parentId)||p.parentId||null;delete x.captureId;delete x.fingerprint;delete x.position;
      if(x.mergedIds)x.mergedIds=x.mergedIds.map(id=>remap.get(id)||id);if(x.summaryIds)x.summaryIds=x.summaryIds.map(id=>remap.get(id)||id);
      if(x.splitIds)x.splitIds=x.splitIds.map(id=>remap.get(id)||id);
      if(x.reference?.setId===set.id&&remap.has(x.reference.cardId))x.reference={...x.reference,setId:target.id,cardId:remap.get(x.reference.cardId)};
      if(x.review&&!p.keepSchedule)x.review=require('./study-review.cjs').copyConfiguration?.(x.review)||{...x.review,enabled:false,logs:[],schedule:undefined};
      x.createdAt=x.updatedAt=new Date().toISOString();return x;});
    for(let i=0;i<copies.length;i++)if(copies[i].image&&!copies[i].mediaId){await store.mkdir(`study-assets/${target.id}`);const bytes=await readBounded(await store.meta(`study-assets/${set.id}/${cards[i].image.fileKey||cards[i].id}.png`),8*1024*1024),file=await store.meta(`study-assets/${target.id}/${copies[i].id}.png`);await writeNew(file,bytes);rollback(()=>fs.rm(file,{force:true}));copies[i].image.fileKey=copies[i].id;}
    if(target.id!==set.id)for(const copy of copies)for(const part of copy.excerpts||[]){const old=part.image.fileKey||part.id;const bytes=await readBounded(await store.meta(`study-assets/${set.id}/${old}.png`),8*1024*1024),key=randomUUID();await store.mkdir(`study-assets/${target.id}`);const file=await store.meta(`study-assets/${target.id}/${key}.png`);await writeNew(file,bytes);rollback(()=>fs.rm(file,{force:true}));part.image.fileKey=key;}
    await require('./study-media.cjs').cloneAssets(store,set,target,copies,rollback);
    if(target!==set)require('./study-clipboard.cjs').layers(set,target,copies);
    if(target!==set)require('./study-notebooks.cjs').cloneDefinitions(set,target,copies);
    target.cards.push(...copies);target.cards=M.order(target.cards);target.documentIds=[...new Set([...target.documentIds,...copies.flatMap(c=>[c.source?.documentId,c.anchor?.documentId,...(c.excerpts||[]).map(p=>p.source.documentId)]).filter(Boolean)])];
    assert(target.documentIds.length<=10000,'TOO_LARGE','Destination document capacity exceeded.');
    target.links??=[];for(const l of [...(set.links||[])])if(remap.has(l.from)&&remap.has(l.to)&&(!l.toSetId||l.toSetId===set.id)){const copy={...l,id:randomUUID(),from:remap.get(l.from),to:remap.get(l.to)};delete copy.toSetId;target.links.push(copy);}
    require('./mindmap-items.cjs').copy(set,target,remap);
    if(target!==set)M.touch(target);
    set.lastCopy={setId:target.id,cardIds:copies.map(c=>c.id)};return;
  }
  if(method==='study.cards.organize'){organizeByDocument(state,set,p.cardIds,p.by==='toc');return;}
  if(method==='study.card.position'){
    const card=M.card(set,p.cardId);assert(!card.parentId||set.cards.find(c=>c.id===card.parentId)?.submap,'INVALID_PARAMS','Only root cards or direct submap children can be freely positioned.');
    card.position=p.reset?null:{x:p.x,y:p.y};return;
  }
  if(method==='study.cards.sort'){
    if(p.parentId)M.card(set,p.parentId);const siblings=sorted(set.cards.filter(c=>c.parentId===(p.parentId||null)),p.by,p.direction||'asc'),rank=new Map(siblings.map((c,i)=>[c.id,i]));
    const rest=set.cards.filter(c=>!rank.has(c.id));set.cards=M.order([...rest,...siblings]);return;
  }
  if(method==='study.submap.configure'){
    const c=M.card(set,p.cardId);if(p.enabled!==undefined)c.submap=p.enabled;
    if(p.title!==undefined)c.title=M.title(p.title);if(p.enabled===false&&set.map?.submapId===c.id)set.map.submapId=null;
    if(p.open){assert(c.submap,'INVALID_PARAMS','Convert this branch to a submap first.');set.map={...set.map,submapId:c.id,focusId:null};}
    return;
  }
  if(method==='study.submap.open'){
    if(p.cardId!==null)assert(M.card(set,p.cardId).submap,'INVALID_PARAMS','Card is not a submap.');set.map={...set.map,submapId:p.cardId,focusId:null};return;
  }
  if(method==='study.summary.create'){
    assert((p.text||'').length<=20000,'INVALID_PARAMS','Summary exceeds 20000 characters.');const cards=selected(set,p.cardIds),summary=note(set,p.title,p.text||'');summary.summaryIds=cards.map(c=>c.id);
    set.links??=[];for(const card of cards)set.links.push({id:randomUUID(),from:card.id,to:summary.id,label:'概要',bidirectional:false});return;
  }
  if(method==='study.card.split'){
    const card=M.card(set,p.cardId),body=card.editedText??card.text;assert(typeof body==='string'&&body.length,'INVALID_PARAMS','Choose a card with text.');
    assert(Array.isArray(p.offsets)&&p.offsets.length>0&&p.offsets.length<=100&&p.offsets.every(n=>Number.isInteger(n)&&n>0&&n<body.length),'INVALID_PARAMS','Split offsets must be inside the card text.');
    assert(p.offsets.every(at=>!(body.charCodeAt(at-1)>=0xd800&&body.charCodeAt(at-1)<=0xdbff&&body.charCodeAt(at)>=0xdc00&&body.charCodeAt(at)<=0xdfff)),'INVALID_PARAMS','A split must not break a Unicode character.');
    const offsets=[0,...new Set([...p.offsets].sort((a,b)=>a-b)),body.length];
    const pieces=[];for(let i=1;i<offsets.length;i++){const text=body.slice(offsets[i-1],offsets[i]).trim();if(!text)continue;const n=note(set,text.slice(0,100),text);n.parentId=card.id;n.tags=[...(card.tags||[])];n.color=card.color;n.reference=card.source?{setId:set.id,cardId:card.id,live:false}:undefined;pieces.push(n.id);}
    card.splitIds=pieces;set.cards=M.order(set.cards);return;
  }
  if(method==='study.board.save'){
    set.boards??=[];assert(set.boards.length<100||p.boardId,'TOO_LARGE','Board capacity exceeded.');
    let board=p.boardId?set.boards.find(b=>b.id===p.boardId):null;if(p.boardId)assert(board,'NOT_FOUND','Board not found.');
    const fields=p.groupBy||[];assert(fields.length<=2&&fields.every(k=>['color','tag','keyword','document','chapter','created','updated','kind','inMap'].includes(k)),'INVALID_PARAMS','Unsupported board groups.');
    Keywords.grouping([set],[],fields);
    const value={id:board?.id||randomUUID(),title:M.title(p.title),filter:checkedFilter(p.filter||{}),groupBy:fields,sort:p.sort||'outline'};sorted([],value.sort);
    if(board)Object.assign(board,value);else set.boards.push(value);return;
  }
  if(method==='study.board.remove'){assert(set.boards?.some(b=>b.id===p.boardId),'NOT_FOUND','Board not found.');set.boards=set.boards.filter(b=>b.id!==p.boardId);return;}
  if(method==='study.board.materialize'){
    const board=set.boards?.find(b=>b.id===p.boardId);assert(board,'NOT_FOUND','Board not found.');
    const rows=sorted(set.cards.filter(c=>matches(c,board.filter)),board.sort);assert(rows.length&&rows.length<=500,'TOO_LARGE','Choose a board with 1–500 matching cards.');
    Keywords.grouping([set],rows,board.groupBy);
    const root=note(set,p.title||board.title);root.boardSource=board.id;
    const levels=grouped(state,set,rows,board.groupBy);
    const add=(items,parentId)=>{for(const item of items){if(typeof item==='string'){const original=M.card(set,item),c=note(set,original.title,original.editedText??original.text);c.parentId=parentId;c.reference={setId:set.id,cardId:item};}else{const group=note(set,item.key);group.parentId=parentId;add(item.children,group.id);}}};add(levels,root.id);set.cards=M.order(set.cards);return;
  }
  if(method==='study.capture.settings'){
    if(p.parentId)M.card(set,p.parentId);
    if(p.deckId)assert(set.decks?.some(d=>d.id===p.deckId&&!d.deletedAt),'NOT_FOUND','Deck not found.');
    if(p.tags)M.tags(p.tags);if(p.color)M.color(p.color);
    const {setId,expectedRevision,...patch}=p;set.captureSettings={...set.captureSettings,...patch};return;
  }
  if(method==='study.appearance.set'){
    if(p.background)assert(/^#[0-9a-f]{6}$/i.test(p.background),'INVALID_PARAMS','Use #RRGGBB map background.');const style=p.cardStyle?checkedStyle(p.cardStyle):{};set.appearance={...set.appearance,...style,...(p.background?{mapBackground:p.background}:{}),...(p.paper?{paper:p.paper}:{}),...(p.inkBehind===undefined?{}:{inkBehind:p.inkBehind})};
    if(p.branchStyle)set.map={...set.map,branchStyle:p.branchStyle};return;
  }
  assert(false,'METHOD_NOT_FOUND','Unsupported organization operation.');
}
module.exports={request,query,grouped,checkedFilter,matches,sorted,selected,checkedStyle,organizeByDocument,STYLES};
