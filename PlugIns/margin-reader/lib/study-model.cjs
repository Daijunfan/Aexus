'use strict';
const { assert } = require('./safety.cjs');
const { sourceStatus } = require('./documents.cjs');
const COLORS = Object.freeze({ yellow: '#f4c84b', green: '#58b985', blue: '#54a4ed', purple: '#aa86d9', pink: '#e689ac', orange: '#ec9b52' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function findSet(state, id, deleted = false) {
  const set = typeof id === 'string' && Object.hasOwn(state.studySets, id) ? state.studySets[id] : null;
  assert(set && (deleted || !set.deletedAt), 'NOT_FOUND', 'Study set does not exist or is in the study-set trash.');
  return set;
}
function revision(set, expected) { assert(set.revision === expected, 'CONFLICT', 'Study set changed in another client. Refresh and explicitly retry.', { currentRevision: set.revision }); }
function touch(set) { set.revision++; set.updatedAt = new Date().toISOString(); }
function title(value) { assert(typeof value === 'string' && value.trim() && value.trim().length <= 200, 'INVALID_PARAMS', 'Title must contain 1–200 characters.'); return value.trim(); }
function color(value) { assert(Object.hasOwn(COLORS, value), 'INVALID_PARAMS', 'Unknown highlight color.'); return value; }
function card(set, id) { const c = set.cards.find(c => c.id === id); assert(c, 'NOT_FOUND', 'Card does not exist in this study set.'); return c; }
function tags(value) {
  assert(Array.isArray(value) && value.length <= 30 && value.every(t => typeof t === 'string' && t.trim() && t.trim().length <= 60), 'INVALID_PARAMS', 'Use at most 30 tags of 1–60 characters.');
  return [...new Set(value.map(t => t.trim()))];
}
function summary(set) { return { id: set.id, title: set.title, description: set.description, revision: set.revision, documentCount: set.documentIds.length, cardCount: set.cards.length, createdAt: set.createdAt, updatedAt: set.updatedAt, deletedAt: set.deletedAt || null }; }
function subtree(nodes, id) {
  const ids = new Set([id]);
  for (let changed = true; changed;) { changed = false; for (const n of nodes) if (ids.has(n.parentId) && !ids.has(n.id)) { ids.add(n.id); changed = true; } }
  return ids;
}
function order(nodes) {
  const byParent = new Map(), output = [], visited = new Set();
  for (const n of nodes) { if (!byParent.has(n.parentId)) byParent.set(n.parentId, []); byParent.get(n.parentId).push(n); }
  const walk = (parent, depth) => {
    assert(depth <= 64, 'INVALID_OUTLINE', 'Mind map depth exceeds 64 levels.');
    for (const n of byParent.get(parent) || []) { assert(!visited.has(n.id), 'INVALID_OUTLINE', 'Mind map contains a cycle.'); visited.add(n.id); output.push(n); walk(n.id, depth + 1); }
  };
  walk(null, 0); assert(output.length === nodes.length, 'INVALID_OUTLINE', 'Mind map contains a cycle or missing parent.'); return output;
}
function move(set, node, parentId, index) {
  assert(parentId === null || set.cards.some(c => c.id === parentId), 'NOT_FOUND', 'Parent card is not in this study set.');
  assert(!subtree(set.cards, node.id).has(parentId), 'INVALID_OUTLINE', 'A card cannot contain itself or one of its ancestors.');
  const siblings = set.cards.filter(c => c.parentId === parentId && c.id !== node.id), others = set.cards.filter(c => c.id !== node.id);
  index ??= siblings.length;
  assert(Number.isInteger(index) && index >= 0 && index <= siblings.length, 'INVALID_PARAMS', 'Sibling index is out of range.');
  node.parentId = parentId; const before = siblings[index]; others.splice(before ? others.indexOf(before) : others.length, 0, node); set.cards = order(others);
}
async function describe(store, state, set) {
  const ids = new Set([...set.documentIds, ...set.cards.filter(c => c.source).map(c => c.source.documentId), ...set.cards.filter(c=>c.anchor).map(c=>c.anchor.documentId), ...(set.ink || []).map(s => s.documentId)]), documents = new Map();
  for (const id of ids) {
    const doc = Object.hasOwn(state.documents, id) ? state.documents[id] : null;
    let source = null;
    if (doc && !doc.trashed) source = await sourceStatus(store, doc).catch(() => null);
    documents.set(id, { id, path: doc?.path || null, title: doc?.title || 'Unavailable document', format: doc?.format || '', kind: doc?.kind, available: Boolean(source?.st?.isFile()), sourceChanged: !source || source.changed, hash: doc?.hash });
  }
  return { ...summary(set), documentIds: [...set.documentIds], documents: set.documentIds.map(id => { const { hash, ...publicDoc } = documents.get(id); return publicDoc; }),
    cards: set.cards.map(c => { if (!c.source) return { ...c, anchorChanged: c.anchor ? (!documents.get(c.anchor.documentId)?.available || documents.get(c.anchor.documentId)?.sourceChanged || documents.get(c.anchor.documentId)?.hash !== c.anchor.sourceHash) : false, referenceAvailable:c.reference ? Boolean(state.studySets[c.reference.setId]&&!state.studySets[c.reference.setId].deletedAt&&state.studySets[c.reference.setId].cards.some(n=>n.id===c.reference.cardId)):false, kind: 'note', tags: c.tags || [], imageAsset: null, sourceAvailable: false, sourceChanged: false, detached: false }; const d = documents.get(c.source.documentId); return { ...c, kind: 'excerpt', tags: c.tags || [], imageAsset: `study-card/${set.id}/${c.id}.png`, sourcePath: d?.path || c.source.path, sourceTitle: d?.title || c.source.title, sourceAvailable: Boolean(d?.available), sourceChanged: !d || d.sourceChanged || d.hash !== c.source.hash, detached: !set.documentIds.includes(c.source.documentId) }; }),
    canvasInk:set.canvasInk||[], layers: require('./study-advanced.cjs').layers(set), activeLayer:set.activeLayer||'default', map:set.map||{layout:'tree',focusId:null},decks:set.decks||[],reviewSettings:set.reviewSettings||{retention:.9,maximumInterval:36500}, links: set.links || [], view: set.view || 'map', history: { canUndo: Boolean(set.history?.undo.length), canRedo: Boolean(set.history?.redo.length) }, review: require('./study-review.cjs').queue(set),
    ink: (set.ink || []).map(s => { const d=documents.get(s.documentId);return {...s,sourceChanged:!d||d.sourceChanged||d.hash!==s.sourceHash}; }),
    cardTrash: set.cardTrash.map(t => ({ id: t.id, removedAt: t.removedAt, count: t.cards.length, title: t.cards[0]?.title })), colors: COLORS };
}
module.exports = { COLORS, UUID, findSet, revision, touch, title, color, card, tags, summary, subtree, order, move, describe };
