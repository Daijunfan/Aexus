import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { WorkflowView } from "../../../Contract/workflow";
import type { ResearchNode, ResearchSource } from "../ui";
import { activityLabel, displayStatus, labelFor } from "../ui";
import { nodeInsight } from "../ResearchInsights";
import type { BoardItem } from "../ResearchViews";
import { Icon, Empty } from "./Icon";
import type { Activity } from "./useWorkflowUpdates";

type ResearchWorker = {
  id: string;
  label: string;
  status: string;
  specId?: string;
  managementRole?: string;
};
const timeLabel = (value?: number) => value
  ? new Date(value).toLocaleString("zh-CN", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    })
  : "尚未开始";

/** Workspace-only inspector. It never modifies workflow state or graph layout. */
export function ResearchTaskInspector({
  job, summary, activeNode, nodes, sources, allWorkers, workers,
  activities, showInspector, board,
  onPin, onDrill, onSelectNode, onOpenWorker,
  renderCitations, renderEvidence, renderMarkdown,
}: {
  job: WorkflowView;
  summary: Record<string, any>;
  activeNode?: ResearchNode;
  nodes: ResearchNode[];
  sources: ResearchSource[];
  allWorkers: ResearchWorker[];
  workers: ResearchWorker[];
  activities: Activity[];
  showInspector: boolean;
  board: BoardItem[];
  onPin: (item: BoardItem) => void;
  onDrill: (question: string) => void;
  onSelectNode: (id: string) => void;
  onOpenWorker: (employeeId: string) => void;
  renderCitations: (ids: any[]) => ReactNode;
  renderEvidence: (excerpts: any[]) => ReactNode;
  renderMarkdown: (content: string) => ReactNode;
}) {
  const taskDetail = useRef<HTMLDivElement>(null);
  useEffect(() => { taskDetail.current?.scrollTo(0, 0); }, [activeNode?.id]);

  const { predecessors, successors } = useMemo(() => {
    if (!activeNode) return { predecessors: [], successors: [] };
    const dependencies = (node: ResearchNode) => node.dependencies ?? node.dependsOn ?? [];
    return {
      predecessors: dependencies(activeNode)
        .map(id => nodes.find(node => node.id === id))
        .filter((node): node is ResearchNode => !!node),
      successors: nodes.filter(node =>
        (activeNode.active === false || node.active !== false) &&
        dependencies(node).includes(activeNode.id)),
    };
  }, [activeNode, nodes]);

  const taskLinks = (items: ResearchNode[], title: string) => (
    <div className="dr-task-links">
      <h4>{title}</h4>
      {items.length ? (
        items.map((node) => (
          <button key={node.id} onClick={() => onSelectNode(node.id)}>
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

  return (
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
                      {nodeInsight(activeNode) && <section className="dr-node-key-result">
                        <h4>核心发现</h4><p>{nodeInsight(activeNode)}</p>
                      </section>}
                      <div className="dr-node-actions">
                        <button onClick={() => onPin({ type: "node", id: activeNode.id, note: "" })}>
                          <Icon name="bookmark" />{board.some(item => item.type === "node" && item.id === activeNode.id) ? "从成果板移除" : "收藏到成果板"}
                        </button>
                        <button onClick={() => onDrill("深入调查「" + activeNode.label + "」，补充不同观点、适用条件、反例与最新案例。")}>补查此问题 ↗</button>
                      </div>
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
                          {renderCitations(activeNode.inputSourceIds ?? [])}
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
                                  {renderMarkdown(section.content)}
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
                      {renderCitations(activeNode.sourceIds ?? [])}
                      {sources
                        .filter((source) =>
                          activeNode.sourceIds?.includes(source.id),
                        )
                        .map((source) => (
                          <details className="dr-task-evidence" key={source.id}>
                            <summary>{source.title}</summary>
                            {renderEvidence(
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
                          onClick={() => onOpenWorker(worker.id)}
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
  );
}
