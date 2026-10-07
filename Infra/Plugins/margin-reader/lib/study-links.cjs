'use strict';
const {JSDOM}=require('jsdom');
const M=require('./study-model.cjs');
const {assert}=require('./safety.cjs');
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
function cardUri(setId,cardId){assert(M.UUID.test(setId)&&M.UUID.test(cardId),'INVALID_PARAMS','Invalid card identity.');return `margin-reader://card/${setId}/${cardId}`;}
function parseUri(value){
  assert(typeof value==='string'&&value.length<=2048,'INVALID_PARAMS','Supply a bounded reader link.');
  let url;try{url=new URL(value);}catch{assert(false,'INVALID_LINK','Invalid reader URI.');}
  assert(url.protocol==='margin-reader:'&&!url.username&&!url.password&&!url.port,'INVALID_LINK','Expected a margin-reader: URI.');
  const parts=url.pathname.split('/').filter(Boolean);
  if(url.hostname==='card'){assert(parts.length===2&&parts.every(v=>M.UUID.test(v))&&!url.search,'INVALID_LINK','Invalid card link.');return {kind:'card',setId:parts[0],cardId:parts[1]};}
  if(url.hostname==='document'){
    assert(parts.length===1&&M.UUID.test(parts[0]),'INVALID_LINK','Invalid document link.');
    const locator={};for(const [key,value] of url.searchParams){assert(['page','pageOffset','section','textOffset','anchor','time','endTime'].includes(key)&&!Object.hasOwn(locator,key),'INVALID_LINK','Unknown or duplicate locator parameter.');locator[key]=key==='anchor'?value:Number(value);}
    return {kind:'document',id:parts[0],locator};
  }
  if(url.hostname==='study'){assert(parts.length===1&&M.UUID.test(parts[0])&&!url.search,'INVALID_LINK','Invalid study link.');return {kind:'study',setId:parts[0]};}
  assert(false,'INVALID_LINK','Reader link kind is not supported.');
}
function catalog(state,p={}){
  if(p.query!==undefined)assert(typeof p.query==='string'&&p.query.length<=1000,'INVALID_PARAMS','Query exceeds 1000 characters.');
  const query=(p.query||'').toLocaleLowerCase(),sets=p.setId?[M.findSet(state,p.setId)]:Object.values(state.studySets).filter(s=>!s.deletedAt),rows=[];
  let total=0;const offset=p.offset||0,limit=p.limit||100;
  for(const set of sets)for(const card of set.cards){
    if(query&&!M.searchable(state,set,card).toLocaleLowerCase().includes(query))continue;
    const value=M.effective(state,set,card);
    if(total>=offset&&rows.length<limit)rows.push({setId:set.id,setTitle:set.title,cardId:card.id,title:value.title,text:(value.editedText??value.text??'').slice(0,500),uri:cardUri(set.id,card.id),revision:set.revision});
    total++;
  }
  return {cards:rows,total,offset,limit,nextOffset:offset+rows.length<total?offset+rows.length:null};
}
function resolveWiki(state,key){
  const direct=new RegExp(`^(${UUID})/(${UUID})$`).exec(key);
  if(direct){try{const {set,card}=require('./card-location.cjs').locate(state,direct[1],direct[2]);return [{setId:set.id,cardId:card.id,title:card.title,setTitle:set.title}];}catch{return [];}}
  const results=[];
  for(const set of Object.values(state.studySets)){if(set.deletedAt)continue;for(const card of set.cards)if(card.id===key||card.title===key)results.push({setId:set.id,cardId:card.id,title:card.title,setTitle:set.title});}
  return results;
}
function textOf(card){return [card.title,card.editedText??card.text,card.note,...(card.comments||[]).filter(c=>!c.deletedAt).map(c=>c.text||'')].join('\n');}
function dictionary(state,set,card){return require('./study-dictionary.cjs').rows(state,set,card);}
function linkContext(state,set,card){
  const dom=new JSDOM('<!doctype html><html><body></body></html>'),cache=new Map();
  return {state,set,card,dom,document:dom.window.document,links:[],choices:[],rendered:0,truncated:false,
    matcher:require('./literal-links.cjs').createMatcher(dictionary(state,set,card),set.linkSettings||{}),
    resolve(key){if(!cache.has(key))cache.set(key,resolveWiki(state,key));return cache.get(key);}};
}
function enrich(html,context){
  const {document,links,choices}=context,body=document.createElement('div');body.innerHTML=html;
  const textNodes=()=>{const out=[],walker=document.createTreeWalker(body,4);let node;while((node=walker.nextNode()))if(!node.parentElement?.closest('a,code,pre,.katex,svg,.reader-link-missing'))out.push(node);return out;};
  function anchor(label,targets,kind){
    if(context.rendered>=200){context.truncated=true;return document.createTextNode(label);}
    context.rendered++;const a=document.createElement('a');a.textContent=label;a.className='reader-internal-link';
    if(targets.length===1){a.href=cardUri(targets[0].setId,targets[0].cardId);if(targets[0].color)a.style.color=targets[0].color;links.push({...targets[0],kind});}
    else{const i=choices.length;choices.push({label,targets,kind});a.href='#reader-link-choice-'+i;}
    return a;
  }
  for(const node of textNodes()){
    const value=node.data,segments=[];let last=0;
    for(const m of value.matchAll(/\[\[([^\]\n]{1,450})\]\]/g)){
      const [key,...alias]=m[1].split('|'),targets=context.resolve(key.trim());
      segments.push(document.createTextNode(value.slice(last,m.index)));
      if(targets.length)segments.push(anchor(alias.join('|')||key,targets,'wiki'));
      else{const missing=document.createElement('span');missing.className='reader-link-missing';missing.textContent=alias.join('|')||key;missing.title='此卡片引用尚未建立或已删除';segments.push(missing);}
      last=m.index+m[0].length;
    }
    if(last){segments.push(document.createTextNode(value.slice(last)));node.replaceWith(...segments);}
  }
  for(const node of textNodes()){
    let end=0,changed=false;const out=[];
    for(const hit of context.matcher.matches(node.data)){
      if(context.rendered>=200){context.truncated=true;break;}
      // Folded Unicode can map multiple code units to one original character.
      if(hit.at<end)continue;
      out.push(document.createTextNode(node.data.slice(end,hit.at)),anchor(node.data.slice(hit.at,hit.end),hit.targets,'title'));end=hit.end;changed=true;
    }
    if(changed){out.push(document.createTextNode(node.data.slice(end)));node.replaceWith(...out);}
  }
  for(const a of body.querySelectorAll('a[href^="margin-reader:"]')){try{const target=parseUri(a.getAttribute('href'));if(target.kind==='card'&&!links.some(l=>l.setId===target.setId&&l.cardId===target.cardId))links.push({...target,kind:'uri'});}catch{a.removeAttribute('href');}}
  return body.innerHTML;
}
function render(state,set,card){
  card=M.effective(state,set,card);
  const base=require('./card-text.cjs').render,marked=require('./study-emphasis.cjs').marked,context=linkContext(state,set,card);
  try{
    const html=enrich(base(marked(card,'text',card.editedText??card.text??'')),context),noteHtml=enrich(base(marked(card,'note',card.note||'')),context);
    const comments=(card.comments||[]).filter(c=>!c.deletedAt).map(c=>({...c,html:enrich(base(marked(card,'comment:'+c.id,c.text||'')),context)}));
    const unique=[...new Map(context.links.map(l=>[`${l.setId}/${l.cardId}`,l])).values()];
    return {html,noteHtml,comments,links:unique,titleLinks:unique.filter(l=>l.kind==='title'),choices:context.choices,uri:cardUri(set.id,card.id),
      linkStatus:{complete:!context.truncated,rendered:context.rendered,limit:200,dictionaryTerms:context.matcher.size}};
  }finally{context.dom.window.close();}
}
function backlinks(state,p){
  const set=M.findSet(state,p.setId),card=M.card(set,p.cardId),uri=cardUri(set.id,card.id),matches=[];
  for(const s of Object.values(state.studySets)){if(s.deletedAt)continue;for(const c of s.cards){if(s.id===set.id&&c.id===card.id)continue;
    const text=textOf(c),reasons=[];
    if(c.reference?.setId===set.id&&c.reference?.cardId===card.id)reasons.push('reference');
    for(const match of text.matchAll(new RegExp(`margin-reader://card/(${UUID})/(${UUID})`,'g'))){try{const found=require('./card-location.cjs').locate(state,match[1],match[2]);if(found.set.id===set.id&&found.card.id===card.id)reasons.push('inline');}catch{}}
    for(const match of text.matchAll(/\[\[([^\]\n]{1,450})\]\]/g))if(resolveWiki(state,match[1].split('|')[0].trim()).some(v=>v.setId===set.id&&v.cardId===card.id))reasons.push(match[1].split('|')[0].trim()===card.title?'title-wiki':'inline');
    for(const link of s.links||[]){if(link.from===c.id&&link.to===card.id&&(link.toSetId||s.id)===set.id)reasons.push('link');if(link.bidirectional&&link.to===c.id&&(link.toSetId||s.id)===s.id&&link.from===card.id&&s.id===set.id)reasons.push('link');}
    if(reasons.length)matches.push({setId:s.id,cardId:c.id,title:c.title,setTitle:s.title,reasons:[...new Set(reasons)]});
  }}
  const offset=p.offset||0,limit=p.limit||100;return {uri,total:matches.length,backlinks:matches.slice(offset,offset+limit),nextOffset:offset+limit<matches.length?offset+limit:null};
}
function associations(state,p){
  const set=M.findSet(state,p.setId);M.card(set,p.cardId);
  const rows=[];
  for(const owner of Object.values(state.studySets)){
    if(owner.deletedAt)continue;
    for(const link of owner.links||[]){
      const outgoing=owner.id===set.id&&link.from===p.cardId;
      const incoming=(link.toSetId||owner.id)===set.id&&link.to===p.cardId;
      if(!outgoing&&!incoming)continue;
      const setId=outgoing?(link.toSetId||owner.id):owner.id,cardId=outgoing?link.to:link.from;
      const other=Object.hasOwn(state.studySets,setId)?state.studySets[setId]:null;
      const target=other&&!other.deletedAt?other.cards.find(c=>c.id===cardId):null;
      rows.push({...link,ownerSetId:owner.id,ownerRevision:owner.revision,outgoing,
        target:{setId,cardId,title:target?M.effective(state,other,target).title:'目标已删除',setTitle:other?.title||'学习集不可用',available:Boolean(target),uri:cardUri(setId,cardId)}});
    }
  }
  const offset=p.offset||0,limit=p.limit||100;
  return {revision:set.revision,total:rows.length,links:rows.slice(offset,offset+limit),nextOffset:offset+limit<rows.length?offset+limit:null};
}
module.exports={cardUri,parseUri,catalog,render,backlinks,resolveWiki,associations};
