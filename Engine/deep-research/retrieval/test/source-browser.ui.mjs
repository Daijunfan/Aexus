import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const artifactRoot = path.resolve(root, '../../../.aexus/artifacts/retrieval-browser');
await fs.mkdir(artifactRoot, { recursive: true });
const out = await fs.mkdtemp(path.join(artifactRoot, 'run-'));
// All source bodies and metadata in this harness are synthetic, with reserved .example hosts.
const proof = (i, excerpt = `Saved original ${i}. 原文锚点-${i}。`, locator = `Line ${i + 1}`) => ({
  excerpt, locator, sha256: 'a'.repeat(64), accessedAt: 1_700_000_000_000,
  finalUrl: `https://site${i % 5}.example/final-${i}`,
});
const sources = Array.from({ length: 1000 }, (_, i) => ({
  id: 's' + i, title: `Fixture source ${i + 1}`, url: `https://site${i % 5}.example/source-${i}`,
  snippet: `候选摘要 ${i}，未作引用核验。`, verified: i % 4 === 0,
  acquisition: i % 4 <= 1 ? { status: 'read', method: 'independent-http', excerpts: [proof(i)] } :
    { status: i % 4 === 2 ? 'discovered' : 'unavailable', reason: i % 4 === 3 ? 'Fixture read failed' : '' },
}));
const findings = sources.filter(source => source.verified).map(source => ({
  id: 'f-' + source.id, sourceIds: [source.id], claim: '已提取容量论断 ' + source.id,
  evidence: [{ sourceId: source.id, excerpt: source.acquisition.excerpts[0].excerpt, locator: source.acquisition.excerpts[0].locator }],
}));
sources[0].acquisition.excerpts.push(proof(0, '未关联论断的原文片段。', 'Line 50'));
sources[1].title = 'Quantum studies';
sources[1].acquisition.excerpts = [proof(1, '专属原文搜索词：储能数据需要继续核验。')];
sources[998].title = '<img src=x onerror="window.fixtureXss=true">';
sources[998].url = 'javascript:window.fixtureXss=true';
sources[999] = { ...sources[999], verified: true, acquisition: { status: 'read', method: 'agent-reported', excerpt: 'Legacy unproven passage.' } };
for (let i = 0; i < 20; i++) {
  const item = proof(4, `Deep saved passage ${i}.`, 'Paragraph ' + i);
  sources[4].acquisition.excerpts.push(item);
  findings.push({ id: 'deep-' + i, sourceIds: ['s4'], claim: `稀有论断关键词：深层发现 ${i}，保留其原始定位。`, evidence: [{ sourceId: 's4', excerpt: item.excerpt, locator: item.locator }] });
}
const data = { sources, findings };
const entry = `
import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {SourcePanel} from ${JSON.stringify(path.join(root, 'SourcePanel.tsx'))};
import ${JSON.stringify(path.join(root, '../style.css'))};
import '@vscode/codicons/dist/codicon.css';
const initial = ${JSON.stringify(data)};
function Harness(){
  const [data,setData]=useState(initial),[selection,setSelection]=useState(null);
  useEffect(()=>{window.fixture={select:setSelection,update:setData,initial,reset:()=>{setData(initial);setSelection(null)}}},[]);
  const evidence=items=>items.map((item,i)=><blockquote className="dr-evidence" key={i}><p>{item.excerpt}</p><small>{item.locator}</small></blockquote>);
  return <div className="dr-app" data-view="sources"><main className="dr-main">
    <p className="fixture-label">资料浏览测试 · 1,000 条合成资料 · 无真实研究或网络检索</p>
    <SourcePanel {...data} selection={selection} onSelect={setSelection} onReturn={()=>{window.returnCount=(window.returnCount||0)+1;setSelection(null)}} renderEvidence={evidence}/>
  </main></div>;
}
createRoot(document.getElementById('root')).render(<Harness/>);`;
const bundle = await build({
  stdin: { contents: entry, resolveDir: root, sourcefile: 'source-browser-fixture.tsx', loader: 'tsx' },
  outfile: '/app.js', write: false, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic',
  loader: { '.ttf': 'file' }, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
});
const assets = new Map(bundle.outputFiles.map(file => ['/' + path.basename(file.path), file.contents]));
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>
html,body,#root{margin:0;height:100%;} html{color-scheme:light;} .dr-main{padding:0;} .fixture-label{padding:8px 16px;font-size:11px;color:var(--dr-muted);border-bottom:1px solid var(--dr-border);}
html[data-theme="dark"]{color-scheme:dark;--bg:#171c21;--fg:#edf3f7;--bg-elev:#222a31;--fg-dim:#afb8c1;--border-soft:#394550;}
</style><title>Retrieval browser fixture</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (request.method !== 'GET') { response.writeHead(405).end(); return; }
  const body = pathname === '/' ? html : assets.get(pathname);
  if (!body) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', pathname === '/' ? 'text/html; charset=utf-8' : pathname.endsWith('.css') ? 'text/css' : pathname.endsWith('.ttf') ? 'font/ttf' : 'text/javascript');
  response.end(body);
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
const checks = [], errors = [], unexpectedRequests = [];
let browser, page;
const screen = name => page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
const check = description => { checks.push(description); console.log('PASS ' + description); };
try {
  const bundledBrowser = await fs.access(chromium.executablePath()).then(() => true, () => false);
  browser = await chromium.launch({ headless: true, ...(process.env.AGENTS_BROWSER_CHANNEL ? { channel: process.env.AGENTS_BROWSER_CHANNEL } : bundledBrowser ? {} : { channel: 'chrome' }) });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    unexpectedRequests.push(route.request().url()); return route.abort();
  });
  const start = performance.now();
  await page.goto(origin);
  await page.waitForFunction(() => !!window.fixture);
  await page.locator('.dr-source-row').first().waitFor();
  const initialRenderMs = performance.now() - start;
  assert.equal(await page.locator('.dr-source-row').count(), 40);
  assert.match(await page.locator('.dr-source-row').first().innerText(), /已提取容量论断 s0/);
  assert.ok(!/候选摘要/.test(await page.locator('.dr-source-row').first().innerText()));
  check('1,000 sources render at most 40 rows and show known value before candidate summaries');

  const search = page.getByRole('textbox', { name: '搜索来源' });
  await search.fill('ＱＵＡＮＴＵＭ 储能');
  await page.waitForFunction(() => document.querySelectorAll('.dr-source-row').length === 1);
  assert.match(await page.locator('.dr-source-row').innerText(), /匹配：标题 · 已读取片段/);
  await search.fill('稀有论断关键词');
  assert.equal(await page.locator('.dr-source-row').count(), 1);
  assert.equal(await page.locator('.dr-source-row').getAttribute('data-source-id'), 's4');
  check('Unicode and cross-field searches find stored excerpts and linked claims with explicit match labels');
  await page.getByRole('button', { name: '清除资料筛选', exact: true }).click();

  await page.getByLabel('筛选来源网站').selectOption('site1.example');
  assert.equal(await page.locator('.dr-source-number').first().innerText(), '2');
  await page.getByRole('group', { name: '来源状态' }).getByRole('button', { name: /^已核验/ }).click();
  assert.match(await page.getByRole('status').innerText(), /50 条资料/);
  await page.getByRole('button', { name: '来源下一页' }).click();
  assert.equal(await page.locator('.dr-source-row').count(), 10);
  check('website and status facets compose, keep source numbering, and expose the final partial page');
  await page.getByRole('button', { name: '清除资料筛选', exact: true }).click();

  await page.evaluate(() => window.fixture.select({ id: 's999' }));
  await page.locator('.dr-source-row.selected').waitFor();
  assert.equal(await page.locator('.dr-source-number').first().innerText(), '961');
  await page.getByRole('button', { name: '来源上一页' }).click();
  assert.equal(await page.locator('.dr-source-number').first().innerText(), '921');
  await page.getByRole('button', { name: '在列表中定位' }).click();
  assert.equal(await page.locator('.dr-source-number').first().innerText(), '961');
  assert.equal(await page.locator('.dr-acquisition-metadata').count(), 0);
  assert.match(await page.locator('.dr-source-detail').innerText(), /历史来源 · 未独立验证/);
  check('external citations reveal their page while manual paging stays stable and historical flags remain unverified');

  await search.fill('专属原文搜索词');
  await page.evaluate(() => window.fixture.select({ id: 's500' }));
  assert.equal(await search.inputValue(), '专属原文搜索词');
  assert.equal(await page.locator('.dr-source-row').count(), 1);
  await page.getByRole('button', { name: '在列表中定位' }).click();
  assert.equal(await search.inputValue(), '');
  assert.equal(await page.locator('.dr-source-row.selected').getAttribute('data-source-id'), 's500');
  check('filtered-out citations retain their detail and can be located without silently clearing user filters');

  await page.evaluate(() => window.fixture.select({ id: 's0', locator: 'Line 50' }));
  await page.locator('.dr-linked-excerpt').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.dr-retrieval-excerpts').getAttribute('open'), '');
  assert.match(await page.locator('.dr-source-detail').innerText(), /完整内容请打开原文/);
  await page.evaluate(() => window.fixture.select({ id: 's4', locator: 'Paragraph 19' }));
  const target = page.locator('.dr-linked-claim');
  await target.waitFor();
  const targetBox = await target.boundingBox(), detailBox = await page.locator('.dr-source-detail').boundingBox();
  assert.ok(targetBox.y >= detailBox.y && targetBox.y + targetBox.height <= detailBox.y + detailBox.height, 'the exact linked finding must fit inside the detail viewport');
  const scrollBefore = await page.locator('.dr-source-detail').evaluate(element => element.scrollTop);
  await page.evaluate(() => window.fixture.update({ ...window.fixture.initial, sources: window.fixture.initial.sources.map(source => ({ ...source })) }));
  assert.ok(Math.abs(await page.locator('.dr-source-detail').evaluate(element => element.scrollTop) - scrollBefore) < 2);
  check('orphan excerpt locators expand their fragment and deep claim locators remain visible through ordinary data refreshes');
  await screen('desktop-citation');

  await page.evaluate(() => window.fixture.select({ id: 's998' }));
  assert.equal(await page.locator('.dr-source-detail img').count(), 0);
  assert.equal(await page.locator('.dr-source-detail a.dr-source-link').count(), 0);
  assert.equal(await page.evaluate(() => !!window.fixtureXss), false);
  assert.match(await page.locator('.dr-source-detail h3').innerText(), /<img/);
  check('untrusted source titles render as text and unsupported URL protocols have no original-link action');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.fixture.select(null));
  await search.fill('专属原文搜索词');
  await page.locator('.dr-source-row').click();
  await page.locator('.dr-source-detail h2').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.dr-source-list').isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'H2');
  await screen('mobile-reading');
  await page.getByRole('button', { name: '关闭来源详情' }).click();
  assert.equal(await page.locator('.dr-source-list').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.sourceId), 's1');
  assert.equal(await search.inputValue(), '专属原文搜索词');
  check('narrow screens switch to a readable detail pane and return keyboard focus to the preserved filtered list');

  await page.evaluate(() => window.fixture.select({ id: 'missing-source' }));
  await page.getByText('选中的来源暂不在当前研究中').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '返回报告', exact: true }).click();
  assert.equal(await page.evaluate(() => window.returnCount), 1);
  check('missing historical source IDs retain a working return path on narrow screens');
  await page.getByRole('button', { name: '清除资料筛选', exact: true }).click();
  await screen('mobile-list');

  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await screen('mobile-dark');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), true);
  assert.notEqual(await page.locator('.dr-source-row').first().evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)');
  check('light/dark source rows and narrow layouts avoid document-level overflow');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => { document.documentElement.dataset.theme = ''; window.fixture.select({ id: 's0' }); });
  await page.locator('.dr-source-detail').getByText('Line 1', {exact: true}).last().waitFor({state: 'visible'});
  assert.equal(await page.locator('.dr-acquisition-metadata').getAttribute('open'), null);
  check('source proof locator appears in readable claim evidence even while duplicate provenance metadata stays collapsed');
  await screen('desktop-overview');
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpectedRequests, []);
  await fs.writeFile(path.join(out, 'verification.json'), JSON.stringify({
    passed: true, checks, errors, unexpectedRequests, initialRenderMs, sourceCount: 1000,
    maxRenderedRows: 40, scope: 'Headless Chromium with synthetic local fixtures; no Core, native agents, real research or external requests.',
  }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: checks.length, initialRenderMs, out }));
} catch (error) {
  if (page) await screen('failure').catch(() => {});
  await fs.writeFile(path.join(out, 'verification.json'), JSON.stringify({ passed: false, checks, errors, error: String(error), unexpectedRequests }, null, 2));
  console.error(error); console.error('Artifacts:', out); process.exitCode = 1;
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
