'use strict';
const {assert}=require('./safety.cjs');
/** Whole semicolon-delimited aliases; never substring-group unrelated titles. */
function terms(title,caseSensitive=false){
  const unique=new Map();
  for(const raw of String(title||'').split(/[;；]/)){
    const label=raw.trim();if(label.length<2||label.length>200)continue;
    const key=caseSensitive?label:label.toLocaleLowerCase();
    if(!unique.has(key))unique.set(key,label);
  }
  return [...unique.values()];
}
function grouping(sources,cards,fields){
  if(!fields.includes('keyword'))return;
  assert(sources.every(s=>s.linkSettings?.titleLinks!==false),'TITLE_LINKS_DISABLED','Enable title links in each selected study before grouping by keywords, or select an enabled study.');
  assert(fields.filter(f=>f==='keyword').length===1,'INVALID_PARAMS','Use the keyword grouping dimension only once.');
  let edges=0;
  for(const card of cards){edges+=Math.max(1,terms(card.title).length)*(fields.includes('tag')?Math.max(1,card.tags?.length||0):1);assert(edges<=100000,'TOO_LARGE','Keyword grouping exceeds 100000 memberships; narrow the filter.');}
}
module.exports={terms,grouping};
