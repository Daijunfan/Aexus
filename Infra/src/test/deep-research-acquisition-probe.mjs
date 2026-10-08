// Opt-in public-source acquisition proof. No model generation or employee process.
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
import {normalizeSources, mergeSources, normalizeVerification, mergeVerification, validateReport} from '../../../Engine/deep-research/evidence.mjs'
import {generateArtifacts} from '../../../Engine/deep-research/reports.mjs'

const root = path.resolve(import.meta.dirname, '../../..')
const output = path.join(root, '.aexus/artifacts/deep-research-independent/real-sources')
const refs = [
  {name: 'langchain', title: 'Open Deep Research supervisor source', url: 'https://raw.githubusercontent.com/langchain-ai/open_deep_research/1b7d2e80db9faa586165c60e09096dbbfd483a64/src/open_deep_research/deep_researcher.py', needle: 'tool_results = await asyncio.gather(*research_tasks)', claim: '该固定源码提交使用 asyncio.gather 并行等待 research_tasks。'},
  {name: 'deerflow', title: 'DeerFlow architecture', url: 'https://raw.githubusercontent.com/bytedance/deer-flow/main/docs/ARCHITECTURE.md', needle: 'App imports `deerflow`, but `deerflow` never imports `app`.', claim: 'DeerFlow 文档明确约束 app 对 harness 的单向依赖。'},
  {name: 'gpt-researcher', title: 'GPT Researcher multi-agent LangGraph example', url: 'https://raw.githubusercontent.com/assafelovic/gpt-researcher/master/docs/docs/gpt-researcher/multi_agents/langgraph.md', needle: '- Editor - Plans the report outline and structure based on the initial research.', claim: 'GPT Researcher 示例在初步研究后安排 Editor 生成报告大纲。'}
]
const state = {input: {topic: '真实公开资料获取与引用链验证', maxSources: 20}, sources: [], findings: [], contradictions: [], graph: {version: 1, nodes: []}, plan: null, workers: [], planRevisions: []}
const records = []
const readPublic = promisify(execFile)
const cached = process.argv.includes('--cached') ? JSON.parse(await fs.readFile(path.join(output, 'acquisition.json'), 'utf8')).sources : null
await fs.mkdir(output, {recursive: true})
for (const ref of refs) {
  const prior = cached?.find(r => r.url === ref.url)
  const bytes = cached ? await fs.readFile(path.join(output, ref.name + '.txt')) : (await readPublic('/usr/bin/curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '15', ref.url], {encoding: 'buffer', maxBuffer: 2 * 1024 * 1024})).stdout
  const text = bytes.toString('utf8'), lines = text.split('\n')
  const index = lines.findIndex(line => line.includes(ref.needle))
  assert.ok(index >= 0, ref.title + ': required evidence disappeared')
  const accessedAt = prior?.accessedAt || new Date().toISOString(), sha256 = createHash('sha256').update(bytes).digest('hex'), excerpt = lines[index].trim(), locator = 'Raw source line ' + (index + 1)
  if (cached) assert.equal(sha256, prior?.sha256, 'Cached evidence content must match its acquisition manifest')
  await fs.writeFile(path.join(output, ref.name + '.txt'), bytes)
  const source = normalizeSources({sources: [{title: ref.title, url: ref.url, acquisition: {status: 'read', excerpt, locator}}]}).sources[0]
  source.acquisition.accessedAt = Date.parse(accessedAt)
  source.acquisition.provenance = {kind: 'independent-public-fetch', sha256, file: ref.name + '.txt'}
  mergeSources(state, [source], {id: 'independent-acquisition'})
  mergeVerification(state, normalizeVerification({verifications: [{sourceId: source.id, credibilityScore: 1, claims: [{text: ref.claim, excerpt, locator, confidence: 1}], notes: '仅核验该直接源码或文档描述，不推断运行效果。'}]}, state.sources))
  records.push({...ref, sourceId: source.id, retrieval: 'HTTPS GET via system curl, non-success status rejected', accessedAt, sha256, bytes: bytes.length, excerpt, locator})
}
const formatSample = '\n\n| 项目 | 已取得证据 |\n| --- | --- |\n| LangChain | 并行研究源码 |\n| DeerFlow | 单向模块依赖 |\n\n- 文档描述与运行效果分别记录。\n- 三份来源不等于二十个独立网站。'
state.report = validateReport({report: {title: '真实资料引用链验证 fixture', abstract: '独立 GET 三个公开源码页面并构造引用工件；没有运行收费模型、应用代理或竞品。', sections: records.map((r, i) => ({heading: r.title, content: r.claim + (i === 0 ? formatSample : ''), citations: [r.sourceId]})), limitations: ['这是人工审阅的固定取证样例，不能代替自动研究质量验收。']}}, state)
for (const artifact of generateArtifacts(state)) {
  await fs.writeFile(path.join(output, artifact.name), artifact.content)
  for (const record of records) if (artifact.name === 'research-report.html' || artifact.name === 'research-report.md') {
    assert.ok(artifact.content.includes(record.url), 'Missing original source URL in ' + artifact.name)
    assert.ok(artifact.content.includes(record.sourceId), 'Missing citation anchor in ' + artifact.name)
  }
}
await fs.writeFile(path.join(output, 'acquisition.json'), JSON.stringify({kind: 'independent-public-fetch', modelCalls: 0, agentProcesses: 0, sources: records, reportState: state}, null, 2) + '\n')
console.log(JSON.stringify({passed: true, output, independentSources: records.length, modelCalls: 0, agentProcesses: 0, sources: records.map(({name, sha256, bytes, locator}) => ({name, sha256, bytes, locator}))}, null, 2))
