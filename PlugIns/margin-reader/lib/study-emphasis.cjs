'use strict';
const {assert,escapeHtml}=require('./safety.cjs');
const M=require('./study-model.cjs');
const fields=card=>({title:card.title,text:card.editedText??card.text??'',note:card.note||'',...Object.fromEntries((card.comments||[]).filter(c=>!c.deletedAt).map(c=>['comment:'+c.id,c.text||'']))});
const rect=r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=1.000001;
const group=g=>typeof g==='string'&&g.trim()&&g.length<=60;
function validate(value){
 assert(value&&Array.isArray(value.text)&&value.text.length<=200&&Array.isArray(value.images)&&value.images.length<=100,'INVALID_PARAMS','Use at most 200 text and 100 image emphasis marks.');
 for(const m of value.text)assert(m&&typeof m.field==='string'&&(['title','text','note'].includes(m.field)||m.field.startsWith('comment:')&&M.UUID.test(m.field.slice(8)))&&Number.isInteger(m.start)&&Number.isInteger(m.end)&&m.start>=0&&m.end>m.start&&typeof m.quote==='string'&&m.quote.length===m.end-m.start&&group(m.group),'INVALID_PARAMS','Invalid text emphasis range or group name.');
 for(const m of value.images)assert(rect(m)&&group(m.group),'INVALID_PARAMS','Invalid image emphasis or group name.');
 const ordered=[...value.text].sort((a,b)=>a.field.localeCompare(b.field)||a.start-b.start);
 for(let i=1;i<ordered.length;i++)assert(ordered[i].field!==ordered[i-1].field||ordered[i].start>=ordered[i-1].end,'INVALID_PARAMS','Text emphasis ranges cannot overlap.');
}
function active(card){const all=fields(card);return (card.emphasis?.text||[]).filter(m=>all[m.field]?.slice(m.start,m.end)===m.quote);}
function update(state,set,p){
 const card=M.card(set,p.cardId),all=fields(M.effective(state,set,card));
 const value={text:p.text??card.emphasis?.text??[],images:p.images??card.emphasis?.images??[]};validate(value);
 for(const m of value.text)assert(all[m.field]?.slice(m.start,m.end)===m.quote,'SOURCE_CHANGED','Emphasized text changed. Select the current text again.');
 assert(!value.images.length||card.image||card.reference,'INVALID_PARAMS','Image emphasis requires a card image.');
 card.emphasis=structuredClone(value);card.updatedAt=new Date().toISOString();
}
// Insert markup before Markdown rendering so selections retain their original UTF-16 offsets.
function marked(card,field,text){let out='',at=0;for(const m of active(card).filter(m=>m.field===field).sort((a,b)=>a.start-b.start)){out+=text.slice(at,m.start)+'<mark>'+escapeHtml(m.quote)+'</mark>';at=m.end;}return out+text.slice(at);}
function intersection(a,b){const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),right=Math.min(a.x+a.width,b.x+b.width),bottom=Math.min(a.y+a.height,b.y+b.height);return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;}
function bounds(stroke,aspect=1){const xs=stroke.points.map(p=>p[0]),ys=stroke.points.map(p=>p[1]),pad=stroke.width/2;return {x:Math.min(...xs)-pad,y:Math.min(...ys)-pad*aspect,width:Math.max(...xs)-Math.min(...xs)+2*pad,height:Math.max(...ys)-Math.min(...ys)+2*pad*aspect};}
function prepare(state,set,raw,rules={}){
 assert(rules&&typeof rules==='object'&&!Array.isArray(rules)&&Object.entries(rules).every(([k,v])=>['documentHighlighter','cardHighlighter','textEmphasis','imageEmphasis'].includes(k)&&typeof v==='boolean'),'INVALID_PARAMS','Choose boolean masking rules.');
 const card=M.effective(state,set,raw);assert(card.referenceAvailable!==false,'INVALID_REFERENCE','The referenced card is unavailable. Restore its source before reviewing.');const all=fields(card),enabled={documentHighlighter:true,cardHighlighter:true,textEmphasis:true,imageEmphasis:true,...rules},visible=s=>!s.hidden&&require('./study-advanced.cjs').layers(set).some(l=>l.id===(s.layerId||'default')&&l.visible&&!l.deletedAt);
 const text=enabled.textEmphasis?active(card):[],images=enabled.imageEmphasis?card.emphasis?.images||[]:[],masks=images.map(m=>({...m})),warnings=[];
 if(enabled.textEmphasis&&(card.emphasis?.text||[]).length!==text.length)warnings.push('文字已修改：失效的强调标记未用于出题，请重新选择。');
 if(enabled.cardHighlighter){for(const s of card.ink||[])if(s.brush==='highlighter'&&visible(s)&&s.reviewSide!=='front'){
   if(require('./image-ink.cjs').bound(s)){const box=intersection(bounds(require('./image-ink.cjs').project(s),card.image.width/card.image.height),{x:0,y:0,width:1,height:1});if(box)masks.push({...box,group:'1'});continue;}
   if(!s.imageBounds){warnings.push('旧卡片荧光笔缺少图片坐标映射；请重新标记图片区域。');continue;}const b=intersection(bounds(s,s.aspectRatio||1),s.imageBounds),f=s.imageBounds;if(b&&card.image)masks.push({x:(b.x-f.x)/f.width,y:(b.y-f.y)/f.height,width:b.width/f.width,height:b.height/f.height,group:'1'});
 }if(!card.image&&(card.ink||[]).some(s=>s.brush==='highlighter'&&visible(s)))warnings.push('文字卡片上的手写荧光笔尚无固定图片坐标；请使用文字强调出题。');}
 if(enabled.documentHighlighter&&card.source){
  const ink=(set.ink||[]).filter(s=>s.brush==='highlighter'&&visible(s)&&require('./study-notebooks.cjs').visible(set,s));
  if(ink.some(s=>s.documentId===card.source.documentId)&&!card.image?.fragments?.length)warnings.push('此旧摘录未保存原页到图片的坐标映射；重新摘录后可遮挡文档荧光笔。');
  for(const f of card.image?.fragments||[])for(const s of ink.filter(s=>s.page===f.page&&s.documentId===(f.documentId||card.source.documentId)&&s.sourceHash===(f.sourceHash||card.source.hash)&&(s.notebookId||'default')===(f.notebookId||card.source.notebookId||'default'))){
   const b=intersection(bounds(s,f.aspect),f.source);if(!b)continue;
   masks.push({x:f.image.x+(b.x-f.source.x)/f.source.width*f.image.width,y:f.image.y+(b.y-f.source.y)/f.source.height*f.image.height,width:b.width/f.source.width*f.image.width,height:b.height/f.source.height*f.image.height,group:'1'});
  }
 }
 assert(text.length||masks.length,'NO_EMPHASIS',[...new Set(warnings)].join(' ')||'No selected emphasis or visible highlighter marks were found.');
 assert(masks.length<=100,'TOO_LARGE','At most 100 image masks can be generated per card.');
 const names=[...new Set([...text,...masks].map(m=>m.group))].sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));assert(names.length<=100,'TOO_LARGE','Use at most 100 emphasis groups.');
 const number=g=>names.indexOf(g)+1,parts=[];
 for(const field of Object.keys(all)){const marks=text.filter(m=>m.field===field).sort((a,b)=>a.start-b.start);if(!marks.length)continue;let content='',at=0;
  for(const m of marks){assert(!/[{}]|::/.test(m.quote),'INVALID_PARAMS','This emphasis contains cloze delimiters; use a custom question for this selection.');content+=all[field].slice(at,m.start)+`{{c${number(m.group)}::${m.quote}}}`;at=m.end;}parts.push(content+all[field].slice(at));
 }
 const cloze=parts.join('\n\n');if(cloze)require('./cloze.cjs').parse(cloze);
 return {cloze,front:card.title,frontMode:'custom',backMode:'card',occlusions:masks.map(m=>intersection(m,{x:0,y:0,width:1,height:1})),occlusionGroups:masks.map(m=>number(m.group)),groupNames:Object.fromEntries(names.map((name,i)=>[i+1,name])),warnings:[...new Set(warnings)]};
}
function generate(state,set,p){
 const selected=p.cardIds?require('./study-organize.cjs').selected(set,p.cardIds,p.descendants===true):set.cards;
 assert(selected.length,'INVALID_PARAMS','Select cards to generate review questions.');
 const prepared=[],skipped=[];for(const card of selected){try{prepared.push({card,...prepare(state,set,card,p.rules)});}catch(error){if(error.code!=='NO_EMPHASIS')throw error;skipped.push({cardId:card.id,message:error.message});}}
 assert(prepared.length,'NO_EMPHASIS',skipped.map(s=>s.message).join(' '));
 for(const {card,warnings,...params} of prepared){require('./study-review.cjs').configure(card,{...params,enabled:true,revealMode:'sequential'},set,state.settings,{preserveGeneration:true});if(p.autoUpdate===false)delete card.review.generation;else card.review.generation={rules:{...p.rules},status:'ready',warnings};}
 set.lastReviewBatch={count:prepared.length,cardIds:prepared.map(p=>p.card.id),skipped,warnings:prepared.flatMap(p=>p.warnings.map(message=>({cardId:p.card.id,message})))};
}
// Generated questions are derived from the same committed source state. The
// transaction hook covers CLI, imports, ink tools, notebook moves and undo alike.
const generationKey=r=>JSON.stringify([r.cloze||'',r.cloze?'':r.front,r.frontMode,r.backMode,r.revealMode,r.occlusions||[],r.occlusionGroups||[],r.groupNames||{}]);
function refreshGenerated(state,revisions){
 const changed=new Set(Object.values(state.studySets).filter(s=>revisions.get(s.id)!==s.revision).map(s=>s.id));if(!changed.size)return;
 for(const set of Object.values(state.studySets)){
  if(set.deletedAt)continue;let updated=false;
  for(const card of set.cards){
   const generation=card.review?.generation;if(!generation||!changed.has(set.id)&&!card.reference)continue;
   let params,status='ready',warnings=[];
   try{({warnings,...params}=prepare(state,set,card,generation.rules));}
   catch(error){if(!['NO_EMPHASIS','INVALID_PARAMS','TOO_LARGE','INVALID_REFERENCE'].includes(error.code))throw error;status=error.code==='NO_EMPHASIS'?'empty':'invalid';warnings=[error.message];params={cloze:'',front:card.title,frontMode:'custom',backMode:'card',occlusions:[],occlusionGroups:[],groupNames:{}};}
   params.revealMode='sequential';const next={rules:generation.rules,status,warnings:[...new Set(warnings)]},questionChanged=generationKey(card.review)!==generationKey(params);
   if(questionChanged)require('./study-review.cjs').configure(card,{...params,enabled:card.review.enabled},set,state.settings,{preserveGeneration:true});
   if(questionChanged||JSON.stringify(generation)!==JSON.stringify(next)){card.review.generation=next;card.updatedAt=new Date().toISOString();updated=true;}
  }
  // A source in another study may have changed a live referenced question.
  if(updated&&!changed.has(set.id))M.touch(set);
 }
}
module.exports={rect,fields,validate,active,marked,update,prepare,generate,refreshGenerated};
