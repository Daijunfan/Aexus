import type { WorkflowView } from "../../../Contract/workflow";
import type { ResearchNode } from "../ui";
import { activityLabel, labelFor } from "../ui";
import type { Activity } from "./useWorkflowUpdates";
import { Icon } from "./Icon";
import { PHASES, STATUS } from "./status";

/** A truthful weighted-plan progress band with explicit activity disclosure. */
export function ResearchProgressBand({
  job, summary, tab, progress, percent, revisions,
  completedTasks, totalTasks, sourceCount, readCount, verifiedCount, domains,
  workers, findingCount, nodes, runningNodes, stageTask, activities, onNode,
}: {
  job: WorkflowView;
  summary: Record<string, any>;
  tab: string;
  progress: Record<string, any>;
  percent: number | null;
  revisions: any[];
  completedTasks: number;
  totalTasks: number;
  sourceCount: number;
  readCount: number;
  verifiedCount: number;
  domains: number;
  workers: { id: string; label: string }[];
  findingCount: number;
  nodes: ResearchNode[];
  runningNodes: ResearchNode[];
  stageTask?: ResearchNode;
  activities: Activity[];
  onNode: (id: string) => void;
}) {
  if (job.status === "completed" && tab === "report") return null;
  return (
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
                    {verifiedCount} 已核验 · {findingCount} 项论断
                  </span>
                  {progress.failed > 0 && (
                    <span className="dr-error-text">
                      {progress.failed} 项需处理
                    </span>
                  )}
                </div>
                <details key={tab} className="dr-execution-details">
                  <summary>
                    <span className={"dr-activity-indicator " + job.status} />
                    <strong>执行动态</strong>
                    <span>{runningNodes.length ? `${runningNodes.length} 项研究中` : (STATUS[job.status] ?? "整理中")}</span>
                    <em>{runningNodes[0]?.label ?? stageTask?.label ?? ""}</em>
                    <Icon name="chevron-down" />
                  </summary>
                  <div className="dr-execution-content">
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
                          onClick={() => onNode(node.id)}
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
                  </div>
                </details>
              </section>

  );
}
