"use strict";
const {assert} = require('./safety.cjs');
const M = require('./study-model.cjs');
const O = require('./study-organize.cjs');
const Keywords = require('./title-keywords.cjs');
const H = require('./study-history.cjs');

const GROUPS=['study','color','tag','keyword','document','chapter','created','updated','kind','inMap'];
const keyOf=(setId,cardId)=>setId+'/'+cardId;
function sets(state, ids) {
  if (ids===undefined) return Object.values(state.studySets).filter(s=>!s.deletedAt);
  assert(Array.isArray(ids)&&ids.length>0&&ids.length<=1000&&ids.every(id=>typeof id==='string'), 'INVALID_PARAMS','Choose 1–1000 study IDs.');
  return [...new Set(ids)].map(id=>M.findSet(state,id));
}
function selection(state,p) {
  const filter=O.checkedFilter(p.filter||{}), sources=sets(state,p.setIds);
  const rows=[];
  for(const set of sources)for(const card of set.cards) {
    const value=M.effective(state,set,card);
    if(O.matches(value,filter))rows.push({...value,ownerSetId:set.id,ownerSetTitle:set.title,ownerRevision:set.revision});
  }
  return {rows:O.sorted(rows,p.sort||'outline',p.direction||'asc'),sources};
}
function group(state,rows,fields,depth=0) {
  if(depth===fields.length)return rows.map(c=>keyOf(c.ownerSetId,c.id));
  const field=fields[depth],groups=new Map();
  for(const card of rows){
    let labels;
    if(field==='keyword')labels=Keywords.terms(card.title);
    else if(field==='study')labels=[card.ownerSetTitle];
    else if(field==='tag')labels=card.tags?.length?card.tags:['未标记'];
    else if(field==='color')labels=[card.color];
    else if(field==='kind')labels=[card.source?'摘录':'笔记'];
    else if(field==='inMap')labels=[card.inMap===false?'未加入脑图':'脑图内'];
    else if(field==='created'||field==='updated')labels=[String(card[field+'At']||'').slice(0,10)||'无日期'];
    else {
      const doc=state.documents[card.source?.documentId||card.anchor?.documentId];
      if(field==='document')labels=[doc?.title||'独立笔记'];
      else {const position=card.source?.locator.page??card.source?.locator.section??-1;
        labels=[doc?.toc.filter(n=>(n.locator.page??n.locator.section??Infinity)<=position).at(-1)?.title||'无目录'];}
    }
    if(!labels.length)labels=['无标题词条'];
    for(const label of labels){const index=field==='keyword'?label.toLocaleLowerCase():label;if(!groups.has(index))groups.set(index,{label,values:[]});groups.get(index).values.push(card);}
  }
  return [...groups.values()].map(({label,values})=>({key:label,count:values.length,children:group(state,values,fields,depth+1)}));
}
async function query(store,p) {
  const state=await store.load(),{rows,sources}=selection(state,p),fields=p.groupBy||[];
  assert(Array.isArray(fields)&&fields.length<=2&&fields.every(f=>GROUPS.includes(f)),'INVALID_PARAMS','Choose at most two supported grouping fields.');
  Keywords.grouping(sources,rows,fields);
  const offset=p.offset||0,limit=p.limit||100,page=rows.slice(offset,offset+limit),described=new Map();
  for(const source of sources){
    const selected=page.filter(c=>c.ownerSetId===source.id);if(!selected.length)continue;
    const view=await M.describe(store,state,{...source,cards:selected});
    for(const card of view.cards)described.set(keyOf(source.id,card.id),card);
  }
  return {total:rows.length,offset,limit,nextOffset:offset+limit<rows.length?offset+limit:null,
    revisions:Object.fromEntries(sources.map(s=>[s.id,s.revision])),
    groups:group(state,rows,fields),cards:page.map(c=>({...described.get(keyOf(c.ownerSetId,c.id)),ownerSetId:c.ownerSetId,ownerSetTitle:c.ownerSetTitle,ownerRevision:c.ownerRevision}))};
}
async function batch(store,p) {
  assert(Array.isArray(p.targets)&&p.targets.length>0&&p.targets.length<=10000,'INVALID_PARAMS','Select 1–10000 card targets.');
  assert(p.expectedRevisions&&typeof p.expectedRevisions==='object'&&!Array.isArray(p.expectedRevisions),'INVALID_PARAMS','Supply expected revisions for every affected study.');
  return store.transaction(async(state,rollback)=>{
    const grouped=new Map();
    for(const target of p.targets){
      assert(target&&typeof target==='object'&&Object.keys(target).every(k=>['setId','cardId'].includes(k)),'INVALID_PARAMS','Each target needs setId and cardId.');
      const set=M.findSet(state,target.setId);M.card(set,target.cardId);
      assert(Object.hasOwn(p.expectedRevisions,set.id),'INVALID_PARAMS','A selected study is missing its expected revision.');
      M.revision(set,p.expectedRevisions[set.id]);
      if(!grouped.has(set.id))grouped.set(set.id,new Set());grouped.get(set.id).add(target.cardId);
    }
    // A failure in any study aborts the entire operation and all file effects.
    const revisions={};let count=0;
    for(const [id,ids] of grouped){
      const set=M.findSet(state,id);H.checkpoint(set);
      await O.request(store,state,set,'study.cards.batch',{cardIds:[...ids],descendants:p.descendants===true,patch:p.patch},rollback);
      M.touch(set);revisions[id]=set.revision;count+=ids.size;
    }
    return {updated:count,studies:grouped.size,revisions};
  });
}
module.exports={query,batch,selection,group,GROUPS};
