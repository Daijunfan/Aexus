'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { promisify } = require('node:util');
const run = promisify(require('node:child_process').execFile);
const root = path.resolve(__dirname, '..'), host = path.resolve(root, '../..');
const { _electron: electron, expect } = require(path.join(host, 'node_modules/@playwright/test'));

async function main() {
  const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'mr-team-ui-')));
  const control = path.join(temp, 'fixture'), artifacts = path.join(root, 'artifacts/agent-acceptance');
  await fs.mkdir(control); await fs.writeFile(path.join(control, 'release-all'), ''); await fs.mkdir(artifacts, { recursive: true });
  const env = { ...process.env, HOME: temp, AGENTS_COMPANY_HOME: path.join(temp, 'state'), AGENTS_COMPANY_PROJECTS: path.join(temp, 'projects'), AGENTS_COMPANY_WORKSPACES: path.join(temp, 'work'), AGENTS_COMPANY_BUILTIN_PLUGINS: path.join(temp, 'empty-builtins'), AGENTS_COMPANY_PLUGIN_DIRS: '', AGENTS_COMPANY_HIDDEN: '1', CODEX_BIN: path.join(host, 'test/fixtures/initialization-codex.cjs'), CODEX_HOME: path.join(temp, 'codex'), AC_INIT_FIXTURE: control };
  for (const key of Object.keys(env)) if (key.startsWith('AGENTS_COMPANY_TOKEN') || ['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_ALLOW_INSECURE','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_WORKSPACE'].includes(key)) delete env[key];
  const report = { passed: false, modelCalls: 0, checks: [], browserErrors: [] };
  const pass = label => { report.checks.push(label); console.log('PASS ' + label); };
  let app;
  try {
    app = await electron.launch({ executablePath: require(path.join(host, 'node_modules/electron')), args: [host], env });
    const page = await app.firstWindow(); page.on('pageerror', error => report.browserErrors.push(error.message));
    const cli = async (...args) => {
      const reply = JSON.parse((await run(process.execPath, [path.join(host, 'bin/agents'), ...args, '--json'], { env, timeout: 30000, maxBuffer: 16 * 1024 * 1024 })).stdout);
      assert(reply.ok, reply.error); return reply.data;
    };
    await page.locator('.infinite-canvas').waitFor();
    await cli('plugin', 'install', path.join(root, 'dist-plugin'));
    await page.reload(); await page.locator('.infinite-canvas').waitFor();
    await page.locator('.add-team').click();
    await page.locator('.team-form input[name="team-name"]').fill('阅读验收 Team');
    await page.locator('.team-form [data-mode="work"]').click();
    await page.locator('.team-form select[name="team-plugin"]').selectOption('margin-reader', { force: true });
    await expect(page.locator('.team-form input[name="team-root"]')).toHaveValue(new RegExp('^' + temp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/work/'));
    await expect(page.locator('.save-team')).toBeEnabled(); await page.locator('.save-team').click();
    await expect(page.locator('.team-form')).toHaveCount(0);
    const state = await cli('session', 'list');
    assert.equal(state.teamSettings['阅读验收 Team'].pluginId, 'margin-reader');
    assert(state.teamRoots['阅读验收 Team'].startsWith(temp + path.sep));
    pass('The actual Agents Company homepage form creates a Work Team bound to Margin Reader');
    await page.locator('.add-employee').click();
    await page.locator('.employee-form input[name="title"]').fill('文献助理');
    await page.locator('.employee-form select[name="group"]').selectOption('阅读验收 Team', { force: true });
    await page.locator('.employee-form [data-engine="codex"]').click();
    await page.locator('.employee-form select[name="model"]').selectOption('gpt-6-luna', { force: true });
    await page.locator('.save-employee').click(); await expect(page.locator('.employee-form')).toHaveCount(0);
    const employee = (await cli('session', 'list')).sessions.find(card => card.title === '文献助理');
    assert(employee && employee.cwd.startsWith(state.teamRoots['阅读验收 Team'] + path.sep));
    const bootstrap=await require('./host-plugin-bootstrap.cjs').reference({cli,workspace:employee.cwd,scope:['--employee',employee.id],home:env.AGENTS_COMPANY_HOME});
    const schema=bootstrap.schema;report.bootstrapLayout=bootstrap.layout;
    assert.equal(schema.commands.length, require('../schema.json').commands.length);
    await expect.poll(async () => (await cli('session', 'status', '--employee', employee.id))[0].initialization.status).toBe('ready');
    pass('The homepage-created employee is ready and receives all declared CLI commands through the current host bootstrap');
    await cli('session', 'open', employee.id);
    const credential = await cli('auth', 'agent-token', employee.id);
    const agentEnv = { ...env, AGENTS_COMPANY_EMPLOYEE: employee.id, AGENTS_COMPANY_TOKEN_FILE: credential.file, AGENTS_COMPANY_PLUGIN_RPC: '' };
    const launcher=await require('./host-plugin-bootstrap.cjs').launcherFor({workspace:employee.cwd,credential,layout:bootstrap.layout});
    const agent = async (method, params = {}) => {
      const reply = JSON.parse((await run(launcher, ['api', method, '--data', JSON.stringify(params)], { cwd: employee.cwd, env: agentEnv, timeout: 30000, maxBuffer: 8 * 1024 * 1024 })).stdout);
      assert(!reply.error, JSON.stringify(reply.error)); return reply.result;
    };
    await agent('fs.write', { path: '团队阅读.md', content: '# 文献助理\n\n员工通过正式 CLI 创建的内容，原生插件窗口同步显示。' });
    const doc = await agent('document.open', { path: '团队阅读.md' });
    const opened = app.waitForEvent('window');
    await cli('plugin', 'open', 'margin-reader', '--employee', employee.id);
    const reader = await opened; reader.on('pageerror', error => report.browserErrors.push(error.message));
    await reader.waitForSelector('body[data-ready="true"]');
    await expect(reader.locator('.flow-document')).toContainText('员工通过正式 CLI 创建的内容');
    await agent('toc.add', { id: doc.id, expectedRevision: doc.revision, title: '员工同步章节', locator: { section: 0 } });
    await expect(reader.locator('.outline-row')).toContainText(['文献助理', '员工同步章节']);
    await agent('settings.set', { theme: 'dark' }); await expect(reader.locator('body')).toHaveAttribute('data-theme', 'dark');
    await reader.screenshot({ path: path.join(artifacts, 'employee-native-reader.png') });
    pass('The generated employee launcher controls content, outline and appearance in the matching native plugin window');
    await agent('settings.set', { lastDocument: null, currentFolder: '.' });
    await expect(reader.locator('#library-view')).toBeVisible(); await expect(reader.locator('#reader-view')).toBeHidden();
    pass('Employee CLI navigation and the native reader stay synchronized without a manual refresh');
    assert(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(window => !window.isVisible())));
    report.fixtureActivity=await require('./host-plugin-bootstrap.cjs').verifyFixtureOnly(control,[employee.id]);
    assert.deepEqual(report.browserErrors, []);
    pass('All test windows remain hidden; only deterministic identity/index initialization is permitted, with no real models or uncaught browser errors');
    report.passed = true;
  } finally {
    await fs.writeFile(path.join(artifacts, 'team-ui.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close(); await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
