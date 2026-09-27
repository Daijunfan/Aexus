'use strict';
const { fsrs, createEmptyCard, Rating } = require('ts-fsrs');
const { assert } = require('./safety.cjs');
const schedulerFor = set => fsrs({enable_fuzz:false,...(set?.reviewSettings?.w?{w:set.reviewSettings.w}:{}),request_retention:set?.reviewSettings?.retention??.9,maximum_interval:set?.reviewSettings?.maximumInterval??36500});
const ratings = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };
function enabled(card) { return Boolean(card.review?.enabled); }
function queue(set, now = new Date(), deckId = set.reviewSettings?.deckId) {
  const cards = set.cards.filter(c=>enabled(c)&&(!deckId||c.review.deckId===deckId)&&!(set.decks||[]).some(d=>d.id===c.review.deckId&&d.deletedAt));
  const due = cards.filter(c => new Date(c.review.schedule.due) <= now)
    .sort((a, b) => new Date(a.review.schedule.due) - new Date(b.review.schedule.due));
  return { revision: set.revision, total: cards.length, due: due.length, cardIds: due.map(c => c.id),
    nextDue: cards.length ? cards.map(c => c.review.schedule.due).sort()[0] : null };
}
function configure(card, p, set) {
  const previous = card.review;
  let front = p.front ?? previous?.front ?? card.title;
  let back = p.back ?? previous?.back ?? (card.note || card.text || card.title);
  if(p.cloze!==undefined){assert(p.cloze.length<=20000&&/\{\{[^{}]+\}\}/.test(p.cloze),'INVALID_PARAMS','Mark hidden answers as {{answer}}.');front=p.cloze.replace(/\{\{([^{}]+)\}\}/g,'[ … ]');back=p.cloze.replace(/\{\{([^{}]+)\}\}/g,'$1');}
  assert(front.trim() && back.trim() && front.length <= 20000 && back.length <= 20000, 'INVALID_PARAMS', 'Flashcard front and back must contain 1–20000 characters.');
  if(p.deckId)assert(set.decks?.some(d=>d.id===p.deckId&&!d.deletedAt),'NOT_FOUND','Deck not found.');
  if(p.occlusions!==undefined)assert(Array.isArray(p.occlusions)&&p.occlusions.length<=100&&p.occlusions.every(r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1&&r.y+r.height<=1),'INVALID_PARAMS','Invalid image occlusions.');
  card.review = { ...previous, ...(p.cloze!==undefined?{cloze:p.cloze}:{}), ...(p.deckId!==undefined?{deckId:p.deckId}:{}),...(p.occlusions!==undefined?{occlusions:p.occlusions}:{}), enabled: p.enabled, front, back, schedule: previous?.schedule || createEmptyCard(), logs: previous?.logs || [] };
}
function preview(card, now = new Date(), set) {
  assert(enabled(card), 'INVALID_PARAMS', 'Card is not enabled for review.');
  return Object.fromEntries(Object.entries(ratings).map(([name, grade]) => [name, schedulerFor(set).next(card.review.schedule, now, grade).card.due.toISOString()]));
}
function grade(card, rating, set) {
  assert(enabled(card), 'INVALID_PARAMS', 'Card is not enabled for review.');
  assert(Object.hasOwn(ratings, rating), 'INVALID_PARAMS', 'Invalid review rating.');
  const result = schedulerFor(set).next(card.review.schedule, new Date(), ratings[rating]);
  card.review.schedule = result.card; card.review.logs.push(result.log);
}
function stats(set){
 const days=new Map();let reviews=0,again=0;for(const c of set.cards)for(const log of c.review?.logs||[]){reviews++;if(log.rating===1)again++;const date=new Date(log.review).toISOString().slice(0,10),d=days.get(date)||{date,count:0,again:0};d.count++;if(log.rating===1)d.again++;days.set(date,d);}
 return {cards:set.cards.filter(enabled).length,reviews,again,recallRate:reviews?(reviews-again)/reviews:null,days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date))};
}
module.exports = { queue, configure, preview, grade, stats };
