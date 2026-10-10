import { useMemo, useState } from "react";
import type { WorkflowView } from "../../../Contract/workflow";
import { STATUS } from "./status";
type Filter = "all" | "active" | "completed";

export function ResearchHistory({
  history,
  hasMore,
  loading,
  busy,
  onOpen,
  onMore,
}: {
  history: WorkflowView[];
  hasMore: boolean;
  loading: boolean;
  busy: boolean;
  onOpen: (id: string) => void;
  onMore: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return history.filter(item => {
      if (filter === "completed" && item.status !== "completed") return false;
      if (filter === "active" && !["running", "waiting", "paused", "failed"].includes(item.status)) return false;
      const title = String(item.summary.topic || item.summary.title || "研究");
      return !term || title.toLocaleLowerCase().includes(term);
    });
  }, [history, query, filter]);
  const filtering = history.length > 5;

  return (
    <section className="dr-recent" aria-label="研究记录">
      <h2>研究记录 <span>{history.length || ""}{hasMore ? "+" : ""}</span></h2>
      {filtering && (
        <div className="dr-history-tools">
          <label className="dr-history-search">
            <span className="codicon codicon-search" aria-hidden="true" />
            <input
              aria-label="搜索研究记录"
              type="search"
              placeholder="搜索已加载的研究…"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </label>
          <select
            aria-label="筛选研究状态"
            value={filter}
            onChange={event => setFilter(event.target.value as Filter)}
          >
            <option value="all">全部状态</option>
            <option value="active">进行及待处理</option>
            <option value="completed">已完成</option>
          </select>
        </div>
      )}
      {!history.length && (
        <p className="dr-muted">
          {loading ? "读取研究记录…" : "完成的研究与正在进行的任务会显示在这里"}
        </p>
      )}
      {filtering && !visible.length && (
        <p className="dr-muted" role="status">已加载的研究记录中没有匹配结果</p>
      )}
      {visible.map(item => (
        <button key={item.id} disabled={busy} onClick={() => onOpen(item.id)}>
          <i className={"dr-state-dot " + item.status} aria-hidden="true" />
          <strong>{item.summary.topic || item.summary.title || "研究"}</strong>
          <small>
            {STATUS[item.status] ?? item.status} ·{" "}
            {new Date(item.createdAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
          </small>
          <span className="codicon codicon-arrow-right" aria-hidden="true" />
        </button>
      ))}
      {hasMore && (
        <button className="dr-history-more" disabled={busy} onClick={onMore}>
          查看更多研究记录 <span className="codicon codicon-chevron-down" aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
