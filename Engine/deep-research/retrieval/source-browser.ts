import { independentlyRead, sourceHost, type ResearchFinding, type ResearchSource } from "../ui.ts";

export const SOURCE_PAGE_SIZE = 40;
export type SourceStatusFilter = "all" | "verified" | "reading" | "unread";
export type SourceFilters = { query: string; host: string; status: SourceStatusFilter };
export type SourceEntry = {
  source: ResearchSource;
  number: number;
  host: string;
  status: Exclude<SourceStatusFilter, "all">;
  claims: ResearchFinding[];
  summary: string;
  fields: { label: string; text: string }[];
};
export type SourceIndex = ReturnType<typeof indexSources>;

const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
export const queryTerms = (query: string) => [...new Set(normalize(query).split(" ").filter(Boolean))];

/** A disposable UI projection. Source identities, evidence and verification remain owned by the domain. */
export function indexSources(sources: ResearchSource[], findings: ResearchFinding[]) {
  const claimsBySource = new Map<string, ResearchFinding[]>();
  for (const finding of findings) for (const id of new Set(finding.sourceIds)) {
    const claims = claimsBySource.get(id) ?? [];
    claims.push(finding);
    claimsBySource.set(id, claims);
  }
  const hosts = new Map<string, number>();
  const entries: SourceEntry[] = sources.map((source, index) => {
    const read = independentlyRead(source);
    const claims = claimsBySource.get(source.id) ?? [];
    const host = sourceHost(source.url);
    if (host) hosts.set(host, (hosts.get(host) ?? 0) + 1);
    const excerpts = source.acquisition?.excerpts?.map(item => item.excerpt) ??
      (source.acquisition?.excerpt ? [source.acquisition.excerpt] : []);
    const fields = [
      { label: "标题", text: source.title },
      { label: "网址", text: source.url },
      { label: "候选摘要", text: [source.snippet, source.summary].filter(Boolean).join("\n") },
      { label: read ? "已读取片段" : "历史片段 · 未独立验证", text: excerpts.join("\n") },
      { label: read && source.verified ? "已提取论断" : "关联论断 · 待核验", text: claims.map(item => item.claim).join("\n") },
    ].map(field => ({ ...field, text: normalize(field.text || "") })).filter(field => field.text);
    const summary = read && source.verified && claims[0]?.claim ? claims[0].claim :
      read && excerpts[0] ? "已读取片段 · " + excerpts[0] :
      source.snippet || source.summary ? "候选摘要 · " + (source.snippet || source.summary) : "尚无可用摘要";
    return { source, number: index + 1, host, claims, summary, fields,
      status: read ? source.verified ? "verified" : "reading" : "unread" };
  });
  return {
    entries,
    byId: new Map(entries.map(entry => [entry.source.id, entry])),
    hosts: [...hosts].map(([host, count]) => ({ host, count })).sort((a, b) => a.host.localeCompare(b.host)),
  };
}

/** Tokens may match across title, original excerpts and claims; no network requests or inferred content. */
export function filterSources(index: SourceIndex, filters: SourceFilters) {
  const terms = queryTerms(filters.query);
  const counts = { all: 0, verified: 0, reading: 0, unread: 0 };
  const entries = index.entries.filter(entry => {
    if (filters.host && entry.host !== filters.host) return false;
    if (!terms.every(term => entry.fields.some(field => field.text.includes(term)))) return false;
    counts.all++;
    counts[entry.status]++;
    return filters.status === "all" || entry.status === filters.status;
  });
  return { entries, counts, terms };
}

export function matchedFields(entry: SourceEntry, terms: string[]) {
  return entry.fields.filter(field => terms.some(term => field.text.includes(term))).map(field => field.label);
}

/** Keep DOM work bounded without dropping sources or changing their stable display numbers. */
export function sourcePage(entries: SourceEntry[], requestedPage: number) {
  const pages = Math.max(1, Math.ceil(entries.length / SOURCE_PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const start = (page - 1) * SOURCE_PAGE_SIZE;
  return { page, pages, start, entries: entries.slice(start, start + SOURCE_PAGE_SIZE) };
}

export function sourcePageNumber(entries: SourceEntry[], id: string) {
  const index = entries.findIndex(entry => entry.source.id === id);
  return index < 0 ? null : Math.floor(index / SOURCE_PAGE_SIZE) + 1;
}
