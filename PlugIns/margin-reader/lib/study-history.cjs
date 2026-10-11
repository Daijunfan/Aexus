'use strict';
const { assert } = require('./safety.cjs');
// Images are immutable assets, so history stores metadata only. Revisions never rewind.
const fields = ['title', 'description', 'documentIds', 'cards', 'cardTrash', 'links', 'ink', 'canvasInk', 'layers', 'activeLayer', 'map', 'decks', 'reviewSettings', 'navigation', 'boards', 'captureSettings', 'appearance', 'mediaAssets', 'linkSettings', 'inkSettings', 'inkBinding', 'inkRulers', 'recall', 'reviewSession', 'presentation', 'tools', 'inkToolbar', 'activeTools', 'palette', 'menuSettings','cardRedirects','documentNotebooks','activeNotebooks'];
function snapshot(set) { return structuredClone(Object.fromEntries(fields.map(k => [k, set[k] ?? ({documentNotebooks:{},activeNotebooks:{},cardRedirects:{},activeLayer:'default',map:{},navigation:{mode:'both'},captureSettings:{},appearance:{},mediaAssets:{},linkSettings:{},inkSettings:{},inkBinding:{},inkRulers:{},inkToolbar:{},activeTools:{},palette:[],menuSettings:{},recall:{enabled:false,scope:'both',mode:'mask',revealedIds:[]},reviewSession:{},presentation:{},reviewSettings:{},layers:[{id:'default',title:'默认图层',visible:true,locked:false}]}[k] ?? [])]))); }
function trim(history) {
  while (history.undo.length + history.redo.length > 30 || Buffer.byteLength(JSON.stringify(history)) > 8 * 1024 * 1024) {
    if (history.undo.length) history.undo.shift(); else if (history.redo.length) history.redo.shift(); else break;
  }
}
function checkpoint(set) {
  set.history ??= { undo: [], redo: [] };
  set.history.undo.push(snapshot(set)); set.history.redo = []; trim(set.history);
}
function restore(set, direction) {
  const history = set.history, from = history?.[direction];
  assert(from?.length, 'NOT_FOUND', direction === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.');
  history[direction === 'undo' ? 'redo' : 'undo'].push(snapshot(set));
  const {historyTransaction,...value}=from.pop();Object.assign(set,value); trim(history);
}
function checkpointGroup(sets) {
  const marker={id:require('node:crypto').randomUUID(),owners:sets.map(s=>s.id)};
  for(const set of sets){checkpoint(set);assert(set.history.undo.length,'TOO_LARGE','This linked move exceeds the reversible history budget.');set.history.undo.at(-1).historyTransaction=marker;}
  return marker.id;
}
function restoreGroup(state,set,direction) {
  const entry=set.history?.[direction]?.at(-1),marker=entry?.historyTransaction;
  if(!marker){restore(set,direction);return [set];}
  assert(Array.isArray(marker.owners)&&marker.owners.length>0&&marker.owners.length<=1000&&new Set(marker.owners).size===marker.owners.length,'STATE_CORRUPT','Invalid linked history participants.');
  const owners=marker.owners.map(id=>{
    const other=Object.hasOwn(state.studySets,id)?state.studySets[id]:null;
    assert(other&&!other.deletedAt&&other.history?.[direction]?.at(-1)?.historyTransaction?.id===marker.id,'CONFLICT','A linked study was edited after this move. Undo its later changes first; no study was overwritten.');
    return other;
  });
  for(const owner of owners){restore(owner,direction);const opposite=direction==='undo'?'redo':'undo';assert(owner.history[opposite].length,'TOO_LARGE','Linked history exceeds the reversible budget.');owner.history[opposite].at(-1).historyTransaction=marker;}
  return owners;
}
module.exports = { checkpoint, restore, snapshot, checkpointGroup, restoreGroup };
