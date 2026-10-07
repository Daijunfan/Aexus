'use strict';
const {fsrs,createEmptyCard,Rating}=require('ts-fsrs');
const {assert}=require('./safety.cjs');
const cloze=require('./cloze.cjs');
const Content=require('./review-content.cjs');
const schedulerFor=set=>fsrs({enable_fuzz:false,...(set?.reviewSettings?.w?{w:set.reviewSettings.w}:{}),request_retention:set?.reviewSettings?.retention??.9,maximum_interval:set?.reviewSettings?.maximumInterval??36500});
const ratings={again:Rating.Again,hard:Rating.Hard,good:Rating.Good,easy:Rating.Easy};
function available(card){return !card.review?.generation||card.review.generation.status==='ready';}
function enabled(card){return Boolean(card.review?.enabled)&&available(card);}
function variants(card){return card.review?.variants?.length?card.review.variants:[{id:'default',front:card.review?.front??card.title,back:card.review?.back??(card.note||card.editedText||card.text||card.title),schedule:card.review?.schedule,occlusions:card.review?.occlusions||[]}];}
function entries(set,{deckId=set.reviewSettings?.deckId,dueOnly=true,now=new Date()}={}) {
  const rows=[];
  for(const card of set.cards){
    if(!enabled(card)||deckId&&card.review.deckId!==deckId||(set.decks||[]).some(d=>d.id===card.review.deckId&&d.deletedAt))continue;
    for(const variant of variants(card))if(!dueOnly||new Date(variant.schedule.due)<=now)rows.push({cardId:card.id,variantId:variant.id,key:`${card.id}/${variant.id}`,due:variant.schedule.due});
  }
  return rows;
}
function queue(set,now=new Date(),deckId=set.reviewSettings?.deckId){
  const all=entries(set,{deckId,dueOnly:false,now}),due=all.filter(e=>new Date(e.due)<=now).sort((a,b)=>new Date(a.due)-new Date(b.due)||a.key.localeCompare(b.key));
  return {revision:set.revision,total:new Set(all.map(e=>e.cardId)).size,due:new Set(due.map(e=>e.cardId)).size,cardIds:[...new Set(due.map(e=>e.cardId))],items:due,totalInstances:all.length,dueInstances:due.length,nextDue:all.length?all.map(e=>e.due).sort()[0]:null};
}
function configure(card,p,set,defaults={},options={}){
  const previous=card.review;
  const priorModes=Content.modes(card,defaults),frontMode=p.frontMode||(p.front!==undefined?'custom':priorModes.frontMode),backMode=p.backMode||(p.back!==undefined?'custom':priorModes.backMode),revealMode=p.revealMode||priorModes.revealMode;
  assert(['title','card','emphasis','custom'].includes(frontMode)&&['card','custom'].includes(backMode)&&['sequential','independent'].includes(revealMode),'INVALID_PARAMS','Invalid review content mode.');
  let front=p.front??previous?.front??card.title,back=p.back??previous?.back??(card.note||card.editedText||card.text||card.title);
  const clozeText=p.cloze===undefined?previous?.cloze||'':p.cloze;
  const parsed=clozeText?cloze.parse(clozeText):null;
  assert(frontMode!=='emphasis'||parsed,'INVALID_PARAMS','Mark the question text with cloze groups before extracting an emphasis question.');
  if(p.cloze!==undefined&&parsed){front=cloze.render(parsed);back=parsed.plain;}
  assert(typeof front==='string'&&typeof back==='string'&&front.trim()&&back.trim()&&front.length<=20000&&back.length<=20000,'INVALID_PARAMS','Flashcard front and back must contain 1–20000 characters.');
  if(p.groupNames!==undefined)assert(p.groupNames&&typeof p.groupNames==='object'&&!Array.isArray(p.groupNames)&&Object.keys(p.groupNames).length<=100&&Object.entries(p.groupNames).every(([k,v])=>/^[1-9]\d{0,2}$/.test(k)&&typeof v==='string'&&v.trim()&&v.length<=60),'INVALID_PARAMS','Invalid review group names.');
  if(p.deckId)assert(set.decks?.some(d=>d.id===p.deckId&&!d.deletedAt),'NOT_FOUND','Deck not found.');
  if(p.occlusions!==undefined)assert(Array.isArray(p.occlusions)&&p.occlusions.length<=100&&p.occlusions.every(r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1&&r.y+r.height<=1),'INVALID_PARAMS','Invalid image occlusions.');
  const masks=p.occlusions??previous?.occlusions??[],groups=p.occlusionGroups??previous?.occlusionGroups;
  if(p.occlusionGroups!==undefined)assert(Array.isArray(groups)&&groups.length===masks.length&&groups.every(n=>Number.isInteger(n)&&n>=1&&n<=100),'INVALID_PARAMS','Supply one group number (1–100) per image mask.');
  const r=card.review={...previous,frontMode,backMode,revealMode,cloze:clozeText,...(p.deckId!==undefined?{deckId:p.deckId}:{}),occlusions:masks,enabled:p.enabled,front,back,schedule:previous?.schedule||createEmptyCard(),logs:previous?.logs||[]};
  if(p.groupNames!==undefined)r.groupNames={...p.groupNames};
  if(groups&&groups.length===masks.length)r.occlusionGroups=groups;else delete r.occlusionGroups;
  const definitions=[];
  if(revealMode==='independent'&&parsed&&parsed.groups.some(id=>id!=='cloze'))for(const id of parsed.groups)definitions.push({id,front:cloze.render(parsed,id),back:parsed.plain,clozeGroup:id,occlusions:masks});
  else if(revealMode==='independent'&&groups?.length&&groups.length===masks.length)for(const group of [...new Set(groups)])definitions.push({id:'mask'+group,front,back,occlusions:masks.filter((_,i)=>groups[i]===group)});
  const retired=(previous?.variants||[]).filter(v=>!definitions.some(next=>next.id===v.id));if(retired.length)r.variantArchive={...previous.variantArchive,...Object.fromEntries(retired.map(v=>[v.id,structuredClone(v)]))};
  if(definitions.length){
    r.variants=definitions.map(value=>{const old=previous?.variants?.find(v=>v.id===value.id)||previous?.variantArchive?.[value.id];return {...value,schedule:old?.schedule||createEmptyCard(),logs:old?.logs||[]};});
    r.schedule=r.variants.reduce((a,b)=>new Date(a.schedule.due)<=new Date(b.schedule.due)?a:b).schedule;
  }else {
    delete r.variants;
  }
  if(!options.preserveGeneration&&(p.autoUpdate===false||['front','frontMode','back','backMode','cloze','occlusions','occlusionGroups','groupNames','revealMode'].some(k=>p[k]!==undefined)))delete r.generation;
  card.updatedAt=new Date().toISOString();
  if(['front','frontMode','back','backMode','cloze','occlusions','occlusionGroups','groupNames','revealMode'].some(k=>p[k]!==undefined)&&set.reviewSession?.entries?.[set.reviewSession.index]?.cardId===card.id){set.reviewSession.revealed=false;set.reviewSession.revealedGroups=[];}
}
function target(card,variantId){
  const values=variants(card);const current=variantId?values.find(v=>v.id===variantId):[...values].sort((a,b)=>new Date(a.schedule.due)-new Date(b.schedule.due))[0];
  assert(current,'NOT_FOUND','Review question group no longer exists.');return current;
}
function preview(card,now=new Date(),set,variantId){
  assert(enabled(card),'INVALID_PARAMS','Card is not enabled for review.');const item=target(card,variantId);
  return Object.fromEntries(Object.entries(ratings).map(([name,grade])=>[name,schedulerFor(set).next(item.schedule,now,grade).card.due.toISOString()]));
}
function grade(card,rating,set,variantId){
  assert(enabled(card),'INVALID_PARAMS','Card is not enabled for review.');assert(Object.hasOwn(ratings,rating),'INVALID_PARAMS','Invalid review rating.');
  const item=target(card,variantId),result=schedulerFor(set).next(item.schedule,new Date(),ratings[rating]);
  if(card.review.variants?.length){item.schedule=result.card;item.logs.push(result.log);card.review.logs.push({...result.log,variantId:item.id});card.review.schedule=card.review.variants.reduce((a,b)=>new Date(a.schedule.due)<=new Date(b.schedule.due)?a:b).schedule;}
  else{card.review.schedule=result.card;card.review.logs.push(result.log);}
  card.updatedAt=new Date().toISOString();return {variantId:item.id,due:result.card.due};
}
function copyConfiguration(review){
  const result={...review,enabled:false,schedule:createEmptyCard(),logs:[]};
  if(review.variants)result.variants=review.variants.map(v=>({...v,schedule:createEmptyCard(),logs:[]}));
  if(review.variantArchive)result.variantArchive=Object.fromEntries(Object.entries(review.variantArchive).map(([id,v])=>[id,{...v,schedule:createEmptyCard(),logs:[]} ]));return result;
}
function stats(set){
  const days=new Map();let reviews=0,again=0;
  for(const c of set.cards)for(const log of c.review?.logs||[]){reviews++;if(log.rating===1)again++;const date=new Date(log.review).toISOString().slice(0,10),d=days.get(date)||{date,count:0,again:0};d.count++;if(log.rating===1)d.again++;days.set(date,d);}
  return {cards:set.cards.filter(enabled).length,reviews,again,recallRate:reviews?(reviews-again)/reviews:null,days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date))};
}
module.exports={available,enabled,question:Content.question,queue,configure,preview,grade,stats,entries,variants,target,copyConfiguration};
