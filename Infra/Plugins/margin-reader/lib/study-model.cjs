'use strict';
const { assert } = require('./safety.cjs');
const { sourceStatus } = require('./documents.cjs');
const COLORS = Object.freeze({ yellow: '#f4c84b', green: '#58b985', blue: '#54a4ed', purple: '#aa86d9', pink: '#e689ac', orange: '#ec9b52', red:'#e35d6a', teal:'#36a6a1', cyan:'#54c0db', indigo:'#7272cc', lime:'#98b548', brown:'#af845f', gray:'#92969d', rose:'#cc6d83', olive:'#86965f', slate:'#6e8caa' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function findSet(state, id, deleted = false) {
  const set = typeof id === 'string' && Object.hasOwn(state.studySets, id) ? state.studySets[id] : null;
  assert(set && (deleted || !set.deletedAt), 'NOT_FOUND', 'Study set does not exist or is in the study-set trash.');
  return set;
}
function revision(set, expected) { assert(set.revision === expected, 'CONFLICT', 'Study set changed in another client. Refresh and explicitly retry.', { currentRevision: set.revision }); }
function touch(set) { set.revision++; set.updatedAt = new Date().toISOString(); }
function title(value) { assert(typeof value === 'string' && value.trim() && value.trim().length <= 200, 'INVALID_PARAMS', 'Title must contain 1–200 characters.'); return value.trim(); }
function color(value) { assert(typeof value==='string'&&(Object.hasOwn(COLORS,value)||/^#[0-9a-f]{6}$/i.test(value)), 'INVALID_PARAMS', 'Use a palette color or #RRGGBB.'); return value; }
function card(set, id) { const c = set.cards.find(c => c.id === id); assert(c, 'NOT_FOUND', 'Card does not exist in this study set.'); return c; }
function tags(value) {
  assert(Array.isArray(value) && value.length <= 30 && value.every(t => typeof t === 'string' && t.trim() && t.trim().length <= 60), 'INVALID_PARAMS', 'Use at most 30 tags of 1–60 characters.');
  return [...new Set(value.map(t => t.trim()))];
}
function summary(set) { return { id: set.id, title: set.title, documentNotesFor: set.documentNotesFor || null, description: set.description, revision: set.revision, documentCount: set.documentIds.length, cardCount: set.cards.length, createdAt: set.createdAt, updatedAt: set.updatedAt, deletedAt: set.deletedAt || null }; }
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
// References keep their own identity, placement and comments while presenting
// current target content. Broken/cyclic targets never resolve outside this state.
function effective(state, set, card) {
  if (!card.reference || card.reference.live === false) return card;
  const seen = new Set([`${set.id}/${card.id}`]);
  let target = card, owner = set;
  while (target.reference && target.reference.live !== false) {
    const ref = target.reference, key = `${ref.setId}/${ref.cardId}`;
    if (seen.has(key) || seen.size >= 32) return { ...card, referenceAvailable: false, referenceStatus: 'cycle' };
    seen.add(key);
    try{const found=require('./card-location.cjs').locate(state,ref.setId,ref.cardId);owner=found.set;target=found.card;}catch(error){return {...card,referenceAvailable:false,referenceStatus:error.code==='INVALID_REFERENCE'?'cycle':'missing'};}
  }
  const asset = target.mediaId && owner.mediaAssets?.[target.mediaId];
  return { ...card, title: target.title, text: target.text, editedText: target.editedText,
    referenceSnapshot: { title: card.title, text: card.text }, referenceAvailable: true, referenceStatus: 'live',
    referenceTarget: { setId: owner.id, cardId: target.id },
    ...(target.image ? { image: target.image, imageAsset: asset ? require('./study-media.cjs').asset(owner.id, asset) : `study-card/${owner.id}/${target.id}.png` } : {}) };
}
function searchable(state, set, card) {
  const value = effective(state, set, card);
  return [value.title, value.text, value.editedText, value.note, ...(value.tags || []),
    ...(value.comments || []).filter(c => !c.deletedAt).map(c => c.text || '')].join('\n');
}
async function describe(store, state, set) {
  const ids = new Set([...set.documentIds,...set.documentIds.flatMap(id=>(state.documents[id]?.virtual?.pages||[]).filter(p=>!p.blank).map(p=>p.documentId)),...set.cards.flatMap(c=>[c.source,...(c.excerpts||[]).map(p=>p.source)].filter(Boolean).flatMap(source=>(source.virtualSources||[]).map(s=>s.documentId))), ...set.cards.filter(c => c.source).map(c => c.source.documentId), ...set.cards.filter(c=>c.anchor).map(c=>c.anchor.documentId), ...set.cards.flatMap(c=>(c.excerpts||[]).map(p=>p.source.documentId)), ...(set.ink || []).map(s => s.documentId)]), documents = new Map();
  for (const id of ids) {
    const doc = Object.hasOwn(state.documents, id) ? state.documents[id] : null;
    let source = null;
    if (doc && !doc.trashed) source = await sourceStatus(store, doc).catch(() => null);
    documents.set(id, { id, path: doc?.path || null, title: doc?.title || 'Unavailable document', format: doc?.format || '', kind: doc?.kind, sourceVersion:source?.st?require('./safety.cjs').version(source.st):null,bytes:source?.st?.size??null,updatedAt:doc?.updatedAt||null,available: Boolean(source?.st?.isFile()), sourceChanged: !source || source.changed, hash: doc?.hash });
  }
  const projectAnnotations=require('./virtual-document.cjs').projector(state,set,documents);
  const notebooks=require('./study-notebooks.cjs');
  return { ...summary(set),documentNotebooks:Object.fromEntries(set.documentIds.map(id=>[id,notebooks.list(set,id)])),activeNotebooks:set.activeNotebooks||{},lastNotebookId:set.lastNotebookId||null,versionRecords:set.versionRecords||[],versionPolicy:set.versionPolicy||{enabled:false,intervalSeconds:600},lastVersionId:set.lastVersionId||null,lastOutlineImport:set.lastOutlineImport||null, tools:require('./ink-toolbar.cjs').tools(set),inkToolbar:require('./ink-toolbar.cjs').describe(set),activeTools:set.activeTools||{},palette:set.palette?.length?set.palette:null,menuSettings:set.menuSettings||{},lastToolId:set.lastToolId||null,lastReviewBatch:set.lastReviewBatch||null,reviewSession:require('./study-learning.cjs').sessionView(set,state),recall:set.recall||{enabled:false,scope:'both',mode:'mask',revealedIds:[]},presentation:set.presentation||null, inkSettings:set.inkSettings||{},inkBinding:set.inkBinding||{},inkRulers:set.inkRulers||{},lastInk:set.lastInk||null,documentNotesFor:set.documentNotesFor||null, navigation:set.navigation||{mode:'both'}, boards:set.boards||[], captureSettings:set.captureSettings||{}, appearance:set.appearance||{}, submaps:set.cards.filter(c=>c.submap).map(c=>({id:c.id,title:c.title,parentId:c.parentId})), lastPlacedNote:set.lastPlacedNote||null, lastCopy:set.lastCopy||null,lastInsertedCard:set.lastInsertedCard||null, lastMedia:set.lastMedia||null, linkSettings:set.linkSettings||{}, selection:state.settings.studySelection?.setId===set.id?state.settings.studySelection:null, documentIds: [...set.documentIds], documents: set.documentIds.map(id => { const { hash, ...publicDoc } = documents.get(id); return publicDoc; }),
    cards: set.cards.map(c => { if (!c.source) return { ...c, anchorChanged: c.anchor ? (!documents.get(c.anchor.documentId)?.available || documents.get(c.anchor.documentId)?.sourceChanged || documents.get(c.anchor.documentId)?.hash !== c.anchor.sourceHash) : false, referenceAvailable:c.reference ? Boolean(state.studySets[c.reference.setId]&&!state.studySets[c.reference.setId].deletedAt&&state.studySets[c.reference.setId].cards.some(n=>n.id===c.reference.cardId)):false, kind: 'note', tags: c.tags || [], imageAsset: null, sourceAvailable: false, sourceChanged: false, detached: false }; const d = documents.get(c.source.documentId); return { ...c, kind: 'excerpt', tags: c.tags || [], imageAsset: `study-card/${set.id}/${c.id}.png`, sourcePath: d?.path || c.source.path, sourceTitle: d?.title || c.source.title, sourceAvailable: Boolean(d?.available), sourceChanged: !d || d.sourceChanged || d.hash !== c.source.hash, detached: !set.documentIds.includes(c.source.documentId) }; }).map(c=>{const value=effective(state,set,require('./study-media.cjs').describeCard(set,c));return {...value,ink:(value.ink||[]).map(s=>({...s,imageBound:require('./image-ink.cjs').bound(s)})),notebookVisible:notebooks.visible(set,c.source||c.anchor),notebookLocked:Boolean(notebooks.forSource(set,c.source||c.anchor)?.locked),annotationLocations:projectAnnotations(c).map(location=>({...location,notebookVisible:notebooks.visible(set,require('./excerpt-parts.cjs').parts(c).find(p=>p.id===location.partId)?.source||c.source)})),excerptParts:require('./excerpt-parts.cjs').parts(c).map(part=>{const d=documents.get(part.source.documentId);return {...part,notebookVisible:notebooks.visible(set,part.source),sourceAvailable:Boolean(d?.available),sourceChanged:!d||d.sourceChanged||d.hash!==part.source.hash};})};}),
    canvasInk:set.canvasInk||[], layers: require('./study-advanced.cjs').layers(set), activeLayer:set.activeLayer||'default', map:{...(set.map||{layout:'tree',focusId:null}),mindmap:{...set.map?.mindmap,enabled:set.map?.mindmap?.enabled!==false}},decks:set.decks||[],reviewSettings:set.reviewSettings||{retention:.9,maximumInterval:36500}, links: set.links || [], view: set.view || 'map', history: { canUndo: Boolean(set.history?.undo.length), canRedo: Boolean(set.history?.redo.length) }, review: require('./study-review.cjs').queue(set),
    ink: (set.ink || []).map(s => { const d=documents.get(s.documentId);return {...s,notebookVisible:notebooks.visible(set,s),notebookLocked:Boolean(notebooks.forSource(set,s)?.locked),sourceChanged:!d||d.sourceChanged||d.hash!==s.sourceHash}; }),
    cardTrash: set.cardTrash.map(t => ({ id: t.id, removedAt: t.removedAt, count: t.cards.length, title: t.cards[0]?.title })), colors: {...COLORS,...Object.fromEntries([...set.cards,...(set.ink||[]),...(set.canvasInk||[]),...set.cards.flatMap(c=>c.ink||[])].map(c=>c.color).filter(c=>typeof c==='string'&&c.startsWith('#')).map(c=>[c,c]))} };
}
module.exports = { COLORS, UUID, findSet, revision, touch, title, color, card, tags, summary, subtree, order, move, describe, effective, searchable };
