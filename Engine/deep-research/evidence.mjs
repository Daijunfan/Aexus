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

export const sourceExcerpt = source => source.acquisition?.excerpts?.map(item => item.excerpt).join('\n\n') ?? source.acquisition?.excerpt ?? '';
export const sourceView = source => ({...source, acquisition: {...source.acquisition, excerpt: sourceExcerpt(source), locator: source.acquisition?.excerpts?.map(item => item.locator).filter(Boolean).join('; ') || source.acquisition?.locator || ''}});
export const isIndependentSource = source => source.acquisition?.status === 'read' && source.acquisition.method === 'independent-http' && source.acquisition.excerpts?.length > 0;
const proofFor = (source, excerpt) => isIndependentSource(source) && source.acquisition.excerpts.find(proof => proof.excerpt.includes(excerpt));

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

export function withinSourceBudget(state, candidates) {
  const allowed = state.input.sourceUrls?.length ? new Set(state.input.sourceUrls) : null;
  const known = new Set(state.sources.map(source => source.id));
  const knownUrls = new Set(state.sources.flatMap(source => { try { return [canonicalUrl(source.url)]; } catch { return []; } }));
  let remaining = Math.max(0, state.input.maxSources - state.sources.length);
  return candidates.filter(source => {
    if (allowed && !allowed.has(source.url)) return false;
    if (known.has(source.id) || knownUrls.has(source.url)) return true;
    if (!remaining) return false;
    known.add(source.id); knownUrls.add(source.url); remaining--; return true;
  });
}

export function mergeSources(state, sources, node = {}) {
  const byId = new Map(state.sources.map(s => [s.id, s]));
  const ids = [];
  for (const source of sources) {
    const acquisition = {...source.acquisition, ...(source.acquisition?.rejections ? {rejections: source.acquisition.rejections.map(item => ({...item, ...(node.id ? {nodeId: node.id} : {})}))} : {})};
    const old = byId.get(source.id) || state.sources.find(s => { try { return canonicalUrl(s.url) === source.url; } catch { return false; } });
    const sourceId = old?.id || source.id;
    if (!old && state.sources.length >= state.input.maxSources) continue;
    if (old) {
      const rejections = [...(old.acquisition?.rejections || [])];
      for (const item of acquisition.rejections || []) {
        const known = rejections.find(known => known.excerpt === item.excerpt && known.nodeId === item.nodeId);
        if (known) Object.assign(known, item); else rejections.push(item);
      }
      if (isIndependentSource(source)) {
        const excerpts = [...(old.acquisition?.excerpts || [])];
        for (const item of acquisition.excerpts) if (!excerpts.some(known => known.excerpt === item.excerpt && known.sha256 === item.sha256)) { excerpts.push(item); old.verified = false; }
        const pageTitle = acquisition.pageTitle || old.acquisition?.pageTitle;
        old.acquisition = {status: 'read', method: 'independent-http', excerpts, ...(pageTitle ? {pageTitle} : {})};
        if (pageTitle) old.title = pageTitle;
      } else if (!isIndependentSource(old)) old.acquisition = acquisition;
      if (rejections.length) old.acquisition.rejections = rejections;
      old.dimensionIds = [...new Set([...(old.dimensionIds || []), ...(node.dimensionId ? [node.dimensionId] : [])])];
      old.nodeIds = [...new Set([...(old.nodeIds || []), ...(node.id ? [node.id] : [])])];
    } else {
      const added = { ...source, acquisition, dimensionId: node.dimensionId || null, dimensionIds: node.dimensionId ? [node.dimensionId] : [], nodeIds: node.id ? [node.id] : [] };
      state.sources.push(added); byId.set(source.id, added);
    }
    if (isIndependentSource(source)) ids.push(sourceId);
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
    if (!isIndependentSource(source)) throw Error('核验来源尚未独立阅读: ' + source.id);
    seen.add(entry.sourceId);
    if (typeof entry.credibilityScore !== 'number' || !Number.isFinite(entry.credibilityScore)) throw Error('核验必须提供 credibilityScore 数值');
    const claims = (entry.claims || []).map(claim => {
      if (!claim || typeof claim.text !== 'string' || !claim.text.trim() || typeof claim.excerpt !== 'string' || !claim.excerpt.trim()) throw Error('论断必须包含 text 和对应的原文 excerpt');
      const proof = proofFor(source, claim.excerpt);
      if (!proof) throw Error('论断引用的片段不在独立获取正文中: ' + source.id);
      return { text: claim.text.trim(), excerpt: claim.excerpt, locator: String(proof.locator || ''), confidence: typeof claim.confidence === 'number' ? Math.max(0, Math.min(1, claim.confidence)) : 0.5 };
    });
    const contradictions = entry.contradictions || [];
    for (const contradiction of contradictions) {
      if (!Array.isArray(contradiction.sourceIds) || contradiction.sourceIds.some(id => !byId.has(id))) throw Error('矛盾引用了未知来源');
    }
    return { sourceId: source.id, credibilityScore: Math.max(0, Math.min(1, entry.credibilityScore)), claims, notes: String(entry.notes || ''), contradictions };
  });
}

export function mergeVerification(state, entries) {
  for (const entry of entries) {
    const source = state.sources.find(s => s.id === entry.sourceId);
    Object.assign(source, { verified: isIndependentSource(source), credibilityScore: entry.credibilityScore, verificationNotes: entry.notes });
    for (const claim of entry.claims) {
      const id = 'finding-' + createHash('sha256').update(claim.text).digest('hex').slice(0, 16);
      let finding = state.findings.find(f => f.id === id);
      if (!finding) { finding = { id, claim: claim.text, sourceIds: [], evidence: [], confidence: claim.confidence, addedAt: Date.now() }; state.findings.push(finding); }
      if (!finding.sourceIds.includes(source.id)) finding.sourceIds.push(source.id);
      if (!finding.evidence.some(e => e.sourceId === source.id && e.excerpt === claim.excerpt)) finding.evidence.push({ sourceId: source.id, excerpt: claim.excerpt, locator: claim.locator });
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
  const sources = new Map(state.sources.filter(s => s.verified && isIndependentSource(s)).map(s => [s.id, s]));
  const findingsById = new Map(state.findings.map(finding => [finding.id, finding]));
  const sections = report.sections.map((section, i) => {
    if (typeof section.content !== 'string' || !section.content.trim()) throw Error('报告章节正文不能为空');
    const citations = [...new Set(section.citations || [])];
    if (citations.some(id => !sources.has(id))) throw Error('报告引用了未阅读、未核验或不存在的来源');
    if (section.findingIds !== undefined && !Array.isArray(section.findingIds)) throw Error('章节 findingIds 必须是论断 ID 数组');
    const findings = section.findingIds === undefined ? state.findings.filter(f => f.sourceIds.some(id => citations.includes(id))) : [...new Set(section.findingIds)].map(id => {
      const finding = findingsById.get(id);
      if (!finding) throw Error('章节引用了不存在的论断: ' + id);
      return finding;
    });
    if (findings.some(f => !f.sourceIds.some(id => citations.includes(id)))) throw Error('章节论断与引用来源不匹配');
    const evidence = findings.flatMap(f => (f.evidence || []).filter(e => citations.includes(e.sourceId)).map(e => ({ ...e, claim: f.claim })));
    if (evidence.some(e => !proofFor(sources.get(e.sourceId), e.excerpt))) throw Error('报告论断的原文片段没有对应的独立获取证据');
    if (!citations.length || !evidence.length) throw Error('每个报告章节必须引用已核验论断和对应原文片段');
    const supported = new Set(evidence.map(e => e.sourceId));
    if (citations.some(id => !supported.has(id))) throw Error('报告章节引用了没有核验论断的来源');
    return { id: section.id || 'section-' + i, heading: String(section.heading || section.title || '章节 ' + (i + 1)), content: section.content.trim(), citations, evidence };
  });
  const citations = [...new Set(sections.flatMap(s => s.citations))];
  if (!citations.length || !sections.some(s => s.evidence.length)) throw Error('报告必须引用已获取的原文片段和核验论断');
  return { title: String(report.title || state.input.topic), abstract: String(report.abstract || report.summary || ''), sections, citations, conclusion: String(report.conclusion || ''), limitations: Array.isArray(report.limitations) ? report.limitations.map(String) : [] };
}
