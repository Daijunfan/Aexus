'use strict';
const D=require('./documents.cjs'),M=require('./study-model.cjs'),S=require('./safety.cjs');
const {compile}=require('./search-query.cjs');
const {firstLiteral}=require('./text-offsets.cjs');
async function scan(store){
 const tree=await require('./files.cjs').fileCommand(store,'fs.tree',{path:'.',depth:100}),files=[];
 const walk=rows=>{for(const e of rows)if(e.kind==='file'&&e.readable)files.push(e);else if(e.children)walk(e.children);};walk(tree.entries);return files.sort((a,b)=>a.path.localeCompare(b.path));
}
async function index(store,p){
 const files=await scan(store),offset=p.offset||0,limit=p.limit||20,rows=files.slice(offset,offset+limit),indexed=[],errors=[];
 for(const file of rows){try{const doc=await D.openDocument(store,{path:file.path,activate:false});indexed.push({id:doc.id,path:doc.path});}catch(e){errors.push({path:file.path,code:e.code||'INVALID_DOCUMENT',message:e.message});}}
 return {indexed,errors,total:files.length,offset,nextOffset:offset+rows.length<files.length?offset+rows.length:null};
}
async function search(store,p){
 const query=compile(p.query,{caseSensitive:p.caseSensitive}),state=await store.load(),offset=p.offset||0,limit=p.limit||100,hits=[],skipped=[];let total=0;
 const push=hit=>{if(total>=offset&&hits.length<limit)hits.push(hit);total++;};
 if(p.kind!=='documents')for(const set of Object.values(state.studySets)){
  if(set.deletedAt||p.setId&&set.id!==p.setId)continue;
  for(const original of set.cards){const c=M.effective(state,set,original),row={title:c.title,text:c.editedText??c.text??'',note:[c.note,...(c.comments||[]).filter(v=>!v.deletedAt).map(v=>v.text)].join('\n'),tags:c.tags||[],color:c.color,path:c.source?.path||'',type:c.source?'excerpt':'note'};
   if(query.matches(row))push({kind:'card',setId:set.id,cardId:c.id,title:c.title,subtitle:set.title,snippet:row.text.slice(0,300),uri:`margin-reader://card/${set.id}/${c.id}`});
  }
 }
 if(p.kind!=='cards'){
  const documentIds=p.setId?new Set(M.findSet(state,p.setId).documentIds):null;
  for(const doc of Object.values(state.documents)){
   if(doc.trashed||documentIds&&!documentIds.has(doc.id))continue;
   try{
    const parsed=await D.parsedDocument(store,doc);
    for(let i=0;i<parsed.sections.length;i++){
     const section=parsed.sections[i],row={title:doc.title,text:section.text,note:'',tags:doc.tags||[],path:doc.path,type:doc.format,category:doc.category||''};if(!query.matches(row))continue;
     let start=0;for(const term of query.terms.filter(t=>!t.negated&&(!t.field||t.field==='text'))){const hit=firstLiteral(section.text,term.value,p.caseSensitive);if(hit){start=hit.start;break;}}
     let locator=doc.kind==='pdf'?{page:i+1}:{section:i};
     if(doc.kind==='flow'){
      const dom=new(require('jsdom').JSDOM)(section.html);try{const body=dom.window.document.body.textContent;for(const term of query.terms.filter(t=>!t.negated&&(!t.field||t.field==='text'))){const hit=firstLiteral(body,term.value,p.caseSensitive);if(hit){locator.textOffset=hit.start;break;}}}finally{dom.window.close();}
     }
     push({kind:'document',documentId:doc.id,title:doc.title,subtitle:doc.path,locator,snippet:section.text.slice(Math.max(0,start-60),start+240),uri:`margin-reader://document/${doc.id}?${new URLSearchParams(locator)}`});
    }
   }catch(e){skipped.push({id:doc.id,path:doc.path,code:e.code||'UNAVAILABLE'});}
  }
 }
 return {query:p.query,hits,total,offset,limit,nextOffset:offset+hits.length<total?offset+hits.length:null,skipped,indexedDocuments:Object.values(state.documents).filter(d=>!d.trashed).length};
}
module.exports={index,search};
