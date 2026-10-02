'use strict';
const { randomUUID } = require('node:crypto');
const { assert } = require('./safety.cjs');
function validateLocator(locator, parsed) {
  assert(locator && typeof locator === 'object' && !Array.isArray(locator), 'INVALID_LOCATOR', 'A reading locator is required.');
  if(parsed.kind==='media'){const time=locator.time??0;assert(Number.isFinite(time)&&time>=0&&time<=parsed.media.duration,'INVALID_LOCATOR','Media time is outside the source.');assert(locator.section===undefined||locator.section===0,'INVALID_LOCATOR','Media documents have one timeline.');if(locator.endTime!==undefined)assert(Number.isFinite(locator.endTime)&&locator.endTime>=time&&locator.endTime<=parsed.media.duration,'INVALID_LOCATOR','Invalid media interval.');return {section:0,time,...(locator.endTime===undefined?{}:{endTime:locator.endTime})};}
  if (parsed.kind === 'pdf') {
    assert(Number.isInteger(locator.page) && locator.page >= 1 && locator.page <= parsed.sections.length, 'INVALID_LOCATOR', 'PDF page is outside the document.');
    assert(locator.offset === undefined || (Number.isFinite(locator.offset) && locator.offset >= 0 && locator.offset <= 1), 'INVALID_LOCATOR', 'Page offset must be between 0 and 1.');
    assert(locator.pageOffset === undefined || (Number.isFinite(locator.pageOffset) && locator.pageOffset >= 0 && locator.pageOffset <= 1), 'INVALID_LOCATOR', 'PDF pageOffset must be between 0 and 1.');
    assert(locator.pageOffset === undefined || locator.offset === undefined, 'INVALID_LOCATOR', 'Supply pageOffset or legacy offset, not both.');
    return { page: locator.page, ...(locator.pageOffset !== undefined ? { pageOffset: locator.pageOffset } : {}), ...(locator.offset !== undefined ? { offset: locator.offset } : {}) };
  }
  assert(Number.isInteger(locator.section) && locator.section >= 0 && locator.section < parsed.sections.length, 'INVALID_LOCATOR', 'Section is outside the document.');
  if (locator.anchor !== undefined && locator.anchor !== null) assert(typeof locator.anchor === 'string' && parsed.sections[locator.section].anchors.includes(locator.anchor), 'INVALID_LOCATOR', 'Anchor no longer exists. Edit the chapter target or reopen the source document.');
  if (locator.textOffset !== undefined) {
    assert(Number.isInteger(locator.textOffset) && locator.textOffset >= 0, 'INVALID_LOCATOR', 'Text offset must be a nonnegative UTF-16 character offset.');
    const dom = new (require('jsdom').JSDOM)(parsed.sections[locator.section].html);
    try { assert(locator.textOffset <= dom.window.document.body.textContent.length, 'INVALID_LOCATOR', 'Text offset is outside the section.'); }
    finally { dom.window.close(); }
  }
  return { section: locator.section, ...(locator.anchor ? { anchor: locator.anchor } : {}), ...(locator.textOffset === undefined ? {} : { textOffset: locator.textOffset }) };

}
function ordered(nodes) {
  const output = []; const visited = new Set();
  function walk(parentId) {
    for (const node of nodes.filter(n => n.parentId === parentId)) {
      assert(!visited.has(node.id), 'INVALID_OUTLINE', 'Outline contains a cycle.'); visited.add(node.id); output.push(node); walk(node.id);
    }
  }
  walk(null); assert(output.length === nodes.length, 'INVALID_OUTLINE', 'Outline contains an unreachable chapter.'); return output;
}
function descendants(nodes, id) {
  const result = new Set([id]);
  for (let changed = true; changed;) { changed = false; for (const n of nodes) if (result.has(n.parentId) && !result.has(n.id)) { result.add(n.id); changed = true; } }
  return result;
}
function move(nodes, node, parentId, index) {
  assert(parentId === null || nodes.some(n => n.id === parentId), 'NOT_FOUND', 'Parent chapter does not exist.');
  assert(!descendants(nodes, node.id).has(parentId), 'INVALID_OUTLINE', 'A chapter cannot be moved under itself or a descendant.');
  const siblings = nodes.filter(n => n.parentId === parentId && n.id !== node.id);
  index ??= siblings.length;
  assert(Number.isInteger(index) && index >= 0 && index <= siblings.length, 'INVALID_PARAMS', 'Chapter index is outside its sibling list.');
  const others = nodes.filter(n => n.id !== node.id); node.parentId = parentId;
  const before = siblings[index]; const at = before ? others.indexOf(before) : others.length;
  others.splice(at, 0, node); return ordered(others);
}
function editOutline(doc, parsed, method, params) {
  assert(params.expectedRevision === doc.revision, 'CONFLICT', 'Outline changed in another client. Reload and retry.', { currentRevision: doc.revision });
  let nodes = structuredClone(doc.toc);
  const node = params.nodeId ? nodes.find(n => n.id === params.nodeId) : null;
  if (method !== 'toc.add' && method !== 'toc.reset') assert(node, 'NOT_FOUND', 'Chapter does not exist.');
  const title = value => { assert(typeof value === 'string' && value.trim() && value.trim().length <= 500, 'INVALID_PARAMS', 'Chapter title must contain 1–500 characters.'); return value.trim(); };
  if (method === 'toc.add') {
    const newNode = { id: randomUUID(), parentId: null, title: title(params.title), locator: validateLocator(params.locator, parsed), source: 'custom' };
    nodes.push(newNode); nodes = move(nodes, newNode, params.parentId ?? null, params.index);
  } else if (method === 'toc.update') {
    assert(params.title !== undefined || params.locator !== undefined, 'INVALID_PARAMS', 'Provide a title or locator to edit.');
    if (params.title !== undefined) node.title = title(params.title);
    if (params.locator !== undefined) node.locator = validateLocator(params.locator, parsed);
    node.source = 'custom';
  } else if (method === 'toc.remove') {
    if (params.mode === 'subtree') { const ids = descendants(nodes, node.id); nodes = nodes.filter(n => !ids.has(n.id)); }
    else { for (const child of nodes.filter(n => n.parentId === node.id)) child.parentId = node.parentId; nodes = nodes.filter(n => n.id !== node.id); }
  } else if (method === 'toc.move') nodes = move(nodes, node, params.parentId ?? null, params.index);
  else if (method === 'toc.indent') {
    const siblings = nodes.filter(n => n.parentId === node.parentId); const i = siblings.indexOf(node);
    assert(i > 0, 'INVALID_OUTLINE', 'The first sibling has no preceding chapter to indent under.');
    nodes = move(nodes, node, siblings[i - 1].id);
  } else if (method === 'toc.outdent') {
    assert(node.parentId !== null, 'INVALID_OUTLINE', 'This chapter is already at the top level.');
    const parent = nodes.find(n => n.id === node.parentId); const siblings = nodes.filter(n => n.parentId === parent.parentId);
    nodes = move(nodes, node, parent.parentId, siblings.indexOf(parent) + 1);
  } else if (method === 'toc.reset') nodes = structuredClone(parsed.toc);
  doc.toc = ordered(nodes); doc.customOutline = method !== 'toc.reset'; doc.revision++; doc.updatedAt = new Date().toISOString();
  return { id: doc.id, revision: doc.revision, toc: doc.toc };
}
module.exports = { validateLocator, ordered, descendants, editOutline };
