'use strict';
const S = require('./safety.cjs'), M = require('./study-model.cjs');
const { createMatcher } = require('./literal-links.cjs');
const COLORS = Object.freeze({ blue: '#2379c5', green: '#278451', red: '#c24848', purple: '#8654b8' });
const caches = new WeakMap();
function validateSources(sources, state) {
  S.assert(Array.isArray(sources) && sources.length <= 256, 'INVALID_PARAMS', 'Choose at most 256 dictionary sources.');
  const seen = new Set();
  for (const source of sources) {
    S.assert(source && typeof source === 'object' && !Array.isArray(source) && Object.keys(source).every(k => ['setId','rootId','color'].includes(k)), 'INVALID_PARAMS', 'Invalid dictionary source.');
    S.assert(typeof source.setId === 'string' && M.UUID.test(source.setId) && (source.rootId === undefined || source.rootId === null || typeof source.rootId === 'string' && M.UUID.test(source.rootId)), 'INVALID_PARAMS', 'Invalid dictionary identity.');
    S.assert(source.color === undefined || Object.hasOwn(COLORS, source.color), 'INVALID_PARAMS', 'Choose blue, green, red or purple for a dictionary.');
    const key = `${source.setId}/${source.rootId || ''}`;
    S.assert(!seen.has(key), 'INVALID_PARAMS', 'Duplicate dictionary scope.'); seen.add(key);
    if (state) { if(source.rootId){const found=require('./card-location.cjs').locate(state,source.setId,source.rootId);S.assert(found.card.submap,'INVALID_PARAMS','Dictionary root must be a submap.');}else M.findSet(state,source.setId); }
  }
  return sources;
}
function scopes(state, settings) {
  if (settings.sources !== undefined) return validateSources(settings.sources);
  return (settings.dictionarySetIds?.length ? settings.dictionarySetIds : Object.values(state.studySets).filter(s => !s.deletedAt).map(s => s.id)).map(setId => ({ setId, rootId: null, color: 'blue' }));
}
function rows(state, owner, current = {}) {
  const settings = owner.linkSettings || {}; if (settings.titleLinks === false) return [];
  const result = [], visited = new Set();
  const resolved=[];
  for(const source of scopes(state,settings)){
    try{
      const set=source.rootId?require('./card-location.cjs').locate(state,source.setId,source.rootId).set:M.findSet(state,source.setId);
      let depth=0,parent=source.rootId,seen=new Set();
      if(source.rootId&&!M.card(set,source.rootId).submap)continue;
      while(parent){S.assert(!seen.has(parent),'INVALID_OUTLINE','Dictionary hierarchy contains a cycle.');seen.add(parent);parent=M.card(set,parent).parentId;depth++;}
      resolved.push({source,set,depth});
    }catch(error){if(!['NOT_FOUND','INVALID_REFERENCE'].includes(error.code))throw error;}
  }
  // More specific submap colors take precedence over an included main map.
  resolved.sort((a,b)=>b.depth-a.depth);
  for (const {source,set} of resolved) {
    const descendants = source.rootId ? M.subtree(set.cards, source.rootId) : null;
    for (const card of set.cards) {
      if (descendants && !descendants.has(card.id) || card.id === current.id && set.id === owner.id) continue;
      const identity = `${set.id}/${card.id}`; if (visited.has(identity)) continue; visited.add(identity);
      const terms = settings.keywordSource === 'tags' ? card.tags || [] : [...new Set([card.title, ...card.title.split(/[;；]/).map(t => t.trim()).filter(Boolean)])];
      for (const term of terms) if (term.length >= 2 && term.length <= 200) result.push({ title: term, cardTitle: card.title, setId: set.id, cardId: card.id, setTitle: set.title, color: COLORS[source.color || 'blue'], rootId: source.rootId || null });
    }
  }
  return result;
}
async function match(store, p) {
  S.assert(typeof p.text === 'string' && p.text.length <= 262144, 'INVALID_PARAMS', 'Dictionary matching accepts at most 262144 UTF-16 code units per request.');
  const state = await store.load(), set = M.findSet(state, p.setId);
  let cached = caches.get(store);
  if (!cached || cached.revision !== state.revision || cached.setId !== set.id) {
    cached = { revision: state.revision, setId: set.id, matcher: createMatcher(rows(state, set), set.linkSettings || {}) }; caches.set(store, cached);
  }
  const offset = p.offset || 0, limit = p.limit || 200, matches = []; let total = 0;
  for (const hit of cached.matcher.matches(p.text)) {
    if (total >= offset && matches.length < limit) matches.push({ start: hit.at, end: hit.end, text: p.text.slice(hit.at, hit.end), targets: hit.targets.slice(0,20), targetTotal: hit.targets.length });
    total++;
  }
  return { revision: state.revision, setRevision: set.revision, textHash: S.digest(p.text), dictionaryTerms: cached.matcher.size, matches, total, offset, limit, nextOffset: offset + matches.length < total ? offset + matches.length : null };
}
async function lookup(store,p){
  S.assert(typeof p.term==='string'&&p.term.length>=2&&p.term.length<=200,'INVALID_PARAMS','Dictionary term must contain 2–200 UTF-16 units.');
  const state=await store.load(),set=M.findSet(state,p.setId),sensitive=set.linkSettings?.caseSensitive===true;
  const term=sensitive?p.term:p.term.toLocaleLowerCase(),seen=new Set(),targets=[];let total=0;
  const offset=p.offset||0,limit=p.limit||100;
  for(const row of rows(state,set)){if((sensitive?row.title:row.title.toLocaleLowerCase())!==term)continue;
    const id=row.setId+'/'+row.cardId;if(seen.has(id))continue;seen.add(id);if(total>=offset&&targets.length<limit)targets.push(row);total++;
  }
  return {revision:state.revision,term:p.term,targets,total,offset,limit,nextOffset:offset+targets.length<total?offset+targets.length:null};
}
module.exports = { COLORS, validateSources, rows, match, lookup };
