/** Attach only explicitly verified topic identity and unambiguous source versions. */
import {createHash} from 'node:crypto';

const validProof = proof =>
  typeof proof?.excerpt === 'string' && typeof proof?.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(proof.sha256) &&
  typeof proof.finalUrl === 'string' && /^https?:\/\//i.test(proof.finalUrl) &&
  Number.isFinite(proof.accessedAt) && proof.accessedAt > 0;

export function attributeVerification(state, entries, node, validatedSources) {
  const findings = new Map(state.findings.map(item => [item.id, item]));
  const sources = new Map(validatedSources.map(item => [item.id, item]));
  const persisted = new Map(state.sources.map(item => [item.id, item]));
  const dimensions = new Set(state.dimensions.map(item => item.id));
  for (const entry of entries) {
    const source = sources.get(entry.sourceId);
    for (const claim of entry.claims || []) {
      const id = 'finding-' + createHash('sha256').update(claim.text).digest('hex').slice(0, 16);
      const finding = findings.get(id);
      if (!finding) continue;
      if (node.dimensionId && dimensions.has(node.dimensionId)) {
        finding.dimensionIds = [...new Set([...(Array.isArray(finding.dimensionIds) ? finding.dimensionIds : []), node.dimensionId])];
      }
      const proofs = (source?.acquisition?.excerpts || [])
        .filter(proof => validProof(proof) && proof.excerpt.includes(claim.excerpt));
      const versions = new Set(proofs.map(proof => JSON.stringify([proof.sha256, proof.finalUrl])));
      if (versions.size !== 1) continue; // No guessing between old and new readings.
      const proof = proofs.find(item => item.locator === claim.locator) || proofs[0];
      const evidence = (finding.evidence || []).find(item =>
        item.sourceId === entry.sourceId && item.excerpt === claim.excerpt);
      if (!evidence || evidence.sha256) continue;
      const current = persisted.get(entry.sourceId);
      const currentVersions = new Set((current?.acquisition?.excerpts || [])
        .filter(item => validProof(item) && item.excerpt.includes(claim.excerpt))
        .map(item => JSON.stringify([item.sha256, item.finalUrl])));
      if (currentVersions.size !== 1) continue;
      Object.assign(evidence, {
        sha256: proof.sha256, finalUrl: proof.finalUrl, accessedAt: proof.accessedAt,
      });
    }
  }
}
