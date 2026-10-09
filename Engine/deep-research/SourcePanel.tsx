import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  safeUrl,
  independentlyRead,
  acquisitionLabel,
  sourceHost,
  type EvidenceExcerpt,
  type ResearchSource,
  type SourceSelection,
  type ResearchFinding,
} from "./ui";

export function SourcePanel({
  sources,
  findings,
  selection,
  onSelect,
  onReturn,
  renderEvidence,
}: {
  sources: ResearchSource[];
  findings: ResearchFinding[];
  selection: SourceSelection | null;
  onSelect: (selection: SourceSelection | null) => void;
  onReturn?: () => void;
  renderEvidence: (items: EvidenceExcerpt[]) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const detail = useRef<HTMLElement>(null);
  const filters = [
    {id: "all", label: "全部", count: sources.length},
    {id: "verified", label: "已核验", count: sources.filter(source => independentlyRead(source) && source.verified).length},
    {id: "reading", label: "待核验", count: sources.filter(source => independentlyRead(source) && !source.verified).length},
    {id: "unread", label: "未取得原文", count: sources.filter(source => !independentlyRead(source)).length},
  ];
  const search = query.trim().toLowerCase();
  const visibleSources = sources.filter(source => {
    const read = independentlyRead(source);
    const matches =
      filter === "all" ||
      (filter === "verified" && read && source.verified) ||
      (filter === "reading" && read && !source.verified) ||
      (filter === "unread" && !read);
    return matches && [source.title, source.url, source.snippet].some(value => String(value ?? "").toLowerCase().includes(search));
  });
  const selected = sources.find((source) => source.id === selection?.id);
  const claims = findings.filter((finding) =>
    finding.sourceIds.includes(selected?.id ?? ""),
  );
  const excerpts =
    selected?.acquisition?.excerpts ??
    (selected?.acquisition?.excerpt
      ? [
          {
            excerpt: selected.acquisition.excerpt,
            locator: selected.acquisition.locator,
          },
        ]
      : []);
  useLayoutEffect(() => {
    const area = detail.current;
    const claim = area?.querySelector<HTMLElement>(".dr-linked-claim");
    if (area && claim)
      area.scrollTop =
        claim.offsetTop -
        area.offsetTop -
        (area.clientHeight - claim.offsetHeight) / 2;
    else if (area) area.scrollTop = 0;
  }, [selection?.id, selection?.locator]);
  return (
    <section className="dr-evidence-layout" aria-label="研究来源">
      <div className="dr-source-list">
        <label className="dr-search">
          <span className="codicon codicon-search" aria-hidden="true" />
          <input
            aria-label="搜索来源"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、网站或摘要"
          />
        </label>
        {sources.length > 0 && (
          <div className="dr-source-filters" role="group" aria-label="来源状态">
            {filters.map(option => (
              <button key={option.id} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>
                {option.label} <span>{option.count}</span>
              </button>
            ))}
          </div>
        )}
        {visibleSources.map((source) => (
            <button
              key={source.id}
              className={
                "dr-source-row " +
                (selection?.id === source.id ? "selected" : "")
              }
              onClick={() => onSelect({ id: source.id })}
            >
              <span className="dr-source-number">
                {sources.indexOf(source) + 1}
              </span>
              <span>
                <small>
                  {sourceHost(source.url) || source.type}
                  <span
                    className={
                      "dr-verified " +
                      (source.verified &&
                      independentlyRead(source) &&
                      !source.acquisition?.rejections?.length
                        ? "yes"
                        : "")
                    }
                  >
                    {acquisitionLabel(source)}
                  </span>
                </small>
                <strong>{source.title}</strong>
                <p>{source.snippet || source.summary}</p>
              </span>
              <span
                className="codicon codicon-chevron-right"
                aria-hidden="true"
              />
            </button>
          ))}
        {!visibleSources.length && (
          <div className="dr-empty">
            <span aria-hidden="true" className="codicon codicon-globe" />
            <p>{sources.length ? "没有符合条件的来源" : "尚未收集来源"}</p>
          </div>
        )}
      </div>
      <aside ref={detail} className="dr-source-detail" aria-label="来源详情">
        {selected ? (
          <>
            {onReturn && (
              <button className="dr-return-report" onClick={onReturn}>
                <span
                  aria-hidden="true"
                  className="codicon codicon-arrow-left"
                />
                返回报告
              </button>
            )}
            <div className="dr-section-heading">
              <h2>来源详情</h2>
              <button
                className="dr-icon-button"
                title="关闭来源详情"
                aria-label="关闭来源详情"
                onClick={() => onSelect(null)}
              >
                <span aria-hidden="true" className="codicon codicon-close" />
              </button>
            </div>
            <small className="dr-eyebrow">
              {sourceHost(selected.url) || selected.type}
            </small>
            <h3>{selected.title}</h3>
            <section className="dr-acquisition-status">
              <h4>{acquisitionLabel(selected)}</h4>
              <p>
                {independentlyRead(selected)
                  ? "已独立获取原文并匹配引用片段"
                  : "尚未取得可独立验证的原文"}
              </p>
              {selected.acquisition?.reason && (
                <p>{selected.acquisition.reason}</p>
              )}
              {selected.acquisition?.rejections?.map((item, index) => (
                <details key={index}>
                  <summary>
                    片段未通过核对
                    {item.locator ? " · 提交位置：" + item.locator : ""}
                  </summary>
                  <p>{item.reason}</p>
                  {renderEvidence([{ excerpt: item.excerpt }])}
                </details>
              ))}
              {independentlyRead(selected) && (
                <details className="dr-acquisition-metadata">
                  <summary>获取记录</summary>
                  {selected.acquisition!.excerpts!.map((item, index) => (
                    <dl key={index}>
                      <dt>原文位置</dt>
                      <dd>{item.locator || "未标注"}</dd>
                      <dt>获取时间</dt>
                      <dd>
                        {new Date(item.accessedAt).toLocaleString("zh-CN")}
                      </dd>
                      <dt>最终链接</dt>
                      <dd>
                        <a
                          href={safeUrl(item.finalUrl)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {item.finalUrl}
                        </a>
                      </dd>
                      <dt>内容指纹</dt>
                      <dd>
                        <code>{item.sha256}</code>
                      </dd>
                    </dl>
                  ))}
                </details>
              )}
            </section>
            {safeUrl(selected.url) && (
              <a
                className="dr-source-link"
                href={safeUrl(selected.url)}
                target="_blank"
                rel="noreferrer"
              >
                <span
                  aria-hidden="true"
                  className="codicon codicon-link-external"
                />
                阅读原文
              </a>
            )}
            <p>{selected.snippet || selected.summary}</p>
            {selected.verificationNotes && (
              <section>
                <h4>核验说明</h4>
                <p>{selected.verificationNotes}</p>
              </section>
            )}
            {excerpts.length > 0 &&
              !claims.some((finding) =>
                finding.evidence?.some(
                  (item) =>
                    item.sourceId === selected.id &&
                    excerpts.length === 1 &&
                    item.excerpt === excerpts[0].excerpt,
                ),
              ) && (
                <details>
                  <summary>
                    {independentlyRead(selected)
                      ? "已读取原文"
                      : "历史片段 · 未独立验证"}
                  </summary>
                  {renderEvidence(excerpts)}
                </details>
              )}
            {claims.length > 0 && (
              <section>
                <h4>已提取论断</h4>
                {claims.map((claim, index) => (
                  <div
                    key={index}
                    className={
                      claim.evidence?.some(
                        (item) =>
                          item.sourceId === selected.id &&
                          selection?.locator === item.locator,
                      )
                        ? "dr-linked-claim"
                        : ""
                    }
                  >
                    <p>{claim.claim}</p>
                    {renderEvidence(
                      (claim.evidence ?? []).filter(
                        (item) => item.sourceId === selected.id,
                      ),
                    )}
                  </div>
                ))}
              </section>
            )}
          </>
        ) : (
          <div className="dr-empty">
            <span aria-hidden="true" className="codicon codicon-book" />
            <p>选择一个来源查看证据</p>
          </div>
        )}
      </aside>
    </section>
  );
}
