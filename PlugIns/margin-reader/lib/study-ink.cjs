'use strict';
const { randomUUID } = require('node:crypto');
const { assert } = require('./safety.cjs');
const { findDocument, parsedDocument, sourceStatus } = require('./documents.cjs');
const { validateLocator } = require('./outline.cjs');
const M = require('./study-model.cjs');
async function add(store, state, set, p) {
  const layerId=p.layerId||set.activeLayer||'default';require('./study-advanced.cjs').editable(set,layerId);
  assert(set.documentIds.includes(p.documentId), 'NOT_MEMBER', 'Document is not a member of the study set.');
  const doc = findDocument(state, p.documentId);
  const notebook=require('./study-notebooks.cjs').active(set,doc.id);require('./study-notebooks.cjs').editable(set,{documentId:doc.id,notebookId:notebook.id});
  assert(doc.kind === 'pdf', 'INVALID_PARAMS', 'Handwriting currently requires a PDF document.');
  assert(doc.sourceVersion === p.expectedSourceVersion && !(await sourceStatus(store, doc)).changed, 'SOURCE_CHANGED', 'Source changed. Reopen before annotating.');
  const parsed=await parsedDocument(store,doc);validateLocator({page:p.page},parsed);
  assert(Array.isArray(p.points) && p.points.length >= 2 && p.points.length <= 2048 && p.points.every(pt => Array.isArray(pt) && (pt.length === 2 || pt.length === 3) && pt.every(v => Number.isFinite(v) && v >= 0 && v <= 1)), 'INVALID_PARAMS', 'A stroke needs 2–2048 normalized [x,y] points.');
  p={...p,width:require('./study-ink-tools.cjs').width(set,p,'document')};
  const pageSize=parsed.sections[p.page-1],geometry=await require('./stroke-geometry.cjs').resolve(set,p,pageSize.height/pageSize.width);
  require('./study-ink-tools.cjs').attributes(p);M.color(p.color);if(await require('./stroke-geometry.cjs').erase(store,state,set,p,'document',geometry))return;
  const pieces=require('./stroke-geometry.cjs').pieces(geometry);set.ink ??= []; assert(set.ink.length+pieces.length <= 2000, 'TOO_LARGE', 'A study set supports at most 2000 handwriting strokes.');
  let context;
  if(doc.attachedTo){const pane=[state.settings.comparison,state.settings.comparisonExtra].find(v=>v?.documentId===doc.attachedTo.documentId),original=state.documents[doc.attachedTo.documentId];context={...doc.attachedTo,notebookHash:doc.hash,locator:pane?.locator||(original&&state.settings.lastDocument===original.id?original.position:{page:p.page})};}
  const strokes=pieces.map(piece=>({...(context?{context}:{}), id:randomUUID(), documentId: doc.id, notebookId:notebook.id, sourceHash: doc.hash, page: p.page, layerId, ...require('./study-ink-tools.cjs').attributes(p), ...piece, color: M.color(p.color), width: p.width, createdAt: new Date().toISOString() }));set.ink.push(...strokes);set.lastInk={scope:'document',strokeIds:strokes.map(s=>s.id),recognizedShape:geometry.recognizedShape};
}
function remove(set, p) {
  assert(set.ink?.some(s => s.id === p.strokeId), 'NOT_FOUND', 'Stroke not found.');
  require('./study-advanced.cjs').editable(set,set.ink.find(s=>s.id===p.strokeId).layerId);
  require('./study-notebooks.cjs').editable(set,set.ink.find(s=>s.id===p.strokeId));
  set.ink = set.ink.filter(s => s.id !== p.strokeId);
}
module.exports = { add, remove };
