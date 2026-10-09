import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {generateArtifacts} from '../reports.mjs';

test('standalone report contains wide tables on mobile and print while exposing source proof', async t => {
  const sha256 = 'a'.repeat(64);
  const source = {id: 'src-one', title: 'Independent original', url: 'https://example.org/original', verified: true,
    acquisition: {status: 'read', method: 'independent-http', excerpts: [{excerpt: 'A directly retrieved source passage.', locator: 'Page 1', sha256, accessedAt: 1, finalUrl: 'https://example.org/final'}]}};
  const table = '| Source | Date | Method | Evidence | Difference | Limitation |\n| --- | --- | --- | --- | --- | --- |\n| Original source | 2026 | Independent HTTP | Direct passage | Compared claims | Limited sample |';
  const section = {id: 'comparison', heading: 'Source comparison', content: table + '\n\n' + 'Grounded analysis follows the retrieved passage. '.repeat(100), citations: [source.id], evidence: [{sourceId: source.id, excerpt: source.acquisition.excerpts[0].excerpt, locator: 'Page 1', claim: 'A bounded finding.'}]};
  const state = {sources: [source], findings: [{claim: 'A bounded finding.'}], contradictions: [], workers: [], graph: {version: 1, nodes: []}, planRevisions: [{}], report: {title: 'Evidence-backed comparison', abstract: 'A bounded research summary.', sections: [section], citations: [source.id], conclusion: 'A limited conclusion.', limitations: ['Only one original source.']}};
  const document = generateArtifacts(state).find(file => file.name === 'research-report.html').content;
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  t.after(() => browser.close());
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  await page.setContent(document);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  assert.ok(await page.locator('section .report-content').first().evaluate(element => element.scrollWidth > element.clientWidth));
  await page.locator('.source-proof summary').click();
  assert.equal(await page.locator('.source-proof code').innerText(), sha256);
  await page.setViewportSize({width: 1440, height: 600});
  await page.evaluate(() => scrollTo(0, 600));
  assert.equal(await page.locator('nav').evaluate(element => Math.round(element.getBoundingClientRect().top)), 0);
  await page.emulateMedia({media: 'print'});
  await page.setViewportSize({width: 794, height: 1123});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
});
