"use strict";
const { randomUUID } = require('node:crypto');
const { assert } = require('./safety.cjs');
const M = require('./study-model.cjs');
const { findDocument, sourceStatus, parsedDocument } = require('./documents.cjs');
const { validateLocator } = require('./outline.cjs');
const history = require('./study-history.cjs');

function resolveCard(state, setId, cardId) {
  const seen = new Set();
  let {set,card}=require('./card-location.cjs').locate(state,setId,cardId);
  while (card.reference) {
    const key = `${set.id}/${card.id}`;
    assert(!seen.has(key) && seen.size < 32, 'INVALID_REFERENCE', 'The card reference contains a cycle or is too deep.');
    seen.add(key);
    ({set,card}=require('./card-location.cjs').locate(state,card.reference.setId,card.reference.cardId));
  }
  return { set, card };
}
async function target(store, state, set, card) {
  const source = card.source || card.anchor;
  if (!source) return null;
  assert(set.documentIds.includes(source.documentId), 'NOT_MEMBER', 'Restore this document membership before following the excerpt.');
  const doc = findDocument(state, source.documentId);
  const status = await sourceStatus(store, doc);
  assert(status.st?.isFile(), 'NOT_FOUND', 'The original document is unavailable; the saved excerpt is preserved.');
  assert(!status.changed && (source.hash || source.sourceHash) === doc.hash, 'SOURCE_CHANGED', 'The original changed. Rebind the excerpt explicitly; old coordinates were not applied.');
  const parsed = await parsedDocument(store, doc);
  let locator = { ...source.locator };
  if (doc.kind === 'pdf' && source.selection?.rects?.length) {
    const first = [...source.selection.rects].sort((a, b) => a.page - b.page || a.y - b.y)[0];
    locator = { page: first.page, pageOffset: first.y };
  } else if (Number.isInteger(source.selection?.start)) {
    locator.textOffset = source.selection.start;
  }
  locator = validateLocator(locator, parsed);
  require('./study-notebooks.cjs').book(set,source.documentId,source.notebookId||'default');
  return { documentId: doc.id, path: doc.path, locator, selection: source.selection || null,notebookId:source.notebookId||'default' };
}
function revealBranch(set, id) {
  const node = M.card(set, id), ancestors = new Set();
  let parent = node.parentId;
  while (parent) {
    assert(!ancestors.has(parent), 'INVALID_OUTLINE', 'Card hierarchy contains a cycle.');
    ancestors.add(parent); parent = M.card(set, parent).parentId;
  }
  const collapsed = set.cards.filter(c => ancestors.has(c.id) && c.collapsed);
  const outside = set.map?.focusId && !M.subtree(set.cards, set.map.focusId).has(id);
  const submapId=[...ancestors].find(id=>M.card(set,id).submap)||null;
  const changeSubmap=(set.map?.submapId||null)!==submapId;
  const cardBox=node.inMap===false&&set.view!=='cards';
  if (collapsed.length || outside || changeSubmap || cardBox) {
    history.checkpoint(set);
    collapsed.forEach(c => { c.collapsed = false; });
    if (outside) set.map.focusId = null;
    if(changeSubmap)set.map={...set.map,submapId,focusId:null};
    if(cardBox)set.view='cards';
    M.touch(set);
  }
}
async function activate(store, p) {
  return store.transaction(async state => {
    const {set:initial,card:original}=require('./card-location.cjs').locate(state,p.setId,p.cardId);
    const mode = initial.navigation?.mode || 'both', origin = p.origin || 'map';
    const linked = p.force === true || mode === 'both' || mode === (origin === 'map' ? 'map-to-document' : 'document-to-map');
    let set = initial, card = original, source = null;
    if (linked && origin === 'map') {
      ({ set, card } = resolveCard(state, initial.id, original.id));
      if(p.excerptId){const part=require('./excerpt-parts.cjs').parts(card).find(part=>part.id===p.excerptId);assert(part,'NOT_FOUND','Excerpt part no longer exists.');source=await target(store,state,set,{...card,source:part.source});source.excerptId=part.id;}else source = await target(store, state, set, card);
      if (!source) state.settings.lastDocument = null;
      if (source) {
        const doc = findDocument(state, source.documentId);
        // A source jump always reveals a previously folded target page.
        require('./document-layout.cjs').unfoldTarget(doc,source.locator);
        doc.position = source.locator;
        state.settings.lastDocument = doc.id;
        state.settings.openDocuments = [...new Set([...(state.settings.openDocuments || []), doc.id])].slice(-(state.settings.tabLimit||20));
      }
    }
    if(source&&!require('./study-notebooks.cjs').visible(set,source)){history.checkpoint(set);require('./study-notebooks.cjs').reveal(set,source);M.touch(set);}
    if (linked) revealBranch(set, card.id);
    state.settings.activeStudySet = set.id;
    state.settings.studySelection = { setId: set.id, cardId: card.id, origin, linked, serial: state.revision + 1 };
    return { setId: set.id, cardId: card.id, linked, source, set: await M.describe(store, state, set) };
  });
}
async function ensureDocumentStudy(store, p) {
  return store.transaction(async state => {
    const doc = findDocument(state, p.id);
    let set = Object.values(state.studySets).find(s => !s.deletedAt && s.documentNotesFor === doc.id);
    if (!set) {
      const now = new Date().toISOString();
      set = { id: randomUUID(), title: `文档笔记 · ${doc.title}`.slice(0, 200), description: '', revision: 1,
        documentIds: [doc.id], documentNotesFor: doc.id, cards: [], cardTrash: [], view: 'documents', captureSettings:{inMap:true},
        createdAt: now, updatedAt: now };
      state.studySets[set.id] = set;
    }
    if (p.activate !== false) { state.settings.activeStudySet = set.id; state.settings.lastDocument = doc.id; }
    return M.describe(store, state, set);
  });
}
function updateAnnotation(set, p) {
  const card = M.card(set, p.cardId);
  assert(card.source, 'INVALID_PARAMS', 'This card has no document excerpt annotation.');
  assert(p.visible !== undefined || p.style !== undefined, 'INVALID_PARAMS', 'Supply visible or style.');
  card.annotation = { visible: true, style: 'highlight', ...card.annotation,
    ...(p.visible === undefined ? {} : { visible: p.visible }), ...(p.style === undefined ? {} : { style: p.style }) };
  card.updatedAt = new Date().toISOString();
}
module.exports = { activate, ensureDocumentStudy, resolveCard, target, updateAnnotation };
