import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ContractClient } from "../../Contract/protocol";
import type { WorkflowView } from "../../Contract/workflow";
import { ResearchGraph } from "./ResearchGraph";
import { SourcePanel } from "./SourcePanel";
import { ReportView } from "./ReportView";
import {
  activityLabel,
  displayStatus,
  independentlyRead,
  labelFor,
  safeUrl,
  sourceHost,
  type ResearchNode,
} from "./ui";
import "./style.css";

const ENGINE = "deep-research";
const SCOPES = [
  { value: "quick", label: "快速" },
  { value: "comprehensive", label: "全面" },
  { value: "deep", label: "深入" },
  { value: "academic", label: "学术" },
];
const PHASES: Record<string, string> = {
  init: "准备研究",
  scouting: "初步调研",
  planning: "制定计划",
  research: "研究执行",
  verification: "核验证据",
  synthesis: "综合发现",
  writing: "撰写报告",
  review: "审阅报告",
  complete: "研究完成",
};
const STATUS: Record<string, string> = {
  running: "进行中",
  waiting: "待确认",
  paused: "已暂停",
  completed: "已完成",
  failed: "需处理",
  cancelled: "已停止",
};
const TABS = [
  { id: "graph", label: "研究地图", icon: "type-hierarchy" },
  { id: "sources", label: "来源", icon: "globe" },
  { id: "findings", label: "发现", icon: "lightbulb" },
  { id: "report", label: "报告", icon: "file-text" },
];
function Icon({ name }: { name: string }) {
  return <span className={"codicon codicon-" + name} aria-hidden="true" />;
}
function Empty({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="dr-empty">
      <Icon name={icon} />
      <p>{children}</p>
    </div>
  );
}

export default function Page({ client }: { client: ContractClient }) {
  const [job, setJob] = useState<WorkflowView | null>(null),
    [history, setHistory] = useState<WorkflowView[]>([]);
  const [forkParent, setForkParent] = useState<WorkflowView | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [topic, setTopic] = useState(""),
    [scope, setScope] = useState("comprehensive"),
    [maxSources, setMaxSources] = useState<number | null>(null);
  const sourceBudget = maxSources ?? (scope === "quick" ? 6 : 80);
  const [materials, setMaterials] = useState<
      { name: string; content: string }[]
    >([]),
    [autoApprove, setAutoApprove] = useState(true);
  const [tab, setTab] = useState("graph"),
    [nodeId, setNodeId] = useState<string | null>(null),
    [sourceId, setSourceId] = useState<{ id: string; locator?: string } | null>(
      null,
    );
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [graphDirection, setGraphDirection] = useState<
    "horizontal" | "vertical"
  >();
  const [liveActivities, setLiveActivities] = useState<
    {
      nodeId: string;
      messageId: string;
      preview: { kind: string; text: string; detail?: string; tool?: string };
    }[]
  >([]);
  const [revisionOpen, setRevisionOpen] = useState(false),
    [instructions, setInstructions] = useState("");
  const alive = useRef(true),
    current = useRef<WorkflowView | null>(null),
    selected = useRef<string | null>(null);
  const taskDetail = useRef<HTMLDivElement>(null);
  const reportReturn = useRef<{
    section: string;
    outer: number;
    main: number;
    window: number;
  } | null>(null);
  const request = useRef<{ payload: string; key: string } | null>(null);
  const apply = (next: WorkflowView) => {
    current.current = next;
    setJob(next);
    setHistory((old) =>
      [next, ...old.filter((item) => item.id !== next.id)].sort(
        (a, b) => b.createdAt - a.createdAt,
      ),
    );
  };
  const keyFor = (value: unknown) => {
    const payload = JSON.stringify(value);
    if (request.current?.payload !== payload)
      request.current = { payload, key: crypto.randomUUID() };
    return request.current.key;
  };
  const operate = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    void client
      .invoke<{ jobs: WorkflowView[]; hasMore?: boolean }>("workflow.list", {
        engineId: ENGINE,
        offset: 0,
        limit: 30,
      })
      .then(({ jobs, hasMore }) => {
        if (alive.current) {
          setHistory(jobs);
          setHistoryHasMore(!!hasMore);
        }
      })
      .catch((e) => {
        if (alive.current) setError(e.message);
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    return () => {
      alive.current = false;
    };
  }, [client]);
  useEffect(() => {
    if (!job || !["running", "waiting", "paused"].includes(job.status)) return;
    let active = true,
      activityAt = 0,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await client.invoke<
          WorkflowView & { unchanged?: boolean }
        >("workflow.get", {
          id: job.id,
          ifRevision: current.current?.revision,
        });
        if (active && selected.current === job.id && !next.unchanged)
          apply(next);
        if (
          active &&
          job.status === "running" &&
          tab === "graph" &&
          !document.hidden &&
          Date.now() - activityAt >= 3000
        ) {
          activityAt = Date.now();
          const graphRunning: ResearchNode[] = (
            current.current?.summary.graph?.nodes ?? []
          )
            .filter(
              (node: ResearchNode) =>
                node.status === "running" && node.employeeId && node.messageId,
            )
            .sort(
              (a: ResearchNode, b: ResearchNode) =>
                Number(b.id === nodeId) - Number(a.id === nodeId),
            );
          const running: ResearchNode[] = graphRunning.length
            ? graphRunning
            : (current.current?.summary.tasks ?? []).filter(
                (task: any) =>
                  ["running", "approval"].includes(task.status) &&
                  task.employeeId &&
                  task.messageId,
              );
          const readings = await Promise.allSettled(
            running.slice(0, 2).map(async (node) => {
              const [status] = await client.invoke<any[]>("session.status", {
                employee: node.employeeId,
              });
              return status?.currentTask?.messageId === node.messageId &&
                status.activityPreview &&
                status.activityPreview.kind !== "thinking"
                ? {
                    nodeId: node.id,
                    messageId: node.messageId!,
                    preview: status.activityPreview,
                  }
                : null;
            }),
          );
          if (active)
            setLiveActivities(
              readings.flatMap((result) =>
                result.status === "fulfilled" && result.value
                  ? [result.value]
                  : [],
              ),
            );
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) timer = setTimeout(poll, 1500);
      }
    };
    timer = setTimeout(poll, 750);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [job?.id, job?.status, client, tab, nodeId]);
  const load = async (id: string, view = "graph") => {
    selected.current = id;
    setForkParent(null);
    setNodeId(null);
    setSourceId(null);
    reportReturn.current = null;
    setTab(view);
    setRevisionOpen(false);
    const next = await client.invoke<WorkflowView>("workflow.get", { id });
    if (alive.current && selected.current === id) apply(next);
  };
  const loadMoreHistory = async () => {
    const { jobs, hasMore } = await client.invoke<{
      jobs: WorkflowView[];
      hasMore: boolean;
    }>("workflow.list", { engineId: ENGINE, offset: history.length, limit: 30 });
    if (alive.current) {
      setHistory((old) => {
        const known = new Set(old.map((item) => item.id));
        return [...old, ...jobs.filter((item) => !known.has(item.id))].sort(
          (a, b) => b.createdAt - a.createdAt,
        );
      });
      setHistoryHasMore(hasMore);
    }
  };
  const newResearch = () => {
    selected.current = null;
    current.current = null;
    setJob(null);
    setForkParent(null);
    setError("");
    setRevisionOpen(false);
    request.current = null;
    reportReturn.current = null;
  };
  const beginFollowUp = () => {
    const parent = current.current;
    if (!parent || parent.status !== "completed") return;
    selected.current = null;
    current.current = null;
    setJob(null);
    setForkParent(parent);
    setTopic("");
    setScope(parent.summary.scope ?? "comprehensive");
    const previousBudget = parent.summary.progress?.sources?.max;
    const defaultBudget = parent.summary.scope === "quick" ? 6 : 80;
    setMaxSources(previousBudget === defaultBudget ? null : previousBudget ?? null);
    setMaterials([]);
    setAutoApprove(false);
    setError("");
    request.current = null;
    reportReturn.current = null;
  };
  const start = (event: FormEvent) => {
    event.preventDefault();
    void operate(async () => {
      const input = {
        topic: topic.trim(),
        scope,
        maxSources: sourceBudget,
        ...(!forkParent ? { languages: ["zh-CN", "en"] } : {}),
        autoApprove,
        ...(materials.length ? { materials } : {}),
      };
      const body = forkParent
        ? { id: forkParent.id, expectedRevision: forkParent.revision, input }
        : { engineId: ENGINE, input };
      const next = await client.invoke<WorkflowView>(forkParent ? "workflow.fork" : "workflow.start", {
        ...body,
        clientRequestId: keyFor(body),
      });
      selected.current = next.id;
      apply(next);
      setForkParent(null);
      setTab("graph");
      setNodeId(null);
      setSourceId(null);
      reportReturn.current = null;
      request.current = null;
    });
  };
  const mutate = async (
    command: string,
    extra: Record<string, unknown> = {},
  ) => {
    const activeJob = current.current;
    if (!activeJob) return;
    const body = {
      id: activeJob.id,
      expectedRevision: activeJob.revision,
      ...extra,
    };
    const next = await client.invoke<WorkflowView>(command, {
      ...body,
      clientRequestId: keyFor(body),
    });
    if (alive.current && selected.current === activeJob.id) apply(next);
    request.current = null;
  };
  const answer = (action: string, extra: Record<string, unknown> = {}) =>
    mutate("workflow.respond", { answer: { action, ...extra } });
  const pause = async () => {
    if (current.current) {
      const next = await client.invoke<WorkflowView>("workflow.pause", {
        id: current.current.id,
      });
      apply(next);
      if (next.controlPending)
        throw Error(next.error || "任务暂停尚未完成，请重试暂停后再调整研究");
    }
  };
  const revise = async () => {
    if (current.current?.status === "waiting")
      await answer("revise", { instructions: instructions.trim() });
    else {
      if (current.current?.status !== "paused") await pause();
      await mutate("workflow.amend", {
        update: { instructions: instructions.trim() },
      });
      await mutate("workflow.resume");
    }
    setRevisionOpen(false);
    setInstructions("");
  };
  const stop = async () => {
    if (current.current)
      apply(
        await client.invoke<WorkflowView>("workflow.cancel", {
          id: current.current.id,
        }),
      );
  };
  const download = async (name: string) => {
    if (!current.current) return;
    const file = await client.invoke<{
      content: string;
      encoding?: string;
      mediaType: string;
    }>("workflow.file", { id: current.current.id, name });
    const content =
      file.encoding === "base64"
        ? Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0))
        : file.content;
    const url = URL.createObjectURL(
      new Blob([content], { type: file.mediaType }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  const upload = async (files: File[]) => {
    const next = [...materials];
    for (const file of files) {
      if (!/\.(txt|md|csv|json)$/i.test(file.name) || file.size > 200000)
        throw Error("支持 TXT、Markdown、CSV、JSON，每份不超过 200KB");
      next.push({ name: file.name, content: await file.text() });
    }
    if (next.length > (forkParent ? 9 : 10)) throw Error(forkParent ? "后续研究最多添加 9 份背景材料" : "最多 10 份背景材料");
    setMaterials(next);
  };
  const summary = job?.summary ?? {},
    progress = summary.progress ?? {};
  const nodes: ResearchNode[] =
      summary.graph?.nodes ?? summary.plan?.nodes ?? [],
    sources: any[] = summary.sources ?? [],
    allWorkers: any[] = summary.workers ?? [],
    workers: any[] = allWorkers.filter(
      (worker: any) => worker.active !== false,
    );
  const findings: any[] = summary.findingsDetails ?? [],
    contradictions: {
      id: string;
      sources: string[];
      description: string;
      severity: string;
    }[] = summary.contradictions ?? [],
    report = summary.deliverable ?? summary.report?.content,
    revisions: any[] = summary.planRevisions ?? summary.planHistory ?? [];
  const runningNodes = nodes.filter(
    (node) => node.active !== false && node.status === "running",
  );
  const stageTask = (summary.tasks ?? []).find((task: any) =>
    ["running", "approval", "prepared"].includes(task.status),
  );
  const showInspector = inspectorOpen && nodes.length > 0;
  const timeline: any[] = summary.timeline ?? [];
  const activities =
    job?.status === "running"
      ? liveActivities.filter((activity) =>
          [
            ...runningNodes,
            ...(summary.tasks ?? []).filter((task: any) =>
              ["running", "approval"].includes(task.status),
            ),
          ].some(
            (node) =>
              node.id === activity.nodeId &&
              node.messageId === activity.messageId,
          ),
        )
      : [];
  const activeNode =
    nodes.find((node) => node.id === nodeId) ??
    nodes.find((node) => node.status === "running") ??
    nodes.find((node) => node.active !== false);
  const dependencies = (node: ResearchNode) =>
    node.dependencies ?? node.dependsOn ?? [];
  useEffect(() => {
    taskDetail.current?.scrollTo(0, 0);
  }, [activeNode?.id]);
  const predecessors = activeNode
    ? dependencies(activeNode)
        .map((id) => nodes.find((node) => node.id === id))
        .filter((node): node is ResearchNode => !!node)
    : [];
  const successors = activeNode
    ? nodes.filter(
        (node) =>
          (activeNode.active === false || node.active !== false) &&
          dependencies(node).includes(activeNode.id),
      )
    : [];
  const timeLabel = (value?: number) =>
    value
      ? new Date(value).toLocaleString("zh-CN", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "尚未开始";
  const percent =
    progress.mode === "determinate" && typeof progress.percent === "number"
      ? Math.max(0, Math.min(100, progress.percent))
      : null;
  const completedTasks =
      progress.completedTasks ??
      progress.completed ??
      nodes.filter((node) => node.status === "completed").length,
    totalTasks = progress.totalTasks ?? progress.total ?? nodes.length;
  const sourceCount = progress.sources?.collected ?? sources.length,
    readCount = sources.filter(independentlyRead).length,
    verifiedCount = sources.filter(
      (source) => independentlyRead(source) && source.verified,
    ).length;
  const domains = new Set(
    sources.filter(independentlyRead).map((source) => sourceHost(source.url)).filter(Boolean),
  ).size;
  const scopeHelp: Record<string, string> = {
    quick: "快速概览：默认最多 6 个来源、4 位协作者，聚焦关键原始资料。",
    comprehensive:
      "全面调查：覆盖主要问题、证据来源和交叉核验，适合作为默认起点。",
    deep: "深度分析：为复杂问题展开更多证据、反证和影响分析。",
    academic: "学术研究：强调方法、学术来源、局限和可复核引用。",
  };
  const approval =
    job?.status === "waiting"
      ? (
          {
            planning: ["确认研究计划", "approve-plan", "开始执行"],
            synthesis: ["确认综合结果", "approve-synthesis", "继续撰写"],
            review: ["审阅研究报告", "approve-report", "确认交付"],
          } as Record<string, string[]>
        )[summary.phase]
      : null;
  const openSource = (id: string, locator?: string) => {
    setSourceId({ id, locator });
    setTab("sources");
  };
  const openReportSource = (id: string, section: string, locator?: string) => {
    reportReturn.current = {
      section,
      outer: document.querySelector(".engine-surface")?.scrollTop ?? 0,
      main: document.querySelector(".dr-main")?.scrollTop ?? 0,
      window: window.scrollY,
    };
    openSource(id, locator);
  };
  const returnToReport = () => {
    const place = reportReturn.current;
    setTab("report");
    requestAnimationFrame(() => {
      const outer = document.querySelector(".engine-surface"),
        main = document.querySelector(".dr-main");
      if (outer) outer.scrollTop = place?.outer ?? 0;
      if (main) main.scrollTop = place?.main ?? 0;
      window.scrollTo(0, place?.window ?? 0);
      document
        .getElementById(place?.section ?? "")
        ?.focus({ preventScroll: true });
    });
  };
  const citations = (ids: any[], section?: string, locator?: string) => (
    <div className="dr-citations">
      {ids.map((citation, index) => {
        const id =
          typeof citation === "string"
            ? citation
            : (citation.sourceId ?? citation.id);
        return (
          <button
            key={String(id) + index}
            onClick={() =>
              section
                ? openReportSource(id, section, locator)
                : openSource(id, locator)
            }
          >
            <Icon name="link" />
            {sources.find((source) => source.id === id)?.title ?? String(id)}
          </button>
        );
      })}
    </div>
  );
  const evidence = (
    items: { excerpt: string; locator?: string; sourceId?: string }[],
    section?: string,
  ) =>
    items.map((item, index) => (
      <blockquote className="dr-evidence" key={index}>
        <p>{item.excerpt}</p>
        {item.locator && <small>{item.locator}</small>}
        {item.sourceId && citations([item.sourceId], section, item.locator)}
      </blockquote>
    ));
  const taskLinks = (items: ResearchNode[], title: string) => (
    <div className="dr-task-links">
      <h4>{title}</h4>
      {items.length ? (
        items.map((node) => (
          <button key={node.id} onClick={() => setNodeId(node.id)}>
            <span
              className={
                "dr-state-dot " + displayStatus(node.status, job ?? undefined)
              }
            />
            {node.label}
            <Icon name="arrow-right" />
          </button>
        ))
      ) : (
        <p className="dr-muted">无</p>
      )}
    </div>
  );
  const markdown = (content: string, section?: string) => (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => {
          const id =
            href?.startsWith("#") &&
            sources.some((source) => source.id === href.slice(1))
              ? href.slice(1)
              : href?.startsWith("source:")
                ? href.slice(7)
                : null;
          return id ? (
            <button
              className="dr-inline-citation"
              onClick={() =>
                section ? openReportSource(id, section) : openSource(id)
              }
            >
              {children}
            </button>
          ) : (
            <a href={safeUrl(href)} target="_blank" rel="noreferrer">
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </Markdown>
  );

  return (
    <div
      className="dr-app"
      data-status={job?.status ?? "new"}
      data-view={job ? tab : "intake"}
      data-revision={job?.revision}
    >
      <main className="dr-main">
        {error && (
          <div className="dr-alert error" role="alert">
            <Icon name="warning" />
            <span>{error}</span>
            <button
              title="关闭提示"
              aria-label="关闭提示"
              onClick={() => setError("")}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
        {!job ? (
          <div className="dr-intake-page">
            <div className="dr-intake-heading">
              <Icon name="telescope" />
              <h1>{forkParent ? "继续研究" : "Deep Research"}</h1>
            </div>
            {forkParent && (
              <div className="dr-follow-up-context">
                <span className="dr-eyebrow">基于已完成研究</span>
                <strong>{forkParent.summary.deliverable?.title ?? forkParent.summary.topic}</strong>
                <p>上次报告作为历史线索；新问题的来源与引用会重新独立核验，并先确认新计划。</p>
                <button type="button" disabled={busy} onClick={() => setForkParent(null)}>取消追问</button>
              </div>
            )}
            <form className="dr-intake" onSubmit={start}>
              <label htmlFor="dr-topic">{forkParent ? "后续问题" : "研究目标"}</label>
              <textarea
                id="dr-topic"
                aria-label={forkParent ? "后续问题" : "研究目标"}
                placeholder={forkParent ? "例如：上次报告中的哪项假设已经变化？请重新核验来源并说明影响" : "例如：比较当前开源多智能体研究引擎的能力、证据质量与实际成本；请给出可定位引用和研究局限"}
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                minLength={1}
                maxLength={2000}
                required
                rows={4}
              />
              <div className="dr-intake-controls">
                <div
                  className="dr-segment"
                  role="radiogroup"
                  aria-label="研究深度"
                >
                  {SCOPES.map((option) => (
                    <label
                      className={scope === option.value ? "active" : ""}
                      key={option.value}
                    >
                      <input
                        type="radio"
                        name="depth"
                        checked={scope === option.value}
                        onChange={() => setScope(option.value)}
                      />
                      {option.label}
                      <span className="dr-scope-help">
                        {scopeHelp[option.value]}
                      </span>
                    </label>
                  ))}
                </div>
                <button
                  className="dr-primary"
                  type="submit"
                  disabled={busy || !topic.trim()}
                >
                  <Icon name={busy ? "loading" : "arrow-right"} />
                  {forkParent ? "开始后续研究" : "开始研究"}
                </button>
              </div>
              <details className="dr-settings">
                <summary>
                  研究选项
                  <Icon name="chevron-down" />
                </summary>
                <div className="dr-settings-grid">
                  <label>
                    来源预算
                    <input
                      aria-label="来源预算"
                      type="number"
                      min={1}
                      max={1000}
                      value={sourceBudget}
                      onChange={(event) =>
                        setMaxSources(Number(event.target.value))
                      }
                    />
                  </label>
                  <label className="dr-check">
                    <input
                      type="checkbox"
                      checked={!autoApprove}
                      onChange={(event) =>
                        setAutoApprove(!event.target.checked)
                      }
                    />
                    关键节点由我确认
                  </label>
                  <label className="dr-upload">
                    <Icon name="attach" />
                    添加背景材料
                    <input
                      aria-label="添加背景材料"
                      type="file"
                      multiple
                      accept=".txt,.md,.csv,.json"
                      onChange={(event) => {
                        const files = [...(event.target.files ?? [])];
                        event.target.value = "";
                        if (files.length) void operate(() => upload(files));
                      }}
                    />
                  </label>
                </div>
              </details>
              {materials.length > 0 && (
                <div className="dr-materials">
                  {materials.map((material, index) => (
                    <span key={index}>
                      <Icon name="file-text" />
                      {material.name}
                      <button
                        type="button"
                        aria-label={"移除 " + material.name}
                        title={"移除 " + material.name}
                        onClick={() =>
                          setMaterials((old) =>
                            old.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Icon name="close" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </form>
            <section className="dr-recent" aria-label="研究记录">
              <h2>
                研究记录 <span>{history.length || ""}{historyHasMore ? "+" : ""}</span>
              </h2>
              {!history.length && (
                <p className="dr-muted">
                  {loading ? "读取研究记录…" : "完成的研究与正在进行的任务会显示在这里"}
                </p>
              )}
              {history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => void operate(() => load(item.id))}
                >
                  <i className={"dr-state-dot " + item.status} />
                  <strong>{item.summary.topic || item.summary.title || "研究"}</strong>
                  <small>
                    {STATUS[item.status]} ·{" "}
                    {new Date(item.createdAt).toLocaleDateString("zh-CN", {
                      month: "short", day: "numeric",
                    })}
                  </small>
                  <Icon name="arrow-right" />
                </button>
              ))}
              {historyHasMore && (
                <button
                  className="dr-history-more"
                  disabled={busy}
                  onClick={() => void operate(loadMoreHistory)}
                >
                  查看更多研究记录 <Icon name="chevron-down" />
                </button>
              )}
            </section>
          </div>
        ) : (
          <>
            <header className="dr-job-header">
              <button
                className="dr-icon-button"
                title="返回研究首页"
                aria-label="返回研究首页"
                onClick={newResearch}
              >
                <Icon name="arrow-left" />
              </button>
              <div className="dr-job-title">
                <span className="dr-eyebrow">
                  {PHASES[summary.phase] ?? summary.phaseLabel ?? "研究"}
                </span>
                <h1>{summary.topic}</h1>
                {job.parent && (
                  <button className="dr-parent-link" onClick={() => void operate(() => load(job.parent!.id, "report"))}>
                    <Icon name="arrow-left" /> 查看上次报告
                  </button>
                )}
              </div>
              <div className="dr-job-actions">
                <span className={"dr-status " + job.status}>
                  {job.status === "cancelled" && job.controlPending
                    ? labelFor("stopping")
                    : STATUS[job.status]}
                </span>
                {job.status === "completed" && (
                  <button className="dr-secondary dr-followup-action" onClick={beginFollowUp}>
                    <Icon name="comment-discussion" /> 继续研究
                  </button>
                )}
                {["running", "waiting", "paused", "failed"].includes(
                  job.status,
                ) && (
                  <button
                    className="dr-icon-button"
                    title="调整研究方向"
                    aria-label="调整研究方向"
                    disabled={busy || job.controlPending}
                    onClick={() => setRevisionOpen((value) => !value)}
                  >
                    <Icon name="edit" />
                  </button>
                )}
                {job.status === "running" && (
                  <button
                    className="dr-icon-button"
                    title="暂停研究"
                    aria-label="暂停研究"
                    disabled={busy}
                    onClick={() => void operate(pause)}
                  >
                    <Icon name="debug-pause" />
                  </button>
                )}
                {["paused", "failed"].includes(job.status) && (
                  <button
                    className="dr-icon-button"
                    title="恢复研究"
                    aria-label="恢复研究"
                    disabled={busy || job.controlPending}
                    onClick={() =>
                      void operate(() => mutate("workflow.resume"))
                    }
                  >
                    <Icon name="debug-start" />
                  </button>
                )}
                {(!["completed", "cancelled"].includes(job.status) ||
                  (job.status === "cancelled" && job.controlPending)) && (
                  <button
                    className="dr-icon-button"
                    title={job.status === "cancelled" ? "重试停止" : "停止研究"}
                    aria-label={
                      job.status === "cancelled" ? "重试停止" : "停止研究"
                    }
                    disabled={busy}
                    onClick={() => void operate(stop)}
                  >
                    <Icon name="debug-stop" />
                  </button>
                )}
              </div>
            </header>
            {!(job.status === "completed" && tab === "report") && (
              <section className="dr-progress-band" aria-label="研究进度">
                <div className="dr-progress-label">
                  <span>
                    {percent === null
                      ? (PHASES[summary.phase] ?? "探索研究范围")
                      : `当前计划 · 第 ${summary.graph?.version ?? progress.planVersion ?? 1} 版`}
                    {revisions.length > 1 && (
                      <span
                        className="dr-plan-context"
                        title="计划会随证据调整；当前进度按本版计划的任务范围计算。"
                      >
                        <Icon name="info" />
                      </span>
                    )}
                  </span>
                  <strong>
                    {percent === null
                      ? "进度尚未确定"
                      : `${Math.round(percent)}%`}
                  </strong>
                </div>
                <div
                  className={
                    "dr-progress-track " +
                    (percent === null ? "indeterminate" : "")
                  }
                  role="progressbar"
                  aria-label="当前计划进度"
                  aria-valuemin={percent === null ? undefined : 0}
                  aria-valuemax={percent === null ? undefined : 100}
                  aria-valuenow={percent ?? undefined}
                  aria-valuetext={
                    percent === null
                      ? "初步调研与规划中，尚未确定总工作量"
                      : `当前计划完成 ${completedTasks} / ${totalTasks} 项任务`
                  }
                >
                  <span
                    style={
                      percent === null ? undefined : { width: `${percent}%` }
                    }
                  />
                </div>
                <div className="dr-progress-metrics">
                  <span>
                    <Icon name="checklist" />
                    {percent === null
                      ? "工作量待规划"
                      : `${completedTasks} / ${totalTasks} 任务`}
                  </span>
                  <span>
                    <Icon name="organization" />
                    {workers.length} 位协作者
                  </span>
                  <span
                    title={`${sourceCount} 个已发现来源，${readCount} 个已读取正文，${verifiedCount} 个已核验；${domains} 个已独立读取网站域名`}
                  >
                    <Icon name="globe" />
                    {sourceCount} 来源 · {domains} 实读网站
                  </span>
                  <span>
                    <Icon name="verified" />
                    {verifiedCount} 已核验 · {findings.length} 项论断
                  </span>
                  {progress.failed > 0 && (
                    <span className="dr-error-text">
                      {progress.failed} 项需处理
                    </span>
                  )}
                </div>
                <div className="dr-current-activity" aria-label="当前研究活动">
                  <span className={"dr-activity-indicator " + job.status} />
                  <div>
                    <small>
                      {job.status === "running"
                        ? "当前执行"
                        : STATUS[job.status]}
                    </small>
                    {runningNodes.length && job.status === "running" ? (
                      runningNodes.map((node) => (
                        <button
                          key={node.id}
                          onClick={() => {
                            setTab("graph");
                            setNodeId(node.id);
                            setInspectorOpen(true);
                          }}
                        >
                          <span className="dr-state-dot running" />
                          {node.label}
                        </button>
                      ))
                    ) : (
                      <strong>
                        {job.status === "paused"
                          ? "保留当前进度，等待恢复研究"
                          : job.status === "failed"
                            ? "执行遇到问题，已保存完成的研究"
                            : job.status === "waiting"
                              ? "等待审阅后继续"
                              : job.status === "completed"
                                ? "研究与证据已交付"
                                : job.status === "cancelled"
                                  ? job.controlPending
                                    ? "正在确认剩余任务停止"
                                    : "研究已停止，已保存完成的研究"
                                  : stageTask
                                    ? labelFor(stageTask.label)
                                    : (PHASES[summary.phase] ?? "正在组织研究")}
                      </strong>
                    )}
                  </div>
                  <time>
                    {new Date(job.updatedAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    更新
                  </time>
                </div>
                {activities.length > 0 && (
                  <div className="dr-live-activity" aria-label="实时工作活动">
                    {activities.map((activity) => {
                      const task = [...nodes, ...(summary.tasks ?? [])].find(
                        (task) => task.id === activity.nodeId,
                      );
                      return (
                        <div key={activity.nodeId}>
                          <Icon
                            name={
                              activity.preview.kind === "thinking"
                                ? "lightbulb"
                                : "pulse"
                            }
                          />
                          <small>
                            {workers.find(
                              (worker) => worker.id === task?.employeeId,
                            )?.label ?? "研究团队"}
                          </small>
                          <span>{activityLabel(activity.preview)}</span>
                          <span className="dr-live-context">
                            {task ? labelFor(task.label) : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
            {job.status === "failed" && (
              <div className="dr-alert error">
                <Icon name="warning" />
                <span>{job.error || "研究执行需要处理"}</span>
              </div>
            )}
            {job.status === "paused" && (
              <div className="dr-alert">
                <Icon name="debug-pause" />
                <span>
                  {job.controlPending
                    ? job.error || "正在确认任务暂停"
                    : "研究已暂停"}
                </span>
                {job.controlPending && (
                  <button
                    className="dr-secondary"
                    disabled={busy}
                    onClick={() => void operate(pause)}
                  >
                    重试暂停
                  </button>
                )}
              </div>
            )}
            {job.status === "cancelled" && job.controlPending && (
              <div className="dr-alert error" role="alert">
                <Icon name="warning" />
                <span>
                  {job.error || "部分研究任务尚未确认停止，请重试停止。"}
                </span>
                <button
                  className="dr-secondary"
                  disabled={busy}
                  onClick={() => void operate(stop)}
                >
                  重试停止
                </button>
              </div>
            )}
            {summary.attention && (
              <div className="dr-alert">
                <Icon name="shield" />
                <span>
                  {summary.tasks?.some(
                    (task: any) => task.status === "approval",
                  )
                    ? "协作者正在等待授权"
                    : summary.attention.message}
                </span>
                <button
                  className="dr-secondary"
                  onClick={() =>
                    void operate(async () => {
                      await client.invoke("view.open", {
                        kind: "conversation",
                        employee: summary.attention.employeeId,
                      });
                    })
                  }
                >
                  查看研究会话
                </button>
              </div>
            )}
            {revisionOpen && (
              <form
                className="dr-revision"
                onSubmit={(event) => {
                  event.preventDefault();
                  void operate(revise);
                }}
              >
                <label htmlFor="dr-revision">调整研究方向</label>
                <textarea
                  id="dr-revision"
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  placeholder="补充研究问题、限定范围或指出需要重新核验的结论"
                  required
                  rows={3}
                />
                <div>
                  <button
                    type="button"
                    className="dr-secondary"
                    onClick={() => setRevisionOpen(false)}
                  >
                    取消
                  </button>
                  <button
                    className="dr-primary"
                    type="submit"
                    disabled={
                      busy || job.controlPending || !instructions.trim()
                    }
                  >
                    <Icon name="refresh" />
                    重新规划
                  </button>
                </div>
              </form>
            )}
            {approval && (
              <section className="dr-approval" aria-label={approval[0]}>
                <div>
                  <Icon name="checklist" />
                  <h2>{approval[0]}</h2>
                  <p>
                    {summary.phase === "review"
                      ? summary.review?.summary
                      : (summary.plan?.strategy ?? "")}
                  </p>
                  {(summary.managerReviews ?? [])
                    .filter(
                      (review: any) =>
                        review.planVersion === summary.graph?.version &&
                        (summary.phase === "planning"
                          ? review.stage !== "final"
                          : review.stage === "final"),
                    )
                    .map((review: any, index: number) => (
                      <details
                        className={"dr-manager-review " + review.verdict}
                        key={index}
                      >
                        <summary>
                          <Icon
                            name={
                              review.verdict === "revise" ? "warning" : "check"
                            }
                          />
                          {workers.find(
                            (worker) => worker.id === review.managerId,
                          )?.label ?? "研究负责人"}
                          <span>
                            {review.verdict === "revise"
                              ? "建议修订"
                              : "通过审阅"}
                          </span>
                        </summary>
                        <p>{review.summary}</p>
                        {review.issues?.map((issue: any, index: number) => (
                          <p key={index}>
                            {issue.description} {issue.suggestion}
                          </p>
                        ))}
                      </details>
                    ))}
                </div>
                <button
                  className="dr-secondary"
                  disabled={busy || job.controlPending}
                  onClick={() => setRevisionOpen(true)}
                >
                  提出调整
                </button>
                <button
                  className="dr-primary"
                  disabled={busy || job.controlPending}
                  onClick={() => void operate(() => answer(approval[1]))}
                >
                  <Icon name="check" />
                  {approval[2]}
                </button>
              </section>
            )}
            <nav className="dr-tabs" role="tablist" aria-label="研究视图">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                >
                  <Icon name={item.icon} />
                  {item.label}
                  {item.id === "sources" && <span>{sourceCount}</span>}
                  {item.id === "findings" && <span>{findings.length}</span>}
                </button>
              ))}
            </nav>
            {tab === "graph" && (
              <div className="dr-map-layout" data-inspector={showInspector}>
                <section className="dr-map-section" aria-label="研究任务图">
                  <ResearchGraph
                    nodes={nodes}
                    edges={summary.graph?.edges}
                    selectedId={activeNode?.id}
                    onSelect={(id) => {
                      setNodeId(id);
                      setInspectorOpen(true);
                    }}
                    workers={workers}
                    workflow={job}
                    direction={graphDirection}
                    onDirection={setGraphDirection}
                    inspectorOpen={inspectorOpen}
                    onToggleInspector={() =>
                      setInspectorOpen((value) => !value)
                    }
                    discovery={
                      <div className="dr-discovery-workspace">
                        <span className="dr-discovery-icon">
                          <Icon
                            name={
                              summary.phase === "planning"
                                ? "list-tree"
                                : "search"
                            }
                          />
                        </span>
                        <h2>
                          {summary.phase === "planning"
                            ? "根据证据规划调查路线"
                            : "建立研究的来源地图"}
                        </h2>
                        <p>{summary.topic}</p>
                        {stageTask && (
                          <span className="dr-discovery-owner">
                            <Icon name="person" />
                            {workers.find(
                              (worker) => worker.id === stageTask.employeeId,
                            )?.label ?? labelFor(stageTask.role)}
                            <span className="dr-state-dot running" />
                            {labelFor(stageTask.status)}
                          </span>
                        )}
                        {sources.length > 0 && (
                          <div className="dr-discovered-sources">
                            <h4>
                              已发现来源 <span>{sources.length}</span>
                            </h4>
                            {sources.slice(-4).map((source) => (
                              <button
                                key={source.id}
                                onClick={() => openSource(source.id)}
                              >
                                <Icon name="globe" />
                                <span>
                                  {source.title}
                                  <small>
                                    {sourceHost(source.url)} ·{" "}
                                    {independentlyRead(source)
                                      ? "已读取"
                                      : "待获取正文"}
                                  </small>
                                </span>
                                <Icon name="arrow-up-right" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    }
                  />
                  {revisions.length > 0 && (
                    <details className="dr-plan-history">
                      <summary>
                        <Icon name="history" />
                        计划变更<span>{revisions.length} 版</span>
                      </summary>
                      {revisions.map((revision, index) => (
                        <article key={revision.version ?? index}>
                          <b>第 {revision.version ?? index + 1} 版</b>
                          <p>{revision.reason || "根据研究结果更新计划"}</p>
                          <small>
                            {revision.addedNodeIds?.length ?? 0} 新增 ·{" "}
                            {revision.retainedNodeIds?.length ?? 0} 保留 ·{" "}
                            {revision.removedNodeIds?.length ?? 0} 调整
                          </small>
                        </article>
                      ))}
                    </details>
                  )}
                  {timeline.length > 0 && (
                    <details className="dr-activity-log">
                      <summary>
                        <Icon name="pulse" />
                        研究动态<span>{timeline.length} 条记录</span>
                      </summary>
                      {timeline
                        .slice(-8)
                        .reverse()
                        .map((item, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              if (item.data?.nodeId) {
                                setNodeId(item.data.nodeId);
                                setInspectorOpen(true);
                              }
                            }}
                          >
                            <time>
                              {new Date(item.timestamp).toLocaleTimeString(
                                "zh-CN",
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </time>
                            <span>{item.description}</span>
                            <small>{labelFor(item.type)}</small>
                          </button>
                        ))}
                    </details>
                  )}
                </section>
                <aside
                  className="dr-inspector"
                  aria-label="任务与协作者"
                  hidden={!showInspector}
                >
                  <div className="dr-section-heading">
                    <h2>
                      {activeNode?.active === false ? "历史任务" : "任务详情"}
                    </h2>
                    {activeNode && (
                      <span
                        className={
                          "dr-node-state " +
                          displayStatus(activeNode.status, job)
                        }
                      >
                        {activeNode.active === false && "已归档 · "}
                        {labelFor(displayStatus(activeNode.status, job))}
                      </span>
                    )}
                  </div>
                  {activeNode ? (
                    <div ref={taskDetail} className="dr-task-detail">
                      <span className="dr-eyebrow">
                        {labelFor(activeNode.kind)}
                      </span>
                      <h3>{activeNode.label}</h3>
                      {(activeNode.objective || activeNode.description) && (
                        <section className="dr-task-objective">
                          <h4>研究目标</h4>
                          <p>
                            {activeNode.objective || activeNode.description}
                          </p>
                        </section>
                      )}
                      {activeNode.error && (
                        <p className="dr-error-text">{activeNode.error}</p>
                      )}
                      <dl>
                        {displayStatus(activeNode.status, job) !==
                          activeNode.status && (
                          <>
                            <dt>最后执行状态</dt>
                            <dd>{labelFor(activeNode.status)}</dd>
                          </>
                        )}
                        <dt>执行者</dt>
                        <dd>
                          {allWorkers.find(
                            (worker) =>
                              worker.id ===
                              (activeNode.employeeId ?? activeNode.ownerId),
                          )?.label ?? "待分配"}
                        </dd>
                        <dt>负责人</dt>
                        <dd>
                          {activeNode.managerIds
                            ?.map(
                              (id) =>
                                allWorkers.find(
                                  (worker) =>
                                    worker.id === id || worker.specId === id,
                                )?.label ?? id,
                            )
                            .join("、") || "研究团队"}
                        </dd>
                        <dt>开始时间</dt>
                        <dd>{timeLabel(activeNode.startedAt)}</dd>
                        <dt>结束时间</dt>
                        <dd>
                          {activeNode.finishedAt
                            ? timeLabel(activeNode.finishedAt)
                            : activeNode.startedAt
                              ? "尚未结束"
                              : "尚未开始"}
                        </dd>
                        <dt>计划版本</dt>
                        <dd>
                          第{" "}
                          {activeNode.planVersion ??
                            summary.graph?.version ??
                            1}{" "}
                          版
                        </dd>
                      </dl>
                      {taskLinks(predecessors, "前置任务")}
                      {(activeNode.inputSourceIds?.length ?? 0) > 0 && (
                        <section className="dr-task-input">
                          <h4>输入证据</h4>
                          {citations(activeNode.inputSourceIds ?? [])}
                        </section>
                      )}
                      {activeNode.payload?.query &&
                        activeNode.payload.query !== activeNode.objective && (
                          <section className="dr-task-input">
                            <h4>调查问题</h4>
                            <p>{activeNode.payload.query}</p>
                          </section>
                        )}
                      {taskLinks(successors, "后继任务")}
                      {activeNode.resultSummary && (
                        <section className="dr-task-result">
                          <h4>结果摘要</h4>
                          <p>{activeNode.resultSummary}</p>
                          {activeNode.result?.insights?.map(
                            (insight: string, index: number) => (
                              <p key={index}>{insight}</p>
                            ),
                          )}
                          {activeNode.result?.issues?.map(
                            (issue: any, index: number) => (
                              <p key={index}>
                                {issue.description} {issue.suggestion}
                              </p>
                            ),
                          )}
                          {activeNode.result?.sections?.map(
                            (section: any, index: number) => (
                              <details key={index}>
                                <summary>{section.heading}</summary>
                                <div className="dr-markdown">
                                  {markdown(section.content)}
                                </div>
                              </details>
                            ),
                          )}
                        </section>
                      )}
                      {activities
                        .filter((activity) => activity.nodeId === activeNode.id)
                        .map((activity) => (
                          <section
                            className="dr-task-result"
                            key={activity.nodeId}
                          >
                            <h4>{activityLabel(activity.preview)}</h4>
                            <details>
                              <summary>查看工作摘要</summary>
                              <p>{activity.preview.text}</p>
                              {activity.preview.detail && (
                                <p className="dr-tool-detail">
                                  {activity.preview.detail}
                                </p>
                              )}
                            </details>
                          </section>
                        ))}
                      {(activeNode.sourceIds?.length ?? 0) > 0 && (
                        <h4 className="dr-evidence-heading">证据来源</h4>
                      )}
                      {citations(activeNode.sourceIds ?? [])}
                      {sources
                        .filter((source) =>
                          activeNode.sourceIds?.includes(source.id),
                        )
                        .map((source) => (
                          <details className="dr-task-evidence" key={source.id}>
                            <summary>{source.title}</summary>
                            {evidence(
                              source.acquisition?.excerpts ??
                                (source.acquisition?.excerpt
                                  ? [source.acquisition]
                                  : []),
                            )}
                          </details>
                        ))}
                    </div>
                  ) : (
                    <Empty icon="search">
                      {summary.phase === "scouting"
                        ? "初步调研正在进行"
                        : "正在形成研究计划"}
                    </Empty>
                  )}
                  <details className="dr-team">
                    <summary>
                      <Icon name="organization" />
                      <strong>协作团队</strong>
                      <span>
                        {
                          workers.filter(
                            (worker) =>
                              displayStatus(worker.status, job) === "working",
                          ).length
                        }{" "}
                        工作中 / {workers.length}
                      </span>
                      <Icon name="chevron-down" />
                    </summary>
                    <div className="dr-team-list">
                      {workers.map((worker) => (
                        <button
                          key={worker.id}
                          className="dr-person"
                          onClick={() =>
                            void operate(async () => {
                              await client.invoke("view.open", {
                                kind: "conversation",
                                employee: worker.id,
                              });
                            })
                          }
                          title={"查看 " + worker.label + " 的研究会话"}
                        >
                          <span
                            className={
                              "dr-person-icon " +
                              displayStatus(worker.status, job)
                            }
                          >
                            <Icon
                              name={
                                worker.managementRole === "manager"
                                  ? "organization"
                                  : "person"
                              }
                            />
                          </span>
                          <span>
                            <strong>{worker.label}</strong>
                            <small>
                              {worker.managementRole === "manager"
                                ? "Manager · "
                                : ""}
                              {labelFor(displayStatus(worker.status, job))}
                            </small>
                          </span>
                          <Icon name="arrow-up-right" />
                        </button>
                      ))}
                      {!workers.length && (
                        <p className="dr-muted">正在组织研究团队</p>
                      )}
                    </div>
                  </details>
                </aside>
              </div>
            )}
            {tab === "sources" && (
              <SourcePanel
                sources={sources}
                findings={findings}
                selection={sourceId}
                onSelect={setSourceId}
                onReturn={reportReturn.current ? returnToReport : undefined}
                renderEvidence={evidence}
              />
            )}
            {tab === "findings" && (
              <section className="dr-findings" aria-label="研究发现">
                <div className="dr-section-heading">
                  <h2>研究发现</h2>
                  <span>
                    {findings.length} 条
                    {contradictions.length > 0 &&
                      ` · ${contradictions.length} 项分歧待解释`}
                  </span>
                </div>
                {contradictions.length > 0 && (
                  <div className="dr-contradictions">
                    <h3><Icon name="warning" />来源存在分歧</h3>
                    {contradictions.map((contradiction) => (
                      <article key={contradiction.id}>
                        <p>{contradiction.description}</p>
                        {citations(contradiction.sources)}
                      </article>
                    ))}
                  </div>
                )}
                {findings.map((finding, index) => (
                  <article key={finding.id ?? index}>
                    <span className="dr-finding-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3>{finding.claim ?? finding.text ?? finding.title}</h3>
                      {finding.detail && (
                        <div className="dr-markdown">
                          {markdown(finding.detail)}
                        </div>
                      )}
                      {evidence(finding.evidence ?? [])}
                    </div>
                  </article>
                ))}
                {!findings.length && (
                  <Empty icon="lightbulb">尚未形成研究发现</Empty>
                )}
              </section>
            )}
            {tab === "report" && (
              <ReportView
                report={report}
                job={job}
                onDownload={(name) => void operate(() => download(name))}
                renderMarkdown={markdown}
                renderEvidence={evidence}
                renderCitations={citations}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
