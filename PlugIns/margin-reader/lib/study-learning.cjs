'use strict';
const {randomUUID,createHash}=require('node:crypto');
const M=require('./study-model.cjs'),R=require('./study-review.cjs'),O=require('./study-organize.cjs'),H=require('./study-history.cjs');
const {assert}=require('./safety.cjs');
const writes=new Set(['study.review.batch','study.review.session.start','study.review.session.action','study.recall.set','study.recall.reveal','study.presentation.start','study.presentation.action']);
const reads=new Set(['study.review.session.get','study.review.log']);
function cards(state,set,p){
  let rows=p.cardIds?O.selected(set,p.cardIds,p.descendants===true):set.cards;
  if(p.filter){const filter=O.checkedFilter(p.filter);rows=rows.filter(c=>O.matches(M.effective(state,set,c),filter));}
  return rows;
}
function session(set){const s=set.reviewSession;assert(s&&s.id,'NOT_FOUND','Start a review session first.');return s;}
function sessionView(set,state){
  const s=set.reviewSession;if(!s?.id)return null;
  const entry=s.entries[s.index],card=entry&&set.cards.find(c=>c.id===entry.cardId);
  const variant=card&&R.variants(card).find(v=>v.id===entry.variantId);
  const value=card&&(state?M.effective(state,set,card):card),groups=value?require('./review-content.cjs').groupIds(value):[];
  const question=value&&R.question(value,variant,s.revealed?groups:s.revealedGroups||[],state?.settings);
  return {...s,total:s.entries.length,completed:Object.keys(s.answers||{}).length,
    current:entry?{...entry,available:Boolean(card&&variant&&R.available(card)),unavailableReason:card?.review?.generation?.status!=='ready'?card?.review?.generation?.warnings?.[0]||null:null,title:value?.title||'Card removed',front:question?.front||'',back:s.revealed?question?.back??'':null,occlusions:question?.occlusions||[],groups:question?.groups||[],revealedGroups:s.revealed?question?.groups||[]:(s.revealedGroups||[]),remainingGroups:s.revealed?[]:question?(question.groups||[]).filter(g=>!(s.revealedGroups||[]).includes(g)):[],answer:s.answers?.[entry.key]||null}:null};
}
function sortedEntries(set,rows,sort,seed){
  const rank=new Map(set.cards.map((c,i)=>[c.id,i])),card=id=>M.card(set,id);
  const digest=key=>createHash('sha256').update(seed+'/'+key).digest('hex');
  return [...rows].sort((a,b)=>{
    if(sort==='random')return digest(a.key).localeCompare(digest(b.key));
    if(sort==='due')return new Date(a.due||0)-new Date(b.due||0)||rank.get(a.cardId)-rank.get(b.cardId);
    if(sort==='title')return card(a.cardId).title.localeCompare(card(b.cardId).title)||a.key.localeCompare(b.key);
    if(sort==='created')return String(card(a.cardId).createdAt).localeCompare(String(card(b.cardId).createdAt))||a.key.localeCompare(b.key);
    if(sort==='source'){const order=O.sorted([card(a.cardId),card(b.cardId)],'source');return a.cardId===b.cardId?a.key.localeCompare(b.key):order[0].id===a.cardId?-1:1;}
    return rank.get(a.cardId)-rank.get(b.cardId)||a.key.localeCompare(b.key);
  });
}
async function read(store,method,p){
  const state=await store.load(),set=M.findSet(state,p.setId);
  if(method==='study.review.session.get')return {revision:set.revision,session:sessionView(set,state)};
  const rows=[];
  for(const card of p.cardId?[M.card(set,p.cardId)]:set.cards)for(const log of card.review?.logs||[])rows.push({...log,cardId:card.id,title:card.title});
  rows.sort((a,b)=>Date.parse(b.review)-Date.parse(a.review));const offset=p.offset||0,limit=p.limit||100;
  return {revision:set.revision,total:rows.length,logs:rows.slice(offset,offset+limit),nextOffset:offset+limit<rows.length?offset+limit:null};
}
function configureBatch(state,set,p){
  const rows=cards(state,set,p);assert(rows.length&&rows.length<=10000,'INVALID_PARAMS','Select one or more cards for batch review.');
  const patch=p.patch;assert(patch&&typeof patch==='object'&&!Array.isArray(patch)&&Object.keys(patch).length&&Object.keys(patch).every(k=>['enabled','deckId','frontTemplate','backTemplate','frontMode','backMode','revealMode','cloze','occlusions','occlusionGroups'].includes(k)),'INVALID_PARAMS','Unsupported batch-review patch.');
  if(patch.enabled!==undefined)assert(typeof patch.enabled==='boolean','INVALID_PARAMS','enabled must be boolean.');
  for(const key of ['deckId','frontTemplate','backTemplate','frontMode','backMode','revealMode','cloze'])if(patch[key]!==undefined)assert(typeof patch[key]==='string'||key==='deckId'&&patch[key]===null,'INVALID_PARAMS',`Invalid ${key}.`);
  const template=(text,c)=>text.replace(/\{(title|text|note)\}/g,(_,key)=>key==='text'?c.editedText??c.text??'':c[key]||'');
  const preservedFronts=[];
  for(const card of rows){const effective=M.effective(state,set,card),params={enabled:patch.enabled??card.review?.enabled??true};
    for(const k of ['deckId','frontMode','backMode','revealMode','cloze','occlusions','occlusionGroups'])if(patch[k]!==undefined)params[k]=patch[k];
    if(patch.frontMode&&patch.frontMode!=='custom'&&patch.frontTemplate===undefined&&card.review&&!card.review.generation&&require('./review-content.cjs').modes(card).frontMode==='custom'){delete params.frontMode;preservedFronts.push(card.id);}
    if(patch.frontTemplate!==undefined)params.front=template(patch.frontTemplate,effective);
    if(patch.backTemplate!==undefined)params.back=template(patch.backTemplate,effective);
    R.configure(card,params,set,state.settings);card.updatedAt=new Date().toISOString();
  }
  set.lastReviewBatch={count:rows.length,cardIds:rows.map(c=>c.id),preservedFronts};
}
function startSession(state,set,p){
  if(p.deckId)assert(set.decks?.some(d=>d.id===p.deckId&&!d.deletedAt),'NOT_FOUND','Review deck does not exist.');
  const rows=cards(state,set,p),ids=new Set(rows.map(c=>c.id)),mode=p.mode||'scheduled';
  let entries=mode==='scheduled'?R.entries(set,{deckId:p.deckId||undefined,dueOnly:p.dueOnly!==false}).filter(e=>ids.has(e.cardId)):
    rows.filter(c=>R.available(c)&&(!p.deckId||c.review?.deckId===p.deckId)).flatMap(c=>R.variants(c).map(v=>({cardId:c.id,variantId:v.id,key:`${c.id}/${v.id}`,due:v.schedule?.due||null})));
  assert(entries.length<=10000,'TOO_LARGE','A review session supports at most 10000 questions. Narrow the selection.');
  const seed=p.seed||randomUUID(),sort=p.sort||'due';entries=sortedEntries(set,entries,sort,seed);
  if(p.direction==='desc')entries.reverse();if(p.limit)entries=entries.slice(0,p.limit);
  set.reviewSession={id:randomUUID(),mode,sort,seed,entries,index:0,revealed:false,revealedGroups:[],finished:entries.length===0,answers:{},startedAt:new Date().toISOString()};set.view='review';
}
function stepSession(set,p){
  const s=session(set),entry=s.entries[s.index];
  if(p.sessionId)assert(p.sessionId===s.id,'CONFLICT','This review session was replaced.');
  if(p.action==='finish'){s.finished=true;return;}
  if(p.action==='reveal'){
    assert(entry,'NOT_FOUND','This session has no current card.');const card=M.card(set,entry.cardId),variant=R.variants(card).find(v=>v.id===entry.variantId);assert(variant,'NOT_FOUND','Review question group no longer exists.');assert(R.available(card),'NO_EMPHASIS','This generated question has no current usable marks.');
    const groups=R.question(card,variant).groups;
    if(p.revealed===false){s.revealed=false;s.revealedGroups=[];}
    else if(p.revealed===true){s.revealed=true;s.revealedGroups=[...groups];}
    else{const visible=new Set(s.revealedGroups||[]),next=groups.find(id=>!visible.has(id));if(next)visible.add(next);s.revealedGroups=groups.filter(id=>visible.has(id));s.revealed=s.revealedGroups.length===groups.length;}
    return;
  }
  if(p.action==='grade'){
    assert(entry&&!s.finished,'INVALID_PARAMS','No active review question.');
    assert(s.revealed,'ANSWER_HIDDEN','Reveal the answer before grading.');
    assert(!Object.hasOwn(s.answers,entry.key),'ALREADY_REVIEWED','This question was already graded in this session. Undo the grade before changing it.');
    assert(['again','hard','good','easy'].includes(p.rating),'INVALID_PARAMS','Choose a valid recall rating.');
    const card=M.card(set,entry.cardId);assert(R.available(card),'NO_EMPHASIS','This generated question has no current usable marks.');assert(R.variants(card).some(v=>v.id===entry.variantId),'NOT_FOUND','Review question group no longer exists.');
    if(s.mode==='scheduled')R.grade(card,p.rating,set,entry.variantId);
    s.answers[entry.key]={rating:p.rating,at:new Date().toISOString(),scheduled:s.mode==='scheduled'};
    if(s.index+1<s.entries.length)s.index++;else s.finished=true;s.revealed=false;s.revealedGroups=[];return;
  }
  if(p.action==='favorite'){
    assert(entry,'NOT_FOUND','This session has no current card.');const c=M.card(set,entry.cardId);c.favorite=p.favorite??!c.favorite;return;
  }
  if(p.action==='previous'||p.action==='next'||p.action==='goto'){
    const index=p.action==='goto'?p.index:s.index+(p.action==='next'?1:-1);
    assert(Number.isInteger(index)&&index>=0&&index<s.entries.length,'INVALID_PARAMS','Question index is outside this session.');
    s.index=index;s.revealed=false;s.revealedGroups=[];s.finished=false;return;
  }
  assert(false,'INVALID_PARAMS','Unknown review action.');
}
function recall(set,p){
  const old=set.recall||{enabled:false,scope:'both',mode:'mask',revealedIds:[]};
  if(p.cardIds)p.cardIds.forEach(id=>M.card(set,id));
  const {setId,expectedRevision,reset,...patch}=p;
  set.recall={...old,...patch};if(reset||p.enabled===false)set.recall.revealedIds=[];
}
function reveal(set,p){
  const card=M.card(set,p.cardId);set.recall??={enabled:false,scope:'both',mode:'mask',revealedIds:[]};
  const ids=new Set(set.recall.revealedIds||[]);if(p.visible===false)ids.delete(card.id);else ids.add(card.id);set.recall.revealedIds=[...ids];
}
function presentation(state,set,p){
  const rows=cards(state,set,p);assert(rows.length>0&&rows.length<=10000,'INVALID_PARAMS','Choose 1–10000 presentation cards.');
  set.presentation={enabled:true,mode:p.mode||'cards',id:randomUUID(),cardIds:rows.map(c=>c.id),index:0,showNotes:p.showNotes??true,showImages:p.showImages??true};
}
function stepPresentation(set,p){
  const s=set.presentation;assert(s?.enabled,'NOT_FOUND','No active presentation.');
  if(p.action==='stop'){s.enabled=false;return;}
  const index=p.action==='goto'?p.index:s.index+(p.action==='next'?1:-1);
  assert(Number.isInteger(index)&&index>=0&&index<s.cardIds.length,'INVALID_PARAMS','Presentation index is out of range.');s.index=index;
}
async function request(store,method,p){
  await store.transaction(async state=>{
    const set=M.findSet(state,p.setId);M.revision(set,p.expectedRevision);
    const transient=method==='study.review.session.start'||method==='study.review.session.action'&&!['grade','favorite'].includes(p.action)||method.startsWith('study.presentation.');
    if(!transient)H.checkpoint(set);
    if(method==='study.review.batch')configureBatch(state,set,p);
    else if(method==='study.review.session.start')startSession(state,set,p);
    else if(method==='study.review.session.action')stepSession(set,p);
    else if(method==='study.recall.set')recall(set,p);
    else if(method==='study.recall.reveal')reveal(set,p);
    else if(method==='study.presentation.start')presentation(state,set,p);
    else if(method==='study.presentation.action')stepPresentation(set,p);
    else assert(false,'METHOD_NOT_FOUND','Unknown learning operation.');
    M.touch(set);
  });
  const state=await store.load();return M.describe(store,state,M.findSet(state,p.setId));
}
module.exports={reads,writes,read,request,sessionView,startSession};
