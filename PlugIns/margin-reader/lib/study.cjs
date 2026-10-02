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
const content = require('./study-content.cjs');
function listOfStrings(value, label, max=500) {
  assert(Array.isArray(value) && value.length && value.length<=max && value.every(v=>typeof v==='string'&&v), 'INVALID_PARAMS', `${label} must contain 1–${max} strings.`);
  return [...new Set(value)];
}
function createStudies(store,localReading) {
  const capture = createCapture(store), media = require('./study-media.cjs').createMedia(store), exports = require('./study-export.cjs').createExports(store);
  const av=require('./av-document.cjs').createAV(store,media);
  async function request(method,p) {
    if(method==='study.excerpt.repair')return capture.repair(p);
    if(method==='study.av.excerpt')return av.excerpt(p);
    if(method==='document.av.info')return av.info(p);
    if(method==='study.notebook.list')return require('./study-notebooks.cjs').read(store,p);
    if(method==='study.speech.attach'){
      const state=await store.load(),set=M.findSet(state,p.setId);M.revision(set,p.expectedRevision);const card=M.effective(state,set,M.card(set,p.cardId)),field=p.field||'text';
      const text=field==='front'||field==='back'?card.review?.[field]:card[field==='text'&&card.editedText!==undefined?'editedText':field];
      const audio=await localReading.speech({text,voice:p.voice,rate:p.rate});
      return request('study.media.import',{setId:set.id,expectedRevision:p.expectedRevision,cardId:card.id,kind:'audio',mimeType:'audio/wav',name:'朗读-'+card.title.slice(0,60)+'.wav',text:'本地朗读 · '+audio.voice,contentBase64:audio.contentBase64});
    }
    if(method.startsWith('study.clipboard.'))return require('./study-clipboard.cjs').request(store,method,p);
    if(method==='study.workspace.query')return require('./study-workspace.cjs').query(store,p);
    if(method==='study.workspace.batch')return require('./study-workspace.cjs').batch(store,p);
    const versions=require('./study-versions.cjs');
    if(versions.reads.has(method))return versions.read(store,method,p);
    if(versions.writes.has(method))return versions.request(store,method,p);
    const learning=require('./study-learning.cjs');
    if(learning.reads.has(method))return learning.read(store,method,p);
    if(learning.writes.has(method))return learning.request(store,method,p);
    if(method==='study.map.geometry'){const set=M.findSet(await store.load(),p.setId),{layoutStudy}=await import('../ui/study-map-layout.mjs'),{extendInkLayout}=await import('../ui/ink-binding.mjs'),layout=extendInkLayout(set,layoutStudy(set.cards,set.map,set.appearance));return {revision:set.revision,...layout,positions:[...layout.positions].map(([cardId,box])=>({cardId,...box,imageBounds:layout.mindmap?(box.imageBounds||null):require('./image-ink.cjs').frame(M.card(set,cardId),box.width,box.height,set.appearance)}))};}
    if(method==='study.export.file')return exports.study(p);
    if(method==='document.pdf.export')return exports.document(p);
    if(method==='study.package.export')return require('./study-package.cjs').exportPackage(store,p);
    if(method==='study.package.import')return require('./study-package.cjs').importPackage(store,p);
    if(method==='study.package.inspect')return require('./study-package.cjs').inspect(store,p);
    if(content.reads.has(method))return content.read(store,method,p);
    if(method==='link.open')return content.open(store,p);
    if(method==='study.card.activate') return require('./study-navigation.cjs').activate(store,p);
    if(method==='study.document.ensure') return require('./study-navigation.cjs').ensureDocumentStudy(store,p);
    if(method==='study.board.query')return require('./study-organize.cjs').query(store,p);
    if(method==='study.review.optimize')return require('./study-optimize.cjs').optimize(store,p);
    if(method==='study.tool.list'){const set=M.findSet(await store.load(),p.setId);return {revision:set.revision,tools:require('./ink-toolbar.cjs').tools(set).filter(t=>p.includeDeleted||!t.deletedAt),active:set.activeTools||{}};}
    if(method==='study.template.export')return require('./study-tools.cjs').exportTemplate(store,p);
    if(method==='study.excerpt.list')return require('./excerpt-parts.cjs').list(store,p);
    if(method==='study.excerpt.image'){const list=await require('./excerpt-parts.cjs').list(store,p),part=list.parts.find(part=>part.id===p.partId);assert(part,'NOT_FOUND','Excerpt part not found.');const bytes=await require('./safety.cjs').readBounded(await store.meta(`study-assets/${p.setId}/${part.image.fileKey||part.id}.png`),8*1024*1024);return {mimeType:'image/png',contentBase64:bytes.toString('base64')};}
    if(method==='study.excerpt.append'||method==='study.excerpt.revise')return capture.edit(method,p);
    if(method==='study.excerpt.remove')return capture.removePart(p);
    if(method==='study.card.create')return capture.create(p);
    if(method==='study.list')return {sets:Object.values((await store.load()).studySets).filter(s=>p.includeTrashed||!s.deletedAt).map(M.summary),colors:M.COLORS};
    if(method==='study.get'){const state=await store.load();return M.describe(store,state,M.findSet(state,p.setId));}
    if(method==='study.review.render'){const state=await store.load(),set=M.findSet(state,p.setId),raw=M.card(set,p.cardId);let shown=[];if(p.sessionId){const view=require('./study-learning.cjs').sessionView(set,state);assert(view?.id===p.sessionId&&view.current?.cardId===p.cardId,'CONFLICT','The review session changed.');assert(!p.variantId||view.current.variantId===p.variantId,'CONFLICT','The current review group changed.');shown=view.current.revealedGroups;p={...p,variantId:view.current.variantId};}return require('./review-content.cjs').render(state,set,raw,{variantId:p.variantId,shown});}
    if(method==='study.review.queue')return review.queue(M.findSet(await store.load(),p.setId),new Date(),p.deckId);
    if(method==='study.review.stats')return review.stats(M.findSet(await store.load(),p.setId));
    if(method==='study.search') {
      assert(p.query.trim() && p.query.length <= 1000, 'INVALID_PARAMS', 'Search text must contain 1–1000 characters.');
      const state=await store.load(),query=p.query.toLocaleLowerCase(),offset=p.offset??0,limit=p.limit??500;
      const cards=[];let total=0;
      for(const set of Object.values(state.studySets)) {
        if(set.deletedAt)continue;
        for(const card of set.cards) {
          if(!M.searchable(state,set,card).toLocaleLowerCase().includes(query))continue;
          const value=M.effective(state,set,card);
          if(total>=offset&&cards.length<limit)cards.push({setId:set.id,setTitle:set.title,cardId:card.id,title:value.title,text:value.editedText??value.text});
          total++;
        }
      }
      const hasMore=offset+cards.length<total;
      return {cards,total,offset,limit,hasMore,truncated:hasMore,nextOffset:hasMore?offset+cards.length:null};
    }
    if(method==='study.review.preview'){const set=M.findSet(await store.load(),p.setId);return review.preview(M.card(set,p.cardId),new Date(),set,p.variantId);}
    if(method==='study.cards.query'){
      const state=await store.load(),set=await M.describe(store,state,M.findSet(state,p.setId)),query=(p.query||'').toLocaleLowerCase();
      return {revision:set.revision,cards:set.cards.filter(c=>(!p.color||c.color===p.color)&&(!p.tag||c.tags.includes(p.tag))&&(!p.documentId||c.source?.documentId===p.documentId)&&(!query||M.searchable(state,set,c).toLocaleLowerCase().includes(query)))};
    }
    if(method==='study.card.render'){const state=await store.load(),set=M.findSet(state,p.setId);return require('./study-links.cjs').render(state,set,M.card(set,p.cardId));}
    if(method==='study.card.image'){const image=await cardImage(store,p.setId,p.cardId);return {mimeType:image.mimeType,contentBase64:image.bytes.toString('base64')};}
    let documentIds;
    const preparedMappings=method==='study.review.generate'&&p.rules?.documentHighlighter!==false?await capture.prepareMappings(p):null;
    const preparedMedia=method==='study.media.import'?await media.prepare(p):null;
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
        state.studySets[id]=set;require('./study-library.cjs').assignNew(state,id,p.folderId);return {setId:id};
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
        value.media=[];
        if(p.includeImages)for(const [mediaId,metadata] of Object.entries(set.mediaAssets||{})){
          const asset=await require('./study-media.cjs').readMedia(store,set.id,mediaId);
          value.media.push({...metadata,contentBase64:asset.bytes.toString('base64')});
        }
        value.note='For original documents, related studies, trash and undo history use study.package.export.';
        const json=JSON.stringify(value,null,2);assert(Buffer.byteLength(json)<=256*1024*1024,'TOO_LARGE','Study export exceeds 256 MiB.');
        await writeNew(file,json);rollback(()=>fs.rm(file,{force:true}));return {path:rel,bytes:Buffer.byteLength(json),cards:set.cards.length};
      }
      M.revision(set,p.expectedRevision);
      if(method==='study.undo'||method==='study.redo') {
        const changed=history.restoreGroup(state,set,method.split('.')[1]);for(const owner of changed){if(state.settings.activeStudySet===owner.id&&!owner.documentIds.includes(state.settings.lastDocument))state.settings.lastDocument=null;M.touch(owner);}return {setId:set.id};
      }
      require('./study-notebooks.cjs').guard(set,method,p);
      if(!['study.remove','study.restore','study.view.set'].includes(method))history.checkpoint(set);
      if(require('./study-ink-tools.cjs').methods.has(method))await require('./study-ink-tools.cjs').request(store,state,set,method,p);
      else if(method==='study.toc.import')await require('./outline-batch.cjs').importStudy(store,state,set,p);
      else if(require('./study-tools.cjs').methods.has(method))await require('./study-tools.cjs').request(store,state,set,method,p);
      else if(method==='study.cards.move')require('./study-tree.cjs').move(set,p);
      else if(method==='study.card.insert'){assert((p.text||'').length<=20000,'INVALID_PARAMS','Card body exceeds 20000 characters.');require('./study-tree.cjs').insert(set,p);}
      else if(method==='study.map.preferences'){const {setId,expectedRevision,...patch}=p;assert(Object.keys(patch).length,'INVALID_PARAMS','Supply a map preference.');set.map={...set.map,tools:{...set.map?.tools,...patch}};}
      else if(require('./study-notebooks.cjs').writes.has(method))await require('./study-notebooks.cjs').request(store,state,set,method,p,rollback);
      else if(content.writes.has(method))await content.request(media,state,set,method,p,preparedMedia,rollback);
      else if(['study.cards.batch','study.cards.copy','study.cards.organize','study.card.position','study.cards.sort','study.submap.configure','study.submap.open','study.summary.create','study.card.split','study.board.save','study.board.remove','study.board.materialize','study.capture.settings','study.appearance.set'].includes(method))await require('./study-organize.cjs').request(store,state,set,method,p,rollback);
      else if(method==='study.annotation.update') require('./study-navigation.cjs').updateAnnotation(set,p);
      else if(method==='study.card.emphasis.set')require('./study-emphasis.cjs').update(state,set,p);
      else if(method==='study.review.generate'){if(preparedMappings)await capture.applyMappings(state,set,preparedMappings);try{require('./study-emphasis.cjs').generate(state,set,p);}catch(error){if(preparedMappings?.report.skipped.length){error.details={...error.details,mappingRepair:preparedMappings.report};error.message+=' '+[...new Set(preparedMappings.report.skipped.map(s=>s.message))].join(' ');}throw error;}if(preparedMappings)set.lastReviewBatch.mappingRepair=preparedMappings.report;}
      else if(method==='study.navigation.set') set.navigation={...set.navigation,mode:p.mode};
      else if(/^(study\.layer\.|study\.canvas\.|study\.deck\.|study\.ink\.transform$|study\.note\.(anchor|place)$|study\.map\.configure$|study\.cards\.(group|merge)$|study\.review\.settings$)/.test(method))await require('./study-advanced.cjs').request(store,state,set,method,p);
      else if(method==='study.card.reference'){const target=M.findSet(state,p.targetSetId),original=M.card(target,p.targetCardId),node=require('./study-advanced.cjs').note(set,original.title,original.text);node.reference={setId:target.id,cardId:original.id};}
      else if(method==='study.ink.add')await require('./study-ink.cjs').add(store,state,set,p);
      else if(method==='study.ink.remove')require('./study-ink.cjs').remove(set,p);
      else if(method==='study.view.set'){set.view=p.view;if(p.view==='review'&&(!set.reviewSession?.id||set.reviewSession.finished))require('./study-learning.cjs').startSession(state,set,{mode:'scheduled',sort:'due'});}
      else if(method==='study.note.create') {
        assert(set.cards.length<10000,'TOO_LARGE','A study set supports at most 10000 cards.');
        assert((p.text||'').length<=20000,'INVALID_PARAMS','Note exceeds 20000 characters.');
        const now=new Date().toISOString(),node={id:randomUUID(),kind:'note',title:M.title(p.title),text:p.text||'',note:'',tags:M.tags(p.tags||[]),color:M.color(p.color||'yellow'),source:null,image:null,parentId:null,collapsed:false,createdAt:now,updatedAt:now};
        if(p.submap)node.submap=true;set.cards.push(node);if(p.parentId)M.move(set,node,p.parentId);
      } else if(method==='study.link.add') {
        const target=p.toSetId?M.findSet(state,p.toSetId):set;M.card(set,p.from);M.card(target,p.to);assert(target.id!==set.id||p.from!==p.to,'INVALID_PARAMS','Choose two different cards.');
        assert((p.label||'').length<=200,'INVALID_PARAMS','Link label exceeds 200 characters.');set.links??=[];
        if(p.curve)content.validateCurve(p.curve);
        assert(!set.links.some(l=>l.from===p.from&&l.to===p.to&&(l.toSetId||set.id)===target.id||target.id===set.id&&(!l.toSetId||l.toSetId===set.id)&&(l.bidirectional||p.bidirectional!==false)&&l.from===p.to&&l.to===p.from),'ALREADY_EXISTS','These cards are already linked.');
        set.links.push({id:randomUUID(),from:p.from,to:p.to,...(target.id!==set.id?{toSetId:target.id}:{}),label:p.label||'',bidirectional:p.bidirectional??true,...(p.curve?{curve:p.curve}:{})});
      } else if(method==='study.link.remove') {
        assert(set.links?.some(l=>l.id===p.linkId),'NOT_FOUND','Link does not exist.');set.links=set.links.filter(l=>l.id!==p.linkId);
      } else if(method==='study.review.configure'||method==='study.review.grade') {
        const card=M.card(set,p.cardId);if(method==='study.review.configure')review.configure(card,p,set,state.settings);else review.grade(card,p.rating,set,p.variantId);
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
        set.links??=[];for(const link of entry.links||[])if(ids.has(link.from)&&(link.toSetId&&link.toSetId!==set.id||ids.has(link.to))&&!set.links.some(l=>l.id===link.id))set.links.push(link);
      } else if(method.startsWith('study.card.')) {
        const card=M.card(set,p.cardId);
        if(card.anchor?.layerId)require('./study-advanced.cjs').editable(set,card.anchor.layerId);
        if(method==='study.card.ink.add') {
          p={...p,width:require('./study-ink-tools.cjs').width(set,p,'card')};
          require('./study-advanced.cjs').editable(set,p.layerId||set.activeLayer||'default');
          assert(Array.isArray(p.points)&&p.points.length>=2&&p.points.length<=2048&&p.points.every(pt=>Array.isArray(pt)&&[2,3].includes(pt.length)&&pt.every(Number.isFinite)&&pt.slice(0,2).every(v=>v>=-1000&&v<=1000)&&(pt.length===2||pt[2]>=0&&pt[2]<=1)),'INVALID_PARAMS','Invalid card ink points.');
          if(p.imageBounds)assert(require('./study-emphasis.cjs').rect(p.imageBounds)&&card.image,'INVALID_PARAMS','Image bounds must fit a card containing an image.');
          const imageInk=require('./image-ink.cjs');if(p.imageBound)assert(p.imageBounds&&card.image&&!card.reference,'INVALID_PARAMS','Image-bound ink needs an owned image and its drawing bounds.');
          const aspect=p.aspectRatio?1/p.aspectRatio:(card.style?.height||set.appearance?.height||226)/(card.style?.width||set.appearance?.width||236),geometry=await require('./stroke-geometry.cjs').resolve(set,p,aspect,1000,-1000);
          require('./study-ink-tools.cjs').attributes(p);M.color(p.color);if(await require('./stroke-geometry.cjs').erase(store,state,set,p,'card',geometry)){M.touch(set);return {setId:set.id};}
          const strokes=require('./stroke-geometry.cjs').pieces(geometry).flatMap(piece=>{const stroke={id:randomUUID(),...piece,...(!p.imageBound&&piece.points.some(pt=>pt[0]<0||pt[1]<0||pt[0]>1||pt[1]>1)?{space:'card-relative'}:{}),color:M.color(p.color),width:p.width,...(p.reviewSide?{reviewSide:p.reviewSide}:{}),...(p.imageBounds?{imageBounds:p.imageBounds,aspectRatio:p.aspectRatio||1,imageBound:p.imageBound??p.points.every(pt=>imageInk.inside(pt,p.imageBounds))}:{}),...require('./study-ink-tools.cjs').attributes(p),layerId:p.layerId||set.activeLayer||'default'};
          return imageInk.bound(stroke)?imageInk.clipped(stroke,p.imageBounds):[stroke];});assert(strokes.length,'INVALID_PARAMS','Draw inside the selected image.');card.ink??=[];assert(card.ink.length+strokes.length<=500,'TOO_LARGE','Card ink limit reached.');card.ink.push(...strokes);set.lastInk={scope:'card',cardId:card.id,strokeIds:strokes.map(s=>s.id),recognizedShape:geometry.recognizedShape};
        } else if(method==='study.card.ink.remove') {
          const stroke=card.ink?.find(s=>s.id===p.strokeId);assert(stroke,'NOT_FOUND','Card stroke not found.');require('./study-advanced.cjs').editable(set,stroke.layerId);card.ink=card.ink.filter(s=>s.id!==p.strokeId);
        } else if(method==='study.card.update') {
          assert(['title','note','text','editedText','tags','color','collapsed'].some(k=>p[k]!==undefined),'INVALID_PARAMS','Provide a card field to update.');
          if(p.title!==undefined){if(card.title!==p.title&&card.mindmap?.runs)delete card.mindmap.runs;card.title=M.title(p.title);}
          if(p.note!==undefined){assert(p.note.length<=20000,'INVALID_PARAMS','Note exceeds 20000 characters.');card.note=p.note;}
          if(p.editedText!==undefined){assert(p.editedText.length<=20000,'INVALID_PARAMS','Edited text exceeds 20000 characters.');card.editedText=p.editedText;}
          if(p.color!==undefined)card.color=M.color(p.color);
          if(p.collapsed!==undefined)card.collapsed=p.collapsed;
          if(p.tags!==undefined)card.tags=M.tags(p.tags);
          if(p.text!==undefined){assert(!card.source,'INVALID_PARAMS','Excerpt text is immutable; edit its note instead.');assert(p.text.length<=20000,'INVALID_PARAMS','Text exceeds 20000 characters.');card.text=p.text;}
          card.updatedAt=new Date().toISOString();
        } else if(method==='study.card.move'){M.move(set,card,p.parentId??null,p.index);if(p.x!==undefined||p.y!==undefined){assert(p.x!==undefined&&p.y!==undefined&&(!card.parentId||M.card(set,card.parentId).submap),'INVALID_PARAMS','Free positions require a root or submap child and both coordinates.');card.position={x:p.x,y:p.y};}else delete card.position;}
        else if(method==='study.card.remove') {
          const ids=p.mode==='subtree'?M.subtree(set.cards,card.id):new Set([card.id]);
          const removed=set.cards.filter(c=>ids.has(c.id));if(ids.has(set.map?.focusId))set.map.focusId=null;if(ids.has(set.map?.submapId))set.map.submapId=null;
          if(p.mode!=='subtree')for(const c of set.cards)if(c.parentId===card.id)c.parentId=card.parentId;
          set.cards=M.order(set.cards.filter(c=>!ids.has(c.id)));
          const attached=l=>ids.has(l.from)||(!l.toSetId||l.toSetId===set.id)&&ids.has(l.to);const links=(set.links||[]).filter(attached);set.links=(set.links||[]).filter(l=>!attached(l));
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
  return {request,close:async()=>{await av.close();await Promise.all([capture.close(),media.close(),exports.close()]);},readAsset:async asset=>{
    const attachment=/^study-media\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.(png|wav|mp3|m4a|ogg|webm)$/.exec(asset);
    if(attachment){const result=await require('./study-media.cjs').readMedia(store,attachment[1],attachment[2]);assert(result.metadata.extension===attachment[3],'SCOPE_DENIED','Attachment extension mismatch.');return result;}
    const m=/^study-card\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.png$/.exec(asset);assert(m,'SCOPE_DENIED','Invalid study card asset.');return cardImage(store,m[1],m[2]);
  }};
}
module.exports={createStudies};
