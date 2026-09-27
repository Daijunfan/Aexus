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
  assert(doc.kind === 'pdf', 'INVALID_PARAMS', 'Handwriting currently requires a PDF document.');
  assert(doc.sourceVersion === p.expectedSourceVersion && !(await sourceStatus(store, doc)).changed, 'SOURCE_CHANGED', 'Source changed. Reopen before annotating.');
  validateLocator({ page: p.page }, await parsedDocument(store, doc));
  assert(Array.isArray(p.points) && p.points.length >= 2 && p.points.length <= 2048 && p.points.every(pt => Array.isArray(pt) && (pt.length === 2 || pt.length === 3) && pt.every(v => Number.isFinite(v) && v >= 0 && v <= 1)), 'INVALID_PARAMS', 'A stroke needs 2–2048 normalized [x,y] points.');
  set.ink ??= []; assert(set.ink.length < 2000, 'TOO_LARGE', 'A study set supports at most 2000 handwriting strokes.');
  set.ink.push({ id: randomUUID(), documentId: doc.id, sourceHash: doc.hash, page: p.page, layerId, points: p.points, color: M.color(p.color), width: p.width, createdAt: new Date().toISOString() });
}
function remove(set, p) {
  assert(set.ink?.some(s => s.id === p.strokeId), 'NOT_FOUND', 'Stroke not found.');
  require('./study-advanced.cjs').editable(set,set.ink.find(s=>s.id===p.strokeId).layerId);
  set.ink = set.ink.filter(s => s.id !== p.strokeId);
}
module.exports = { add, remove };
