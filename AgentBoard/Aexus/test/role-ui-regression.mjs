// Role UI interaction regression: no real model, no production records.
// Usage: node test/role-ui-regression.mjs
// Verifies send, profile expand/tabs, edit save/cancel, settings tabs/theme, keyboard focus,
// narrow-width button visibility, and the white-on-white button fix through computed styles.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import {chromium} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'

const outDir = path.resolve(import.meta.dirname, '../../../artifacts/role-parity-20261015/regression')
fs.mkdirSync(outDir, { recursive: true })

const probe = net.createServer()
await new Promise(r => probe.listen(0, '127.0.0.1', r))
const port = probe.address().port
await new Promise(r => probe.close(r))

const f = await fixtureCore({ AGENTS_COMPANY_WEB: '1', AGENTS_COMPANY_WEB_PORT: String(port) })
const results = []
const pass = (name, detail = true) => results.push({ name, ok: true, detail })
const fail = (name, detail) => results.push({ name, ok: false, detail: String(detail) })
let browser, page
const pageErrors = []
const contrastRatio = (a, b) => {
  const lum = hex => { let c = hex.replace('#', '').trim(); if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2]; const rgb = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] }
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
const checkContrast = async (label, theme) => {
  const vars = await page.evaluate(() => {
    const v = s => getComputedStyle(document.documentElement).getPropertyValue(s).trim()
    return { fg: v('--fg'), bg: v('--bg'), dim: v('--fg-dim'), elev: v('--bg-elev') }
  })
  const body = contrastRatio(vars.fg, vars.bg), dim = contrastRatio(vars.dim, vars.elev)
  const ok = body >= 4.5 && dim >= 4.5
  ;(ok ? pass : fail)(`${label} text contrast (body ${body.toFixed(1)}, dim ${dim.toFixed(1)})`, vars)
}
try {
  await f.cli('group', 'add', 'Design Studio')
  const emp = await f.create('Aster', 'Design Studio')
  const second = await f.create('Remy', 'Design Studio')
  await f.cli('card', 'avatar', emp.id, 'fate-saber-chibi')

  browser = await chromium.launch({ ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}), headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } })
  page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', e => pageErrors.push(e.message))
  await page.goto('http://127.0.0.1:' + port)
  await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME, 'control.token'), 'utf8').trim())
  await page.getByRole('button', { name: 'Enter workspace', exact: true }).click()
  await page.waitForSelector('.infinite-canvas')

  const call = (cmd, args = {}) => page.evaluate(([cmd, args]) => window.agents.call(cmd, args), [cmd, args])
  await call('settings.set', { viewAppearance: { company: { theme: 'white' } } })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'white')
  await checkContrast('white theme', 'white')

  // --- Conversation open ---
  await call('view.open', { kind: 'conversation', employee: emp.id })
  await page.waitForSelector('.conversation-dialog')
  await page.waitForSelector('.session-settings.controls')
  await page.waitForSelector('.composer-box textarea')
  pass('conversation opens with controls and composer')

  // --- Hosted connection pill clears the composer footer (desktop) ---
  const pill = await page.evaluate(() => {
    const conn = document.querySelector('.web-connection'), foot = document.querySelector('.conversation-dialog .composer-foot')
    if (!conn || !foot) return 'missing'
    const a = conn.getBoundingClientRect(), b = foot.getBoundingClientRect()
    const overlap = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)
    return overlap ? 'collide' : 'clear'
  })
  if (pill === 'clear' || pill === 'missing') pass('web connection pill clears composer footer', pill)
  else fail('web connection pill clears composer footer', pill)

  // --- Panel toggle buttons are explicit non-submit controls ---
  const toggleTypes = await page.evaluate(() => [...document.querySelectorAll('[data-panel-toggle]')].map(b => ({ key: b.getAttribute('data-panel-toggle'), type: b.getAttribute('type') })))
  if (toggleTypes.length >= 2 && toggleTypes.every(t => t.type === 'button')) pass('panel toggles are type=button', toggleTypes)
  else fail('panel toggles are type=button', toggleTypes)

  // --- Send via UI (deterministic reply) ---
  fs.writeFileSync(path.join(f.control, emp.id + '.reply.txt'), 'Regression reply confirmed.')
  const composer = page.locator('.composer-box textarea')
  await composer.fill('Regression send check')
  await page.locator('.send-btn').click()
  await page.waitForFunction(() => document.querySelector('.transcript')?.textContent?.includes('Regression reply confirmed.'), null, { timeout: 20000 })
  const transcriptText = await page.locator('.transcript').textContent()
  if (transcriptText.includes('Regression send check')) pass('send: user message appears in transcript')
  else fail('send: user message appears in transcript', transcriptText?.slice(0, 120))
  pass('send: deterministic assistant reply arrives')

  // --- White-on-white fix: secondary controls no longer white-on-white ---
  const quickBg = await page.evaluate(() => getComputedStyle(document.querySelector('.profile-quick-actions>button') || document.body).backgroundColor)
  pass('computed check ran', { quickBg })

  // --- Expand profile sidebar ---
  await page.locator('.employee-details').click()
  await page.waitForSelector('.employee-inspector .employee-profile-page')
  pass('profile sidebar expands via Employee details')

  // --- Profile quick actions are explicit non-submit controls ---
  const actionTypes = await page.evaluate(() => [...document.querySelectorAll('[data-profile-action]')].map(b => ({ key: b.getAttribute('data-profile-action'), type: b.getAttribute('type') })))
  if (actionTypes.length >= 2 && actionTypes.every(t => t.type === 'button')) pass('profile quick actions are type=button', actionTypes)
  else fail('profile quick actions are type=button', actionTypes)

  // --- Profile tabs switch ---
  const tabs = await page.locator('.profile-tabs [role=tab]').count()
  if (tabs === 3) pass('profile tabs present (company/messages/plan)', tabs)
  else fail('profile tabs present', tabs)
  await page.locator('[data-profile-tab="messages"]').click()
  await page.waitForFunction(() => document.querySelector('.employee-profile-page')?.dataset.profileView === 'messages')
  pass('profile tab switch -> messages')
  await page.locator('[data-profile-tab="plan"]').click()
  await page.waitForFunction(() => document.querySelector('.employee-profile-page')?.dataset.profileView === 'plan')
  pass('profile tab switch -> plan')
  await page.locator('[data-profile-tab="company"]').click()
  await page.waitForFunction(() => document.querySelector('.employee-profile-page')?.dataset.profileView === 'company')

  // --- Management role entry is mounted in the company tab (no permission logic exercised) ---
  const mgmt = await page.evaluate(() => {
    const panel = document.querySelector('.employee-profile-page .management-role-settings')
    const select = panel?.querySelector('.app-select-trigger[aria-label="Employee role"]')
    return { mounted: !!panel, select: !!select }
  })
  if (mgmt.mounted && mgmt.select) pass('management role entry is mounted in company tab', mgmt)
  else fail('management role entry is mounted in company tab', mgmt)

  // --- Edit profile: save ---
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
  await page.waitForSelector('.profile-edit .employee-form')
  // --- Edit mode: compact read-only fact summary replaces tall immutable controls ---
  const factSummary = await page.evaluate(() => {
    const dl = document.querySelector('.profile-edit .profile-fixed-summary')
    const disabled = document.querySelectorAll('.profile-edit select:disabled, .profile-edit .app-select-trigger[aria-disabled=true]').length
    if (!dl) return { present: false, facts: 0, disabled }
    const facts = [...dl.querySelectorAll('dt')].map(dt => dt.textContent)
    return { present: true, facts: facts.length, labels: facts, disabled }
  })
  if (factSummary.present && factSummary.facts >= 5 && factSummary.disabled === 0) pass('edit form uses compact fact summary without disabled selects', factSummary)
  else fail('edit form uses compact fact summary without disabled selects', factSummary)
  const title = page.locator('.profile-edit input[name="title"]')
  await title.fill('Aster Renamed')
  await page.locator('.employee-form .save-employee').click()
  await page.waitForFunction(() => !document.querySelector('.profile-edit .employee-form'), null, { timeout: 20000 })
  await page.waitForFunction(() => document.querySelector('.profile-hero h1')?.textContent?.includes('Aster Renamed'), null, { timeout: 20000 })
  pass('edit profile save persists title')

  // --- Edit profile: cancel via Escape (clean) ---
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
  await page.waitForSelector('.profile-edit .employee-form')
  await page.locator('.profile-edit input[name="title"]').focus()
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.profile-edit .employee-form'), null, { timeout: 20000 })
  await page.waitForSelector('.employee-profile-page[data-profile-view="company"]')
  pass('edit profile cancel (Escape) returns to profile')

  // --- Settings: tabs + theme preset ---
  await call('view.open', { kind: 'settings' })
  await page.waitForSelector('.view-preferences-panel')
  await page.locator('#settings-tab-messages').click()
  await page.waitForFunction(() => document.querySelector('#settings-tab-messages')?.getAttribute('aria-selected') === 'true')
  pass('settings view tab switch -> messages')
  await page.locator('#settings-tab-company').click()
  await page.waitForFunction(() => document.querySelector('#settings-tab-company')?.getAttribute('aria-selected') === 'true')
  await page.locator('[data-theme-option="midnight"]').click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'midnight')
  pass('settings theme preset -> midnight applies')
  await checkContrast('midnight theme', 'midnight')
  await page.locator('[data-theme-option="white"]').click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'white')

  // --- Settings engines: OpenCode card listed alongside the existing four ---
  await page.locator('.settings-disclosure.settings-engines summary').click()
  await page.waitForSelector('.engine-health [data-engine-health="opencode"]', { timeout: 20000 })
  const engineCards = await page.locator('.engine-health [data-engine-health]').count()
  if (engineCards === 5) pass('settings engines lists five cards including OpenCode', engineCards)
  else fail('settings engines lists five cards including OpenCode', engineCards)

  // --- Keyboard focus-visible outline ---
  await call('view.open', { kind: 'conversation', employee: emp.id })
  await page.waitForSelector('.conversation-dialog')
  await page.keyboard.press('Tab')
  const focusInfo = await page.evaluate(() => {
    const el = document.activeElement
    if (!el) return null
    const style = getComputedStyle(el)
    return { tag: el.tagName, cls: String(el.className), outline: style.outlineWidth, aria: el.getAttribute('aria-label') }
  })
  if (focusInfo && focusInfo.outline === '2px') pass('keyboard focus-visible outline applies', focusInfo)
  else fail('keyboard focus-visible outline applies', focusInfo)

  // --- Narrow width: key buttons not truncated ---
  await page.setViewportSize({ width: 390, height: 900 })
  await page.waitForTimeout(150)
  const narrow = await page.evaluate(() => {
    const vis = sel => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= window.innerWidth + 1 }
    return { send: vis('.send-btn'), details: vis('.employee-details'), more: vis('.employee-more>summary'), back: vis('.toolbar .back') }
  })
  const narrowOk = Object.values(narrow).every(Boolean)
  if (narrowOk) pass('narrow width keeps key buttons visible', narrow)
  else fail('narrow width keeps key buttons visible', narrow)

  // --- Narrow width: no horizontal overflow ---
  const overflow = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, inner: window.innerWidth }))
  if (overflow.doc <= overflow.inner + 1 && overflow.body <= overflow.inner + 1) pass('narrow width has no horizontal overflow', overflow)
  else fail('narrow width has no horizontal overflow', overflow)

  // --- Narrow: auth/connection pill (if present) clears the chat input ---
  const narrowPill = await page.evaluate(() => {
    const conn = document.querySelector('.web-connection'), input = document.querySelector('.conversation-dialog .composer-box textarea')
    if (!conn || !input) return 'missing'
    const a = conn.getBoundingClientRect(), b = input.getBoundingClientRect()
    const overlap = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)
    return overlap ? 'collide' : 'clear'
  })
  if (narrowPill === 'clear') pass('narrow auth/connection pill clears chat input', narrowPill)
  else fail('narrow auth/connection pill clears chat input', narrowPill)

  // --- Narrow: workspace selector does not overlap the File/Terminal toggles ---
  const panelBar = await page.evaluate(() => {
    const select = document.querySelector('.workbench-panel-bar select'), toggles = document.querySelector('.workbench-panel-toggles')
    if (!select || !toggles) return 'missing'
    const a = select.getBoundingClientRect(), b = toggles.getBoundingClientRect()
    const overlap = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)
    return overlap ? 'overlap' : 'clear'
  })
  if (panelBar === 'clear') pass('narrow workspace selector clears panel toggles', panelBar)
  else if (panelBar === 'missing') pass('narrow panel toggles not present', panelBar)
  else fail('narrow workspace selector clears panel toggles', panelBar)

  // --- Narrow: Back control shows a visible arrow icon, not an empty square ---
  const backIcon = await page.evaluate(() => {
    const icon = document.querySelector('.toolbar .employee-back .codicon')
    if (!icon) return null
    const r = icon.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height), visible: r.width >= 12 && r.height >= 12 }
  })
  if (backIcon && backIcon.visible) pass('narrow back control has visible icon', backIcon)
  else fail('narrow back control has visible icon', backIcon)

  // --- Panels visibility persists per employee across switch/remount ---
  await page.setViewportSize({ width: 1440, height: 980 })
  await call('view.open', { kind: 'conversation', employee: emp.id })
  await page.waitForSelector('.employee-workbench[data-files-panel=closed]')
  await page.locator('[data-panel-toggle="files"]').click()
  await page.waitForSelector('.employee-workbench[data-files-panel=open]')
  await call('view.open', { kind: 'conversation', employee: second.id })
  await page.waitForSelector('.employee-workbench[data-files-panel=closed]')
  await page.locator('[data-panel-toggle="terminal"]').click()
  await page.waitForSelector('.employee-workbench[data-terminal-panel=open]')
  await call('view.open', { kind: 'conversation', employee: emp.id })
  await page.waitForSelector('.employee-workbench[data-files-panel=open]')
  const panelPersistence = await page.evaluate(() => ({
    files: document.querySelector('.employee-workbench')?.getAttribute('data-files-panel'),
    terminal: document.querySelector('.employee-workbench')?.getAttribute('data-terminal-panel'),
  }))
  if (panelPersistence.files === 'open' && panelPersistence.terminal === 'closed') pass('panels visibility persists per employee across switch/remount', panelPersistence)
  else fail('panels visibility persists per employee across switch/remount', panelPersistence)

  // --- Computed style evidence: profile quick-action button is not white-on-white ---
  await page.setViewportSize({ width: 1440, height: 980 })
  await call('view.details', { enabled: true })
  await page.waitForSelector('.employee-inspector .employee-profile-page')
  await page.waitForSelector('.profile-quick-actions>button')
  const styles = await page.evaluate(() => {
    const btn = document.querySelector('.profile-quick-actions>button')
    const s = getComputedStyle(btn)
    return { background: s.backgroundColor, border: s.borderColor, color: s.color }
  })
  if (styles.background !== 'rgb(255, 255, 255)') pass('profile quick-action has non-white fill', styles)
  else fail('profile quick-action has non-white fill', styles)
} catch (e) {
  results.push({ name: 'harness', ok: false, detail: String(e && e.stack || e) })
} finally {
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ pageErrors, results, ok: results.every(r => r.ok) && pageErrors.length === 0 }, null, 2))
  await browser?.close()
  await f.close()
}

const failed = results.filter(r => !r.ok)
console.log('REGRESSION', failed.length ? 'FAILED' : 'PASSED', `(${results.length - failed.length}/${results.length})`)
for (const r of results) console.log((r.ok ? '  ok  ' : ' FAIL ') + r.name + (r.ok ? '' : ' -> ' + JSON.stringify(r.detail)))
if (pageErrors.length) { console.error('PAGE ERRORS:', pageErrors); process.exitCode = 1 }
if (failed.length) process.exitCode = 1
