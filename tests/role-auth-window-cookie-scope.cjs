// Exact-client cookie isolation against the pinned candidate's real product UI.
// Both windows share one cookie jar; selection never depends on cookie order.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { chromium } = require('../AgentBoard/Aexus/node_modules/playwright');
const backend = process.env.CLOUD_HOSTS_TEST_BACKEND || path.resolve(__dirname, '../artifacts/Aexus.app/Contents/Resources/backend');
const backendRelease = (() => { try { return JSON.parse(fs.readFileSync(path.join(backend, 'release.json'), 'utf8')); } catch { return null; } })();
const node = process.env.CLOUD_HOSTS_TEST_NODE || path.join(path.dirname(backend), 'node');
const out = path.resolve(__dirname, '../artifacts/full-acceptance-20261015/integration');
fs.mkdirSync(out, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], notes = {};
let browser, child, home;
const check = (name, passed, detail) => { checks.push({ name, passed: !!passed, detail: detail === undefined ? '' : String(detail) }) };
const until = async (fn, timeout = 45000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await delay(100) }
  throw Error('timed out waiting for the isolated Core');
};
const expectedName = (port, clientId) => 'agents_company_session_' + port + '_' + crypto.createHash('sha256').update(clientId).digest('hex').slice(0, 12);
const frameOf = async page => {
  await page.waitForFunction(() => window.cloudHosts?.roleBoard?.ready === true, null, { timeout: 90000 });
  return (await page.locator('iframe').first().elementHandle()).contentFrame();
};
(async () => {
  try {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'aexus-window-cookie-'));
    child = spawn(node, [backend + '/cli.cjs', 'serve'], {
      env: { ...process.env, CLOUD_HOSTS_HOME: home, AGENTS_COMPANY_PROJECTS: path.join(home, 'projects'), AGENTS_COMPANY_WORKSPACES: path.join(home, 'work') },
      stdio: 'ignore'
    });
    const server = await until(() => { try { return JSON.parse(fs.readFileSync(path.join(home, 'server.json'), 'utf8')) } catch { return null } });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });

    // The hosted Core serves its own origin; that origin's port is the instance
    // tag the session cookie is scoped to (auth.ts instanceTag()).
    const openWindow = async label => {
      const page = await context.newPage();
      page.tokens = [];
      page.on('request', request => { const token = request.headers()['x-agents-csrf']; if (token && request.url().includes('/api/')) page.tokens.push(token) });
      await page.goto(server.url);
      await page.locator('#role-board-mode').click();
      const frame = await frameOf(page);
      await frame.waitForFunction(() => typeof window.agents?.call === 'function', null, { timeout: 60000 });
      await frame.evaluate(() => window.agents.call('group.list', {}));
      page.origin = new URL(frame.url()).origin;
      page.port = new URL(page.origin).port;
      page.clientId = await page.evaluate(() => window.cloudHosts.roleBoard.clientId);
      page.token = page.tokens.at(-1);
      page.expected = expectedName(page.port, page.clientId);
      const all = await context.cookies();
      page.allCookies = all.map(cookie => cookie.name);
      page.cookie = all.find(cookie => cookie.name === page.expected) || null;
      check(label + ' holds the session cookie its own client id defines',
        !!page.cookie && !!page.token,
        'clientId=' + page.clientId.slice(0, 8) + ' expected=' + page.expected + ' jar=' + page.allCookies.join(','));
      if (!page.cookie) throw Error('no instance-scoped cookie for ' + page.clientId + '; jar=' + page.allCookies.join(','));
      return page;
    };
    const p = await openWindow('The first window');
    const q = await openWindow('The second window');
    const origin = p.origin, port = p.port;

    const jar = (await context.cookies()).filter(cookie => cookie.name.startsWith('agents_company_session_' + port + '_'));
    notes.jar = jar.map(cookie => cookie.name);
    notes.clientIds = { first: p.clientId, second: q.clientId };
    check('The two windows are separate browser clients with separate instance-scoped cookies',
      p.clientId !== q.clientId && p.cookie.name !== q.cookie.name && jar.length >= 2,
      'names=' + jar.map(cookie => cookie.name.slice(-12)).join(','));
    const attempt = async (cookie, client, csrf) => {
      const response = await fetch(origin + '/api/rpc', {
        method: 'POST',
        headers: {
          Origin: origin, Cookie: cookie.name + '=' + cookie.value, 'content-type': 'application/json',
          'x-agents-client': client, ...(csrf === undefined ? {} : { 'x-agents-csrf': csrf })
        },
        body: JSON.stringify({ cmd: 'group.list', args: {} })
      });
      return response.status;
    };
    const own = await attempt(p.cookie, p.clientId, p.token);
    const foreign = await attempt(q.cookie, p.clientId, p.token);
    const foreignOwn = await attempt(q.cookie, q.clientId, q.token);
    notes.statuses = { ownCookie: own, otherWindowCookie: foreign, otherWindowOwnCookie: foreignOwn };
    check('A window writes on its own instance-scoped cookie', own === 200, 'status=' + own);
    check('The other window\'s session cookie is refused', foreign === 401, 'status=' + foreign);
    check('That other window is still authorized on its own cookie', foreignOwn === 200, 'status=' + foreignOwn);
    if(checks.some(entry=>!entry.passed))process.exitCode=1;
    fs.writeFileSync(path.join(out, 'window-cookie-scope.json'), JSON.stringify({ passed: checks.every(entry => entry.passed), checks, notes, backend, version: backendRelease && backendRelease.version, buildId: backendRelease && backendRelease.buildId }, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(out, 'window-cookie-scope.json'), JSON.stringify({ passed: false, checks, notes, error: error.stack, backend, version: backendRelease && backendRelease.version, buildId: backendRelease && backendRelease.buildId }, null, 2));
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await Promise.race([browser?.close(), delay(5000)]);
    if (child) { child.kill('SIGTERM'); await delay(1500); child.kill('SIGKILL') }
    if (home) fs.rmSync(home, { recursive: true, force: true });
    for (const entry of checks) console.log((entry.passed ? 'PASS ' : 'FAIL ') + entry.name + (entry.detail ? ' — ' + entry.detail : ''));
    console.log('WINDOW_COOKIE_SCOPE', checks.filter(entry => entry.passed).length + '/' + checks.length, checks.every(entry => entry.passed) ? 'PASS' : 'FAIL');
    process.exit(process.exitCode || 0);
  }
})();
