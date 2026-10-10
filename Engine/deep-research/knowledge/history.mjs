/** Compare recorded research observations conservatively. */
import {array, object, text, strings} from './shared.mjs';

// A new fetch time alone cannot establish a changed source; compare proof content.
const evidenceKeys = finding => array(finding.evidence)
  .filter(item => object(item) && typeof item.sourceId === 'string' &&
    typeof item.excerpt === 'string')
  .map(item => JSON.stringify([item.sourceId, item.excerpt, item.sha256 || '', item.finalUrl || '']))
  .sort();

const observationKey = finding => JSON.stringify([
  text(finding.claim), strings(finding.sourceIds).sort(), evidenceKeys(finding),
]);

/**
 * Compare observations, not truth. A missing current finding is "not-observed",
 * never "retracted"; changed source IDs describe evidence links only.
 * Pass projectFindings() output for independently substantiated comparisons.
 *
 * Priorities: (1) unique persistent finding ID, (2) exact claim+provenance,
 * (3) the only remaining claim on each side. Multiple indistinguishable
 * claims must not be arbitrarily paired and called evidence changes.
 */
export function compareResearch(previous = [], current = []) {
  const before = array(previous).filter(f => object(f) && text(f.claim));
  const after = array(current).filter(f => object(f) && text(f.claim));
  const matches = new Array(after.length).fill(-1);
  const used = new Set(), changes = [];

  const priorIds = new Map(), currentIdCounts = new Map();
  for (const [index, finding] of before.entries()) {
    const id = text(finding.id);
    if (!id) continue;
    if (!priorIds.has(id)) priorIds.set(id, []);
    priorIds.get(id).push(index);
  }
  for (const finding of after) {
    const id = text(finding.id);
    if (id) currentIdCounts.set(id, (currentIdCounts.get(id) || 0) + 1);
  }
  const link = (afterIndex, priorIndex) => {
    matches[afterIndex] = priorIndex;
    used.add(priorIndex);
  };

  // A duplicate ID in either research is not a unique identity.
  for (const [index, finding] of after.entries()) {
    const id = text(finding.id), prior = priorIds.get(id);
    if (id && currentIdCounts.get(id) === 1 && prior?.length === 1) link(index, prior[0]);
  }

  // Reordered independent observations should not create false evidence-change
  // events when historical ID algorithms differ between runs.
  const exact = new Map();
  for (const [index, finding] of before.entries()) {
    if (used.has(index)) continue;
    const key = observationKey(finding);
    if (!exact.has(key)) exact.set(key, {indices: [], cursor: 0});
    exact.get(key).indices.push(index);
  }
  for (const [index, finding] of after.entries()) {
    if (matches[index] >= 0) continue;
    const bucket = exact.get(observationKey(finding));
    if (bucket && bucket.cursor < bucket.indices.length) {
      link(index, bucket.indices[bucket.cursor++]);
    }
  }

  // A changed source is attributable by claim only if there is precisely one
  // unmatched occurrence in both snapshots. Ambiguous duplicates stay unpaired.
  const oldByClaim = new Map(), newByClaim = new Map();
  for (const [index, finding] of before.entries()) {
    if (used.has(index)) continue;
    const label = text(finding.claim);
    if (!oldByClaim.has(label)) oldByClaim.set(label, []);
    oldByClaim.get(label).push(index);
  }
  for (const [index, finding] of after.entries()) {
    if (matches[index] >= 0) continue;
    const label = text(finding.claim);
    if (!newByClaim.has(label)) newByClaim.set(label, []);
    newByClaim.get(label).push(index);
  }
  for (const [label, currentPositions] of newByClaim) {
    const priorPositions = oldByClaim.get(label);
    if (currentPositions.length === 1 && priorPositions?.length === 1) {
      link(currentPositions[0], priorPositions[0]);
    }
  }

  let retained = 0;
  for (const [index, finding] of after.entries()) {
    const at = matches[index];
    if (at < 0) {
      changes.push({ id: finding.id, kind: 'new', text: finding.claim });
      continue;
    }
    const prior = before[at];
    const oldSources = strings(prior.sourceIds).sort(), newSources = strings(finding.sourceIds).sort();
    const evidenceChanged = JSON.stringify(oldSources) !== JSON.stringify(newSources) ||
      JSON.stringify(evidenceKeys(prior)) !== JSON.stringify(evidenceKeys(finding));
    const unresolved = finding.status === 'unlinked' && array(finding.issues).some(issue =>
      ['ambiguous-proof', 'proof-not-found', 'source-not-verified'].includes(issue?.kind));
    if (text(prior.claim) !== text(finding.claim)) {
      changes.push({ id: finding.id, kind: 'wording-changed', text: finding.claim, previous: prior.claim,
        ...(evidenceChanged ? {evidenceChanged: true, previousSourceIds: oldSources, sourceIds: newSources} : {}),
        ...(unresolved ? {provenanceUnresolved: true} : {}) });
    } else if (unresolved) {
      changes.push({ id: finding.id, kind: 'provenance-unresolved', text: finding.claim,
        previousSourceIds: oldSources, sourceIds: newSources });
    } else if (evidenceChanged) {
      changes.push({ id: finding.id, kind: 'evidence-changed', text: finding.claim,
        previousSourceIds: oldSources, sourceIds: newSources });
    } else retained++;
  }
  for (const [index, finding] of before.entries()) if (!used.has(index)) {
    changes.push({ id: finding.id, kind: 'not-observed', text: finding.claim });
  }
  return { retained, changes };
}

