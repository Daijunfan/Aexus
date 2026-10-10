import type { ResearchNode, ResearchFinding, ResearchReport, ResearchSource } from "./ui";
import { clean, focusAreas, extractTopicTimeline, extractMatrices, nodeInsight, type ResearchMatrix } from "./ResearchInsights";
import type { BoardItem } from "./ResearchViews";

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] || ch);
const safeHref = (value: string) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
};
const block = (value: unknown) => esc(clean(String(value ?? ""))).replace(/\n/g, " ");

export function visualBrief({
  topic, report, nodes, findings, sources, board, customMatrix,
}: {
  topic: string;
  report?: ResearchReport | null;
  nodes: ResearchNode[];
  findings: ResearchFinding[];
  sources: ResearchSource[];
  board: BoardItem[];
  customMatrix?: ResearchMatrix | null;
}): string {
  const title = report?.title || topic;
  const chapters = board.map((item, index) => {
    const node = item.type === "node" ? nodes.find(n => n.id === item.id) : undefined;
    const finding = item.type === "finding" ? findings.find(f => f.id === item.id) : undefined;
    const text = node ? nodeInsight(node) || node.objective || node.description : finding?.claim;
    if (!node && !finding) return "";
    const ids = node?.sourceIds ?? finding?.sourceIds ?? [];
    const refs = ids.map(id => sources.find(source => source.id === id))
      .filter((source): source is ResearchSource => !!source)
      .map(source => {
        const href = safeHref(source.url);
        return "<li>" + (href ? '<a href="' + esc(href) + '" rel="noopener noreferrer">' + esc(source.title) + "</a>" : esc(source.title)) + "</li>";
      }).join("");
    return '<section class="finding"><div class="number">' + String(index + 1).padStart(2, "0") + '</div>' +
      "<div><h2>" + esc(node?.label || "研究发现") + "</h2><p>" + block(text) + "</p>" +
      (item.note.trim() ? '<blockquote>' + esc(item.note) + "</blockquote>" : "") +
      (refs ? "<details><summary>相关资料</summary><ul>" + refs + "</ul></details>" : "") +
      "</div></section>";
  }).join("");

  const focus = focusAreas(nodes).map(area => {
    const p = area.total ? Math.round(area.completed * 100 / area.total) : 0;
    return '<div class="area"><b>' + esc(area.title) + '</b><span>' +
      esc(area.completed + " / " + area.total) + ' 相关任务</span><div class="track"><i style="width:' +
      p + '%"></i></div></div>';
  }).join("");

  const tables = [...extractMatrices(report), ...(customMatrix ? [customMatrix] : [])];
  const matrices = tables.map(table => '<section class="report-section"><h2>' + esc(table.title) +
    '</h2><div class="matrix-scroll"><table><thead><tr><th>比较维度</th>' +
    table.columns.map(col => "<th>" + esc(col) + "</th>").join("") + "</tr></thead><tbody>" +
    table.rows.map(row => "<tr><th>" + esc(row.label) + "</th>" +
      table.columns.map((_, index) => "<td>" + esc(row.values[index]?.trim() || "—") + "</td>").join("") +
      "</tr>").join("") + "</tbody></table></div></section>").join("");

  const timeline = extractTopicTimeline(report, findings);
  const chronology = timeline.length
    ? '<section class="report-section"><h2>时间与演变</h2><ol class="timeline">' +
      timeline.map(fact => '<li><time>' + esc(fact.date) + '</time><span>' +
        esc(fact.text) + "</span></li>").join("") + "</ol></section>" : "";

  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>' +
    '<style>:root{color-scheme:light;--ink:#162c28;--muted:#668078;--line:#dfe9e5;--accent:#177765}' +
    '*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#edf3f0;color:var(--ink);font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
    '.sheet{max-width:1100px;margin:28px auto;background:#fff;border:1px solid var(--line);box-shadow:0 18px 65px #12382b12;border-radius:14px;overflow:hidden}' +
    'header{padding:56px 64px;background:linear-gradient(130deg,#e9f5ee,#fff 70%);border-bottom:1px solid var(--line)}' +
    '.eyebrow{text-transform:uppercase;letter-spacing:.13em;color:var(--accent);font-size:11px;font-weight:700}' +
    'h1{font-size:clamp(30px,4vw,44px);line-height:1.18;margin:18px 0 22px}h2{font-size:21px;line-height:1.35}' +
    '.lead{color:#46625a;font-size:17px;max-width:760px}main{padding:24px 64px 72px}' +
    '.report-section{border-top:1px solid var(--line);padding:24px 0 28px}.report-section h2{margin:0 0 24px}' +
    '.areas{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:13px}' +
    '.area{border:1px solid var(--line);padding:14px;border-radius:10px;min-width:0}.area b{display:block;font-size:14px;line-height:1.45}.area span{display:block;color:var(--muted);font-size:12px;margin:9px 0}' +
    '.track{height:5px;background:#e4efea;border-radius:4px;overflow:hidden}.track i{display:block;height:100%;background:var(--accent)}' +
    '.finding{display:grid;grid-template-columns:52px minmax(0,1fr);gap:14px;border-bottom:1px solid var(--line);padding:20px 0}' +
    '.finding .number{font-size:22px;color:var(--accent)}.finding h2{margin:0 0 8px}.finding p{margin:0 0 10px;overflow-wrap:anywhere}' +
    'blockquote{border-left:3px solid var(--accent);margin:13px 0;background:#f3f9f6;padding:10px 14px}details{font-size:13px;color:var(--muted)}' +
    'summary{cursor:pointer}a{color:var(--accent);overflow-wrap:anywhere}.matrix-scroll{overflow-x:auto}' +
    'table{border-collapse:collapse;width:100%;font-size:13px;min-width:560px}th,td{padding:12px 15px;border:1px solid var(--line);text-align:left;vertical-align:top;overflow-wrap:anywhere}' +
    'thead th{background:#eff7f3}tbody th{background:#f9fcfa;min-width:130px}' +
    '.timeline{padding-left:20px}.timeline li{padding:8px 0 8px 20px;border-left:2px solid #b7d8ca;list-style:none}' +
    '.timeline time{font-weight:700;display:inline-block;min-width:90px;color:var(--accent)}.timeline span{overflow-wrap:anywhere}' +
    'footer{font-size:12px;color:var(--muted);border-top:1px solid var(--line);padding-top:18px;margin-top:25px}' +
    '@media(max-width:700px){.sheet{margin:0;border:0;border-radius:0}header{padding:35px 22px}main{padding:12px 22px 40px}.finding{grid-template-columns:35px minmax(0,1fr)}}' +
    '@media print{body{background:#fff}.sheet{margin:0;border:0;box-shadow:none}header{padding:24px 0}main{padding:10px 0}.area,.finding,.timeline li{break-inside:avoid}.matrix-scroll{overflow:visible}table{min-width:0;font-size:11px}th,td{padding:7px}a{color:inherit}}' +
    '</style></head><body><div class="sheet"><header><div class="eyebrow">AEXUS / RESEARCH BRIEF</div><h1>' + esc(title) +
    '</h1><p class="lead">' + block(report?.abstract || topic) + '</p></header><main>' +
    '<section class="report-section"><h2>研究范围</h2><div class="areas">' + focus +
    '</div><p style="font-size:12px;color:var(--muted)">进度表示相关计划任务完成数，不代表知识覆盖比例。</p></section>' +
    '<section class="report-section"><h2>选定的研究发现</h2>' + chapters + '</section>' +
    matrices + chronology +
    '<footer>由 Aexus 成果板生成。手动备注以原样保留；资料缺失显示为“—”。重要结论请查看相关原文及适用条件。</footer>' +
    '</main></div></body></html>';
}
