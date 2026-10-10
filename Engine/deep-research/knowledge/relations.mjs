/** Branch-scoped knowledge entity and relationship identity. */
import {array, object, text, key, idFor, strings, union} from './shared.mjs';

/**
 * Merge independent synthesis branches without treating branch-local "e1" IDs
 * as global. Only exact name+type+description matches are collapsed.
 * Optional findingIds are accepted only when evidence can actually be traced.
 */
export function mergeSynthesis(analyses = [], findings = []) {
  const supported = new Map(array(findings)
    .filter(f => f?.status === 'linked' && !array(f.issues).length).map(f => [f.id, f]));
  const entities = new Map(), relationships = new Map(), issues = [];
  for (const [index, entry] of array(analyses).entries()) {
    if (!object(entry)) continue;
    const result = object(entry.result) ? entry.result : entry;
    const nodeId = text(entry.nodeId) || 'unscoped-' + index;
    const local = new Map();
    const references = record => strings(record?.findingIds).filter(id => {
      if (supported.has(id)) return true;
      issues.push({ kind: 'unverified-finding', nodeId, ref: id });
      return false;
    });

    for (const candidate of array(result.entities)) {
      if (!object(candidate)) continue;
      const localId = text(candidate.id), name = text(candidate.name), type = text(candidate.type);
      if (!localId || !name || !type || local.has(localId)) {
        issues.push({ kind: 'invalid-entity', nodeId, ref: localId });
        continue;
      }
      const description = text(candidate.description);
      const id = idFor('entity', [key(type), key(name), key(description)].join('\0'));
      const linked = references(candidate);
      const existing = entities.get(id);
      if (existing) {
        union(existing.originNodeIds, [nodeId]); union(existing.findingIds, linked);
      } else {
        entities.set(id, { id, name, type, description, originNodeIds: [nodeId], findingIds: linked,
          evidenceStatus: linked.length ? 'linked' : 'unlinked' });
      }
      local.set(localId, id);
    }

    for (const candidate of array(result.relationships)) {
      if (!object(candidate)) continue;
      const from = local.get(text(candidate.from)), to = local.get(text(candidate.to));
      const type = text(candidate.type);
      if (!from || !to || !type) {
        issues.push({ kind: 'invalid-relationship', nodeId, ref: [candidate.from, candidate.to].map(text).join(' -> ') });
        continue;
      }
      const id = idFor('relation', [from, to, key(type)].join('\0'));
      const linked = references(candidate);
      const existing = relationships.get(id);
      if (existing) {
        union(existing.originNodeIds, [nodeId]); union(existing.findingIds, linked);
      } else {
        relationships.set(id, { id, from, to, type, originNodeIds: [nodeId], findingIds: linked,
          evidenceStatus: linked.length ? 'linked' : 'unlinked' });
      }
    }
  }
  for (const item of [...entities.values(), ...relationships.values()]) {
    item.evidenceStatus = item.findingIds.length ? 'linked' : 'unlinked';
  }
  return { entities: [...entities.values()], relationships: [...relationships.values()], issues };
}

