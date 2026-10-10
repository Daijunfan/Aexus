import type { WorkflowView } from "../../../Contract/workflow";
import { labelFor } from "../ui";
import { Icon } from "./Icon";
import { PHASES, STATUS } from "./status";

/** The workbench owns presentation and delegates all durable commands. */
export function ResearchJobHeader({
  job, summary, busy,
  onHome, onParent, onFollowUp, onToggleRevision, onPause, onResume, onStop,
}: {
  job: WorkflowView;
  summary: Record<string, any>;
  busy: boolean;
  onHome: () => void;
  onParent: () => void;
  onFollowUp: () => void;
  onToggleRevision: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}) {
  return (
            <header className="dr-job-header">
              <button
                className="dr-icon-button"
                title="返回研究首页"
                aria-label="返回研究首页"
                onClick={onHome}
              >
                <Icon name="arrow-left" />
              </button>
              <div className="dr-job-title">
                <span className="dr-eyebrow">
                  {PHASES[summary.phase] ?? summary.phaseLabel ?? "研究"}
                </span>
                <h1>{summary.topic}</h1>
                {!!summary.sourceUrls?.length && (
                  <span className="dr-bounded-sites" title={summary.sourceUrls.join("\n")}>
                    <Icon name="link" /> 限定 {summary.sourceUrls.length} 个页面
                  </span>
                )}
                {job.parent && (
                  <button className="dr-parent-link" onClick={onParent}>
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
                  <button className="dr-secondary dr-followup-action" onClick={onFollowUp}>
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
                    onClick={onToggleRevision}
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
                    onClick={onPause}
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
                    onClick={onResume}
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
                    onClick={onStop}
                  >
                    <Icon name="debug-stop" />
                  </button>
                )}
              </div>
            </header>
  );
}
