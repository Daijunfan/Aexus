/** Citation provenance and domain evidence projections. */
import {array, object, text, strings, union} from './shared.mjs';

/** Presence of independently obtained text and matching provenance, regardless of review. */
const validProof = proof =>
  typeof proof?.excerpt === 'string' && !!proof.excerpt.trim() &&
  typeof proof.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(proof.sha256) &&
  typeof proof.finalUrl === 'string' && /^https?:\/\//i.test(proof.finalUrl) &&
  Number.isFinite(proof.accessedAt) && proof.accessedAt > 0;

export function independentlyRead(source) {
  const acquisition = source?.acquisition;
  return acquisition?.status === 'read' && acquisition.method === 'independent-http' &&
    array(acquisition.excerpts).some(validProof);
}

/** A legacy "verified: true" flag alone never proves that a source was reviewed. */
export function independentlyVerified(source) {
  return source?.verified === true && independentlyRead(source);
}

/**
 * A source may retain old and newly acquired versions of the same sentence.
 * Never silently attach a finding to whichever page hash happens to come first.
 * Explicit proof selectors are optional for legacy findings, but authoritative
 * when present. Locator is only a tie-breaker, never proof of source identity.
 */
function resolveProof(source, item) {
  if (!independentlyVerified(source)) return { kind: 'source-not-verified' };
  if (!text(item?.excerpt)) return { kind: 'missing-excerpt' };
  let matches = source.acquisition.excerpts.filter(proof =>
    validProof(proof) && proof.excerpt.includes(item.excerpt));
  if (typeof item.sha256 === 'string' && item.sha256) {
    matches = matches.filter(proof => proof.sha256 === item.sha256);
  }
  if (typeof item.finalUrl === 'string' && item.finalUrl) {
    matches = matches.filter(proof => proof.finalUrl === item.finalUrl);
  }
  if (typeof item.accessedAt === 'number' && Number.isFinite(item.accessedAt)) {
    matches = matches.filter(proof => proof.accessedAt === item.accessedAt);
  }
  if (!matches.length) return { kind: 'proof-not-found' };
  // Page content and final URL identify a version; a stale line locator must
  // never choose one page hash over another when the quotation was unchanged.
  const versions = new Set(matches.map(proof =>
    JSON.stringify([proof.sha256, proof.finalUrl])));
  if (versions.size > 1) return { kind: 'ambiguous-proof' };
  // Within a single version a recorded locator can select the right duplicate
  // passage, without assigning authority to a locator as a version identity.
  const located = typeof item.locator === 'string' && item.locator ?
    matches.filter(proof => proof.locator === item.locator) : [];
  if (located.length) matches = located;
  const locations = new Set(matches.map(proof => proof.locator || ''));
  if (locations.size > 1) return { kind: 'ambiguous-proof' };
  return { proof: matches[0] };
}

/** Preserve existing finding IDs; link only excerpts independently read and verified. */
export function projectFindings(sources = [], findings = []) {
  const bySource = new Map(array(sources).filter(s => typeof s?.id === 'string').map(s => [s.id, s]));
  return array(findings).filter(f => typeof f?.id === 'string' && text(f.claim)).map(finding => {
    const allowed = new Set(strings(finding.sourceIds));
    const evidence = [], issues = [];
    const seen = new Set();
    for (const item of array(finding.evidence)) {
      if (!object(item) || !allowed.has(item.sourceId)) {
        issues.push({ sourceId: typeof item?.sourceId === 'string' ? item.sourceId : '', kind: 'undeclared-source' });
        continue;
      }
      const resolution = resolveProof(bySource.get(item.sourceId), item);
      if (!resolution.proof) {
        issues.push({ sourceId: item.sourceId, kind: resolution.kind });
        continue;
      }
      const proof = resolution.proof;
      const signature = JSON.stringify([item.sourceId, item.excerpt, proof.sha256, proof.finalUrl, proof.locator || '']);
      if (seen.has(signature)) continue;
      seen.add(signature);
      evidence.push({ sourceId: item.sourceId, excerpt: item.excerpt, locator: proof.locator || item.locator || '',
        sha256: proof.sha256, finalUrl: proof.finalUrl, accessedAt: proof.accessedAt });
    }
    const sourceIds = [...new Set(evidence.map(e => e.sourceId))];
    return {
      id: finding.id, claim: finding.claim, sourceIds, evidence, issues,
      status: sourceIds.length ? 'linked' : 'unlinked',
      topicIds: strings([...(array(finding.topicIds)), ...(array(finding.dimensionIds))]),
    };
  });
}

/** A reported disagreement is reviewable only when its cited originals are available. */
export function projectDisputes(sources = [], contradictions = []) {
  const bySource = new Map(array(sources).filter(s => typeof s?.id === 'string').map(s => [s.id, s]));
  return array(contradictions).filter(c => text(c?.id) && text(c.description)).map(dispute => {
    const sourceIds = strings(dispute.sources || dispute.sourceIds);
    const availableSourceIds = sourceIds.filter(id => independentlyVerified(bySource.get(id)));
    // Two submitted URLs that redirect to one document are still one source
    // of text. Compare all acquired final URLs, including historical readings.
    const observed = new Set();
    let distinctDocuments = true;
    for (const id of availableSourceIds) {
      const originals = array(bySource.get(id)?.acquisition?.excerpts)
        .filter(validProof).map(proof => proof.finalUrl);
      const own = new Set(originals.map(original => {
        try {
          const url = new URL(original);
          url.hash = '';
          return url.href;
        } catch { return text(original); }
      }).filter(Boolean));
      if (!own.size || [...own].some(url => observed.has(url))) distinctDocuments = false;
      for (const url of own) observed.add(url);
    }
    return {
      id: dispute.id, description: dispute.description, sourceIds, availableSourceIds,
      status: sourceIds.length >= 2 && availableSourceIds.length === sourceIds.length &&
        distinctDocuments ? 'sources-ready' : 'needs-sources',
    };
  });
}

/**
 * Map report quotations to finding evidence without guessing between page
 * versions. Source list is optional for legacy adapters; current knowledge
 * projections always provide it.
 */
export function projectReportLinks(report, findings = [], sources = []) {
  const byExcerpt = new Map();
  for (const finding of array(findings).filter(f => f?.status === 'linked' && !array(f.issues).length)) {
    for (const evidence of array(finding.evidence)) {
      const signature = JSON.stringify([text(finding.claim), evidence.sourceId, evidence.excerpt]);
      if (!byExcerpt.has(signature)) byExcerpt.set(signature, []);
      byExcerpt.get(signature).push({ findingId: finding.id, proof: evidence });
    }
  }
  const bySource = new Map(array(sources)
    .filter(source => typeof source?.id === 'string').map(source => [source.id, source]));
  return array(report?.sections).map((section, index) => {
    const findingIds = [], sourceIds = [];
    for (const evidence of array(section?.evidence)) {
      const signature = JSON.stringify([text(evidence?.claim), evidence?.sourceId, evidence?.excerpt]);
      const candidates = byExcerpt.get(signature);
      if (!candidates?.length) continue;
      const sourceProof = bySource.size ? resolveProof(bySource.get(evidence.sourceId), evidence) : null;
      if (bySource.size && !sourceProof?.proof) continue;
      const qualified = candidates.filter(candidate =>
        (!sourceProof || (candidate.proof.sha256 === sourceProof.proof.sha256 &&
          candidate.proof.finalUrl === sourceProof.proof.finalUrl)) &&
        (!evidence.sha256 || candidate.proof.sha256 === evidence.sha256) &&
        (!evidence.finalUrl || candidate.proof.finalUrl === evidence.finalUrl));
      const versions = new Set(qualified.map(candidate =>
        JSON.stringify([candidate.proof.sha256, candidate.proof.finalUrl])));
      if (versions.size !== 1) continue;
      union(findingIds, qualified.map(candidate => candidate.findingId));
      union(sourceIds, [evidence.sourceId]);
    }
    return {
      id: typeof section?.id === 'string' && section.id ? section.id : 'section-' + index,
      heading: text(section?.heading), findingIds, sourceIds,
    };
  });
}

