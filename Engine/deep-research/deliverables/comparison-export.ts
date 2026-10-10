import type { ResearchMatrix } from "../ResearchInsights";
import { comparisonBarPercent, projectComparisonCharts } from "./matrix-charts";

export const COMPARISON_EXPORT_FILENAME = "aexus-comparison-charts.html";

const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char] ?? char));

/**
 * A self-contained visual appendix. Both the live UI and the exported bars consume
 * one trusted-as-display-only projection; original matrix cells are retained below.
 * Never converts units or treats a chart as independent evidence verification.
 */
export function renderComparisonChartsHtml(matrices: readonly ResearchMatrix[]): string {
  const charts = projectComparisonCharts(matrices);
  if (!charts.length) throw Error("当前矩阵没有可绘制的同单位数值，请先核对表格数据。");

  const relatedIds = new Set(charts.map(chart => chart.matrixId));
  const relatedTables = matrices.filter(table =>
    table && typeof table.id === "string" && relatedIds.has(table.id) &&
    Array.isArray(table.columns) && Array.isArray(table.rows),
  );

  const chartMarkup = charts.map((chart, index) => {
    const values = chart.values.map(item =>
      '<li><span class="series-label">' + escapeHtml(item.label) + '</span>' +
      '<span class="bar-track" aria-hidden="true"><i style="width:' +
      comparisonBarPercent(item.value, chart.maxValue) + '%"></i></span>' +
      '<b class="raw-value">' + escapeHtml(item.raw) + '</b></li>',
    ).join("");
    const omitted = chart.omitted.length
      ? '<p class="omitted">未绘制：' + escapeHtml(chart.omitted.join("、")) + '（缺失或不可比）</p>'
      : "";
    return '<figure class="comparison-card"><figcaption><span class="index">' +
      String(index + 1).padStart(2, "0") + '</span><div><small>' +
      escapeHtml(chart.matrixTitle) + '</small><h2>' + escapeHtml(chart.metric) +
      '</h2><span class="unit">' + escapeHtml(chart.unit || "未标注单位") +
      '</span></div></figcaption><ol class="series">' + values + '</ol>' +
      '<p class="maximum">零基线 · 最大原值 ' + escapeHtml(chart.maxLabel) +
      '</p>' + omitted + '</figure>';
  }).join("");

  const tableMarkup = relatedTables.map(table => {
    const columns = table.columns.map(column => '<th scope="col">' + escapeHtml(column) + '</th>').join("");
    const body = table.rows.filter(row => row && typeof row.label === "string" && Array.isArray(row.values))
      .map(row => '<tr><th scope="row">' + escapeHtml(row.label) + '</th>' +
        table.columns.map((_, index) => {
          const raw = row.values[index];
          const text = raw === null || raw === undefined ? "" : String(raw).trim();
          return '<td>' + escapeHtml(text || "—") + '</td>';
        }).join("") + '</tr>').join("");
    return '<section class="matrix-section"><h3>' + escapeHtml(table.title) +
      '</h3><div class="table-scroll" tabindex="0" role="region" aria-label="' +
      escapeHtml(String(table.title) + " 原始矩阵") +
      '"><table><thead><tr><th scope="col">比较维度</th>' +
      columns + '</tr></thead><tbody>' + body +
      '</tbody></table></div></section>';
  }).join("");

  const style = [
    ':root{color-scheme:light;--ink:#183028;--muted:#567065;--border:#dfe9e4;--accent:#18735c;--panel:#fff;--soft:#edf6f1}',
    '*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#edf3f0;color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
    '.page{width:min(1160px,100%);margin:30px auto;background:var(--panel);border:1px solid var(--border);border-radius:16px;overflow:hidden;box-shadow:0 20px 55px #15332712}',
    'header{padding:43px clamp(18px,5vw,65px);background:linear-gradient(135deg,#e7f4ec,#fff 75%);border-bottom:1px solid var(--border)}',
    '.eyebrow{font-size:11px;font-weight:700;letter-spacing:.14em;color:var(--accent)}',
    'h1{font-size:clamp(29px,4vw,42px);line-height:1.18;letter-spacing:-.03em;margin:16px 0 12px}h1,h2,h3{overflow-wrap:anywhere}h2,h3{line-height:1.4}',
    '.lead{max-width:780px;margin:0;color:var(--muted)}',
    '.stats{display:flex;gap:20px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-top:20px}',
    '.stats strong{font-size:18px;color:var(--ink);display:inline-block;margin-right:5px;font-variant-numeric:tabular-nums}',
    'main{padding:25px clamp(18px,5vw,65px) 50px}main>h2{font-size:22px;margin:0 0 18px}',
    '.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,350px),1fr));gap:14px}',
    '.comparison-card{min-width:0;margin:0;padding:22px;border:1px solid var(--border);border-radius:12px;break-inside:avoid}',
    '.comparison-card figcaption{display:flex;gap:13px;align-items:start;margin-bottom:17px}',
    '.index{font-size:19px;color:var(--accent);font-weight:700;font-variant-numeric:tabular-nums}',
    '.comparison-card figcaption small{display:block;color:var(--muted);font-size:12px;overflow-wrap:anywhere}',
    '.comparison-card h2{font-size:18px;margin:3px 0}',
    '.unit{font-size:11px;color:var(--muted)}.series{display:grid;gap:13px;list-style:none;margin:0;padding:0}',
    '.series li{min-width:0;display:grid;grid-template-columns:minmax(76px,1fr) minmax(55px,1.8fr) minmax(0,1fr);gap:8px;align-items:center}',
    '.series-label{font-size:13px;line-height:1.35;overflow-wrap:anywhere}',
    '.bar-track{min-width:0;height:15px;border-radius:4px;background:var(--soft);overflow:hidden}',
    '.bar-track i{display:block;height:100%;background:var(--accent);border-radius:inherit;print-color-adjust:exact;-webkit-print-color-adjust:exact}',
    '.raw-value{min-width:0;font-size:13px;white-space:normal;overflow-wrap:anywhere;text-align:right;font-variant-numeric:tabular-nums}',
    '.maximum,.omitted{font-size:11px;color:var(--muted);margin:15px 0 0;padding-top:9px;border-top:1px solid var(--border)}',
    '.omitted{margin-top:4px;padding-top:0;border:0}.notice{color:var(--muted);font-size:12px;line-height:1.7;margin:14px 0 25px}',
    '.appendix{border-top:1px solid var(--border);margin-top:35px;padding-top:25px}',
    '.appendix>h2{margin-bottom:8px}.matrix-section{margin:22px 0 28px;break-inside:avoid}',
    '.matrix-section h3{font-size:17px;margin:0 0 10px}.table-scroll{max-width:100%;overflow-x:auto;border:1px solid var(--border);border-radius:6px}',
    'table{border-collapse:collapse;width:100%;min-width:520px;font-size:12px;text-align:left}',
    'th,td{padding:9px 11px;border-bottom:1px solid var(--border);border-right:1px solid var(--border);vertical-align:top;overflow-wrap:anywhere}',
    'thead th{background:var(--soft)}tbody th{background:#f9fcfa}tr:last-child>*{border-bottom:0}tr>*:last-child{border-right:0}',
    'footer{border-top:1px solid var(--border);font-size:11px;color:var(--muted);margin-top:28px;padding-top:12px}',
    '@media(max-width:600px){.page{margin:0;border:0;border-radius:0}main{padding-top:22px}.comparison-card{padding:15px}.series li{grid-template-columns:minmax(66px,1fr) minmax(45px,1.3fr) minmax(0,1.1fr);gap:6px}}',
    '@media print{body{background:#fff}.page{width:auto;margin:0;box-shadow:none;border:0;border-radius:0;overflow:visible}header{padding:10px 0 22px;background:#fff}main{padding:12px 0}.charts{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.comparison-card{padding:12px}.matrix-section{break-inside:auto}.table-scroll{overflow:visible;border:0}table{min-width:0;width:100%;font-size:10px;table-layout:fixed}th,td{padding:5px;word-break:break-word}.charts,.series,.comparison-card{print-color-adjust:exact;-webkit-print-color-adjust:exact}}',
  ].join("");

  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>研究比较图表 · Aexus</title><style>' + style + '</style></head><body>' +
    '<div class="page"><header><span class="eyebrow">AEXUS / RESEARCH COMPARISON</span>' +
    '<h1>研究比较图表</h1><p class="lead">保留当前研究矩阵中的原始数值，按相同单位展示差异，附上完整原表方便查阅。</p>' +
    '<div class="stats"><span><strong>' + charts.length + '</strong> 数值图表</span>' +
    '<span><strong>' + relatedTables.length + '</strong> 原始矩阵</span></div></header>' +
    '<main><h2>数值对比</h2><div class="charts">' + chartMarkup + '</div>' +
    '<p class="notice">图表从零开始，保留原值；缺失项不会显示为零。' +
    '负数、日期编号、范围、估算及单位不一致的行没有绘制。图表来自报告表格或用户编辑，' +
    '尚未逐单元格独立核验；重要事实请返回研究报告检查出处和适用条件。</p>' +
    '<section class="appendix"><h2>原始比较矩阵</h2>' +
    '<p class="notice">包括未被绘制的文本和空白单元格，编辑内容按导出时状态保留。</p>' +
    tableMarkup + '</section>' +
    '<footer>由 Aexus Deep Research 比较矩阵生成。此离线文档不包含动态研究任务或外部依赖。</footer>' +
    '</main></div></body></html>';
}

/** Source-preserving long-form CSV for spreadsheet pivoting and archival. */
export const COMPARISON_CSV_FILENAME = "aexus-comparison-matrices.csv";
const csvCell = (value: unknown): string => {
  const raw = String(value ?? "");
  // Quoting alone does not prevent Excel/Sheets formulas from being evaluated.
  const safe = /^[\s\u200B\u200C\u200D]*[=+@-]/u.test(raw) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
};

export function renderComparisonMatricesCsv(matrices: readonly ResearchMatrix[]): string {
  const lines: unknown[][] = [["矩阵ID", "矩阵名称", "比较维度", "比较对象", "原始值"]];
  for (const matrix of matrices) {
    if (!matrix || typeof matrix.id !== "string" || typeof matrix.title !== "string" ||
      !Array.isArray(matrix.columns) || !matrix.columns.every(column => typeof column === "string") ||
      !Array.isArray(matrix.rows)) continue;
    for (const row of matrix.rows) {
      if (!row || typeof row.label !== "string" || !Array.isArray(row.values)) continue;
      matrix.columns.forEach((candidate, index) => {
        lines.push([matrix.id, matrix.title, row.label, candidate, row.values[index] ?? ""]);
      });
    }
  }
  if (lines.length === 1) throw Error("当前没有可导出的比较矩阵数据。");
  // BOM + CRLF make Chinese Excel imports readable without changing cell data.
  return "\uFEFF" + lines.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
