'use strict';
const {assert}=require('./safety.cjs');
const cloze=require('./cloze.cjs');
const sideOf=c=>c.reviewSide||'back';
const comments=(card,side)=>(card.comments||[]).filter(c=>!c.deletedAt&&(sideOf(c)===side||sideOf(c)==='both'));
const body=card=>[card.title,card.editedText??card.text,card.note].filter(Boolean).join('\n\n');
const whole=card=>[body(card),...comments(card,'back').map(c=>c.text)].filter(Boolean).join('\n\n');
function modes(card,defaults={}){const r=card.review;return {frontMode:r?.frontMode||(r?'custom':defaults.reviewDefaultFront||'title'),backMode:r?.backMode||(r?'custom':'card'),revealMode:r?.revealMode||(r?'independent':defaults.reviewDefaultReveal||'sequential')};}
function maskGroup(review,parsed,index){const n=review.occlusionGroups?.[index]||1;return parsed?.groups.includes('c'+n)?'c'+n:n===1&&parsed?.groups.includes('cloze')?'cloze':'mask'+n;}
function groupIds(card,parsed=card.review?.cloze?cloze.parse(card.review.cloze):null){
 const r=card.review||{},ids=[...(parsed?.groups||[])];
 if(r.occlusions?.length)ids.push(...r.occlusions.map((_,i)=>maskGroup(r,parsed,i)));
 const label=id=>r.groupNames?.[id.match(/\d+$/)?.[0]]||id;return [...new Set(ids)].sort((a,b)=>label(a).localeCompare(label(b),'en',{numeric:true}));
}
function question(card,variant,shown=[],defaults={}){
 const r=card.review||{},m=modes(card,defaults),parsed=r.cloze?cloze.parse(r.cloze):null;
 let front=m.frontMode==='title'?card.title:m.frontMode==='card'?whole(card):m.frontMode==='emphasis'?(parsed?cloze.render(parsed):''):r.front||card.title;
 let back=m.backMode==='card'?whole(card):variant?.back??r.back??whole(card);
 let groups=[],occlusions=variant?.occlusions??r.occlusions??[];
 if(m.revealMode==='sequential'){
  groups=groupIds(card,parsed);
  if(parsed)front=cloze.renderGroups(parsed,shown);
  occlusions=(r.occlusions||[]).filter((_,i)=>!shown.includes(maskGroup(r,parsed,i)));
 }else if(parsed)front=variant?.front??cloze.render(parsed);
 if(m.backMode==='card'&&parsed&&!back.includes(parsed.plain))back=[parsed.plain,back].filter(Boolean).join('\n\n');
 return {front,back,occlusions,groups,frontMode:m.frontMode,backMode:m.backMode,revealMode:m.revealMode};
}
function render(state,set,raw,{variantId,shown=[]}={}){
 const M=require('./study-model.cjs'),R=require('./study-review.cjs'),Media=require('./study-media.cjs'),Links=require('./study-links.cjs');
 const variant=R.variants(raw).find(v=>v.id===(variantId||R.target(raw).id));assert(variant,'NOT_FOUND','Review question group no longer exists.');
 const card=M.effective(state,set,Media.describeCard(set,raw)),q=question(card,variant,shown,state.settings),text=require('./card-text.cjs').render;
 const rich=Links.render(state,set,{...card,reference:null});
 const imageAsset=card.imageAsset||(!card.mediaId&&card.image?`study-card/${set.id}/${card.image.fileKey||card.id}.png`:null);
 const commentHtml=new Map(rich.comments.map(c=>[c.id,c.html]));
 const frontComments=(q.frontMode==='card'&&!raw.review?.cloze?(card.comments||[]).filter(c=>!c.deletedAt):comments(card,'front')).map(c=>({...c,html:commentHtml.get(c.id)||text(c.text||'')}));
 const backComments=comments(card,'back').map(c=>({...c,html:commentHtml.get(c.id)||text(c.text||'')}));
 let contentText=q.backMode==='card'?body(card):q.back;
 if(q.backMode==='card'&&raw.review?.cloze){const plain=cloze.parse(raw.review.cloze).plain;if(!whole(card).includes(plain))contentText=plain+'\n\n'+contentText;}
 let backHtml=q.backMode==='card'?`<h2>${require('./safety.cjs').escapeHtml(card.title)}</h2>${rich.html}${rich.noteHtml}`:text(q.back);
 if(q.backMode==='card'&&raw.review?.cloze){const plain=cloze.parse(raw.review.cloze).plain;if(!whole(card).includes(plain))backHtml=text(plain)+backHtml;}
 const visible=s=>!s.hidden&&require('./study-advanced.cjs').layers(set).some(l=>l.id===(s.layerId||'default')&&l.visible&&!l.deletedAt);
 return {configuration:{generation:raw.review?.generation||null,groupNames:raw.review?.groupNames||{},cloze:raw.review?.cloze||'',enabled:raw.review?.enabled??true,deckId:raw.review?.deckId||null,front:raw.review?.front,back:raw.review?.back},revision:set.revision,cardId:raw.id,variantId:variant.id,...q,imageAsset,image:card.image||null,frontImageInk:require('./image-ink.cjs').forFace(set,card,'front'),backImageInk:require('./image-ink.cjs').forFace(set,card,'back'),
  front:{text:q.front,contentText:q.frontMode==='card'&&!raw.review?.cloze?body(card):q.front,html:q.frontMode==='card'&&!raw.review?.cloze?`<h2>${require('./safety.cjs').escapeHtml(card.title)}</h2>${rich.html}${rich.noteHtml}`:text(q.front),comments:frontComments},back:{text:q.back,contentText,html:backHtml,comments:backComments},
  ink:(card.ink||[]).filter(s=>!require('./image-ink.cjs').bound(s)&&visible(s)&&['back','both'].includes(s.reviewSide||'back')),frontInk:(card.ink||[]).filter(s=>!require('./image-ink.cjs').bound(s)&&visible(s)&&['front','both'].includes(s.reviewSide||'back')),
  links:rich.links,choices:rich.choices,colors:M.COLORS};
}
module.exports={sideOf,comments,body,whole,modes,groupIds,question,render};
