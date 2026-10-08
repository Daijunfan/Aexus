import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  safeUrl,
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
  const detail = useRef<HTMLElement>(null);
  const selected = sources.find((source) => source.id === selection?.id);
  const claims = findings.filter((finding) =>
    finding.sourceIds.includes(selected?.id ?? ""),
  );
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
        {sources
          .filter((source) =>
            [source.title, source.url, source.snippet].some((value) =>
              String(value ?? "")
                .toLowerCase()
                .includes(query.toLowerCase()),
            ),
          )
          .map((source) => (
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
                    className={"dr-verified " + (source.verified ? "yes" : "")}
                  >
                    {source.verified
                      ? "已核验"
                      : source.acquisition?.status === "read"
                        ? "已读取 · 待核验"
                        : "已发现 · 待读取"}
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
        {!sources.length && (
          <div className="dr-empty">
            <span aria-hidden="true" className="codicon codicon-globe" />
            <p>尚未收集来源</p>
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
            {selected.acquisition?.excerpt &&
              !claims.some((finding) =>
                finding.evidence?.some(
                  (item) =>
                    item.sourceId === selected.id &&
                    item.excerpt === selected.acquisition?.excerpt,
                ),
              ) && (
                <details>
                  <summary>
                    {selected.acquisition.status === "read"
                      ? "已读取原文"
                      : "已发现片段 · 尚未读取"}
                  </summary>
                  {renderEvidence([selected.acquisition])}
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
