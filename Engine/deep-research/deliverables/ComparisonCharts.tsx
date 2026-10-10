import { useMemo, useState } from "react";
import type { ResearchMatrix } from "../ResearchInsights";
import { comparisonBarPercent, projectComparisonCharts } from "./matrix-charts";
import { COMPARISON_CSV_FILENAME, COMPARISON_EXPORT_FILENAME, renderComparisonChartsHtml, renderComparisonMatricesCsv } from "./comparison-export";
import "./comparison-charts.css";

export function ComparisonCharts({
  matrices,
  onSelectMatrix,
}: {
  matrices: readonly ResearchMatrix[];
  onSelectMatrix?: (matrixId: string) => void;
}) {
  const charts = useMemo(() => projectComparisonCharts(matrices), [matrices]);
  const [visibleLimit, setVisibleLimit] = useState(4);
  const [query, setQuery] = useState("");
  const [exportError, setExportError] = useState("");
  const matching = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return charts;
    return charts.filter(chart =>
      [chart.matrixTitle, chart.metric, chart.unit,
        ...chart.values.flatMap(value => [value.label, value.raw])]
        .some(value => value.toLowerCase().includes(term)),
    );
  }, [charts, query]);
  const exportData = (format: "html" | "csv") => {
    setExportError("");
    try {
      const content = format === "html"
        ? renderComparisonChartsHtml(matrices)
        : renderComparisonMatricesCsv(matrices);
      const blob = new Blob([content], { type: format === "html" ? "text/html;charset=utf-8" : "text/csv;charset=utf-8" });
      if (blob.size > 8 * 1024 * 1024) throw Error("导出数据超过 8 MiB，请缩小矩阵范围。");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = format === "html" ? COMPARISON_EXPORT_FILENAME : COMPARISON_CSV_FILENAME;
      document.body.appendChild(anchor);
      try { anchor.click(); }
      finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "导出失败，请检查浏览器下载权限。");
    }
  };
  if (!matrices.length) return null;
  const visible = matching.slice(0, visibleLimit);
  const remaining = Math.max(0, matching.length - visible.length);

  return (
    <section className="dr-comparison-charts" aria-label="矩阵数值比较图">
      <header className="dr-comparison-charts__heading">
        <div>
          <small>VISUAL COMPARISONS</small>
          <h3>数据对比 <span className="dr-comparison-charts__count">· {charts.length} 张图表</span></h3>
        </div>
        <div className="dr-comparison-charts__heading-right">
          <p>仅展示可比较的非负数值；缺失、估算、范围、编号及单位冲突仍保留在下方矩阵中。图表未额外核验来源。</p>
          <div className="dr-comparison-charts__export-actions">
            {charts.length > 0 && (
              <button type="button" className="dr-comparison-charts__export"
                onClick={() => exportData("html")} title="导出含原始矩阵的离线 HTML，可打印">
                导出全部图表与矩阵（HTML） ↗
              </button>
            )}
            <button type="button" className="dr-comparison-charts__export dr-comparison-charts__export--secondary"
              onClick={() => exportData("csv")} title="导出全部矩阵原始数据，用于表格分析">
              导出矩阵原值（CSV） ↗
            </button>
          </div>
        </div>
      </header>
      {exportError && <p className="dr-comparison-charts__error" role="alert">{exportError}</p>}
      {charts.length > 0 && <div className="dr-comparison-charts__search">
        <label>
          <span>查找图表</span>
          <input type="search" aria-label="搜索图表" placeholder="指标、方案、数值…"
            value={query} onChange={event => { setQuery(event.target.value); setVisibleLimit(4); }} />
        </label>
        <span role="status" aria-live="polite">{matching.length} / {charts.length} 张</span>
      </div>}
      {visible.length === 0 && <p className="dr-comparison-charts__empty">
        {charts.length > 0 ? "没有符合条件的数值图表，请修改搜索关键词。" : "当前矩阵缺少可直接绘制的同单位数值，仍可导出全部原始文本和单元格。"}
      </p>}
      <div className="dr-comparison-charts__grid">
        {visible.map(chart => (
          <figure className="dr-comparison-charts__card" key={chart.id} aria-label={chart.matrixTitle + "：" + chart.metric}>
            <figcaption>
              <div className="dr-comparison-charts__caption">
                <span className="dr-comparison-charts__source">{chart.matrixTitle}</span>
                <strong>{chart.metric}</strong>
                <span>{chart.unit || "未标注单位"}</span>
              </div>
              {onSelectMatrix && (
                <button type="button" className="dr-comparison-charts__link" onClick={() => onSelectMatrix(chart.matrixId)}>
                  查看矩阵 ↗
                </button>
              )}
            </figcaption>
            <ol className="dr-comparison-charts__values">
              {chart.values.map(item => (
                <li key={item.label}>
                  <span className="dr-comparison-charts__label" title={item.label}>{item.label}</span>
                  <span className="dr-comparison-charts__track" aria-hidden="true">
                    <span style={{ width: comparisonBarPercent(item.value, chart.maxValue) + "%" }} />
                  </span>
                  <b className="dr-comparison-charts__value">{item.raw}</b>
                </li>
              ))}
            </ol>
            <div className="dr-comparison-charts__foot">
              <span>从 0 起 · 最大 {chart.maxLabel}</span>
              {!!chart.omitted.length && <span>未绘制：{chart.omitted.join("、")}（缺失或不可比）</span>}
            </div>
          </figure>
        ))}
      </div>
      {(remaining > 0 || visibleLimit > 4) && <div className="dr-comparison-charts__pagination">
        {remaining > 0 && (
          <button type="button" className="dr-comparison-charts__more"
            onClick={() => setVisibleLimit(limit => limit + 12)}>
            继续显示 {Math.min(12, remaining)} 张（剩余 {remaining}）
          </button>
        )}
        {visibleLimit > 4 && (
          <button type="button" className="dr-comparison-charts__more"
            onClick={() => setVisibleLimit(4)}>收起图表</button>
        )}
      </div>}
    </section>
  );
}
