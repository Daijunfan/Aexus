import type { ReactNode } from "react";
import type { WorkflowView } from "../../Contract/workflow";
import type { EvidenceExcerpt, ResearchReport } from "./ui";

export function ReportView({
  report,
  job,
  onDownload,
  renderMarkdown,
  renderEvidence,
  renderCitations,
}: {
  report?: ResearchReport;
  job: Pick<WorkflowView, "status" | "files">;
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
