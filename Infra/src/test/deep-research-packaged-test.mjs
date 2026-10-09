// Private candidate build and hidden packaged loading. No installation, employee creation or generation.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {build, Platform, Arch} from 'electron-builder'
import {_electron as electron, expect} from '@playwright/test'

const root = path.resolve(import.meta.dirname, '../../..'), require = createRequire(import.meta.url)
const packageOutput = path.join(root, '.aexus/artifacts/deep-research-independent/package')
const installedTarget = process.env.AGENTS_COMPANY_TEST_APP
const output = installedTarget ? path.join(packageOutput, 'installed') : packageOutput
const stage = path.join(packageOutput, 'source'), artifacts = path.join(packageOutput, 'candidate')
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
fs.mkdirSync(output, {recursive: true})
const packageFile = path.join(root, 'package.json'), current = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
const baseline = JSON.parse(execFileSync('git', ['show', 'HEAD:package.json'], {cwd: root, encoding: 'utf8'}))
const before = hash(packageFile)
const options = {...baseline.build, directories: {output: artifacts}, electronDist: path.join(root, 'node_modules/electron/dist'), electronVersion: JSON.parse(fs.readFileSync(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version, npmRebuild: false, mac: {...baseline.build.mac, identity: '-'}}
fs.writeFileSync(path.join(output, 'candidate-config.json'), JSON.stringify(options, null, 2))
if (!process.argv.includes('--verify-only')) {
  assert.ok(!installedTarget, 'Installed-app verification cannot build or install')
  const priorProof = path.join(output, 'verification.json')
  if (fs.existsSync(priorProof)) {
    const previous = JSON.parse(fs.readFileSync(priorProof, 'utf8')), snapshot = path.join(output, 'snapshots', previous.buildEvidence.head.slice(0, 7))
    fs.mkdirSync(snapshot, {recursive: true})
    for (const file of ['verification.json', 'source-build.json', 'chrome-layout.json', 'packaged-deep-research.png']) if (fs.existsSync(path.join(output, file))) fs.copyFileSync(path.join(output, file), path.join(snapshot, file))
  }
  const startedAt = new Date().toISOString()
  execFileSync(path.join(root, 'node_modules/.bin/electron-vite'), ['build'], {cwd: root, env: {...process.env, AGENTS_COMPANY_RELEASE: '1'}, stdio: 'inherit'})
  fs.writeFileSync(path.join(output, 'source-build.json'), JSON.stringify({startedAt, finishedAt: new Date().toISOString(), exitCode: 0, head: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(), packageSha256: before, rendererHtmlSha256: hash(path.join(root, '.aexus/out/renderer/index.html'))}, null, 2))
  fs.rmSync(stage, {recursive: true, force: true}); fs.mkdirSync(stage, {recursive: true})
  fs.copyFileSync(packageFile, path.join(stage, 'package.json'))
  for (const name of ['.aexus/out', 'Infra', 'Contract', 'Engine', 'README.md', 'LICENSE', 'NOTICE']) fs.cpSync(path.join(root, name), path.join(stage, name), {recursive: true, filter: p => !p.split(path.sep).includes('node_modules')})
  for (const directory of fs.readdirSync(path.join(root, 'Engine'))) {
    const dependencies = path.join(root, 'Engine', directory, 'node_modules')
    if (fs.existsSync(dependencies)) fs.cpSync(dependencies, path.join(stage, 'Engine', directory, 'node_modules'), {recursive: true, dereference: true})
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), 'dir')
  await build({projectDir: stage, config: options, targets: Platform.MAC.createTarget('dir', Arch.arm64), publish: 'never'})
}
const appPath = installedTarget || path.join(artifacts, 'mac-arm64/Aexus.app'), executable = path.join(appPath, 'Contents/MacOS/Aexus')
assert.ok(fs.existsSync(executable), 'Candidate executable is missing')
const archive = path.join(appPath, 'Contents/Resources/app.asar'), asar = require('@electron/asar')
const packaged = JSON.parse(asar.extractFile(archive, 'package.json').toString())
assert.equal(packaged.version, current.version)
const manifest = JSON.parse(asar.extractFile(archive, 'Engine/deep-research/engine.json').toString())
assert.equal(manifest.version, '2.0.0')
const candidateLock = path.join(stage, 'Engine/deep-research/package-lock.json')
const lockedEngine = JSON.parse(fs.readFileSync(candidateLock, 'utf8'))
const privateDependencies = Object.keys(JSON.parse(asar.extractFile(archive, 'Engine/deep-research/package.json').toString()).dependencies || {}).map(name => {
  const packagedFile = 'Engine/deep-research/node_modules/' + name + '/package.json'
  const installed = JSON.parse(fs.readFileSync(path.join(root, packagedFile), 'utf8'))
  const bundled = JSON.parse(asar.extractFile(archive, packagedFile).toString())
  assert.equal(bundled.version, installed.version, 'Private Engine dependency must be packaged at its locked version')
  assert.equal(bundled.version, lockedEngine.packages['node_modules/' + name].version)
  return {name, version: bundled.version, path: packagedFile}
})
const candidateEngine = path.join(stage, 'Engine/deep-research')
const coreFingerprint = Object.fromEntries(fs.readdirSync(candidateEngine).filter(f => /\.(mjs|ts|tsx|css)$/.test(f)).map(f => {
  const bytes = asar.extractFile(archive, 'Engine/deep-research/' + f)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash(path.join(candidateEngine, f)), 'Packaged source must match its candidate staging snapshot')
  return [f, createHash('sha256').update(bytes).digest('hex')]
}))
const rendererHtml = asar.extractFile(archive, '.aexus/out/renderer/index.html').toString()
const rendererFiles = ['index.html', ...[...rendererHtml.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g)].map(match => match[1])]
for (const file of rendererFiles) assert.equal(createHash('sha256').update(asar.extractFile(archive, '.aexus/out/renderer/' + file)).digest('hex'), hash(path.join(stage, '.aexus/out/renderer', file)), 'Packaged renderer entry assets must match the fresh build')
const buildEvidence = JSON.parse(fs.readFileSync(path.join(packageOutput, 'source-build.json'), 'utf8'))
assert.equal(buildEvidence.exitCode, 0)
assert.equal(buildEvidence.rendererHtmlSha256, createHash('sha256').update(asar.extractFile(archive, '.aexus/out/renderer/index.html')).digest('hex'), 'ASAR renderer must match the recorded fresh build')
const changedEngineSnapshot = Object.entries(coreFingerprint).flatMap(([file, sha256]) => {
  try { return createHash('sha256').update(execFileSync('git', ['show', buildEvidence.head + ':Engine/deep-research/' + file], {cwd: root})).digest('hex') === sha256 ? [] : [file] }
  catch { return [file] }
})
const pdfFixture = path.join(root, '.aexus/artifacts/deep-research-independent/engine-acquisition/w3c-dummy.pdf')
const pdfHash = '3df79d34abbca99308e79cb94461c1893582604d68329a41fd4bec1885e6adb4'
assert.equal(hash(pdfFixture), pdfHash, 'Saved public W3C PDF must match the independent retrieval fingerprint')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aexus-research-package-')), trap = path.join(temp, 'engine-trap.mjs'), marker = path.join(temp, 'engine-called')
fs.writeFileSync(trap, `#!${process.execPath}\nimport fs from 'node:fs';fs.appendFileSync(${JSON.stringify(marker)},'refused\\n');process.exit(99);\n`, {mode: 0o755})
const env = {...process.env, AGENTS_COMPANY_HOME: path.join(temp, 'state'), AGENTS_COMPANY_PROJECTS: path.join(temp, 'projects'), AGENTS_COMPANY_WORKSPACES: path.join(temp, 'work'), AGENTS_COMPANY_SHARED_DIR: path.join(temp, 'shared'), CODEX_HOME: path.join(temp, 'codex'), AGENTS_COMPANY_HIDDEN: '1', AGENTS_COMPANY_WIDTH: '1440', AGENTS_COMPANY_HEIGHT: '1000', CODEX_BIN: trap, CLAUDE_BIN: trap, CLINE_BIN: trap, PI_BIN: trap}
for (const key of Object.keys(env)) if (key.startsWith('AGENTS_COMPANY_TOKEN') || /^(OPENAI_|ANTHROPIC_|CLINE_API_KEY$|DEEPSEEK_API_KEY$|PI_API_KEY$)/.test(key) || ['ELECTRON_RUN_AS_NODE', 'AGENTS_COMPANY_SOCKET', 'AGENTS_COMPANY_EMPLOYEE', 'AGENTS_COMPANY_URL', 'AGENTS_COMPANY_CLIENT', 'AGENTS_COMPANY_PACKAGE_ROOT', 'AEXUS_CLI'].includes(key)) delete env[key]
let app
const errors = []
try {
  app = await electron.launch({executablePath: executable, args: [], cwd: temp, env})
  if (process.argv.includes('--private-engine')) {
    const privateRoot = path.join(temp, 'private-engine'), privateArchive = path.join(temp, 'private-engine.asar')
    fs.cpSync(path.join(root, 'Engine/deep-research'), path.join(privateRoot, 'Engine/deep-research'), {recursive: true, dereference: true})
    await asar.createPackage(privateRoot, privateArchive)
    const privateProof = await app.evaluate(async (_electron, archive) => {
      const vm = process.mainModule.require('node:vm'), load = suffix => vm.runInThisContext('import(' + JSON.stringify(process.mainModule.require('node:url').pathToFileURL(archive + '/Engine/deep-research/' + suffix).href) + ')', {importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER})
      const runtime = await load('runtime.mjs'), reports = await load('reports.mjs')
      const state = runtime.create({topic: 'Private production GFM dependency import acceptance'})
      Object.assign(state, {report: {title: 'Fixture', abstract: '', conclusion: '', limitations: [], citations: ['s1'], sections: [{id: 'section', heading: 'Evidence', content: '| Key | Value |\n| --- | --- |\n| A | B |\n\n- Item\n\n<script>alert(1)</script>', citations: ['s1'], evidence: []}]}, sources: [{id: 's1', url: 'https://example.org/evidence', title: 'Fixture'}]})
      const content = reports.generateArtifacts(state).find(a => a.name === 'research-report.html').content
      return {runtimeImported: true, gfmTable: content.includes('<table>'), gfmList: content.includes('<ul>'), rawScriptBlocked: !content.includes('<script>'), sourceUrl: content.includes('https://example.org/evidence')}
    }, privateArchive)
    assert.ok(Object.values(privateProof).every(Boolean))
    fs.writeFileSync(path.join(output, 'private-engine-verification.json'), JSON.stringify({passed: true, ...privateProof, scope: 'Updated Engine and its private locked dependencies imported from a disposable ASAR with the actual candidate Electron runtime; full candidate is unchanged', modelCalls: 0, agentProcesses: 0}, null, 2))
  }
  const imported = await app.evaluate(async (_electron, {archive, dependencies, pdfFixture}) => {
    const vm = process.mainModule.require('node:vm'), url = process.mainModule.require('node:url').pathToFileURL(archive + '/Engine/deep-research/runtime.mjs').href
    const module = await vm.runInThisContext('import(' + JSON.stringify(url) + ')', {importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER})
    const state = module.create({topic: 'Packaged Deep Research safe startup acceptance'}), summary = module.describe(state)
    const reports = await vm.runInThisContext('import(' + JSON.stringify(process.mainModule.require('node:url').pathToFileURL(archive + '/Engine/deep-research/reports.mjs').href) + ')', {importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER})
    Object.assign(state, {report: {title: 'GFM proof', abstract: '', conclusion: '', limitations: [], citations: ['s1'], sections: [{id: 'section', heading: 'Evidence', content: '| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- Item', citations: ['s1'], evidence: []}]}, sources: [{id: 's1', title: 'Fixture', url: 'https://example.org/evidence'}]})
    const html = reports.generateArtifacts(state).find(a => a.name === 'research-report.html').content
    const resolve = process.mainModule.require('node:module').createRequire(archive + '/Engine/deep-research/reports.mjs')
    const dependencyPaths = dependencies.map(name => resolve.resolve(name))
    const source = await vm.runInThisContext('import(' + JSON.stringify(process.mainModule.require('node:url').pathToFileURL(archive + '/Engine/deep-research/source-read.mjs').href) + ')', {importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER})
    const fs = process.mainModule.require('node:fs'), data = fs.readFileSync(pdfFixture)
    const [checked] = await source.acquireSources({sources: []}, [{id: 'w3c', url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', acquisition: {excerpt: 'Dummy PDF file', locator: 'Agent claimed page 999'}}], {read: async url => ({url, data, mediaType: 'application/pdf'})})
    const pdfRoot = archive + '.unpacked/Engine/deep-research/node_modules/pdfjs-dist/'
    const pdfResources = ['legacy/build/pdf.worker.mjs', 'standard_fonts', 'cmaps', 'wasm'].map(name => ({name, exists: fs.existsSync(pdfRoot + name)}))
    return {methods: ['create', 'describe', 'respond', 'run', 'fork', 'pause', 'cancel'].every(key => typeof module[key] === 'function'), phase: summary.phase, progress: summary.progress, employeeCount: state.workers.length, gfmTable: html.includes('<table>'), gfmList: html.includes('<ul>'), dependencyPaths,
      pdf: {status: checked.acquisition.status, proof: checked.acquisition.excerpts?.[0], resources: pdfResources}}
  }, {archive, dependencies: privateDependencies.map(d => d.name), pdfFixture})
  assert.equal(imported.methods, true); assert.equal(imported.phase, 'init'); assert.equal(imported.progress.percent, null); assert.equal(imported.employeeCount, 0)
  assert.equal(imported.gfmTable, true); assert.equal(imported.gfmList, true)
  assert.ok(imported.dependencyPaths.every(file => file.includes('/Engine/deep-research/node_modules/')), 'GFM must resolve from private Engine dependencies, not top-level transitive packages')
  assert.equal(imported.pdf.status, 'read', 'Actual packaged PDF parser must read the saved public PDF')
  assert.equal(imported.pdf.proof.locator, 'Page 1'); assert.equal(imported.pdf.proof.sha256, pdfHash)
  assert.deepEqual(imported.pdf.proof.pages, [1]); assert.ok(imported.pdf.resources.every(resource => resource.exists), 'Private PDF worker and supporting resources must be physically unpacked')
  const page = await app.firstWindow(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message))
  await expect(page.locator('.engine-library')).toBeVisible()
  await page.locator('[data-engine-id="deep-research"]').dragTo(page.getByTestId('engine-load-dock'))
  await expect(page.locator('.dr-app')).toBeVisible()
  await expect(page.locator('.dr-sidebar')).toHaveCount(0)
  const question = page.getByLabel('研究目标')
  await question.click()
  await page.keyboard.type('301')
  await expect(question).toHaveValue('301')
  await expect(page.getByLabel('执行引擎')).toHaveValue('')
  await expect(page.getByRole('button', {name: '开始研究', exact: true})).toBeDisabled()
  await page.getByLabel('执行引擎').selectOption('codex')
  await expect(page.getByText('使用 Codex 当前登录账号的模型额度。', {exact: true})).toBeVisible()
  await expect(page.getByRole('button', {name: '开始研究', exact: true})).toBeEnabled()
  const questionBox = await question.boundingBox(), historyBox = await page.getByRole('region', {name: '研究记录'}).boundingBox()
  assert.ok(historyBox.y > questionBox.y + questionBox.height, 'Research history belongs below the input')
  await question.fill('')
  const sessions = await page.evaluate(() => window.agents.call('session.list'))
  assert.equal(sessions.sessions.length, 0)
  const workflows = await page.evaluate(() => window.agents.call('workflow.list', {engineId: 'deep-research'}))
  assert.equal(workflows.total, 0)
  await page.screenshot({path: path.join(output, 'packaged-deep-research.png'), animations: 'disabled'})
  const chromeLayout = []
  for (const size of [{width: 1440, height: 900}, {width: 768, height: 900}, {width: 390, height: 844}]) {
    await app.evaluate(({BrowserWindow}, size) => {const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(1, 1); win.setContentSize(size.width, size.height)}, size)
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(size.width)
    const layout = await page.evaluate(() => ({viewport: {width: innerWidth, height: innerHeight}, surface: {clientHeight: document.querySelector('.engine-surface').clientHeight, scrollHeight: document.querySelector('.engine-surface').scrollHeight, clientWidth: document.querySelector('.engine-surface').clientWidth, scrollWidth: document.querySelector('.engine-surface').scrollWidth}, overflows: [...document.querySelectorAll('.engine-surface *')].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({className: element.className, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth})), elements: Object.fromEntries(['.application-layers', '.engine-surface', '.engine-context', '.dr-app', '.dr-intake'].map(selector => {const r = document.querySelector(selector)?.getBoundingClientRect(); return [selector, r ? {x: r.x, y: r.y, width: r.width, height: r.height} : null]}))}))
    assert.ok(layout.surface.scrollHeight <= layout.surface.clientHeight + 1, 'Empty research intake must not add a second viewport scroll')
    assert.ok(layout.elements['.dr-app'].y + layout.elements['.dr-app'].height <= size.height + 1, 'Research app must account for the real host context height')
    const horizontal = await page.locator('.dr-main,.dr-intake-page,.dr-intake,.dr-intake-controls,.dr-segment').evaluateAll(elements => elements.map(element => ({className: element.className, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth})))
    assert.ok(horizontal.every(element => element.scrollWidth <= element.clientWidth + 1), 'Intake controls and hidden tips must stay within their actual host width')
    layout.horizontal = horizontal
    chromeLayout.push(layout)
    await page.screenshot({path: path.join(output, 'packaged-intake-' + size.width + '.png'), animations: 'disabled'})
  }
  fs.writeFileSync(path.join(output, 'chrome-layout.json'), JSON.stringify({snapshot: 'fresh source-built candidate renderer, no research generation', layouts: chromeLayout}, null, 2))
  assert.deepEqual(errors, [])
  assert.ok(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().every(w => !w.isVisible())))
  assert.ok(!fs.existsSync(marker), 'No engine executable may run during this candidate smoke test')
  assert.equal(hash(packageFile), before, 'User package.json must remain unchanged')
  const proof = {passed: true, version: packaged.version, engineVersion: manifest.version, application: appPath, asarSha256: hash(archive), asarBytes: fs.statSync(archive).size, installed: !!installedTarget, buildConfig: 'HEAD package.json build field, explicit private output; current package metadata copied unchanged', sourcePackageSha256: before, engineFingerprint: coreFingerprint, changedEngineSnapshot, candidateEngineLockSha256: hash(candidateLock), privateDependencies, pdf: imported.pdf, rendererInput: 'Fresh electron-vite release build before candidate staging; verify-only preserves the already-built candidate', buildEvidence, rendererFiles, checkedAgainstHead: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(), checks: ['real ASAR runtime dynamic import and fork hook', 'locked dependencies in private Engine directory', 'actual packaged GFM table and list export', 'actual packaged PDF page text and public raw fingerprint', 'physically unpacked private PDF worker/resources', 'safe create/describe without workers', 'hidden packaged launcher loads Deep Research', 'explicit engine choice before account-backed generation', 'empty isolated sessions/workflows', 'no engine executable invoked'], errors, modelCalls: 0, agentProcesses: 0, productionDataUsed: false}
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(proof, null, 2) + '\n')
  console.log(JSON.stringify(proof, null, 2))
} finally {await app?.close(); fs.rmSync(temp, {recursive: true, force: true})}
