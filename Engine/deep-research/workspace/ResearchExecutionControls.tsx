import type { WorkflowView } from "../../../Contract/workflow";
import { Icon } from "./Icon";

/** Presentation for human checkpoints and recoverable execution control states. */
export function ResearchExecutionControls({
  job, summary, workers, busy, revisionOpen, instructions, approval,
  onRetryPause, onRetryStop, onOpenAttention, onRevise,
  onInstructions, onCancelRevision, onShowRevision, onAnswer,
}: {
  job: WorkflowView;
  summary: Record<string, any>;
  workers: { id: string; label: string }[];
  busy: boolean;
  revisionOpen: boolean;
  instructions: string;
  approval: string[] | null | undefined;
  onRetryPause: () => void;
  onRetryStop: () => void;
  onOpenAttention: () => void;
  onRevise: () => void;
  onInstructions: (value: string) => void;
  onCancelRevision: () => void;
  onShowRevision: () => void;
  onAnswer: (action: string) => void;
}) {
  return (
    <>
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
                    onClick={onRetryPause}
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
                  onClick={onRetryStop}
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
                  onClick={onOpenAttention}
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
                  onRevise();
                }}
              >
                <label htmlFor="dr-revision">调整研究方向</label>
                <textarea
                  id="dr-revision"
                  value={instructions}
                  onChange={(event) => onInstructions(event.target.value)}
                  placeholder="补充研究问题、限定范围或指出需要重新核验的结论"
                  required
                  rows={3}
                />
                <div>
                  <button
                    type="button"
                    className="dr-secondary"
                    onClick={onCancelRevision}
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
                  onClick={onShowRevision}
                >
                  提出调整
                </button>
                <button
                  className="dr-primary"
                  disabled={busy || job.controlPending}
                  onClick={() => onAnswer(approval[1])}
                >
                  <Icon name="check" />
                  {approval[2]}
                </button>
              </section>
            )}

    </>
  );
}
