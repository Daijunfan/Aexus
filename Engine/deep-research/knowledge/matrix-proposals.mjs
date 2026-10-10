/** Conservative matrix follow-up reconciliation; no task launch, persistence or auto-merge. */
import {array, object, strings} from './shared.mjs';

const raw = value => typeof value === 'string' ? value : '';
const has = (value, limit) => typeof value === 'string' && !!value.trim() && value.length <= limit;
const hasLiteralNumber = value => /\p{N}/u.test(value);
/** Avoid treating 0 as supported by a different value such as 10 or 0.5. */
const excerptContainsValue = (excerpt, value) => {
  if (typeof excerpt !== 'string') return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(?<![\\p{N}.,])' + escaped + '(?![\\p{N}.,])', 'u').test(excerpt);
};

// An accepted proposal must retain enough information to open the exact source
// reading later. These refs come from projectFindings(), not model-supplied text.
const originalUrl = value => {
  if (typeof value !== 'string') return false;
  const lower = value.toLowerCase();
  if (!lower.startsWith('https://') && !lower.startsWith('http://')) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !!parsed.hostname;
  } catch { return false; }
};
const proofRef = (findingId, evidence) => {
  if (typeof evidence?.sourceId !== 'string' || !evidence.sourceId ||
      typeof evidence?.excerpt !== 'string' || !evidence.excerpt.trim() ||
      typeof evidence?.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(evidence.sha256) ||
      !originalUrl(evidence?.finalUrl) ||
      !Number.isFinite(evidence?.accessedAt) || evidence.accessedAt <= 0) return null;
  return {
    findingId, sourceId: evidence.sourceId, excerpt: evidence.excerpt,
    locator: typeof evidence.locator === 'string' ? evidence.locator : '',
    sha256: evidence.sha256.toLowerCase(), finalUrl: evidence.finalUrl,
    accessedAt: evidence.accessedAt,
  };
};
// Content identity is stable across repeat fetches; access time is audit
// metadata and must not trigger a false content-change conflict.
const proofKeys = refs => array(refs)
  .map(ref => JSON.stringify([
    ref?.findingId, ref?.sourceId, ref?.excerpt, ref?.locator,
    typeof ref?.sha256 === 'string' ? ref.sha256.toLowerCase() : null, ref?.finalUrl,
  ])).sort();

/**
 * Existing ResearchMatrix has positional cells rather than persistent cell IDs.
 * The request therefore snapshots its exact row/column names and raw previous
 * value. Ambiguous labels and concurrent edits require fresh human review.
 * Proof linkage means the cited claim can be opened, not that it entails value.
 */
export function assessMatrixProposal(matrix, candidate, linkedFindings = [], context) {
  const invalid = reason => ({status: 'invalid', reason});
  if (!object(matrix) || !object(candidate)) return invalid('proposal-or-matrix-missing');
  // "custom" matrix IDs recur in separate research jobs. Once a caller opts
  // into job-scoped proposals, require BOTH origins to match; do not silently
  // apply a child research result to an unrelated job's editable table.
  const scoped = candidate.researchId !== undefined || context?.researchId !== undefined;
  if (scoped && (!has(candidate.researchId, 256) || candidate.researchId !== context?.researchId)) {
    return {status: 'wrong-research', reason: 'research-context-not-matched'};
  }
  if (!has(matrix.id, 256) || candidate.matrixId !== matrix.id ||
      !has(candidate.rowLabel, 512) || !has(candidate.columnLabel, 512) ||
      !has(candidate.proposedRaw, 2000) || typeof candidate.expectedRaw !== 'string' ||
      candidate.expectedRaw.length > 2000) return invalid('invalid-cell-request');
  if (!Array.isArray(matrix.columns) || !Array.isArray(matrix.rows)) return invalid('invalid-matrix');
  const rowMatches = matrix.rows.flatMap((row, index) =>
    row?.label === candidate.rowLabel ? [index] : []);
  const columnMatches = matrix.columns.flatMap((column, index) =>
    column === candidate.columnLabel ? [index] : []);
  if (rowMatches.length !== 1 || columnMatches.length !== 1) {
    return {status: 'cell-not-unique', reason: 'target-renamed-removed-or-duplicated'};
  }
  const rowIndex = rowMatches[0], columnIndex = columnMatches[0];
  const values = matrix.rows[rowIndex]?.values;
  if (!Array.isArray(values) || (values[columnIndex] !== undefined && typeof values[columnIndex] !== 'string'))
    return invalid('invalid-row');
  const actualRaw = raw(values[columnIndex]);
  if (actualRaw !== candidate.expectedRaw) {
    return {status: 'conflict', reason: 'cell-edited-since-request',
      expectedRaw: candidate.expectedRaw, actualRaw};
  }
  if (candidate.proposedRaw === actualRaw) return {status: 'unchanged'};
  const findingIds = strings(candidate.findingIds);
  const byFinding = new Map(array(linkedFindings)
    .filter(finding => typeof finding?.id === 'string').map(finding => [finding.id, finding]));
  if (!findingIds.length || findingIds.some(id =>
    byFinding.get(id)?.status !== 'linked' || array(byFinding.get(id)?.issues).length > 0)) {
    return {status: 'needs-evidence', reason: 'no-explicit-linked-finding'};
  }
  const sourceIds = [...new Set(findingIds.flatMap(id => strings(byFinding.get(id)?.sourceIds)))];
  if (!sourceIds.length) return {status: 'needs-evidence', reason: 'finding-without-source'};
  const proofRefs = [];
  for (const findingId of findingIds) {
    const finding = byFinding.get(findingId);
    const sourceSet = new Set(strings(finding.sourceIds));
    const proven = new Set();
    for (const evidence of array(finding.evidence)) {
      const ref = proofRef(findingId, evidence);
      if (!ref || !sourceSet.has(ref.sourceId)) {
        return {status: 'needs-evidence', reason: 'incomplete-proof-identity'};
      }
      proven.add(ref.sourceId);
      proofRefs.push(ref);
    }
    if (sourceSet.size !== proven.size) {
      return {status: 'needs-evidence', reason: 'incomplete-proof-identity'};
    }
  }
  if (Object.prototype.hasOwnProperty.call(candidate, 'reviewedProofRefs')) {
    if (!Array.isArray(candidate.reviewedProofRefs)) return invalid('invalid-review-snapshot');
    if (JSON.stringify(proofKeys(candidate.reviewedProofRefs)) !== JSON.stringify(proofKeys(proofRefs))) {
      return {status: 'stale-evidence', reason: 'evidence-changed-since-review'};
    }
  }
  if (hasLiteralNumber(candidate.proposedRaw) &&
      !proofRefs.some(ref => excerptContainsValue(ref.excerpt, candidate.proposedRaw))) {
    return {status: 'needs-value-support', reason: 'number-not-in-linked-original-excerpt'};
  }
  return {
    status: 'ready-for-review', matrixId: matrix.id,
    rowIndex, columnIndex, rowLabel: candidate.rowLabel, columnLabel: candidate.columnLabel,
    expectedRaw: actualRaw, proposedRaw: candidate.proposedRaw, findingIds, sourceIds, proofRefs,
    ...(scoped ? {researchId: candidate.researchId} : {}),
  };
}

/**
 * Approval is explicit. Reassess against the matrix snapshot at application
 * time; no stale result can overwrite newer user changes.
 */
export function acceptMatrixProposal(matrix, candidate, findings = [], approved = false, context) {
  const assessment = assessMatrixProposal(matrix, candidate, findings, context);
  if (assessment.status !== 'ready-for-review' || approved !== true) {
    return {status: approved === true ? assessment.status : 'not-approved', matrix, assessment};
  }
  const rows = matrix.rows.map((row, index) => index === assessment.rowIndex
    ? {...row, values: [...row.values]} : row);
  rows[assessment.rowIndex].values[assessment.columnIndex] = assessment.proposedRaw;
  const updated = {...matrix, rows};
  const provenance = {
    matrixId: assessment.matrixId, rowLabel: assessment.rowLabel,
    columnLabel: assessment.columnLabel, previousRaw: assessment.expectedRaw,
    proposedRaw: assessment.proposedRaw,
    findingIds: assessment.findingIds, sourceIds: assessment.sourceIds,
    proofRefs: assessment.proofRefs,
    ...(assessment.researchId ? {researchId: assessment.researchId} : {}),
  };
  return {status: 'applied', matrix: updated, provenance};
}
