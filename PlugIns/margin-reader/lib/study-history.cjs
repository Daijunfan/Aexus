'use strict';
const { assert } = require('./safety.cjs');
// Images are immutable assets, so history stores metadata only. Revisions never rewind.
const fields = ['title', 'description', 'documentIds', 'cards', 'cardTrash', 'links', 'ink', 'canvasInk', 'layers', 'activeLayer', 'map', 'decks', 'reviewSettings'];
function snapshot(set) { return structuredClone(Object.fromEntries(fields.map(k => [k, set[k] ?? ({activeLayer:'default',map:{},reviewSettings:{},layers:[{id:'default',title:'默认图层',visible:true,locked:false}]}[k] ?? [])]))); }
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
  Object.assign(set, from.pop()); trim(history);
}
module.exports = { checkpoint, restore };
