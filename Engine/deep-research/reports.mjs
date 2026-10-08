/** Portable deliverables generated from the approved, evidence-backed report. */
import { graphView } from './graph.mjs';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { sourceView, isIndependentSource } from './evidence.mjs';

const html = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const csv = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
const markdown = text => micromark(String(text ?? ''), { extensions: [gfm()], htmlExtensions: [gfmHtml()] });

export function wordCount(report) {
  const text = [report?.abstract, ...(report?.sections || []).map(s => s.content), report?.conclusion].join(' ');
  return (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+/gu) || []).length;
}

export function generateArtifacts(state) {
  const report = state.report;
  if (!report?.sections?.length || !report.citations?.length) throw Error('缺少可交付的已引用研究报告');
  const byId = new Map(state.sources.map(s => [s.id, s]));
  const references = report.citations.map((id, i) => ({ ...byId.get(id), number: i + 1 }));
  const numbered = new Map(references.map(s => [s.id, s.number]));
  const referenceHtml = references.map(s => `
<li id="${html(s.id)}">
  <a href="${html(s.url)}" rel="noreferrer">${html(s.title)}</a>
  ${s.author ? ' · ' + html(s.author) : ''}${s.publishedDate ? ' · ' + html(s.publishedDate) : ''}
  <p>${html(s.verificationNotes || '')}</p>
</li>`).join('\n');
  const sectionsHtml = report.sections.map(section => {
    const citations = section.citations.map(id => `<a href="#${html(id)}">[${numbered.get(id)}]</a>`).join(' ');
    const evidence = section.evidence.map(e => `
<blockquote>${html(e.excerpt)}
  <footer>${html(e.claim)} · <a href="#${html(e.sourceId)}">[${numbered.get(e.sourceId)}]</a>${e.locator ? ' · ' + html(e.locator) : ''}</footer>
</blockquote>`).join('');
    return `
<section id="${html(section.id)}">
  <h2>${html(section.heading)}</h2>
  <div class="report-content">${markdown(section.content)}</div>
  <p class="citations">${citations}</p>
  ${evidence ? '<details><summary>证据与原文片段</summary>' + evidence + '</details>' : ''}
</section>`;
  }).join('\n');
  const limitations = report.limitations.length ? `<section><h2>研究局限</h2><ul>${report.limitations.map(s => '<li>' + html(s) + '</li>').join('')}</ul></section>` : '';
  const htmlReport = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${html(report.title)}</title>
  <style>
    body { font: 16px/1.8 system-ui,sans-serif; color: #23282b; background: #fff; max-width: 920px; margin: 40px auto; padding: 0 24px; }
    h1 { font-size: 32px; line-height: 1.25; }
    h2 { font-size: 23px; margin: 32px 0 12px; }
    a { color: #086d82; overflow-wrap: anywhere; }
    p, li { overflow-wrap: anywhere; }
    section { border-top: 1px solid #dbe2e4; margin-top: 28px; }
    blockquote { border-left: 3px solid #789ba0; padding-left: 16px; margin: 16px 0; }
    footer, .meta, .citations, summary { font-size: 13px; color: #53666d; }
    details { background: #f4f7f7; padding: 12px 16px; }
    nav ol { padding-left: 22px; }
    .report-content { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0; }
    th, td { padding: 8px 12px; border: 1px solid #dbe2e4; text-align: left; }
    th { background: #f4f7f7; }
    pre { overflow-x: auto; padding: 12px 16px; background: #f4f7f7; font-size: 13px; }
    code { overflow-wrap: anywhere; }
    @media print {
      details { display: block; }
      body { margin: 0; max-width: none; }
      a { color: inherit; }
      .report-content { overflow: visible; }
      pre { white-space: pre-wrap; }
    }
  </style>
</head>
<body>
  <header>
    <p class="meta">AEXUS · Deep Research · 计划 v${state.graph.version}</p>
    <h1>${html(report.title)}</h1>
    <div class="report-content">${markdown(report.abstract)}</div>
    <p class="meta">${state.sources.length} 个已发现来源 · ${state.sources.filter(s => s.verified && isIndependentSource(s)).length} 个已独立读取并核验 · ${state.findings.length} 项论断 · ${state.planRevisions.length} 版计划</p>
  </header>
  <nav><ol>${report.sections.map(s => `<li><a href="#${html(s.id)}">${html(s.heading)}</a></li>`).join('')}</ol></nav>
  ${sectionsHtml}
  ${report.conclusion ? '<section><h2>结论</h2><div class="report-content">' + markdown(report.conclusion) + '</div></section>' : ''}
  ${limitations}
  <section><h2>来源与引用</h2><ol>${referenceHtml}</ol></section>
</body>
</html>`;
  const sectionsMarkdown = report.sections.map(s => {
    const citations = s.citations.map(id => '[[' + numbered.get(id) + ']](#' + id + ')').join(' ');
    const evidence = s.evidence.map(e => `> ${e.excerpt.replace(/\n/g, '\n> ')}\n>\n> ${e.claim} [${numbered.get(e.sourceId)}] ${e.locator}\n`).join('\n');
    return `## ${s.heading}\n\n${s.content}\n\n${citations}\n\n` + (evidence ? '<details><summary>证据与原文片段</summary>\n\n' + evidence + '\n</details>\n' : '');
  }).join('\n');
  const referencesMarkdown = references.map(s => `<a id="${s.id}"></a>\n${s.number}. [${s.title}](${s.url})${s.publishedDate ? ' · ' + s.publishedDate : ''}\n`).join('\n');
  const mdReport = `# ${report.title}\n\n${report.abstract}\n\n` + sectionsMarkdown
    + (report.conclusion ? '\n## 结论\n\n' + report.conclusion + '\n' : '')
    + (report.limitations.length ? '\n## 研究局限\n\n' + report.limitations.map(s => '- ' + s).join('\n') + '\n' : '')
    + '\n## 来源与引用\n\n' + referencesMarkdown;
  const sourceCsv = [
    ['ID', 'Type', 'Title', 'URL', 'Author', 'Published', 'Acquisition', 'Credibility', 'Verified', 'Excerpt', 'Locator'],
    ...state.sources.map(sourceView).map(s => [s.id, s.type, s.title, s.url, s.author, s.publishedDate, s.acquisition.status, s.credibilityScore, s.verified && isIndependentSource(s), s.acquisition.excerpt, s.acquisition.locator])
  ].map(row => row.map(csv).join(',')).join('\r\n');
  return [
    { name: 'research-report.html', description: '完整研究报告、来源和原文证据', mediaType: 'text/html', content: htmlReport },
    { name: 'research-report.md', description: '可编辑研究报告与引用', mediaType: 'text/markdown', content: mdReport },
    { name: 'sources.csv', description: '全部来源及阅读核验状态', mediaType: 'text/csv', content: sourceCsv },
    { name: 'evidence.json', description: '来源、原文、论断和矛盾证据', mediaType: 'application/json', content: JSON.stringify({ sources: state.sources, findings: state.findings, contradictions: state.contradictions }, null, 2) },
    { name: 'research-plan.json', description: 'DAG、团队和规划修订记录', mediaType: 'application/json', content: JSON.stringify({ plan: state.plan, graph: graphView(state), team: state.workers.map(({ id, specId, role, label, managerIds, managementRole }) => ({ id, specId, role, label, managerIds, managementRole })), revisions: state.planRevisions }, null, 2) }
  ];
}
