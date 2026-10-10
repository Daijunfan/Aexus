import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ContractClient } from "../../Contract/protocol";
import type { WorkflowView } from "../../Contract/workflow";
import { ResearchGraph } from "./ResearchGraph";
import { SourcePanel } from "./retrieval/SourcePanel";
import { parseResearchMaterial } from "./retrieval/materials";
import { ReportView } from "./ReportView";
import { ResearchOverview, ResearchTimeline, ResearchUpdates, ResearchBoard } from "./ResearchViews";
import { visualBrief } from "./ResearchBrief";
import { ResearchTabs } from "./workspace/ResearchTabs";
import { ResearchHistory } from "./workspace/ResearchHistory";
import { ResearchIntake, preferredEngine, type EngineOption } from "./workspace/ResearchIntake";
import { ResearchTaskInspector } from "./workspace/ResearchTaskInspector";
import { ResearchJobHeader } from "./workspace/ResearchJobHeader";
import { ResearchProgressBand } from "./workspace/ResearchProgressBand";
import { ResearchExecutionControls } from "./workspace/ResearchExecutionControls";
import { ResearchFindings } from "./workspace/ResearchFindings";
import { projectPublicKnowledge } from "./knowledge/index.mjs";
import { Icon } from "./workspace/Icon";
import { useResearchHistory } from "./workspace/useResearchHistory";
import { ResearchComparisonPanel } from "./workspace/ResearchComparisonPanel";
import { useResearchStudio } from "./workspace/useResearchStudio";
import { useWorkflowUpdates, useAgentActivityPreviews } from "./workspace/useWorkflowUpdates";
import { readResearchView, rememberResearchView } from "./workspace/viewPreference";
import { useResearchLocation } from "./workspace/useResearchLocation";
import { citationLocator } from "./workspace/citationLocator";
import {
  independentlyRead,
  labelFor,
  safeUrl,
  sourceHost,
  type ResearchNode,
} from "./ui";
import "./style.css";
import "./workspace/style.css";

const ENGINE = "deep-research";
export default function Page({ client }: { client: ContractClient }) {
  const [job, setJob] = useState<WorkflowView | null>(null);
  const [forkParent, setForkParent] = useState<WorkflowView | null>(null);
  const [engineOptions, setEngineOptions] = useState<EngineOption[]>([]),
    [selectedEngine, setSelectedEngine] = useState(""),
    [engineLoading, setEngineLoading] = useState(true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [readingMaterials, setReadingMaterials] = useState(false);
  const {
    history, hasMore: historyHasMore, loading,
    updateHistory, loadMoreHistory,
  } = useResearchHistory(client, setError);
  const [topic, setTopic] = useState(""),
    [scope, setScope] = useState("comprehensive"),
    [maxSources, setMaxSources] = useState<number | null>(null),
    [sourceUrlsText, setSourceUrlsText] = useState("");
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
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [parentFindings, setParentFindings] = useState<any[] | null>(null);
  const {board, customMatrix, updateBoard, updateMatrix, pinItem} =
    useResearchStudio(job?.id);
  const [graphDirection, setGraphDirection] = useState<
    "horizontal" | "vertical"
  >();
  const [revisionOpen, setRevisionOpen] = useState(false),
    [instructions, setInstructions] = useState("");
  const alive = useRef(true),
    current = useRef<WorkflowView | null>(null),
    selected = useRef<string | null>(null);
  const { reportReturn, openSource, openReportSource, returnToReport } =
    useResearchLocation(setTab, setSourceId);
  const request = useRef<{ payload: string; key: string } | null>(null);
  const materialRead = useRef<AbortController | null>(null);
  const cancelMaterialRead = () => {
    materialRead.current?.abort();
    materialRead.current = null;
    setReadingMaterials(false);
  };
  const apply = (next: WorkflowView) => {
    const latest = current.current;
    // A late response can update history without reopening a job the user left.
    if (selected.current === next.id &&
        (latest?.id !== next.id || next.revision >= latest.revision)) {
      current.current = next;
      setJob(next);
    }
    updateHistory(next);
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
  useWorkflowUpdates({
    client, job, selected, current, onUpdate: apply, onError: setError,
  });
  const liveActivities = useAgentActivityPreviews({
    client, job, tab, selectedNodeId: nodeId,
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      materialRead.current?.abort();
    };
  }, [client]);
  useEffect(() => {
    let active = true;
    void client
      .invoke<EngineOption[]>("engine.list", {})
      .then(options => {
        if (active) {
          setEngineOptions(options);
          setSelectedEngine(current => current || preferredEngine(options));
        }
      })
      .catch(e => { if (active) setError((e as Error).message); })
      .finally(() => { if (active) setEngineLoading(false); });
    return () => { active = false; };
  }, [client]);
  const load = async (id: string, view?: string) => {
    const previous = selected.current;
    selected.current = id;
    try {
      const next = await client.invoke<WorkflowView>("workflow.get", { id });
      if (!alive.current || selected.current !== id) return;
      cancelMaterialRead();
      setForkParent(null);
      setNodeId(null);
      setSourceId(null);
      reportReturn.current = null;
      setRevisionOpen(false);
      apply(next);
      setTab(view ?? (next.status === "completed" ? "overview" : readResearchView(next.id) ?? "graph"));
    } catch (error) {
      if (selected.current === id) selected.current = previous;
      throw error;
    }
  };
  const newResearch = () => {
    cancelMaterialRead();
    selected.current = null;
    current.current = null;
    setJob(null);
    setForkParent(null);
    setSelectedEngine(preferredEngine(engineOptions));
    setSourceUrlsText("");
    setError("");
    setRevisionOpen(false);
    request.current = null;
    reportReturn.current = null;
  };
  const beginFollowUp = () => {
    const parent = current.current;
    if (!parent || parent.status !== "completed") return;
    cancelMaterialRead();
    selected.current = null;
    current.current = null;
    setJob(null);
    setForkParent(parent);
    setSelectedEngine("inherit");
    setTopic("");
    setScope(parent.summary.scope ?? "comprehensive");
    const previousBudget = parent.summary.progress?.sources?.max;
    const defaultBudget = parent.summary.scope === "quick" ? 6 : 80;
    setMaxSources(previousBudget === defaultBudget ? null : previousBudget ?? null);
    setSourceUrlsText("");
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
        ...(sourceUrlsText.trim() ? { sourceUrls: sourceUrlsText.split(/\r?\n/).map(url => url.trim()).filter(Boolean) } : {}),
        ...(!["automatic", "inherit"].includes(selectedEngine)
          ? { engines: [{ engine: selectedEngine }] }
          : {}),
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
    if (next.length + files.length > (forkParent ? 9 : 10))
      throw Error(forkParent ? "后续研究最多添加 9 份背景材料" : "最多 10 份背景材料");
    cancelMaterialRead();
    const controller = new AbortController();
    materialRead.current = controller;
    setReadingMaterials(true);
    try {
      for (const file of files)
        next.push(await parseResearchMaterial(file, { signal: controller.signal }));
      if (!controller.signal.aborted) setMaterials(next);
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      if (materialRead.current === controller) {
        materialRead.current = null;
        setReadingMaterials(false);
      }
    }
  };
  useEffect(() => {
    let active = true;
    setParentFindings(null);
    if (job?.parent?.id) {
      void client.invoke<WorkflowView>("workflow.get", { id: job.parent.id }).then(parent => {
        if (active) setParentFindings(parent.summary.findingsDetails ?? []);
      }).catch(() => { if (active) setParentFindings(null); });
    }
    return () => { active = false; };
  }, [client, job?.id, job?.parent?.id]);
  useEffect(() => {
    if (job?.id && selected.current === job.id) rememberResearchView(job.id, tab);
  }, [job?.id, tab]);
  useEffect(() => {
    if (tab === "findings" && selectedFindingId) {
      requestAnimationFrame(() => document.getElementById("dr-finding-" + selectedFindingId)?.scrollIntoView({block: "center", behavior: "smooth"}));
    }
  }, [tab, selectedFindingId]);
  const summary = job?.summary ?? {},
    progress = summary.progress ?? {};
  const knowledge = useMemo(
    () => projectPublicKnowledge(job?.summary),
    [job?.summary],
  );
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
  const exportBrief = () => {
    if (!job || !board.length) return;
    const html = visualBrief({ topic: summary.topic, report, nodes, findings, sources, board, customMatrix });
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "aexus-research-brief.html";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  const selectView = (view: string) => {
    // A direct Sources tab visit starts at the library; citation navigation opens a document.
    if (view === "sources" && tab !== "sources") {
      setSourceId(null);
      reportReturn.current = null;
    }
    setTab(view);
  };
  const openNode = (id: string) => { setTab("graph"); setNodeId(id); setInspectorOpen(true); };
  const openFinding = (id: string) => { setSelectedFindingId(id); setTab("findings"); };
  const drillDown = (question: string) => {
    if (job?.status === "completed") {
      beginFollowUp();
      setTopic(question);
    } else if (job && ["running", "waiting", "paused", "failed"].includes(job.status)) {
      setInstructions(question);
      setRevisionOpen(true);
      setTab("graph");
    } else {
      setError("当前研究状态不支持继续调查");
    }
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
  const markdown = (content: string, section?: string) => (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children, node }) => {
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
              onClick={() => {
                if (!section) {
                  openSource(id);
                  return;
                }
                const context = report?.sections?.find(
                  (item: any, index: number) => "report-" + (item.id ?? index) === section,
                );
                const locator = citationLocator(
                  context?.content, node?.position?.start?.offset, id, findings,
                );
                openReportSource(id, section, locator);
              }}
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
            <ResearchIntake
              parent={forkParent}
              values={{topic, scope, sourceBudget, sourceUrlsText, autoApprove, materials}}
              onChange={{
                topic: setTopic,
                scope: setScope,
                sourceBudget: setMaxSources,
                sourceUrlsText: setSourceUrlsText,
                autoApprove: setAutoApprove,
                removeMaterial: index => setMaterials(old => old.filter((_, i) => i !== index)),
              }}
              engines={{
                selected: selectedEngine,
                options: engineOptions,
                loading: engineLoading,
                onSelect: setSelectedEngine,
              }}
              busy={busy}
              readingMaterials={readingMaterials}
              onCancelFollowUp={() => {
                setForkParent(null);
                setSelectedEngine(preferredEngine(engineOptions));
              }}
              onStart={start}
              onUpload={files => void operate(() => upload(files))}
            />
            <ResearchHistory
              history={history}
              hasMore={historyHasMore}
              loading={loading}
              busy={busy}
              onOpen={id => void operate(() => load(id))}
              onMore={() => void operate(loadMoreHistory)}
            />
          </div>
        ) : (
          <>
            <ResearchJobHeader
              job={job}
              summary={summary}
              busy={busy}
              onHome={newResearch}
              onParent={() => void operate(() => load(job.parent!.id, "report"))}
              onFollowUp={beginFollowUp}
              onToggleRevision={() => setRevisionOpen(value => !value)}
              onPause={() => void operate(pause)}
              onResume={() => void operate(() => mutate("workflow.resume"))}
              onStop={() => void operate(stop)}
            />
            <ResearchProgressBand
              job={job}
              summary={summary}
              tab={tab}
              progress={progress}
              percent={percent}
              revisions={revisions}
              completedTasks={completedTasks}
              totalTasks={totalTasks}
              sourceCount={sourceCount}
              readCount={readCount}
              verifiedCount={verifiedCount}
              domains={domains}
              workers={workers}
              findingCount={findings.length}
              nodes={nodes}
              runningNodes={runningNodes}
              stageTask={stageTask}
              activities={activities}
              onNode={openNode}
            />
            <ResearchExecutionControls
              job={job}
              summary={summary}
              workers={workers}
              busy={busy}
              revisionOpen={revisionOpen}
              instructions={instructions}
              approval={approval}
              onRetryPause={() => void operate(pause)}
              onRetryStop={() => void operate(stop)}
              onOpenAttention={() => void operate(async () => {
                await client.invoke("view.open", {
                  kind: "conversation", employee: summary.attention.employeeId,
                });
              })}
              onRevise={() => void operate(revise)}
              onInstructions={setInstructions}
              onCancelRevision={() => setRevisionOpen(false)}
              onShowRevision={() => setRevisionOpen(true)}
              onAnswer={action => void operate(() => answer(action))}
            />
            <ResearchTabs
              active={tab}
              jobId={job.id}
              sourceCount={sourceCount}
              findingCount={findings.length}
              onChange={selectView}
            />
            {tab === "overview" && <ResearchOverview
              nodes={nodes} findings={findings} sources={sources} report={report}
              pinned={board} onNode={openNode} onFinding={openFinding} onDrill={drillDown}
              onPin={pinItem} showUpdates={revisions.length > 1 || !!job.parent} onCompare={() => setTab("comparison")} onBoard={() => setTab("board")} onTimeline={() => setTab("timeline")} onUpdates={() => setTab("updates")} onSources={() => selectView("sources")}
            />}
            {tab === "comparison" && <ResearchComparisonPanel report={report} draft={customMatrix} onDraft={updateMatrix} onDrill={drillDown}/>}
            {tab === "timeline" && <ResearchTimeline report={report} findings={findings} events={timeline} onDrill={drillDown}/>}
            {tab === "updates" && <ResearchUpdates current={findings} previous={parentFindings} revisions={revisions}/>}
            {tab === "board" && <ResearchBoard nodes={nodes} findings={findings} pinned={board}
              onChange={updateBoard} onExport={exportBrief} onNode={openNode} onFinding={openFinding}/>}
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
                    knowledge={knowledge}
                    onOpenFinding={openFinding}
                    onOpenSource={openSource}
                    onOpenNode={openNode}
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
                <ResearchTaskInspector
                  job={job}
                  summary={summary}
                  activeNode={activeNode}
                  nodes={nodes}
                  sources={sources}
                  allWorkers={allWorkers}
                  workers={workers}
                  activities={activities}
                  showInspector={showInspector}
                  board={board}
                  onPin={pinItem}
                  onDrill={drillDown}
                  onSelectNode={setNodeId}
                  onOpenWorker={id => void operate(async () => {
                    await client.invoke("view.open", {kind: "conversation", employee: id});
                  })}
                  renderCitations={citations}
                  renderEvidence={evidence}
                  renderMarkdown={markdown}
                />
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
              <ResearchFindings
                knowledge={knowledge}
                findings={findings}
                sources={sources}
                contradictions={contradictions}
                selectedFindingId={selectedFindingId}
                board={board}
                onPin={pinItem}
                onDrill={drillDown}
                onOpenSource={openSource}
                onOpenNode={openNode}
                renderCitations={citations}
                renderEvidence={evidence}
                renderMarkdown={markdown}
              />
            )}
            {tab === "report" && (
              <ReportView
                report={report}
                job={job}
                findings={findings}
                nodes={nodes}
                onCompare={() => setTab("comparison")}
                onTimeline={() => setTab("timeline")}
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
