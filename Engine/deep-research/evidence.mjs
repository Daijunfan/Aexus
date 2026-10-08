/** Stable evidence identities, acquisition metadata and citation integrity. */
import { createHash } from 'node:crypto';

export function canonicalUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw Error('来源必须使用 HTTP(S) URL');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href.replace(/\/$/, '');
}

export function normalizeSources(result) {
  if (!result || !Array.isArray(result.sources)) throw Error('研究结果必须包含 sources 数组');
  const sources = result.sources.map(source => {
    const url = canonicalUrl(source.url);
    const acquisition = source.acquisition ?? {};
    const excerpt = typeof acquisition.excerpt === 'string' ? acquisition.excerpt.trim() : (typeof source.excerpt === 'string' ? source.excerpt.trim() : '');
    const read = acquisition.status === 'read' && excerpt.length > 0;
    return {
      id: 'src-' + createHash('sha256').update(url).digest('hex').slice(0, 16),
      type: source.type || 'web', title: String(source.title || url), url,
      snippet: String(source.snippet || source.summary || ''),
      author: String(source.author || ''), publishedDate: String(source.publishedDate || source.date || ''),
      acquisition: { status: read ? 'read' : 'discovered', excerpt, locator: String(acquisition.locator || ''), accessedAt: Date.now() },
      verified: false, credibilityScore: null, addedAt: Date.now()
    };
  });
  return { sources, gaps: Array.isArray(result.gaps) ? result.gaps.map(String).filter(Boolean) : [], replanReason: typeof result.replanReason === 'string' ? result.replanReason : '' };
}

export function mergeSources(state, sources, node = {}) {
  const byId = new Map(state.sources.map(s => [s.id, s]));
  const ids = [];
  for (const source of sources) {
    const old = byId.get(source.id) || state.sources.find(s => { try { return canonicalUrl(s.url) === source.url; } catch { return false; } });
    const sourceId = old?.id || source.id;
    if (!old && state.sources.length >= state.input.maxSources) break;
    if (old) {
      if (old.acquisition?.status !== 'read' && source.acquisition.status === 'read') Object.assign(old, { ...source, id: sourceId, verified: old.verified, credibilityScore: old.credibilityScore });
      old.dimensionIds = [...new Set([...(old.dimensionIds || []), ...(node.dimensionId ? [node.dimensionId] : [])])];
      old.nodeIds = [...new Set([...(old.nodeIds || []), ...(node.id ? [node.id] : [])])];
    } else {
      const added = { ...source, dimensionId: node.dimensionId || null, dimensionIds: node.dimensionId ? [node.dimensionId] : [], nodeIds: node.id ? [node.id] : [] };
      state.sources.push(added); byId.set(source.id, added);
    }
    ids.push(sourceId);
  }
  return [...new Set(ids)];
}

export function normalizeVerification(result, sources) {
  const entries = result?.verifications ?? (sources.length === 1 && typeof result?.credibilityScore === 'number' ? [{ ...result, sourceId: sources[0].id }] : null);
  if (!Array.isArray(entries)) throw Error('核验结果必须包含 verifications 数组和 sourceId');
  const byId = new Map(sources.map(s => [s.id, s]));
  const seen = new Set();
  return entries.map(entry => {
    const source = byId.get(entry.sourceId);
    if (!source || seen.has(entry.sourceId)) throw Error('核验返回未知或重复来源: ' + entry.sourceId);
    seen.add(entry.sourceId);
    if (typeof entry.credibilityScore !== 'number' || !Number.isFinite(entry.credibilityScore)) throw Error('核验必须提供 credibilityScore 数值');
    const claims = (entry.claims || []).map(claim => {
      if (!claim || typeof claim.text !== 'string' || !claim.text.trim() || typeof claim.excerpt !== 'string' || !claim.excerpt.trim()) throw Error('论断必须包含 text 和对应的原文 excerpt');
      if (source.acquisition?.status !== 'read' || !source.acquisition.excerpt.includes(claim.excerpt)) throw Error('论断引用的片段不在已获取正文中: ' + source.id);
      return { text: claim.text.trim(), excerpt: claim.excerpt, locator: String(claim.locator || source.acquisition.locator || ''), confidence: typeof claim.confidence === 'number' ? Math.max(0, Math.min(1, claim.confidence)) : 0.5 };
    });
    return { sourceId: source.id, credibilityScore: Math.max(0, Math.min(1, entry.credibilityScore)), claims, notes: String(entry.notes || ''), contradictions: entry.contradictions || [] };
  });
}

export function mergeVerification(state, entries) {
  for (const entry of entries) {
    const source = state.sources.find(s => s.id === entry.sourceId);
    Object.assign(source, { verified: source.acquisition?.status === 'read', credibilityScore: entry.credibilityScore, verificationNotes: entry.notes, extractedClaims: entry.claims });
    for (const claim of entry.claims) {
      const id = 'finding-' + createHash('sha256').update(claim.text).digest('hex').slice(0, 16);
      let finding = state.findings.find(f => f.id === id);
      if (!finding) { finding = { id, claim: claim.text, sourceIds: [], evidence: [], confidence: claim.confidence, addedAt: Date.now() }; state.findings.push(finding); }
      if (!finding.sourceIds.includes(source.id)) { finding.sourceIds.push(source.id); finding.evidence.push({ sourceId: source.id, excerpt: claim.excerpt, locator: claim.locator }); }
    }
    for (const contradiction of entry.contradictions) {
      if (!Array.isArray(contradiction.sourceIds) || contradiction.sourceIds.some(id => !state.sources.some(s => s.id === id))) throw Error('矛盾引用了未知来源');
      const description = String(contradiction.description || '');
      if (description && !state.contradictions.some(c => c.description === description)) state.contradictions.push({ id: 'contradiction-' + state.contradictions.length, sources: contradiction.sourceIds, description, severity: contradiction.severity || 'warning' });
    }
  }
}

export function validateReport(result, state) {
  const report = result?.report;
  if (!report || !Array.isArray(report.sections) || !report.sections.length) throw Error('报告必须包含非空 sections 数组');
  const sources = new Map(state.sources.filter(s => s.verified && s.acquisition?.status === 'read').map(s => [s.id, s]));
  const sections = report.sections.map((section, i) => {
    if (typeof section.content !== 'string' || !section.content.trim()) throw Error('报告章节正文不能为空');
    const citations = [...new Set(section.citations || [])];
    if (citations.some(id => !sources.has(id))) throw Error('报告引用了未阅读、未核验或不存在的来源');
    const evidence = state.findings.filter(f => f.sourceIds.some(id => citations.includes(id))).flatMap(f => (f.evidence || []).filter(e => citations.includes(e.sourceId)).map(e => ({ ...e, claim: f.claim })));
    if (!citations.length || !evidence.length) throw Error('每个报告章节必须引用已核验论断和对应原文片段');
    return { id: section.id || 'section-' + i, heading: String(section.heading || section.title || '章节 ' + (i + 1)), content: section.content.trim(), citations, evidence };
  });
  const citations = [...new Set(sections.flatMap(s => s.citations))];
  if (!citations.length || !sections.some(s => s.evidence.length)) throw Error('报告必须引用已获取的原文片段和核验论断');
  return { title: String(report.title || state.input.topic), abstract: String(report.abstract || report.summary || ''), sections, citations, conclusion: String(report.conclusion || ''), limitations: Array.isArray(report.limitations) ? report.limitations.map(String) : [] };
}
