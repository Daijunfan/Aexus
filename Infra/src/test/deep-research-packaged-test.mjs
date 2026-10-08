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
const output = path.join(root, '.aexus/artifacts/deep-research-independent/package')
const stage = path.join(output, 'source'), artifacts = path.join(output, 'candidate')
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
fs.mkdirSync(output, {recursive: true})
const packageFile = path.join(root, 'package.json'), current = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
const baseline = JSON.parse(execFileSync('git', ['show', 'HEAD:package.json'], {cwd: root, encoding: 'utf8'}))
const before = hash(packageFile)
const options = {...baseline.build, directories: {output: artifacts}, electronDist: path.join(root, 'node_modules/electron/dist'), electronVersion: JSON.parse(fs.readFileSync(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version, npmRebuild: false, mac: {...baseline.build.mac, identity: '-'}}
fs.writeFileSync(path.join(output, 'candidate-config.json'), JSON.stringify(options, null, 2))
if (!process.argv.includes('--verify-only')) {
  fs.rmSync(stage, {recursive: true, force: true}); fs.mkdirSync(stage, {recursive: true})
  fs.copyFileSync(packageFile, path.join(stage, 'package.json'))
  for (const name of ['.aexus/out', 'Infra', 'Contract', 'Engine', 'README.md', 'LICENSE', 'NOTICE']) fs.cpSync(path.join(root, name), path.join(stage, name), {recursive: true, filter: p => !p.split(path.sep).includes('node_modules')})
  for (const directory of fs.readdirSync(path.join(root, 'Engine'))) {
    const dependencies = path.join(root, 'Engine', directory, 'node_modules')
    if (fs.existsSync(dependencies)) fs.symlinkSync(dependencies, path.join(stage, 'Engine', directory, 'node_modules'), 'dir')
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), 'dir')
  await build({projectDir: stage, config: options, targets: Platform.MAC.createTarget('dir', Arch.arm64), publish: 'never'})
}
const appPath = path.join(artifacts, 'mac-arm64/Aexus.app'), executable = path.join(appPath, 'Contents/MacOS/Aexus')
assert.ok(fs.existsSync(executable), 'Candidate executable is missing')
const archive = path.join(appPath, 'Contents/Resources/app.asar'), asar = require('@electron/asar')
const packaged = JSON.parse(asar.extractFile(archive, 'package.json').toString())
assert.equal(packaged.version, current.version)
const manifest = JSON.parse(asar.extractFile(archive, 'Engine/deep-research/engine.json').toString())
assert.equal(manifest.version, '2.0.0')
const candidateEngine = path.join(stage, 'Engine/deep-research')
const coreFingerprint = Object.fromEntries(fs.readdirSync(candidateEngine).filter(f => /\.(mjs|tsx|css)$/.test(f)).map(f => {
  const bytes = asar.extractFile(archive, 'Engine/deep-research/' + f)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash(path.join(candidateEngine, f)), 'Packaged source must match its candidate staging snapshot')
  return [f, createHash('sha256').update(bytes).digest('hex')]
}))
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
  const imported = await app.evaluate(async (_electron, archive) => {
    const vm = process.mainModule.require('node:vm'), url = process.mainModule.require('node:url').pathToFileURL(archive + '/Engine/deep-research/runtime.mjs').href
    const module = await vm.runInThisContext('import(' + JSON.stringify(url) + ')', {importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER})
    const state = module.create({topic: 'Packaged Deep Research safe startup acceptance'}), summary = module.describe(state)
    return {methods: ['create', 'describe', 'respond', 'run', 'pause', 'cancel'].every(key => typeof module[key] === 'function'), phase: summary.phase, progress: summary.progress, employeeCount: state.workers.length}
  }, archive)
  assert.equal(imported.methods, true); assert.equal(imported.phase, 'init'); assert.equal(imported.progress.percent, null); assert.equal(imported.employeeCount, 0)
  const page = await app.firstWindow(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message))
  await expect(page.locator('.engine-library')).toBeVisible()
  await page.locator('[data-engine-id="deep-research"]').dragTo(page.getByTestId('engine-load-dock'))
  await expect(page.locator('.dr-app')).toBeVisible()
  const sessions = await page.evaluate(() => window.agents.call('session.list'))
  assert.equal(sessions.sessions.length, 0)
  const workflows = await page.evaluate(() => window.agents.call('workflow.list', {engineId: 'deep-research'}))
  assert.equal(workflows.total, 0)
  await page.screenshot({path: path.join(output, 'packaged-deep-research.png'), animations: 'disabled'})
  const chromeLayout = []
  for (const size of [{width: 1440, height: 900}, {width: 768, height: 900}, {width: 390, height: 844}]) {
    await app.evaluate(({BrowserWindow}, size) => {const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(1, 1); win.setContentSize(size.width, size.height)}, size)
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(size.width)
    chromeLayout.push(await page.evaluate(() => ({viewport: {width: innerWidth, height: innerHeight}, elements: Object.fromEntries(['.application-layers', '.engine-surface', '.engine-context', '.dr-app', '.dr-intake'].map(selector => {const r = document.querySelector(selector)?.getBoundingClientRect(); return [selector, r ? {x: r.x, y: r.y, width: r.width, height: r.height} : null]}))})))
  }
  fs.writeFileSync(path.join(output, 'chrome-layout.json'), JSON.stringify({snapshot: 'candidate existing renderer, no research generation', layouts: chromeLayout}, null, 2))
  assert.deepEqual(errors, [])
  assert.ok(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().every(w => !w.isVisible())))
  assert.ok(!fs.existsSync(marker), 'No engine executable may run during this candidate smoke test')
  assert.equal(hash(packageFile), before, 'User package.json must remain unchanged')
  const proof = {passed: true, version: packaged.version, engineVersion: manifest.version, candidate: appPath, installed: false, buildConfig: 'HEAD package.json build field, explicit private output; current package metadata copied unchanged', sourcePackageSha256: before, engineFingerprint: coreFingerprint, rendererInput: 'Existing .aexus/out snapshot at candidate staging time; later UI iterations are separate source validations', checks: ['real ASAR runtime dynamic import', 'safe create/describe without workers', 'hidden packaged launcher loads Deep Research', 'empty isolated sessions/workflows', 'no engine executable invoked'], errors, modelCalls: 0, agentProcesses: 0, productionDataUsed: false}
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(proof, null, 2) + '\n')
  console.log(JSON.stringify(proof, null, 2))
} finally {await app?.close(); fs.rmSync(temp, {recursive: true, force: true})}
