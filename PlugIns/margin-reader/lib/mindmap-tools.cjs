'use strict';
const S=require('./safety.cjs'),M=require('./study-model.cjs'),V=require('./mindmap-model.cjs');
const methods=new Set(['study.mindmap.query','study.mindmap.replace','study.mindmap.outline.import']);
function queryCards(state,set,p){
 const filter=p.filter||{},allowed=['query','priority','status','symbol','progressMin','progressMax','hasNote','hasImage','dueBefore','rootId'];S.assert(filter&&typeof filter==='object'&&!Array.isArray(filter)&&Object.keys(filter).every(k=>allowed.includes(k)),'INVALID_PARAMS','Unknown topic filter.');
 for(const k of ['priority','status','symbol'])if(filter[k]!==undefined)V.topic({[k]:filter[k]},'');
 for(const k of ['progressMin','progressMax'])if(filter[k]!==undefined)V.topic({progress:filter[k]},'');
 if(filter.dueBefore)V.topic({task:{due:filter.dueBefore}},'');
 for(const k of ['hasNote','hasImage'])if(filter[k]!==undefined)S.assert(typeof filter[k]==='boolean','INVALID_PARAMS','Boolean filter required.');
 const ids=filter.rootId?M.subtree(set.cards,M.card(set,filter.rootId).id):null;
 const query=(filter.query||'');S.assert(typeof query==='string'&&query.length<=1000,'INVALID_PARAMS','Search query is limited to 1000 characters.');const text=query.toLocaleLowerCase();
 return set.cards.map(c=>M.effective(state,set,require('./study-media.cjs').describeCard(set,c))).filter(c=>{
  const v=c.mindmap||{},progress=v.progress??0;
  return(!ids||ids.has(c.id))&&(!text||[c.title,c.editedText??c.text,c.note,...(c.tags||[])].join('\n').toLocaleLowerCase().includes(text))&&['priority','status','symbol'].every(k=>filter[k]===undefined||(v[k]??(k==='priority'?0:k==='status'?'none':null))===filter[k])&&(filter.progressMin===undefined||progress>=filter.progressMin)&&(filter.progressMax===undefined||progress<=filter.progressMax)&&(filter.hasNote===undefined||Boolean(c.note)===filter.hasNote)&&(filter.hasImage===undefined||Boolean(c.image)===filter.hasImage)&&(!filter.dueBefore||v.task?.due&&v.task.due<=filter.dueBefore);
 });
}
function replacements(state,set,p){
 S.assert(p.query&&p.query.trim()&&p.query.length<=1000,'INVALID_PARAMS','Find text must have 1–1000 characters.');S.assert(typeof p.replacement==='string'&&p.replacement.length<=20000,'INVALID_PARAMS','Replacement is too long.');
 const field=p.field||'title';S.assert(['title','note','display'].includes(field),'INVALID_PARAMS','Replace title, note or display text.');
 const rx=new RegExp(p.query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),p.caseSensitive?'gu':'giu'),rows=p.cardIds?require('./study-organize.cjs').selected(set,p.cardIds):set.cards,changes=[];
 for(const card of rows){const key=field==='display'?(card.source||card.editedText!==undefined?'editedText':'text'):field,before=String(card[key]??(key==='editedText'?card.text:'')??'');let matches=0;const after=before.replace(rx,()=>{matches++;return p.replacement;});
  if(!matches||after===before)continue;S.assert(!card.reference,'INVALID_PARAMS','A live reference must be edited in its original study.');if(field==='title')M.title(after);else S.assert(after.length<=20000,'INVALID_PARAMS','Replacement exceeds note length limit.');changes.push({cardId:card.id,key,field,before,after,matches});
 }
 S.assert(Buffer.byteLength(JSON.stringify(changes))<=32*1024*1024,'TOO_LARGE','Replacement preview exceeds 32 MiB; select fewer topics.');return changes;
}
function outlineRows(text){
 S.assert(typeof text==='string'&&Buffer.byteLength(text)<=1024*1024,'TOO_LARGE','Outline text is limited to 1 MiB.');
 const rows=[];let last=-1;
 for(const raw of text.replaceAll('\r','').split('\n')){
  if(!raw.trim())continue;const heading=/^(#{1,6})\s+(.+)$/.exec(raw),bullet=/^(\s*)(?:[-*+]\s+|\d+[.)]\s+)?(.+)$/.exec(raw);let level,title;
  if(heading){level=heading[1].length-1;title=heading[2].trim();}else{level=Math.floor(bullet[1].replaceAll('\t','  ').length/2);title=bullet[2].trim();}
  if(!rows.length)level=0;S.assert(level<=last+1&&level<64,'INVALID_PARAMS','Indentation may increase one level at a time.');M.title(title);rows.push({level,title});last=level;
  S.assert(rows.length<=10000,'TOO_LARGE','At most 10000 outline topics.');
 }
 S.assert(rows.length,'INVALID_PARAMS','The outline is empty.');return rows;
}
async function request(store,method,p){
 if(method==='study.mindmap.query'){const state=await store.load(),set=M.findSet(state,p.setId),rows=queryCards(state,set,p),offset=p.offset??0,limit=p.limit??100;return{revision:set.revision,total:rows.length,offset,limit,nextOffset:offset+limit<rows.length?offset+limit:null,cards:rows.slice(offset,offset+limit).map(c=>({id:c.id,title:c.title,text:c.editedText??c.text,note:c.note,tags:c.tags,mindmap:c.mindmap||{},sourceDocumentId:c.source?.documentId||c.anchor?.documentId||null,hasImage:Boolean(c.image)}))};}
 if(method==='study.mindmap.replace'&&p.apply!==true){const state=await store.load(),set=M.findSet(state,p.setId);M.revision(set,p.expectedRevision);const changes=replacements(state,set,p);return {applied:false,revision:set.revision,matches:changes.reduce((n,c)=>n+c.matches,0),changes};}
 const id=await store.transaction(async state=>{
  const set=M.findSet(state,p.setId);M.revision(set,p.expectedRevision);require('./study-history.cjs').checkpoint(set);
  if(method==='study.mindmap.replace'){
   const changes=replacements(state,set,p);for(const c of changes){require('./study-notebooks.cjs').guard(set,'study.mindmap.replace',{cardIds:[c.cardId]});const card=M.card(set,c.cardId);card[c.key]=c.after;if(c.key==='title'&&card.mindmap)delete card.mindmap.runs;card.updatedAt=new Date().toISOString();}set.lastMindmapReplace={cards:changes.length,matches:changes.reduce((n,c)=>n+c.matches,0)};
  }else if(method==='study.mindmap.outline.import'){
   const rows=outlineRows(p.text);S.assert(set.cards.length+rows.length<=10000,'TOO_LARGE','Study topic limit reached.');if(p.parentId){M.card(set,p.parentId);require('./study-notebooks.cjs').guard(set,'study.mindmap.outline.import',{cardIds:[p.parentId]});}
   const stack=[],created=[];for(const r of rows){const c=require('./study-advanced.cjs').note(set,r.title);c.parentId=r.level?stack[r.level-1]:p.parentId||null;stack[r.level]=c.id;stack.length=r.level+1;created.push(c.id);}set.cards=M.order(set.cards);set.map??={};set.map.mindmap={...set.map.mindmap,enabled:true};set.lastInsertedCard=created[0];set.lastMindmapOutline={count:created.length,rootIds:created.filter((_id,index)=>rows[index].level===0)};
  }else S.fail('METHOD_NOT_FOUND','Unknown mind-map tool.');M.touch(set);return set.id;
 });
 const state=await store.load(),set=M.findSet(state,id);return {...await M.describe(store,state,set),lastMindmapReplace:set.lastMindmapReplace||null,lastMindmapOutline:set.lastMindmapOutline||null};
}
module.exports={methods,request,queryCards,replacements,outlineRows};
