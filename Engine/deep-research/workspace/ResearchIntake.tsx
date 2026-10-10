import type { FormEvent } from "react";
import type { WorkflowView } from "../../../Contract/workflow";
import { Icon } from "./Icon";

export type EngineOption = {
  engine: string;
  label: string;
  configuration: {
    hasApiKey?: boolean;
    sharedPiConfig?: boolean;
    sharedClineConfig?: boolean;
  };
};

/** Only an explicitly usable API-key engine is selected automatically. */
export const preferredEngine = (options: EngineOption[]) =>
  options.find(option =>
    option.engine === "pi" && option.configuration.sharedPiConfig && option.configuration.hasApiKey)?.engine ??
  options.find(option =>
    option.engine === "cline" && option.configuration.sharedClineConfig && option.configuration.hasApiKey)?.engine ??
  options.find(option => option.configuration.hasApiKey)?.engine ?? "";

const SCOPES = [
  { value: "quick", label: "快速" },
  { value: "comprehensive", label: "全面" },
  { value: "deep", label: "深入" },
  { value: "academic", label: "学术" },
];

const scopeHelp: Record<string, string> = {
    quick: "快速概览：默认最多 6 个来源、4 位协作者，聚焦关键原始资料。",
    comprehensive:
      "全面调查：覆盖主要问题、证据来源和交叉核验，适合作为默认起点。",
    deep: "深度分析：为复杂问题展开更多证据、反证和影响分析。",
    academic: "学术研究：强调方法、学术来源、局限和可复核引用。",
  };

export type ResearchIntakeValues = {
  topic: string;
  scope: string;
  sourceBudget: number;
  sourceUrlsText: string;
  autoApprove: boolean;
  materials: {name: string; content: string}[];
};

export type ResearchIntakeChange = {
  topic: (value: string) => void;
  scope: (value: string) => void;
  sourceBudget: (value: number) => void;
  sourceUrlsText: (value: string) => void;
  autoApprove: (value: boolean) => void;
  removeMaterial: (index: number) => void;
};

export function ResearchIntake({
  parent, values, onChange, engines, busy, readingMaterials,
  onCancelFollowUp, onStart, onUpload,
}: {
  parent: WorkflowView | null;
  values: ResearchIntakeValues;
  onChange: ResearchIntakeChange;
  engines: {
    selected: string;
    options: EngineOption[];
    loading: boolean;
    onSelect: (value: string) => void;
  };
  busy: boolean;
  readingMaterials: boolean;
  onCancelFollowUp: () => void;
  onStart: (event: FormEvent<HTMLFormElement>) => void;
  onUpload: (files: File[]) => void;
}) {
  return (
    <>
            <div className="dr-intake-heading">
              <span className="dr-intake-mark"><Icon name="telescope" /></span>
              <div>
                <span className="dr-intake-kicker">AEXUS / RESEARCH STUDIO</span>
                <h1>{parent ? "继续研究" : "Deep Research"}</h1>
                <p>把问题展开成可审阅的计划、可追溯的证据和完整报告。</p>
              </div>
            </div>
            {parent && (
              <div className="dr-follow-up-context">
                <span className="dr-eyebrow">基于已完成研究</span>
                <strong>{parent.summary.deliverable?.title ?? parent.summary.topic}</strong>
                <p>上次报告作为历史线索；新问题的来源与引用会重新独立核验，并先确认新计划。</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onCancelFollowUp}
                >
                  取消追问
                </button>
              </div>
            )}
            <form className="dr-intake" onSubmit={onStart}>
              <label htmlFor="dr-topic">{parent ? "后续问题" : "研究目标"}</label>
              <textarea
                id="dr-topic"
                aria-label={parent ? "后续问题" : "研究目标"}
                placeholder={parent ? "例如：上次报告中的哪项假设已经变化？请重新核验来源并说明影响" : "例如：比较当前开源多智能体研究引擎的能力、证据质量与实际成本；请给出可定位引用和研究局限"}
                value={values.topic}
                onChange={(event) => onChange.topic(event.target.value)}
                minLength={1}
                maxLength={2000}
                required
                rows={4}
                onKeyDown={event => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <div className="dr-engine-choice">
                <Icon name="organization" />
                <label htmlFor="dr-engine">执行引擎</label>
                <select
                  id="dr-engine"
                  value={engines.selected}
                  onChange={event => engines.onSelect(event.target.value)}
                >
                  <option value="">选择已配置的引擎</option>
                  {parent && <option value="inherit">沿用上次引擎组合</option>}
                  {engines.options.map(option => (
                    <option key={option.engine} value={option.engine}>
                      {option.label}
                      {option.configuration.sharedPiConfig || option.configuration.sharedClineConfig
                        ? " · 原生共享配置"
                        : option.engine === "codex" ? " · 当前登录账号" : ""}
                    </option>
                  ))}
                  <option value="automatic">自动组合所有已就绪引擎</option>
                </select>
              </div>
              <p className="dr-engine-note">
                {engines.loading
                  ? "正在读取已配置引擎…"
                  : engines.selected === "automatic"
                    ? "可能调用多个提供商；额度由各自配置决定。"
                    : engines.selected === "inherit"
                      ? "沿用上次研究的引擎组合，可在这里改选。"
                      : engines.selected === "codex"
                        ? "使用 Codex 当前登录账号的模型额度。"
                        : engines.selected
                          ? "使用所选原生引擎当前配置的默认模型与凭据。"
                          : "请选择执行引擎后开始研究。"}
              </p>
              <div className="dr-intake-controls">
                <div
                  className="dr-segment"
                  role="radiogroup"
                  aria-label="研究深度"
                >
                  {SCOPES.map((option) => (
                    <label
                      className={values.scope === option.value ? "active" : ""}
                      key={option.value}
                    >
                      <input
                        type="radio"
                        name="depth"
                        checked={values.scope === option.value}
                        onChange={() => onChange.scope(option.value)}
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
                  disabled={busy || !values.topic.trim() || !engines.selected || engines.loading}
                >
                  <Icon name={busy ? "loading" : "arrow-right"} />
                  {parent ? "开始后续研究" : "开始研究"}
                </button>
              </div>
              <details className="dr-settings">
                <summary>
                  研究选项
                  <Icon name="chevron-down" />
                </summary>
                <div className="dr-settings-grid">
                  <label className="dr-source-urls-field">
                    限定网址（每行一个，可选）
                    <textarea
                      aria-label="限定网址"
                      rows={3}
                      placeholder={"https://example.com/\nhttps://www.iana.org/help/example-domains"}
                      value={values.sourceUrlsText}
                      onChange={event => onChange.sourceUrlsText(event.target.value)}
                    />
                    <small>报告只引用这些页面；原文仍由引擎独立复核。</small>
                  </label>
                  <label>
                    来源预算
                    <input
                      aria-label="来源预算"
                      type="number"
                      min={1}
                      max={1000}
                      value={values.sourceBudget}
                      onChange={(event) =>
                        onChange.sourceBudget(Number(event.target.value))
                      }
                    />
                  </label>
                  <label className="dr-check">
                    <input
                      type="checkbox"
                      checked={!values.autoApprove}
                      onChange={(event) =>
                        onChange.autoApprove(!event.target.checked)
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
                      disabled={busy}
                      multiple
                      accept=".txt,.md,.csv,.json,.pdf,.docx"
                      onChange={(event) => {
                        const files = [...(event.target.files ?? [])];
                        event.target.value = "";
                        if (files.length) onUpload(files);
                      }}
                    />
                  </label>
                  {readingMaterials && (
                    <small className="dr-materials-reading" role="status" aria-live="polite">
                      <Icon name="loading" /> 正在解析背景材料…
                    </small>
                  )}
                  <small className="dr-materials-hint">
                    支持 TXT、Markdown、CSV、JSON、DOCX 和含文本层的 PDF；扫描件及图片不支持 OCR，引用需独立核验。
                  </small>
                </div>
              </details>
              {values.materials.length > 0 && (
                <div className="dr-materials">
                  {values.materials.map((material, index) => (
                    <span key={index}>
                      <Icon name="file-text" />
                      {material.name}
                      <button
                        type="button"
                        aria-label={"移除 " + material.name}
                        title={"移除 " + material.name}
                        onClick={() =>
                          onChange.removeMaterial(index)
                        }
                      >
                        <Icon name="close" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </form>

    </>
  );
}
