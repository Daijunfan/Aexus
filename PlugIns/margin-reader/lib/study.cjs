'use strict';
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const { assert, fail, relative, safePath, exists, writeNew } = require('./safety.cjs');
const { openDocument, findDocument } = require('./documents.cjs');
const { parentExists } = require('./files.cjs');
const { createCapture, cardImage } = require('./study-capture.cjs');
const M = require('./study-model.cjs');
const history = require('./study-history.cjs');
const review = require('./study-review.cjs');
function listOfStrings(value, label, max=500) {
  assert(Array.isArray(value) && value.length && value.length<=max && value.every(v=>typeof v==='string'&&v), 'INVALID_PARAMS', `${label} must contain 1–${max} strings.`);
  return [...new Set(value)];
}
function createStudies(store) {
  const capture = createCapture(store);
  async function request(method,p) {
    if(method==='study.review.optimize')return require('./study-optimize.cjs').optimize(store,p);
    if(method==='study.card.create')return capture.create(p);
    if(method==='study.list')return {sets:Object.values((await store.load()).studySets).filter(s=>p.includeTrashed||!s.deletedAt).map(M.summary),colors:M.COLORS};
    if(method==='study.get'){const state=await store.load();return M.describe(store,state,M.findSet(state,p.setId));}
    if(method==='study.review.queue')return review.queue(M.findSet(await store.load(),p.setId),new Date(),p.deckId);
    if(method==='study.review.stats')return review.stats(M.findSet(await store.load(),p.setId));
    if(method==='study.search'){const state=await store.load();return {cards:Object.values(state.studySets).filter(s=>!s.deletedAt).flatMap(s=>s.cards.filter(c=>[c.title,c.text,c.note].join(' ').toLocaleLowerCase().includes(p.query.toLocaleLowerCase())).map(c=>({setId:s.id,setTitle:s.title,cardId:c.id,title:c.title,text:c.text}))).slice(0,500)};}
    if(method==='study.review.preview'){const set=M.findSet(await store.load(),p.setId);return review.preview(M.card(set,p.cardId),new Date(),set);}
    if(method==='study.cards.query'){
      const state=await store.load(),set=await M.describe(store,state,M.findSet(state,p.setId)),query=(p.query||'').toLocaleLowerCase();
      return {revision:set.revision,cards:set.cards.filter(c=>(!p.color||c.color===p.color)&&(!p.tag||c.tags.includes(p.tag))&&(!p.documentId||c.source?.documentId===p.documentId)&&(!query||[c.title,c.text,c.note,...c.tags].join('\n').toLocaleLowerCase().includes(query)))};
    }
    if(method==='study.card.render'){const state=await store.load(),card=M.card(M.findSet(state,p.setId),p.cardId),text=[card.text,card.note].join('\n');const titleLinks=Object.values(state.studySets).filter(s=>!s.deletedAt).flatMap(s=>s.cards.filter(c=>c.id!==card.id&&c.title.length>=2&&text.includes(c.title)).map(c=>({setId:s.id,cardId:c.id,title:c.title,setTitle:s.title}))).slice(0,100);return {html:require('./card-text.cjs').render(card.text),noteHtml:require('./card-text.cjs').render(card.note),titleLinks};}
    if(method==='study.card.image'){const image=await cardImage(store,p.setId,p.cardId);return {mimeType:image.mimeType,contentBase64:image.bytes.toString('base64')};}
    let documentIds;
    if(method==='study.documents.add') {
      const set=M.findSet(await store.load(),p.setId);M.revision(set,p.expectedRevision);
      const paths=listOfStrings(p.paths,'paths');paths.forEach(v=>relative(v));
      documentIds=[];
      // Reuse the public document core, without stealing the currently open document.
      for(const path of paths)documentIds.push((await openDocument(store,{path,activate:false})).id);
    }
    const result = await store.transaction(async(state,rollback)=>{
      if(method==='study.create') {
        const now=new Date().toISOString(), id=randomUUID();
        assert(typeof (p.description||'')==='string'&&(p.description||'').length<=4000,'INVALID_PARAMS','Description exceeds 4000 characters.');
        const set={id,title:M.title(p.title),description:p.description||'',revision:1,documentIds:[],cards:[],cardTrash:[],createdAt:now,updatedAt:now};
        state.studySets[id]=set;return {setId:id};
      }
      const set=M.findSet(state,p.setId,method==='study.restore');
      if(method==='study.open') {
        if(p.documentId){assert(set.documentIds.includes(p.documentId),'NOT_MEMBER','Document is not in this study set.');findDocument(state,p.documentId);}
        state.settings.activeStudySet=set.id;state.settings.lastDocument=p.documentId||null;return {setId:set.id};
      }
      if(method==='study.export') {
        const rel=relative(p.path),file=await safePath(store.workspace,rel);await parentExists(store.workspace,rel);assert(!(await exists(file)),'ALREADY_EXISTS','Export destination exists.');
        const value={schema:'margin-reader.study/v1',set:structuredClone(await M.describe(store,state,set))};
        if(p.includeImages)for(const card of value.set.cards)if(card.image)card.image.contentBase64=(await cardImage(store,set.id,card.id)).bytes.toString('base64');
        const json=JSON.stringify(value,null,2);assert(Buffer.byteLength(json)<=256*1024*1024,'TOO_LARGE','Study export exceeds 256 MiB.');
        await writeNew(file,json);rollback(()=>fs.rm(file,{force:true}));return {path:rel,bytes:Buffer.byteLength(json),cards:set.cards.length};
      }
      M.revision(set,p.expectedRevision);
      if(method==='study.undo'||method==='study.redo') {
        history.restore(set,method.split('.')[1]);if(state.settings.activeStudySet===set.id&&!set.documentIds.includes(state.settings.lastDocument))state.settings.lastDocument=null;M.touch(set);return {setId:set.id};
      }
      if(!['study.remove','study.restore','study.view.set'].includes(method))history.checkpoint(set);
      if(/^(study\.layer\.|study\.canvas\.|study\.deck\.|study\.ink\.transform$|study\.note\.anchor$|study\.map\.configure$|study\.cards\.(group|merge)$|study\.review\.settings$)/.test(method))await require('./study-advanced.cjs').request(store,state,set,method,p);
      else if(method==='study.card.reference'){const target=M.findSet(state,p.targetSetId),original=M.card(target,p.targetCardId),node=require('./study-advanced.cjs').note(set,original.title,original.text);node.reference={setId:target.id,cardId:original.id};}
      else if(method==='study.ink.add')await require('./study-ink.cjs').add(store,state,set,p);
      else if(method==='study.ink.remove')require('./study-ink.cjs').remove(set,p);
      else if(method==='study.view.set')set.view=p.view;
      else if(method==='study.note.create') {
        assert(set.cards.length<10000,'TOO_LARGE','A study set supports at most 10000 cards.');
        assert((p.text||'').length<=20000,'INVALID_PARAMS','Note exceeds 20000 characters.');
        const now=new Date().toISOString(),node={id:randomUUID(),kind:'note',title:M.title(p.title),text:p.text||'',note:'',tags:M.tags(p.tags||[]),color:M.color(p.color||'yellow'),source:null,image:null,parentId:null,collapsed:false,createdAt:now,updatedAt:now};
        set.cards.push(node);if(p.parentId)M.move(set,node,p.parentId);
      } else if(method==='study.link.add') {
        M.card(set,p.from);M.card(set,p.to);assert(p.from!==p.to,'INVALID_PARAMS','Choose two different cards.');
        assert((p.label||'').length<=200,'INVALID_PARAMS','Link label exceeds 200 characters.');set.links??=[];
        assert(!set.links.some(l=>l.from===p.from&&l.to===p.to||(l.bidirectional||p.bidirectional!==false)&&l.from===p.to&&l.to===p.from),'ALREADY_EXISTS','These cards are already linked.');
        set.links.push({id:randomUUID(),from:p.from,to:p.to,label:p.label||'',bidirectional:p.bidirectional??true});
      } else if(method==='study.link.remove') {
        assert(set.links?.some(l=>l.id===p.linkId),'NOT_FOUND','Link does not exist.');set.links=set.links.filter(l=>l.id!==p.linkId);
      } else if(method==='study.review.configure'||method==='study.review.grade') {
        const card=M.card(set,p.cardId);if(method==='study.review.configure')review.configure(card,p,set);else review.grade(card,p.rating,set);
      } else if(method==='study.update') {
        assert(p.title!==undefined||p.description!==undefined,'INVALID_PARAMS','Provide title or description.');
        if(p.title!==undefined)set.title=M.title(p.title);
        if(p.description!==undefined){assert(p.description.length<=4000,'INVALID_PARAMS','Description is too long.');set.description=p.description;}
      } else if(method==='study.remove') {
        set.deletedAt=new Date().toISOString();if(state.settings.activeStudySet===set.id){state.settings.activeStudySet=null;state.settings.lastDocument=null;}
      } else if(method==='study.restore') {assert(set.deletedAt,'INVALID_PARAMS','Study set is not deleted.');delete set.deletedAt;
      } else if(method==='study.documents.add') {
        documentIds.forEach(id=>findDocument(state,id));set.documentIds=[...new Set([...set.documentIds,...documentIds])];
        assert(set.documentIds.length<=10000,'TOO_LARGE','A study set supports at most 10000 documents.');
      } else if(method==='study.documents.remove') {
        const ids=new Set(listOfStrings(p.documentIds,'documentIds'));set.documentIds=set.documentIds.filter(id=>!ids.has(id));
        if(state.settings.activeStudySet===set.id&&ids.has(state.settings.lastDocument))state.settings.lastDocument=null;
        // Excerpt snapshots and original files survive removal of a membership.
      } else if(method==='study.card.restore') {
        const entry=set.cardTrash.find(t=>t.id===p.trashId);assert(entry,'NOT_FOUND','Removed card group not found.');
        const ids=new Set([...set.cards,...entry.cards].map(c=>c.id));
        for(const c of entry.cards){if(c.parentId&&!ids.has(c.parentId))c.parentId=null;set.cards.push(c);}
        set.cards=M.order(set.cards);set.cardTrash=set.cardTrash.filter(t=>t!==entry);
        set.links??=[];for(const link of entry.links||[])if(ids.has(link.from)&&ids.has(link.to)&&!set.links.some(l=>l.id===link.id))set.links.push(link);
      } else if(method.startsWith('study.card.')) {
        const card=M.card(set,p.cardId);
        if(method==='study.card.ink.add') {
          require('./study-advanced.cjs').editable(set,p.layerId||'default');
          assert(Array.isArray(p.points)&&p.points.length>=2&&p.points.length<=2048&&p.points.every(pt=>Array.isArray(pt)&&pt.length===2&&pt.every(v=>Number.isFinite(v)&&v>=0&&v<=1)),'INVALID_PARAMS','Invalid card ink points.');
          card.ink??=[];assert(card.ink.length<500,'TOO_LARGE','Card ink limit reached.');card.ink.push({id:randomUUID(),points:p.points,color:M.color(p.color),width:p.width,layerId:p.layerId||'default'});
        } else if(method==='study.card.ink.remove') {
          const stroke=card.ink?.find(s=>s.id===p.strokeId);assert(stroke,'NOT_FOUND','Card stroke not found.');require('./study-advanced.cjs').editable(set,stroke.layerId);card.ink=card.ink.filter(s=>s.id!==p.strokeId);
        } else if(method==='study.card.update') {
          assert(['title','note','text','tags','color','collapsed'].some(k=>p[k]!==undefined),'INVALID_PARAMS','Provide a card field to update.');
          if(p.title!==undefined)card.title=M.title(p.title);
          if(p.note!==undefined){assert(p.note.length<=20000,'INVALID_PARAMS','Note exceeds 20000 characters.');card.note=p.note;}
          if(p.color!==undefined)card.color=M.color(p.color);
          if(p.collapsed!==undefined)card.collapsed=p.collapsed;
          if(p.tags!==undefined)card.tags=M.tags(p.tags);
          if(p.text!==undefined){assert(!card.source,'INVALID_PARAMS','Excerpt text is immutable; edit its note instead.');assert(p.text.length<=20000,'INVALID_PARAMS','Text exceeds 20000 characters.');card.text=p.text;}
          card.updatedAt=new Date().toISOString();
        } else if(method==='study.card.move') M.move(set,card,p.parentId??null,p.index);
        else if(method==='study.card.remove') {
          const ids=p.mode==='subtree'?M.subtree(set.cards,card.id):new Set([card.id]);
          const removed=set.cards.filter(c=>ids.has(c.id));if(ids.has(set.map?.focusId))set.map.focusId=null;
          if(p.mode!=='subtree')for(const c of set.cards)if(c.parentId===card.id)c.parentId=card.parentId;
          set.cards=M.order(set.cards.filter(c=>!ids.has(c.id)));
          const links=(set.links||[]).filter(l=>ids.has(l.from)||ids.has(l.to));set.links=(set.links||[]).filter(l=>!ids.has(l.from)&&!ids.has(l.to));
          set.cardTrash.push({id:randomUUID(),removedAt:new Date().toISOString(),cards:removed,links});
        } else fail('METHOD_NOT_FOUND',`Unknown study method: ${method}`);
      } else fail('METHOD_NOT_FOUND',`Unknown study method: ${method}`);
      M.touch(set);return {setId:set.id};
    });
    if(method==='study.export')return result;
    const state=await store.load(),set=M.findSet(state,result.setId,true);
    if(set.deletedAt)return M.summary(set);
    return M.describe(store,state,set);
  }
  return {request,close:()=>capture.close(),readAsset:async asset=>{const m=/^study-card\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.png$/.exec(asset);assert(m,'SCOPE_DENIED','Invalid study card asset.');return cardImage(store,m[1],m[2]);}};
}
module.exports={createStudies};
