import type { ReactNode } from "react";
import type { WorkflowView } from "../../Contract/workflow";
import type { EvidenceExcerpt, ResearchReport, ResearchFinding, ResearchNode } from "./ui";
import { focusAreas, extractMatrices, extractTopicTimeline, clean } from "./ResearchInsights";

export function ReportView({
  report,
  job,
  findings = [],
  nodes = [],
  onCompare,
  onTimeline,
  onDownload,
  renderMarkdown,
  renderEvidence,
  renderCitations,
}: {
  report?: ResearchReport;
  job: Pick<WorkflowView, "status" | "files">;
  findings?: ResearchFinding[];
  nodes?: ResearchNode[];
  onCompare?: () => void;
  onTimeline?: () => void;
  onDownload: (name: string) => void;
  renderMarkdown: (content: string, section?: string) => ReactNode;
  renderEvidence: (items: EvidenceExcerpt[], section?: string) => ReactNode;
  renderCitations: (ids: string[], section?: string) => ReactNode;
}) {
  return (
    <section className="dr-report-view" aria-label="研究报告">
      {report ? (
        <>
          <aside className="dr-report-index">
            <h2>目录</h2>
            {report.sections.map((section, index) => (
              <a
                key={section.id ?? index}
                href={"#report-" + (section.id ?? index)}
              >
                {section.heading}
              </a>
            ))}
            {job.files.length > 0 && (
              <div className="dr-downloads">
                <h3>交付文件</h3>
                {job.files.map((file) => (
                  <button
                    key={file.name}
                    title={"下载 " + file.name}
                    onClick={() => onDownload(file.name)}
                  >
                    <span
                      aria-hidden="true"
                      className="codicon codicon-cloud-download"
                    />
                    <span>
                      {file.name}
                      <small>{(file.bytes / 1024).toFixed(1)} KB</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </aside>
          <article className="dr-report-document">
            <span className="dr-eyebrow">
              {job.status === "completed" ? "研究报告" : "研究报告 · 草稿"}
            </span>
            <h1>{report.title}</h1>
            {report.abstract && (
              <div className="dr-report-abstract dr-markdown">
                {renderMarkdown(report.abstract)}
              </div>
            )}
            <details className="dr-report-digest" open>
              <summary>研究视觉摘要 · {findings.length} 条发现</summary>
              <div className="dr-report-digest-grid">
                {focusAreas(nodes).slice(0, 4).map(area => <div className="dr-report-scope-card" key={area.id}>
                  <strong>{area.title}</strong><span>{area.completed} / {area.total} 相关任务完成</span>
                  <div><i style={{ width: (area.total ? area.completed / area.total * 100 : 0) + "%" }}/></div>
                </div>)}
              </div>
              {findings.length > 0 && <div className="dr-report-highlights">
                {findings.slice(0, 3).map((finding, index) => <p key={finding.id ?? index}>
                  <b>{String(index + 1).padStart(2, "0")}</b> {clean(finding.claim).slice(0, 230)}
                </p>)}
              </div>}
              <div className="dr-report-digest-actions">
                {extractMatrices(report).length > 0 && <button onClick={onCompare}>查看 {extractMatrices(report).length} 张比较矩阵 ↗</button>}
                {extractTopicTimeline(report, findings).length > 0 && <button onClick={onTimeline}>查看时间线 ↗</button>}
              </div>
            </details>
            {report.sections.map((section, index) => {
              const id = "report-" + (section.id ?? index);
              return (
                <section key={id} id={id} tabIndex={-1}>
                  <h2>{section.heading}</h2>
                  <div className="dr-markdown">
                    {renderMarkdown(section.content, id)}
                  </div>
                  {renderCitations(section.citations ?? [], id)}
                  {!!section.evidence?.length && (
                    <details>
                      <summary>证据与原文片段</summary>
                      {renderEvidence(section.evidence, id)}
                    </details>
                  )}
                </section>
              );
            })}
            {report.conclusion && (
              <section>
                <h2>结论</h2>
                <div className="dr-markdown">
                  {renderMarkdown(report.conclusion)}
                </div>
              </section>
            )}
            {!!report.limitations?.length && (
              <section>
                <h2>研究局限</h2>
                <ul>
                  {report.limitations.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>
            )}
          </article>
        </>
      ) : (
        <div className="dr-empty">
          <span aria-hidden="true" className="codicon codicon-file-text" />
          <p>尚未形成研究报告</p>
        </div>
      )}
    </section>
  );
}
