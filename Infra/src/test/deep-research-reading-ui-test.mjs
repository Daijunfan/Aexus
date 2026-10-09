// Actual Page + actual describe with independently fetched evidence; browser-only Contract fixture, no Core/model.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium, expect} from '@playwright/test'
import {create, describe} from '../../../Engine/deep-research/model.mjs'
import {normalizeNodes} from '../../../Engine/deep-research/graph.mjs'

const root = path.resolve(import.meta.dirname, '../../..'), output = path.join(root, '.aexus/artifacts/deep-research-independent/reading-ui')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aexus-research-reading-'))
fs.mkdirSync(output, {recursive: true})
const acquisition = JSON.parse(fs.readFileSync(path.join(root, '.aexus/artifacts/deep-research-independent/real-sources/acquisition.json'), 'utf8'))
const corpus = process.argv.includes('--corpus')
const independent = process.argv.includes('--independent')
const corpusDirectory = path.join(root, '.aexus/artifacts/deep-research-independent/research-corpus', independent ? 'independent-proof' : '')
const state = corpus ? JSON.parse(fs.readFileSync(path.join(corpusDirectory, 'state.json'), 'utf8')) : Object.assign(create({topic: '阅读真实公开资料的研究报告与可定位引用'}), acquisition.reportState)
state.phase = 'complete'
state.graph = {version: 1, nodes: normalizeNodes([{id: 'read', kind: 'search', dependencies: []}, {id: 'verify', kind: 'verify', dependencies: ['read']}, {id: 'write', kind: 'write', dependencies: ['verify']}, {id: 'review', kind: 'review', dependencies: ['write']}]).map(n => ({...n, status: 'completed'}))}
state.report.sections[0].content += '\n\n[1](#' + state.sources[0].id + ')'
const job = {id: 'wf_33333333-3333-4333-8333-333333333333', engineId: 'deep-research', engineVersion: '2.0.0', status: 'completed', revision: 1, createdAt: Date.now(), updatedAt: Date.now(), files: [], summary: describe(state)}
await build({stdin: {resolveDir: root, sourcefile: 'reading.tsx', loader: 'tsx', contents: "import React from 'react';import{createRoot}from'react-dom/client';import Page from './Engine/deep-research/Page.tsx';import '@vscode/codicons/dist/codicon.css';const client={invoke:async(cmd)=>{if(cmd==='workflow.list')return {jobs:[window.readingJob]};if(cmd==='workflow.get')return window.readingJob;throw Error('Read-only browser fixture rejected '+cmd)},info:async()=>({}),describe:async()=>({})};createRoot(document.getElementById('root')).render(<Page client={client}/>);"}, outfile: path.join(temp, 'bundle.js'), bundle: true, jsx: 'automatic', loader: {'.ttf': 'file'}, define: {'process.env.NODE_ENV': '"production"'}, logLevel: 'silent'})
const browser = await chromium.launch({headless: true, channel: 'chrome'})
const page = await browser.newPage({viewport: {width: 1440, height: 900}}), errors = [], checks = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.route('https://research-reading.test/**', route => {
    const file = path.basename(new URL(route.request().url()).pathname)
    if (file.endsWith('.ttf')) return route.fulfill({contentType: 'font/ttf', body: fs.readFileSync(path.join(temp, file))})
    return route.fulfill({contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font:13px system-ui;background:#fff}.host-bar{height:72px;border-bottom:1px solid #ddd}.host-rail{position:absolute;top:72px;left:0;width:64px;bottom:0;background:#f4f6f7}.engine-surface{margin-left:64px;height:calc(100dvh - 72px);overflow:auto}.engine-context{height:60px;border-bottom:1px solid #ddd}.dr-app{min-height:calc(100% - 60px)}@media(max-width:900px){.host-bar{height:116px}.host-rail{top:116px}.engine-surface{height:calc(100dvh - 116px)}}</style><div class="host-bar"></div><div class="host-rail"></div><main class="engine-surface"><header class="engine-context"></header><div id="root"></div></main>'})
  })
  await page.goto('https://research-reading.test/')
  await page.evaluate(job => {window.readingJob = job}, job)
  await page.addStyleTag({path: path.join(temp, 'bundle.css')})
  await page.addScriptTag({path: path.join(temp, 'bundle.js')})
  await page.getByRole('region', {name: '研究记录'}).getByRole('button').first().click()
  await page.getByRole('tab', {name: '报告', exact: true}).click()
  await expect(page.getByRole('heading', {name: state.report.title, exact: true})).toBeVisible()
  const citation = page.locator('.dr-inline-citation').first()
  const clickedId = await citation.innerText()
  const citationRecord = corpus && independent ? JSON.parse(fs.readFileSync(path.join(corpusDirectory, 'claims.json'), 'utf8')).find(claim => claim.id === clickedId) : null
  const currentSource = citationRecord ? state.sources.find(source => source.id === citationRecord.sourceId) : corpus && !independent ? state.sources.find(s => s.url === JSON.parse(fs.readFileSync(path.join(corpusDirectory, 'acquisition.json'), 'utf8')).sources.find(s => s.id === clickedId).url) : state.sources[0]
  await citation.focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', {name: currentSource.title, exact: true})).toBeVisible()
  const expectedLocator = state.findings.flatMap(finding => finding.evidence).find(evidence => evidence.sourceId === currentSource.id).locator
  await expect(page.locator('.dr-source-detail blockquote small').filter({hasText: expectedLocator}).first()).toBeVisible()
  assert.ok(await page.locator('a').filter({hasText: '阅读原文'}).getAttribute('href').then(href => href === currentSource.url))
  checks.push('Keyboard citation enters the real source record, evidence locator and original URL')
  await page.getByRole('tab', {name: '报告', exact: true}).click()
  await expect(page.getByRole('heading', {name: state.report.title, exact: true})).toBeVisible()
  checks.push('Report is reachable after inspecting its citation')
  for (const viewport of [{width: 1440, height: 900}, {width: 768, height: 900}, {width: 390, height: 844}]) {
    await page.setViewportSize(viewport)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({path: path.join(output, (corpus ? 'corpus-' : '') + 'report-' + viewport.width + '.png'), fullPage: true})
    await page.getByRole('tab', {name: /^来源/}).click()
    await page.screenshot({path: path.join(output, (corpus ? 'corpus-' : '') + 'source-' + viewport.width + '.png'), fullPage: true})
    await page.getByRole('tab', {name: '报告', exact: true}).click()
  }
  assert.deepEqual(errors, [])
  fs.writeFileSync(path.join(output, (corpus ? 'corpus-' : '') + 'verification.json'), JSON.stringify({passed: true, provenance: corpus ? (independent ? 'Native Agent research over independently acquired raw-source proof + actual Page/describe' : 'Historical Native Agent corpus + actual Page/describe') + '; browser Contract fixture, not application-generated research' : 'actual Page + actual describe + independently fetched source snapshots; browser Contract fixture', sources: state.sources.length, chapters: state.report.sections.length, checks, errors, modelCalls: 0, agentProcesses: 0}, null, 2))
  console.log(JSON.stringify({passed: true, checks, output}, null, 2))
} finally {await browser.close(); fs.rmSync(temp, {recursive: true, force: true})}
