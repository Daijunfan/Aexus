// Hosted Role iframe capture: the real CloudHosts outer-embedding bridge, not a
// hand-marked iframe. Starts Core in hosted mode (owning IPC parent + loopback parent
// origin), serves a minimal outer host page that performs the real host.hello ->
// aexus.ready -> host.ticket -> /api/hosted/exchange handshake, then screenshots the
// authenticated Role iframe and verifies hosted-only surface (no standalone web pill,
// Build-only Team form, Profile/Edit/Conversation + company/messages/plan navigation).
// Isolated AGENTS_COMPANY_HOME; no production state, no model.
// Usage: node test/role-hosted-capture.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import http from 'node:http'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {chromium,expect} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'

const outDir = path.resolve(import.meta.dirname, '../../../artifacts/role-parity-20261015/ui-screenshots', 'hosted')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer()
  s.once('error', reject)
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) })
})
const corePort = await freePort()
const parentPort = await freePort()

const hostedInstance = crypto.randomUUID()
const hostedSecret = crypto.randomBytes(32).toString('hex')
const clientId = 'host' + crypto.randomBytes(6).toString('hex')
const windowId = 'win' + crypto.randomBytes(6).toString('hex')
const bindingNonce = crypto.randomBytes(24).toString('hex')
const parentOrigin = 'http://127.0.0.1:' + parentPort
const coreOrigin = 'http://127.0.0.1:' + corePort

// Cloud fixtures: a fake ssh + codex on PATH runs remote commands locally (the proven pattern in
// mixed-team-management-test.mjs), so a cloud Team can hold both a team-workspace member and a
// Core-local member without touching a real host.
const root = path.resolve(import.meta.dirname, '..')
const sshBin = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-hosted-mgmt-'))
fs.writeFileSync(path.join(sshBin, 'ssh'), `#!${process.execPath}
const args=process.argv.slice(2);if(require('fs').existsSync(${JSON.stringify(path.join(sshBin,'offline'))}))process.exit(255);if(args.includes('-R')){console.error('Allocated port '+args[args.indexOf('-R')+1].split(':').at(-1));setInterval(()=>{},1000)}else{const child=require('child_process').spawn('/bin/sh',['-c',args.at(-1)],{stdio:'inherit'});child.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>child.kill('SIGTERM'))}
`, { mode: 0o755 })
fs.writeFileSync(path.join(sshBin, 'codex'), `#!${process.execPath}
if(process.argv.includes('--version')){console.log('codex fixture');process.exit(0)}if(process.argv[2]==='login'){console.log('Logged in');process.exit(0)}require('fs').appendFileSync(${JSON.stringify(path.join(sshBin,'native-starts'))},process.cwd()+String.fromCharCode(10));try{const dir=require('path').join(process.cwd(),'.agents-company/employees'),ids=require('fs').readdirSync(dir);if(ids.length===1)process.env.AGENTS_COMPANY_EMPLOYEE=ids[0]}catch{}require(${JSON.stringify(path.join(root,'test/fixtures/initialization-codex.cjs'))})
`, { mode: 0o755 })
const remoteBase = path.join(sshBin, 'remote')
fs.mkdirSync(remoteBase)

// Hosted Core reads cloud hosts from the CloudHosts projection (the outer app owns the host
// registry); pre-seed one fixture host so a cloud Team can be created without the owner bridge.
const cloudHostId = 'cloudhost-fixture'
const hostProjection = path.join(sshBin, 'host-projection.json')
fs.writeFileSync(hostProjection, JSON.stringify({ schemaVersion: 1, source: 'cloudhosts', projectionRevision: crypto.randomBytes(32).toString('hex'), hosts: [{ id: cloudHostId, name: 'Fixture cloud', host: 'fixture', os: 'linux', defaultDirectory: remoteBase, hasPassword: false, createdAt: Date.now(), updatedAt: Date.now() }] }))

const f = await fixtureCore({
  PATH: sshBin + path.delimiter + process.env.PATH,
  AGENTS_COMPANY_HOST_PROJECTION_PATH: hostProjection,
  AGENTS_COMPANY_WEB: '1',
  AGENTS_COMPANY_WEB_PORT: String(corePort),
  AGENTS_COMPANY_HOSTED: '1',
  AGENTS_COMPANY_HOST_INSTANCE_ID: hostedInstance,
  AGENTS_COMPANY_HOST_BRIDGE_SECRET: hostedSecret,
  AGENTS_COMPANY_HOST_PARENT_ORIGIN: parentOrigin,
})

const makeTicket = () => {
  const grant = {
    purpose: 'hosted-embed-login',
    instanceId: hostedInstance,
    parentOrigin,
    nonce: crypto.randomBytes(16).toString('hex'),
    clientId,
    windowId,
    expiresAt: Date.now() + 15000,
  }
  const encoded = Buffer.from(JSON.stringify(grant)).toString('base64url')
  const signature = crypto.createHmac('sha256', hostedSecret).update(encoded).digest('base64url')
  return encoded + '.' + signature
}

const parentHtml = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#141b29}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head><body>
<iframe id="role" src="${coreOrigin}/?aexus-host=cloudhosts&client=${encodeURIComponent(clientId)}"></iframe>
<script>
const CFG=${JSON.stringify({ instanceId: hostedInstance, windowId, clientId, bindingNonce, coreOrigin })};
const frame=document.getElementById('role');
let ready=false,accepted=false;
window.addEventListener('message',ev=>{const m=ev.data||{};if(m.type==='aexus.ready')ready=true;if(m.type==='host.ticket')accepted=m.payload&&m.payload.accepted===true;window.__hostedAccepted=accepted;});
frame.addEventListener('load',()=>{
  frame.contentWindow.postMessage({protocolVersion:1,instanceId:CFG.instanceId,requestId:crypto.randomUUID(),type:'host.hello',windowId:CFG.windowId,clientId:CFG.clientId,nonce:CFG.bindingNonce,payload:{expectedOrigin:CFG.coreOrigin,nonce:CFG.bindingNonce,capabilities:['folder.pick','file.pick']}},CFG.coreOrigin);
  const start=Date.now();
  const iv=setInterval(async()=>{if(ready||Date.now()-start>8000){clearInterval(iv);if(ready){const res=await fetch('/ticket');const {ticket}=await res.json();frame.contentWindow.postMessage({protocolVersion:1,instanceId:CFG.instanceId,requestId:crypto.randomUUID(),type:'host.ticket',windowId:CFG.windowId,clientId:CFG.clientId,nonce:CFG.bindingNonce,payload:{ticket}},CFG.coreOrigin);}}},120);
});
</script></body></html>`

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', parentOrigin)
  if (url.pathname === '/ticket') {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ ticket: makeTicket() }))
    return
  }
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end(parentHtml)
})
await new Promise(r => server.listen(parentPort, '127.0.0.1', r))

let browser, page
const pageErrors = []
const checks = []
const check = (name, ok, detail = null) => checks.push({ name, ok: !!ok, detail })
try {
  // Meaningful hosted content: one team, one ready employee, one deterministic reply.
  await f.cli('group', 'add', 'Design Studio')
  const emp = await f.create('Aster', 'Design Studio')
  await f.cli('card', 'avatar', emp.id, 'fate-saber-chibi')
  fs.writeFileSync(path.join(f.control, emp.id + '.reply.txt'), '这里已通过托管桥接登录。工作区与文件树保持原有能力。')
  await f.cli('session', 'send', '--employee', emp.id, '--text', '帮我看看这个托管工作区。')
  await f.until(async () => !(await f.status(emp.id)).busy, 'fixture reply')

  // Cloud Team fixtures for the mounted ManagementPanel checks: a team-workspace member (remote)
  // whose Secretary option must be disabled, and a Core-local member who can be appointed.
  const mgmtRole = async id => (await f.cli('session', 'list')).sessions.find(c => c.id === id)?.managementRole
  await f.cli('group', 'add', 'Cloud', '--mode', 'cloud', '--host-id', cloudHostId, '--remote-dir', remoteBase)
  const cloudWorkspace = await f.cli('card', 'create', '--title', 'Cloud workspace member', '--group', 'Cloud', '--model', 'gpt-6-luna', '--effort', 'low'); await f.ready(cloudWorkspace.id)
  const cloudLocal = await f.cli('card', 'create', '--title', 'Cloud core local', '--group', 'Cloud', '--work-environment', 'local', '--model', 'gpt-6-luna', '--effort', 'low'); await f.ready(cloudLocal.id)

  browser = await chromium.launch({ ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}), headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } })
  page = await context.newPage()
  page.setDefaultTimeout(30000)
  page.on('pageerror', e => pageErrors.push(e.message))
  await page.goto(parentOrigin + '/')

  const hostFrame = page.frames().find(fr => fr !== page.mainFrame())
  await hostFrame.locator('.infinite-canvas').waitFor({ timeout: 30000 })
  const hostedAccepted = await page.evaluate(() => window.__hostedAccepted === true)
  const webConnection = await hostFrame.locator('.web-connection').count()
  check('hosted bridge ticket accepted', hostedAccepted)
  check('hosted Role iframe has no standalone web-connection pill', webConnection === 0, { webConnection })

  // Home screenshots (real outer embedding + iframe-only), desktop and narrow.
  await page.screenshot({ animations: 'disabled', path: path.join(outDir, 'hosted-embed-1440.png') })
  await hostFrame.locator('body').screenshot({ animations: 'disabled', path: path.join(outDir, 'hosted-role-iframe-1440.png') })
  await page.setViewportSize({ width: 390, height: 900 })
  await page.screenshot({ animations: 'disabled', path: path.join(outDir, 'hosted-embed-390.png') })
  await hostFrame.locator('body').screenshot({ animations: 'disabled', path: path.join(outDir, 'hosted-role-iframe-390.png') })
  await page.setViewportSize({ width: 1440, height: 980 })

  // Team form in hosted mode: Build-only, no Work·Plugin toggle, no removed plugin products.
  await hostFrame.locator('.add-team').click()
  await hostFrame.locator('.team-form').waitFor({ timeout: 15000 })
  const teamForm = await hostFrame.evaluate(() => {
    const form = document.querySelector('.team-form')
    if (!form) return { present: false }
    const text = (form.textContent || '')
    return {
      present: true,
      modeOptions: form.querySelectorAll('.team-mode-options').length,
      workPluginToggle: /Work\s*·\s*Plugin/.test(text),
      removedPluginRefs: /mini\s*notion|margin\s*reader/i.test(text),
      directoryBrowserButton: !!form.querySelector('.folder-input button'),
    }
  })
  check('hosted Team form is Build-only (no Work·Plugin toggle)', teamForm.present && teamForm.modeOptions === 0 && !teamForm.workPluginToggle, teamForm)
  check('hosted Team form references no removed plugin products', !teamForm.removedPluginRefs, teamForm)
  check('hosted Team form keeps the directory browser as a secondary action', teamForm.directoryBrowserButton, teamForm)
  await hostFrame.locator('.team-form').screenshot({ animations: 'disabled', path: path.join(outDir, 'hosted-team-form.png') })
  await hostFrame.locator('.panel-close').click()
  await hostFrame.locator('.team-form').waitFor({ state: 'detached', timeout: 15000 })

  // Conversation navigation (Profile/Edit/Conversation).
  await hostFrame.evaluate(id => window.agents.call('view.open', { kind: 'conversation', employee: id }), emp.id)
  await hostFrame.locator('.conversation-dialog').waitFor({ timeout: 20000 })
  check('hosted Conversation navigation opens the conversation dialog', true)
  await hostFrame.locator('.conversation-dialog').screenshot({ animations: 'disabled', path: path.join(outDir, 'hosted-conversation.png') })

  // Profile sidebar: company/messages/plan tabs remain.
  await hostFrame.evaluate(() => window.agents.call('view.details', { enabled: true }))
  await hostFrame.locator('.employee-inspector .employee-profile-page').waitFor({ timeout: 20000 })
  const tabs = await hostFrame.locator('.profile-tabs [role=tab]').count()
  await hostFrame.locator('[data-profile-tab="messages"]').click()
  await hostFrame.waitForFunction(() => document.querySelector('.employee-profile-page')?.dataset.profileView === 'messages')
  await hostFrame.locator('[data-profile-tab="plan"]').click()
  await hostFrame.waitForFunction(() => document.querySelector('.employee-profile-page')?.dataset.profileView === 'plan')
  await hostFrame.locator('[data-profile-tab="company"]').click()
  await hostFrame.waitForFunction(() => document.querySelector('.employee-profile-page')?.dataset.profileView === 'company')
  check('hosted Profile keeps company/messages/plan tabs', tabs === 3, { tabs })
  await hostFrame.locator('.employee-profile-page').screenshot({ animations: 'disabled', path: path.join(outDir, 'hosted-profile.png') })

  // Edit profile: compact read-only fact summary (no disabled group/kind selects).
  await hostFrame.getByRole('button', { name: 'Edit profile', exact: true }).click()
  await hostFrame.locator('.profile-edit .employee-form').waitFor({ timeout: 15000 })
  const editForm = await hostFrame.evaluate(() => {
    const form = document.querySelector('.profile-edit .employee-form')
    if (!form) return { present: false }
    return {
      present: true,
      summary: form.querySelectorAll('.profile-fixed-summary').length,
      groupSelect: form.querySelectorAll('select[name="group"]').length,
      kindSelect: form.querySelectorAll('select[name="kind"]').length,
      titleEditable: !!form.querySelector('input[name="title"]'),
    }
  })
  check('hosted Edit profile uses compact fact summary, title editable, no immutable selects', editForm.present && editForm.summary === 1 && editForm.groupSelect === 0 && editForm.kindSelect === 0 && editForm.titleEditable, editForm)
  await hostFrame.locator('.profile-edit .employee-form').screenshot({ animations: 'disabled', path: path.join(outDir, 'hosted-edit-profile.png') })

  // Real mounted ManagementPanel (会话 -> Employee details -> Company -> Management permissions).
  // Role changes go through the actual AppSelect in the built renderer; no direct API shortcut.
  await hostFrame.getByRole('button', { name: 'Back to employee profile', exact: true }).click()
  const mgmtSelect = () => hostFrame.locator('.employee-profile-page .management-role-settings select')
  await mgmtSelect().waitFor({ timeout: 15000 })
  check('mounted Management permissions section is reachable from the Company tab', true)
  const chooseMgmt = async value => { await mgmtSelect().locator('..').locator('.app-select-trigger').click(); await hostFrame.getByRole('option', { name: value, exact: true }).click() }
  await chooseMgmt('Secretary'); await expect(mgmtSelect()).toHaveValue('secretary'); await expect(hostFrame.locator('.employee-profile-page .profile-badges')).toContainText('Secretary'); assert.equal(await mgmtRole(emp.id), 'secretary')
  await chooseMgmt('Governor'); await expect(mgmtSelect()).toHaveValue('governor'); await expect(hostFrame.locator('.employee-profile-page .profile-badges')).toContainText('Governor'); assert.equal(await mgmtRole(emp.id), 'governor')
  await chooseMgmt('Secretary'); await expect(mgmtSelect()).toHaveValue('secretary'); await expect(hostFrame.locator('.employee-profile-page .profile-badges')).toContainText('Secretary'); assert.equal(await mgmtRole(emp.id), 'secretary')
  await hostFrame.locator('.employee-profile-page .profile-section').filter({ has: hostFrame.locator('h2', { hasText: 'Management permissions' }) }).screenshot({ animations: 'disabled', path: path.join(outDir, 'hosted-management-permissions.png') })
  check('user changes a Build employee Secretary <-> Governor through the mounted AppSelect; profile badge and Core persistence follow', true)
  const openProfile = async id => {
    await hostFrame.evaluate(() => window.agents.call('view.details', { enabled: false }))
    await hostFrame.evaluate(id => window.agents.call('view.open', { kind: 'conversation', employee: id }), id)
    await hostFrame.evaluate(() => window.agents.call('view.details', { enabled: true }))
    await hostFrame.locator('.employee-profile-page[data-profile-employee="' + id + '"] .management-role-settings select').waitFor({ timeout: 30000 })
  }
  await openProfile(cloudWorkspace.id)
  await expect(hostFrame.locator('.employee-profile-page .management-role-settings option[value="secretary"][disabled]')).toHaveCount(1)
  check('cloud team-workspace employee has the Secretary option disabled in the mounted panel', true)
  await openProfile(cloudLocal.id)
  await expect(hostFrame.locator('.employee-profile-page .management-role-settings option[value="secretary"][disabled]')).toHaveCount(0)
  await chooseMgmt('Secretary'); await expect(mgmtSelect()).toHaveValue('secretary'); await expect(hostFrame.locator('.employee-profile-page .profile-badges')).toContainText('Secretary'); assert.equal(await mgmtRole(cloudLocal.id), 'secretary')
  check('cloud Team Core-local employee can be appointed Secretary through the mounted panel', true)
  // Card badges in the office reflect the persisted roles.
  await hostFrame.evaluate(() => window.agents.call('view.details', { enabled: false }))
  await hostFrame.evaluate(() => window.agents.call('view.open', { kind: 'home' }))
  await hostFrame.locator('.infinite-canvas').waitFor({ timeout: 15000 })
  await expect(hostFrame.locator('[data-card-id="' + emp.id + '"] .employee-management')).toHaveText('Secretary')
  await expect(hostFrame.locator('[data-card-id="' + cloudLocal.id + '"] .employee-management')).toHaveText('Secretary')
  check('office card badges reflect the persisted Secretary roles', true)

  // Source/renderer identity: the Core web server serves the built bundle at out/renderer.
  const rendererDir = path.join(root, 'out', 'renderer')
  const indexHtml = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8')
  const assetRel = indexHtml.match(/assets\/index-[^"']+\.js/)?.[0] ?? null
  const assetPath = assetRel ? path.join(rendererDir, assetRel) : null
  const renderer = {
    directory: 'out/renderer',
    asset: assetRel,
    assetMtime: assetPath ? fs.statSync(assetPath).mtime.toISOString() : null,
    assetSha256: assetPath ? crypto.createHash('sha256').update(fs.readFileSync(assetPath)).digest('hex') : null,
    mountMarkerInBundle: assetPath ? fs.readFileSync(assetPath, 'utf8').includes('management-role-settings') : false,
  }

  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({
    state: 'hosted-candidate',
    bridge: 'host.hello -> aexus.ready -> host.ticket -> /api/hosted/exchange',
    hostedAccepted,
    embedded: true,
    iframeOrigin: coreOrigin,
    parentOrigin,
    clientId,
    windowId,
    employee: emp.id,
    webConnectionPillCount: webConnection,
    pageErrors,
    csrfAnomalies: pageErrors.length,
    renderer,
    management: {
      path: '会话 -> Employee details -> Company -> Management permissions',
      buildEmployee: { id: emp.id, finalRole: await mgmtRole(emp.id) },
      cloudWorkspace: { id: cloudWorkspace.id, secretaryDisabled: true },
      cloudCoreLocal: { id: cloudLocal.id, finalRole: await mgmtRole(cloudLocal.id), appointedViaGui: true },
    },
    checks,
  }, null, 2))

  const failed = checks.filter(c => !c.ok)
  if (pageErrors.length) { console.error('PAGE ERRORS:', pageErrors); process.exitCode = 1 }
  if (failed.length) { console.error('FAILED CHECKS:', failed); process.exitCode = 1 }
  console.log('WROTE hosted evidence to', outDir, '| accepted:', hostedAccepted, '| web-connection pills:', webConnection, '| checks:', checks.length - failed.length + '/' + checks.length)
  for (const c of checks) console.log((c.ok ? '  ok  ' : ' FAIL ') + c.name + (c.ok ? '' : ' -> ' + JSON.stringify(c.detail)))
} catch (e) {
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({ state: 'hosted-error', error: String(e && e.stack || e), pageErrors, checks }, null, 2))
  await page?.screenshot({ animations: 'disabled', path: path.join(outDir, 'failure.png') }).catch(() => {})
  throw e
} finally {
  await browser?.close()
  server.close()
  await f.close()
  fs.rmSync(sshBin, { recursive: true, force: true })
}
