/** Portable deliverables generated from the approved, evidence-backed report. */
import { graphView } from './graph.mjs';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { sourceView, isIndependentSource } from './evidence.mjs';

const html = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const httpUrl = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; } };
const markdownLinkText = text => String(text ?? '').replace(/[\\[\]]/g, '\\$&');
const csv = value => '"' + String(value ?? '').replace(/^([\s]*[=+@-])/, "'$1").replace(/"/g, '""') + '"';
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
  const referenceHtml = references.map(s => {
    const proof = isIndependentSource(s) ? s.acquisition.excerpts[0] : null, link = httpUrl(s.url), finalUrl = proof && httpUrl(proof.finalUrl);
    return `
<li id="${html(s.id)}">
  <div class="reference-title">${link ? `<a href="${html(link)}" rel="noreferrer">${html(s.title)}</a>` : html(s.title)}</div>
  ${s.author || s.publishedDate ? `<p class="reference-meta">${[s.author, s.publishedDate].filter(Boolean).map(html).join(' · ')}</p>` : ''}
  ${s.verificationNotes ? `<p class="reference-note">${html(s.verificationNotes)}</p>` : ''}
  ${proof ? `<p class="reference-status">已独立读取 · <time>${html(new Date(proof.accessedAt).toLocaleString('zh-CN'))}</time>${proof.locator ? ' · ' + html(proof.locator) : ''}</p>
  <details class="source-proof"><summary>查看核验记录</summary><dl><dt>最终网址</dt><dd>${finalUrl ? `<a href="${html(finalUrl)}" rel="noreferrer">${html(finalUrl)}</a>` : html(proof.finalUrl)}</dd><dt>SHA-256</dt><dd><code>${html(proof.sha256)}</code></dd></dl></details>` : ''}
</li>`;
  }).join('\n');
  const highlightItems = (state.findings ?? []).filter(item => typeof item?.claim === "string" && item.claim.trim())
    .slice(0, 6).map((item, index) => `<article class="highlight-card"><small>${String(index + 1).padStart(2, "0")}</small><p>${html(item.claim)}</p></article>`).join("");
  const researchHighlights = highlightItems ? `<section class="visual-highlights" aria-label="研究发现速览"><h2>研究发现速览</h2><div class="highlights-grid">${highlightItems}</div></section>` : "";
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
  ${evidence ? '<details class="evidence-panel" open><summary>证据与原文片段</summary>' + evidence + '</details>' : ''}
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
    :root { --ink: #1d2b27; --muted: #62746c; --line: #dce7e1; --green: #176b54; --tint: #f3f8f5; }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; background: #f2f5f3; color: var(--ink); font: 16px/1.8 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .sheet { max-width: 1120px; margin: 40px auto; background: white; border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 22px 70px #17291d0b; }
    header { padding: 62px 72px 48px; background: linear-gradient(140deg,#f0f8f3,white 65%); border-bottom: 1px solid var(--line); border-radius: 17px 17px 0 0; }
    .kicker { margin: 0 0 22px; color: var(--green); font-size: 11px; font-weight: 700; letter-spacing: .13em; }
    h1 { max-width: 800px; margin: 0; font-size: clamp(31px,4vw,46px); line-height: 1.23; letter-spacing: -.035em; }
    .lead { max-width: 760px; margin-top: 24px; color: #43574e; font-size: 18px; }
    .lead > :first-child { margin-top: 0; }
    .stats { display: flex; flex-wrap: wrap; gap: 20px 34px; margin-top: 38px; padding-top: 22px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; }
    .stats strong { display: block; color: var(--ink); font-size: 19px; line-height: 1.2; }
    .visual-highlights { padding-bottom: 22px; }
    .highlights-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(195px, 1fr)); gap: 12px; }
    .highlight-card { border: 1px solid var(--line); border-radius: 10px; padding: 16px; background: linear-gradient(145deg,#f4faf6,white); }
    .highlight-card small { font-size: 11px; color: var(--green); font-weight: 700; }
    .highlight-card p { font-size: 14px; line-height: 1.75; margin: 9px 0 0; }
    .content-grid { display: grid; grid-template-columns: 230px minmax(0,1fr); }
    nav { position: sticky; top: 0; align-self: start; padding: 38px 24px; border-right: 1px solid var(--line); }
    nav strong { color: var(--muted); font-size: 11px; letter-spacing: .13em; }
    nav ol { list-style: none; margin: 18px 0 0; padding: 0; counter-reset: sections; }
    nav li { counter-increment: sections; display: flex; gap: 10px; margin: 0 0 16px; font-size: 13px; line-height: 1.5; }
    nav li::before { content: counter(sections, decimal-leading-zero); color: #8aa99b; font-size: 11px; }
    main { min-width: 0; padding: 8px 68px 76px; overflow-x: hidden; }
    section { border-top: 1px solid var(--line); padding-top: 34px; margin-top: 34px; scroll-margin-top: 20px; }
    main > section:first-child { border-top: 0; }
    h2 { margin: 0 0 18px; font-size: 25px; line-height: 1.35; letter-spacing: -.02em; }
    a { color: var(--green); overflow-wrap: anywhere; text-underline-offset: 3px; }
    p, li, dd { overflow-wrap: anywhere; }
    .report-content { overflow-x: auto; }
    .report-content > :first-child { margin-top: 0; }
    .citations { margin-top: 22px; font-size: 13px; }
    .citations a { display: inline-block; margin-right: 6px; padding: 2px 8px; border-radius: 5px; background: var(--tint); text-decoration: none; }
    details { border: 1px solid var(--line); border-radius: 10px; background: #fbfdfb; padding: 12px 16px; }
    summary { cursor: pointer; color: var(--green); font-size: 13px; font-weight: 600; }
    .evidence-panel { margin-top: 18px; }
    blockquote { margin: 16px 0 4px; padding: 13px 16px; border-left: 3px solid #83ae96; background: var(--tint); border-radius: 0 7px 7px 0; }
    blockquote footer { margin-top: 8px; color: var(--muted); font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; margin: 20px 0; }
    th, td { padding: 9px 12px; border: 1px solid var(--line); text-align: left; }
    th { background: var(--tint); }
    pre { overflow-x: auto; padding: 14px 18px; background: var(--tint); border-radius: 8px; font-size: 13px; }
    code { overflow-wrap: anywhere; }
    .references ol { padding-left: 25px; }
    .references li { padding: 10px 0 24px 8px; border-bottom: 1px solid var(--line); }
    .reference-title { font-weight: 650; }
    .reference-meta, .reference-status { color: var(--muted); font-size: 12px; }
    .reference-note { margin: 10px 0; font-size: 14px; }
    .source-proof { margin-top: 10px; padding: 8px 12px; }
    .source-proof dl { display: grid; grid-template-columns: 74px minmax(0,1fr); gap: 5px 12px; margin: 12px 0 4px; font-size: 12px; }
    .source-proof dt { color: var(--muted); }
    .source-proof dd { margin: 0; }
    .source-proof code { word-break: break-all; }
    @media (max-width: 760px) {
      .sheet { margin: 0; border: 0; border-radius: 0; box-shadow: none; }
      header { padding: 40px 24px 30px; border-radius: 0; }
      .content-grid { display: block; }
      nav { position: static; padding: 20px 24px; border-right: 0; border-bottom: 1px solid var(--line); }
      nav ol { display: flex; flex-wrap: wrap; gap: 10px 18px; }
      nav li { margin: 0; }
      main { padding: 0 24px 50px; }
    }
    @media print {
      html { scroll-behavior: auto; }
      body { background: white; }
      .sheet { margin: 0; border: 0; border-radius: 0; box-shadow: none; }
      header { padding: 0 0 20px; background: white; }
      .content-grid { display: block; }
      nav { position: static; padding: 12px 0; border: 0; }
      nav li { break-inside: avoid; }
      main { padding: 0; overflow: visible; }
      section, blockquote, .references li { break-inside: avoid; }
      a { color: inherit; }
      .report-content { overflow: visible; }
      pre { white-space: pre-wrap; }
    }
  </style>
</head>
<body>
<div class="sheet">
  <header>
    <p class="kicker">AEXUS / DEEP RESEARCH / PLAN ${state.graph.version}</p>
    <h1>${html(report.title)}</h1>
    <div class="lead report-content">${markdown(report.abstract)}</div>
    <div class="stats"><span><strong>${state.sources.length}</strong>已发现来源</span><span><strong>${state.sources.filter(s => s.verified && isIndependentSource(s)).length}</strong>已独立读取并核验</span><span><strong>${state.findings.length}</strong>项论断</span><span><strong>${state.planRevisions.length}</strong>版计划</span></div>
  </header>
  <div class="content-grid">
  <nav aria-label="报告目录"><strong>目录 / CONTENTS</strong><ol>${report.sections.map(s => `<li><a href="#${html(s.id)}">${html(s.heading)}</a></li>`).join('')}</ol></nav>
  <main>
  ${researchHighlights}
  ${sectionsHtml}
  ${report.conclusion ? '<section><h2>结论</h2><div class="report-content">' + markdown(report.conclusion) + '</div></section>' : ''}
  ${limitations}
  <section class="references"><h2>来源与引用</h2><ol>${referenceHtml}</ol></section>
  </main>
  </div>
</div>
</body>
</html>`;
  const sectionsMarkdown = report.sections.map(s => {
    const citations = s.citations.map(id => '[[' + numbered.get(id) + ']](#' + id + ')').join(' ');
    const evidence = s.evidence.map(e => `> ${e.excerpt.replace(/\n/g, '\n> ')}\n>\n> ${e.claim} [${numbered.get(e.sourceId)}] ${e.locator}\n`).join('\n');
    return `## ${s.heading}\n\n${s.content}\n\n${citations}\n\n` + (evidence ? '<details><summary>证据与原文片段</summary>\n\n' + evidence + '\n</details>\n' : '');
  }).join('\n');
  const referencesMarkdown = references.map(s => {
    const link = httpUrl(s.url), proof = isIndependentSource(s) ? s.acquisition.excerpts[0] : null;
    const finalUrl = proof && httpUrl(proof.finalUrl), title = markdownLinkText(s.title);
    return `<a id="${html(s.id)}"></a>\n${s.number}. ${link ? `[${title}](<${link}>)` : title}${s.publishedDate ? ' · ' + s.publishedDate : ''}\n` +
      (proof ? `   - 原文获取：${new Date(proof.accessedAt).toLocaleString('zh-CN')}${proof.locator ? ' · ' + proof.locator : ''}\n${finalUrl ? '   - 最终链接：<' + finalUrl + '>\n' : ''}   - SHA-256：\`${proof.sha256}\`\n` : '');
  }).join('\n');
  const mdReport = `# ${report.title}\n\n${report.abstract}\n\n` + sectionsMarkdown
    + (report.conclusion ? '\n## 结论\n\n' + report.conclusion + '\n' : '')
    + (report.limitations.length ? '\n## 研究局限\n\n' + report.limitations.map(s => '- ' + s).join('\n') + '\n' : '')
    + '\n## 来源与引用\n\n' + referencesMarkdown;
  const sourceCsv = [
    ['ID', 'Type', 'Title', 'URL', 'Author', 'Published', 'Acquisition', 'Credibility', 'Verified', 'Excerpt', 'Locator', 'Final URL', 'Accessed At', 'SHA-256'],
    ...state.sources.map(sourceView).map(s => {
      const read = isIndependentSource(s), proof = read ? s.acquisition.excerpts[0] : null;
      return [s.id, s.type, s.title, s.url, s.author, s.publishedDate, s.acquisition.status, s.credibilityScore, s.verified && read, s.acquisition.excerpt, s.acquisition.locator, proof?.finalUrl, proof ? new Date(proof.accessedAt).toLocaleString('zh-CN') : '', proof?.sha256];
    })
  ].map(row => row.map(csv).join(',')).join('\r\n');
  return [
    { name: 'research-report.html', description: '完整研究报告、来源和原文证据', mediaType: 'text/html', content: htmlReport },
    { name: 'research-report.md', description: '可编辑研究报告与引用', mediaType: 'text/markdown', content: mdReport },
    { name: 'sources.csv', description: '全部来源及阅读核验状态', mediaType: 'text/csv', content: sourceCsv },
    { name: 'evidence.json', description: '来源、原文、论断和矛盾证据', mediaType: 'application/json', content: JSON.stringify({ sources: state.sources, findings: state.findings, contradictions: state.contradictions }, null, 2) },
    { name: 'research-plan.json', description: 'DAG、团队和规划修订记录', mediaType: 'application/json', content: JSON.stringify({ plan: state.plan, graph: graphView(state), team: state.workers.map(({ id, specId, role, label, managerIds, managementRole }) => ({ id, specId, role, label, managerIds, managementRole })), revisions: state.planRevisions }, null, 2) }
  ];
}
