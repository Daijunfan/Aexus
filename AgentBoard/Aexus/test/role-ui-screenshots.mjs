// Role UI screenshot harness (current candidate state).
// Usage: node test/role-ui-screenshots.mjs
// Drives the real renderer via AGENTS_COMPANY_WEB + a deterministic local Core fixture
// (no real model, isolated AGENTS_COMPANY_HOME). zh-CN light/dark desktop+narrow, plus a
// selected English desktop pass. Covers conversation, profile, edit, settings, group chat,
// Company, Plan and the simplified Team form.
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {chromium} from '@playwright/test'
import {fixtureCore} from './fixtures/headless-core.mjs'

const root = path.resolve(import.meta.dirname, '..')
const outDir = path.resolve(import.meta.dirname, '../../../artifacts/role-parity-20261015/ui-screenshots', 'candidate')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const probe = net.createServer()
await new Promise(r => probe.listen(0, '127.0.0.1', r))
const port = probe.address().port
await new Promise(r => probe.close(r))

const head = (await promisify(execFile)('git', ['rev-parse', '--short', 'HEAD'], { cwd: root })).stdout.trim()

const f = await fixtureCore({ AGENTS_COMPANY_WEB: '1', AGENTS_COMPANY_WEB_PORT: String(port) })
let browser, page
const errors = []
let cwd = ''
try {
  await f.cli('group', 'add', 'Design Studio')
  const emp = await f.create('Aster', 'Design Studio')
  await f.cli('card', 'avatar', emp.id, 'fate-saber-chibi')

  // --- Representative company: a second team plus several teammates so the office
  //     canvas shows real cooperation instead of one sparse room ---
  await f.cli('group', 'add', 'Platform Core')
  const nova = await f.create('Nova', 'Design Studio')
  const kite = await f.create('Kite', 'Design Studio')
  const lumen = await f.create('Lumen', 'Design Studio')
  const rook = await f.create('Rook', 'Platform Core')
  const vale = await f.create('Vale', 'Platform Core')
  await f.cli('card', 'avatar', nova.id, 'claude-axolotl')
  await f.cli('card', 'avatar', kite.id, 'voltcoin')
  await f.cli('card', 'avatar', lumen.id, 'inky')
  await f.cli('card', 'avatar', rook.id, 'rocky')
  await f.cli('card', 'avatar', vale.id, 'marmalade')

  // --- Deterministic private transcript (turn 1 code, turn 2 prose) ---
  fs.writeFileSync(path.join(f.control, emp.id + '.reply.txt'),
    '这里的工作区已经就绪。\n\n读取顶层文件可以这样写：\n\n```ts\nimport { readdirSync } from "node:fs"\nconst entries = readdirSync(process.cwd())\nconsole.log(entries.filter(name => !name.startsWith(".")))\n```\n\n引擎与权限沿用创建时的配置，无需再手动指定。')
  const catalog = await f.cli('workspace', 'catalog', '--employee', emp.id)
  cwd = catalog.workspaces.find(w => w.view === 'company').path
  fs.mkdirSync(path.join(cwd, 'src'), { recursive: true })
  fs.writeFileSync(path.join(cwd, 'README.md'), '# Aster workspace\n\nDemo tree for the Role workbench.\n')
  fs.writeFileSync(path.join(cwd, 'src', 'main.ts'), 'export function ready(): boolean { return true }\n')
  fs.writeFileSync(path.join(cwd, 'notes.md'), '工作区里还有一份手写笔记，作为附件一并查看。\n')
  await f.cli('session', 'send', '--employee', emp.id, '--text', '帮我看看这个工作区的文件结构。', '--files', '["notes.md"]')
  await f.until(async () => !(await f.status(emp.id)).busy, 'fixture reply 1')

  fs.writeFileSync(path.join(f.control, emp.id + '.reply.txt'), '收到，笔记已经放在工作区根目录。接下来可以继续扩充文件树，或直接告诉我你想先完成哪一步。')
  await f.cli('session', 'send', '--employee', emp.id, '--text', '好的，代码示例保留语言标记。')
  await f.until(async () => !(await f.status(emp.id)).busy, 'fixture reply 2')

  // --- Group chat with a code block (multi-word text goes through --file) ---
  const group = await f.cli('chat', 'create', '--name', '讨论空间', '--members', JSON.stringify([emp.id]))
  fs.writeFileSync(path.join(f.control, 'group1.txt'), '本周完成工作区的初始化，并把文件结构整理到 README。')
  fs.writeFileSync(path.join(f.control, 'group2.txt'), '关键接口如下：\n\n```ts\nexport function ready(): boolean { return true }\n```')
  await f.cli('chat', 'post', group.id, '--kind', 'message', '--file', path.join(f.control, 'group1.txt'))
  await f.cli('chat', 'post', group.id, '--kind', 'message', '--file', path.join(f.control, 'group2.txt'))

  // --- One recurring schedule so Plan has a representative row ---
  await f.cli('schedule', 'create', '--name', '每周回顾', '--employee', emp.id, '--prompt', '整理本周进展并输出一份简短总结。', '--time', '09:00', '--days', '1,3,5', '--timezone', 'Asia/Shanghai')

  browser = await chromium.launch({ ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}), headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } })
  page = await context.newPage()
  page.setDefaultTimeout(30000)
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:' + port)
  await page.locator('.web-login input').fill(fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME, 'control.token'), 'utf8').trim())
  await page.getByRole('button', { name: 'Enter workspace', exact: true }).click()
  await page.waitForSelector('.infinite-canvas')

  const call = (cmd, args = {}) => page.evaluate(([cmd, args]) => window.agents.call(cmd, args), [cmd, args])
  const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  const shot = async name => { await settle(); await page.screenshot({ animations: 'disabled', path: path.join(outDir, name + '.png') }) }
  const setTheme = async theme => { await call('settings.set', { viewAppearance: { company: { theme } } }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme) }
  const desktop = () => page.setViewportSize({ width: 1440, height: 980 })
  const narrow = () => page.setViewportSize({ width: 390, height: 900 })
  const filesToggle = () => page.locator('[data-panel-toggle="files"]')
  const editButton = () => page.locator('[data-profile-action="edit"]')

  const openConversation = async () => { await call('view.open', { kind: 'conversation', employee: emp.id }); await page.waitForSelector('.conversation-dialog') }
  const openProfile = async () => { await call('view.details', { enabled: true }); await page.waitForSelector('.employee-inspector .employee-profile-page') }
  const openEdit = async () => { const btn = editButton(); await btn.scrollIntoViewIfNeeded(); await btn.waitFor({ state: 'visible' }); if (await btn.isEnabled()) { await btn.click(); await page.waitForSelector('.profile-edit .employee-form') } }
  const openSettings = async () => { await call('view.open', { kind: 'settings' }); await page.waitForSelector('.view-preferences-panel') }
  const openGroup = async () => { await call('view.open', { kind: 'messages', chatId: group.id }); await page.waitForSelector('.group-conversation'); await page.locator('.group-message', { hasText: '关键接口如下' }).first().waitFor() }
  const openPlan = async () => { await call('view.open', { kind: 'plan' }); await page.waitForSelector('.plan-view'); await page.getByText('每周回顾', { exact: false }).first().waitFor() }
  const openTeam = async () => { await call('view.open', { kind: 'team' }); await page.waitForSelector('.team-form') }
  const openCompany = async () => { await call('view.open', { kind: 'home' }); await page.waitForSelector('.infinite-canvas') }

  const matrix = [
    { lang: 'zh-CN', tag: 'zh', themes: ['white', 'midnight'], narrow: true },
    { lang: 'en', tag: 'en', themes: ['white'], narrow: false },
  ]

  for (const { lang, tag, themes, narrow: withNarrow } of matrix) {
    await call('settings.set', { language: lang })
    for (const theme of themes) {
      await setTheme(theme)

      // Desktop pass
      await desktop()
      await openConversation()
      await page.waitForSelector('.workbench-panel-bar')
      await shot(`conversation-${tag}-${theme}-1440`)
      await filesToggle().click()
      await page.waitForSelector('.employee-workbench[data-files-panel=open]')
      await shot(`conversation-files-${tag}-${theme}-1440`)
      await filesToggle().click()
      await page.waitForSelector('.employee-workbench[data-files-panel=closed]')

      await openProfile()
      await shot(`profile-${tag}-${theme}-1440`)
      await openEdit()
      await shot(`edit-${tag}-${theme}-1440`)

      await openSettings()
      await shot(`settings-${tag}-${theme}-1440`)
      await page.locator('.settings-employee-defaults>summary').click()
      await page.waitForSelector('.settings-employee-defaults[open]')
      await shot(`settings-defaults-${tag}-${theme}-1440`)
      await page.locator('.settings-engines>summary').click()
      await page.waitForSelector('.settings-engines[open]')
      await page.locator('.settings-scroll-body').evaluate(el => { el.scrollTop = el.scrollHeight })
      await shot(`settings-engines-${tag}-${theme}-1440`)

      await openGroup()
      await shot(`group-${tag}-${theme}-1440`)
      await openPlan()
      await shot(`plan-${tag}-${theme}-1440`)
      await openTeam()
      await shot(`team-${tag}-${theme}-1440`)
      await openCompany()
      await shot(`company-${tag}-${theme}-1440`)

      // Narrow pass (zh-CN only — the overflow acceptance surface)
      if (withNarrow) {
        await narrow()
        await openConversation()
        await shot(`conversation-${tag}-${theme}-390`)
        await openProfile()
        await shot(`profile-${tag}-${theme}-390`)
        await openEdit()
        await shot(`edit-${tag}-${theme}-390`)
        await openSettings()
        await shot(`settings-${tag}-${theme}-390`)
        await openGroup()
        await shot(`group-${tag}-${theme}-390`)
        await openPlan()
        await shot(`plan-${tag}-${theme}-390`)
        await openTeam()
        await shot(`team-${tag}-${theme}-390`)
        await openCompany()
        await shot(`company-${tag}-${theme}-390`)
      }
    }
  }

  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({
    head,
    state: 'candidate',
    languages: ['zh-CN', 'en (selected, white desktop)'],
    themes: ['white', 'midnight'],
    viewports: ['1440x980', '390x900'],
    employee: emp.id,
    group: group.id,
    workspace: cwd,
    sourceFiles: [
      'src/renderer/src/components/EmployeeProfile.tsx',
      'src/renderer/src/components/ConversationBody.tsx',
      'src/renderer/src/office/OfficeForms.tsx',
      'src/renderer/src/styles/themes.css',
      'src/renderer/src/styles/employee-profile.css',
      'src/renderer/src/styles/employee-workbench.css',
      'src/renderer/src/i18n/zh-CN.ts',
    ],
    pageErrors: errors,
  }, null, 2))
  if (errors.length) { console.error('PAGE ERRORS:', errors); process.exitCode = 1 }
  console.log('WROTE screenshots to', outDir)
} catch (e) {
  await page?.screenshot({ animations: 'disabled', path: path.join(outDir, 'failure.png') }).catch(() => {})
  throw e
} finally {
  await browser?.close()
  await f.close()
}
