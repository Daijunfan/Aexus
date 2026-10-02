"use strict";
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');

// Every call is supplied by the authenticated employee harness. No private state
// writes, direct runtime calls or mock responses can satisfy this acceptance.
exports.exercise = async function ({api, deny}) {
  let set = await api('study.create', {title:'Complete employee workflows'});
  const setId = set.id;
  const get = async () => set = await api('study.get', {setId});
  const change = async (method, params = {}) => {
    await get();
    return set = await api(method, {setId, expectedRevision:set.revision, ...params});
  };
  await change('study.documents.add', {paths:['Books/source.pdf','Books/guide.md']});
  let pdf = await api('document.open', {path:'Books/source.pdf',activate:false});
  const flow = await api('document.open', {path:'Books/guide.md',activate:false});
  const editDoc = async (method,params={}) => {
    pdf = await api('document.get',{id:pdf.id});
    return pdf = await api(method,{id:pdf.id,expectedRevision:pdf.revision,...params});
  };
  await editDoc('document.fold',{pages:[]});
  await change('study.note.create',{title:'Alpha concept',text:'Definition\n\nSecond paragraph'});
  const a = set.cards.at(-1).id;
  await change('study.note.create',{title:'Beta concept',text:'Related definition'});
  const b = set.cards.at(-1).id;
  await get();
  const capture = await api('study.card.create',{setId,expectedRevision:set.revision,
    documentId:pdf.id,expectedSourceVersion:pdf.sourceVersion,captureId:randomUUID(),
    text:'',title:'Employee source excerpt',color:'yellow',locator:{page:1},
    selection:{rects:[{page:1,x:.1,y:.1,width:.5,height:.15}]}});
  const excerptId = capture.card.id;
  const ctx={api,deny,get,change,setId,pdf,flow,a,b,excerptId,editDoc};
  await require('./agent-organization-surface.cjs').exercise(ctx);
  await require('./agent-reading-surface.cjs').exercise(ctx);
  await require('./agent-content-surface.cjs').exercise(ctx);
  await require('./agent-learning-surface.cjs').exercise(ctx);
  await require('./agent-notebook-surface.cjs').exercise(ctx);
  await require('./agent-tree-surface.cjs').exercise(ctx);
  await require('./agent-archive-surface.cjs').exercise(ctx);
  return {setId,cardId:excerptId};
};
