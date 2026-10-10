import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  safeUrl, independentlyRead, acquisitionLabel,
  type EvidenceExcerpt, type ResearchSource, type SourceSelection, type ResearchFinding,
} from "../ui";
import { filterSources, indexSources, matchedFields, sourcePage, sourcePageNumber, type SourceFilters } from "./source-browser";
import "./source-browser.css";

export type SourcePanelProps = {
  sources: ResearchSource[];
  findings: ResearchFinding[];
  selection: SourceSelection | null;
  onSelect: (selection: SourceSelection | null) => void;
  onReturn?: () => void;
  renderEvidence: (items: EvidenceExcerpt[]) => ReactNode;
};
const emptyFilters: SourceFilters = { query: "", host: "", status: "all" };
const statusOptions = [
  { id: "all", label: "全部" }, { id: "verified", label: "已核验" },
  { id: "reading", label: "待核验" }, { id: "unread", label: "未取得原文" },
] as const;
const acquiredTime = (value: number) => {
  const date = new Date(value);
  return Number.isFinite(value) && value > 0 && !Number.isNaN(date.getTime()) ? date.toLocaleString("zh-CN") : "未记录";
};

export function SourcePanel({ sources, findings, selection, onSelect, onReturn, renderEvidence }: SourcePanelProps) {
  const [filters, setFilters] = useState<SourceFilters>(emptyFilters);
  const [requestedPage, setPage] = useState(1);
  const index = useMemo(() => indexSources(sources, findings), [sources, findings]);
  const matches = useMemo(() => filterSources(index, filters), [index, filters]);
  const page = sourcePage(matches.entries, requestedPage);
  const selected = selection ? index.byId.get(selection.id) : undefined;
  const source = selected?.source;
  const claims = selected?.claims ?? [];
  const read = source ? independentlyRead(source) : false;
  const excerpts = source?.acquisition?.excerpts ?? (source?.acquisition?.excerpt ? [
    { excerpt: source.acquisition.excerpt, locator: source.acquisition.locator },
  ] : []);
  const detail = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const previousSelection = useRef<string | undefined>(undefined);
  const previousDetail = useRef<string | undefined>(undefined);
  const hasFilters = !!filters.query || !!filters.host || filters.status !== "all";
  const selectedVisible = selected && page.entries.some(entry => entry.source.id === source?.id);
  const hasLinkedClaim = !!selection?.locator && claims.some(claim => claim.evidence?.some(
    item => item.sourceId === source?.id && item.locator === selection.locator,
  ));
  const originalUrl = safeUrl(source?.acquisition?.excerpts?.find(item => item.locator === selection?.locator)?.finalUrl) ||
    safeUrl(source?.acquisition?.excerpts?.[0]?.finalUrl) || safeUrl(source?.url);

  const changeFilters = (next: SourceFilters) => {
    setFilters(next); setPage(1);
    if (list.current) list.current.scrollTop = 0;
  };
  const locateSelected = () => {
    changeFilters(emptyFilters);
    setPage(sourcePageNumber(index.entries, selection?.id ?? "") ?? 1);
  };
  const changePage = (next: number) => {
    setPage(next);
    if (list.current) list.current.scrollTop = 0;
  };

  // External citations reveal their page; ordinary paging never snaps back to the selected row.
  useLayoutEffect(() => {
    if (previousSelection.current === selection?.id) return;
    previousSelection.current = selection?.id;
    const targetPage = sourcePageNumber(matches.entries, selection?.id ?? "");
    if (targetPage !== null) setPage(targetPage);
  }, [selection?.id, matches.entries]);

  useLayoutEffect(() => {
    const area = detail.current;
    if (!area) return;
    const target = area.querySelector<HTMLElement>(".dr-linked-claim, .dr-linked-excerpt");
    if (target) {
      const folded = target.closest("details");
      if (folded) folded.open = true;
      area.scrollTop += target.getBoundingClientRect().top - area.getBoundingClientRect().top -
        Math.max(0, (area.clientHeight - target.offsetHeight) / 2);
    } else area.scrollTop = 0;
    if (selection && previousDetail.current !== selection.id && window.matchMedia("(max-width: 800px)").matches) {
      area.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    }
    if (!selection && previousDetail.current) {
      const row = [...(list.current?.querySelectorAll<HTMLButtonElement>(".dr-source-row") ?? [])]
        .find(item => item.dataset.sourceId === previousDetail.current);
      (row ?? list.current?.querySelector<HTMLInputElement>("input"))?.focus({ preventScroll: true });
    }
    previousDetail.current = selection?.id;
  }, [selection?.id, selection?.locator, source?.id]);

  return (
    <section className="dr-evidence-layout dr-retrieval" aria-label="研究来源" data-detail-open={!!selection}>
      <div ref={list} className="dr-source-list">
        <div className="dr-retrieval-toolbar">
          <label className="dr-search">
            <span className="codicon codicon-search" aria-hidden="true" />
            <input aria-label="搜索来源" value={filters.query}
              onChange={event => changeFilters({ ...filters, query: event.target.value })}
              placeholder="搜索标题、网址、摘要、原文片段或论断" />
          </label>
          {sources.length > 0 && <>
            <div className="dr-source-filters" role="group" aria-label="来源状态">
              {statusOptions.map(option => <button type="button" key={option.id}
                aria-pressed={filters.status === option.id}
                onClick={() => changeFilters({ ...filters, status: option.id })}>
                {option.label} <span>{matches.counts[option.id]}</span>
              </button>)}
            </div>
            <div className="dr-retrieval-controls">
              <label>来源网站
                <select aria-label="筛选来源网站" value={filters.host}
                  onChange={event => changeFilters({ ...filters, host: event.target.value })}>
                  <option value="">全部网站</option>
                  {filters.host && !index.hosts.some(item => item.host === filters.host) &&
                    <option value={filters.host}>{filters.host}（当前无来源）</option>}
                  {index.hosts.map(item => <option key={item.host} value={item.host}>{item.host} · {item.count}</option>)}
                </select>
              </label>
              {hasFilters && <button type="button" onClick={() => changeFilters(emptyFilters)}>清除资料筛选</button>}
            </div>
          </>}
          <div className="dr-retrieval-range">
            <p role="status" aria-live="polite">
              {matches.entries.length ? `${page.start + 1}–${page.start + page.entries.length} / ${matches.entries.length} 条资料` : "0 条资料"}
            </p>
            {page.pages > 1 && <nav aria-label="来源分页">
              <button type="button" aria-label="来源上一页" disabled={page.page === 1} onClick={() => changePage(page.page - 1)}>上一页</button>
              <span>{page.page} / {page.pages}</span>
              <button type="button" aria-label="来源下一页" disabled={page.page === page.pages} onClick={() => changePage(page.page + 1)}>下一页</button>
            </nav>}
          </div>
        </div>
        {selected && !selectedVisible && <div className="dr-retrieval-notice">
          <span>当前来源未显示在列表中，详情仍保留。</span>
          <button type="button" onClick={locateSelected}>在列表中定位</button>
        </div>}
        {page.entries.map(entry => <button type="button" key={entry.source.id}
          className={"dr-source-row " + (selection?.id === entry.source.id ? "selected" : "")}
          data-source-id={entry.source.id} aria-pressed={selection?.id === entry.source.id} onClick={() => onSelect({ id: entry.source.id })}>
          <span className="dr-source-number">{entry.number}</span>
          <span>
            <small>{entry.host || entry.source.type || "来源"}
              <span className={"dr-verified " + (entry.status === "verified" && !entry.source.acquisition?.rejections?.length ? "yes" : "")}>
                {acquisitionLabel(entry.source)}
              </span>
            </small>
            <strong>{entry.source.title}</strong>
            <p>{entry.summary}</p>
            {matches.terms.length > 0 && <span className="dr-retrieval-match">匹配：{matchedFields(entry, matches.terms).join(" · ")}</span>}
          </span>
          <span className="codicon codicon-chevron-right" aria-hidden="true" />
        </button>)}
        {!page.entries.length && <div className="dr-empty">
          <span aria-hidden="true" className="codicon codicon-globe" />
          <p>{sources.length ? "没有符合条件的来源" : "尚未收集来源"}</p>
          {hasFilters && <button type="button" onClick={() => changeFilters(emptyFilters)}>显示全部资料</button>}
        </div>}
      </div>
      <aside key={selection?.id ?? "empty"} ref={detail} className="dr-source-detail" aria-label="来源详情">
        {onReturn && <button type="button" className="dr-return-report" onClick={onReturn}>
          <span aria-hidden="true" className="codicon codicon-arrow-left" />返回报告
        </button>}
        {selection && <div className="dr-section-heading">
            <h2 tabIndex={-1}>来源详情</h2>
            <button type="button" className="dr-icon-button" title="关闭来源详情" aria-label="关闭来源详情" onClick={() => onSelect(null)}>
              <span className="dr-retrieval-back-label">返回资料列表</span>
              <span aria-hidden="true" className="codicon codicon-close" />
            </button>
        </div>}
        {source ? <>
          <small className="dr-eyebrow">{selected?.host || source.type}</small>
          <h3>{source.title}</h3>
          <section className="dr-acquisition-status">
            <h4>{acquisitionLabel(source)}</h4>
            <p>{read ? "已独立获取原文并匹配引用片段" : "尚未取得可独立验证的原文"}</p>
            {source.acquisition?.reason && <p>{source.acquisition.reason}</p>}
          </section>
          {originalUrl && <a className="dr-source-link" href={originalUrl} target="_blank" rel="noreferrer">
            <span aria-hidden="true" className="codicon codicon-link-external" />阅读原文
          </a>}
          {read && <p className="dr-retrieval-limitation">此处展示已保存的原文片段；完整内容请打开原文。片段匹配不代表结论已得到语义核验。</p>}
          {(source.snippet || source.summary) && <section>
            <h4>初调研摘要 · 非引用证据</h4><p>{source.snippet || source.summary}</p>
          </section>}
          {source.verificationNotes && <section><h4>核验说明</h4><p>{source.verificationNotes}</p></section>}
          {excerpts.length > 0 && (!claims.some(finding => finding.evidence?.some(item =>
            item.sourceId === source.id && excerpts.length === 1 && item.excerpt === excerpts[0].excerpt,
          )) || !!selection?.locator && !hasLinkedClaim) && <details className="dr-retrieval-excerpts">
            <summary>{read ? "已读取原文" : "历史片段 · 未独立验证"}</summary>
            {excerpts.map((item, i) => <div key={i} className={selection?.locator && !hasLinkedClaim && item.locator === selection.locator ? "dr-linked-excerpt" : undefined}>
              {renderEvidence([item])}
            </div>)}
          </details>}
          <section className="dr-acquisition-status">
            {source.acquisition?.rejections?.map((item, i) => <details key={i}>
              <summary>片段未通过核对{item.locator ? " · 提交位置：" + item.locator : ""}</summary>
              <p>{item.reason}</p>{renderEvidence([{ excerpt: item.excerpt }])}
            </details>)}
            {read && <details className="dr-acquisition-metadata">
              <summary>获取记录</summary>
              {source.acquisition!.excerpts!.map((item, i) => <dl key={i}>
                <dt>原文位置</dt><dd>{item.locator || "未标注"}</dd>
                <dt>获取时间</dt><dd>{acquiredTime(item.accessedAt)}</dd>
                <dt>最终链接</dt><dd>{safeUrl(item.finalUrl) ? <a href={safeUrl(item.finalUrl)} target="_blank" rel="noreferrer">{item.finalUrl}</a> : "未记录有效链接"}</dd>
                <dt>内容指纹</dt><dd><code>{item.sha256 || "未记录"}</code></dd>
              </dl>)}
            </details>}
          </section>
          {claims.length > 0 && <section>
            <h4>{read && source.verified ? "已提取论断" : "关联论断 · 待核验"}</h4>
            {claims.map(claim => <div key={claim.id} className={selection?.locator && claim.evidence?.some(
              item => item.sourceId === source.id && item.locator === selection.locator,
            ) ? "dr-linked-claim" : undefined}>
              <p>{claim.claim}</p>
              {renderEvidence((claim.evidence ?? []).filter(item => item.sourceId === source.id))}
            </div>)}
          </section>}
        </> : <div className="dr-empty">
          <span aria-hidden="true" className="codicon codicon-book" />
          <p>{selection ? "选中的来源暂不在当前研究中" : "选择一个来源查看证据"}</p>
        </div>}
      </aside>
    </section>
  );
}
