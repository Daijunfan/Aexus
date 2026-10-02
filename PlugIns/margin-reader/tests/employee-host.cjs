'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const run = promisify(require('node:child_process').execFile);
const root = path.resolve(__dirname, '..'), host = path.resolve(root, '../..');
const reportFile = path.join(root, 'artifacts/agent-acceptance/employee-host.json');
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'mr-employee-home-'));
  const { fixtureCore } = await import(pathToFileURL(path.join(host, 'test/fixtures/headless-core.mjs')));
  let fixture;
  const report = { passed: false, modelCalls: 0, checks: [], platform: process.platform, node: process.version };
  try {
    fixture = await fixtureCore({ HOME: temp, AGENTS_COMPANY_BUILTIN_PLUGINS: path.join(temp, 'empty-builtins'), AGENTS_COMPANY_PLUGIN_DIRS: '', AGENTS_COMPANY_PLUGIN_RPC: '', AGENTS_WORKSPACE: '' });
    const f = fixture;
    const pass = label => { report.checks.push(label); console.log('PASS ' + label); };
    await f.cli('plugin', 'install', path.join(root, 'dist-plugin'));
    await f.cli('group', 'add', 'Reader Team', '--mode', 'work', '--plugin', 'margin-reader');
    await f.cli('group', 'add', 'Other Team', '--mode', 'work', '--plugin', 'margin-reader');
    const employee = await f.create('Reader employee', 'Reader Team');
    const other = await f.create('Other employee', 'Other Team');
    assert(employee.cwd.startsWith(f.temp + path.sep)); assert(other.cwd.startsWith(f.temp + path.sep));
    const bootstrap=await require('./host-plugin-bootstrap.cjs').reference({cli:f.cli,workspace:employee.cwd,scope:['--employee',employee.id],home:f.env.AGENTS_COMPANY_HOME});
    const guide=bootstrap.guide,boundSchema=bootstrap.schema;
    assert.equal(boundSchema.commands.length, require('../schema.json').commands.length);
    assert(guide.includes('study.card.create') && guide.includes('study.search'));
    await f.cli('session', 'open', employee.id);
    const credential = await f.cli('auth', 'agent-token', employee.id);
    const env = { ...f.env, AGENTS_COMPANY_EMPLOYEE: employee.id, AGENTS_COMPANY_TOKEN_FILE: credential.file, AGENTS_COMPANY_PLUGIN_RPC: '' };
    delete env.AGENTS_COMPANY_TOKEN;
    const launcher = await require('./host-plugin-bootstrap.cjs').launcherFor({workspace:employee.cwd,credential,layout:bootstrap.layout});
    if(bootstrap.layout==='host-runtime'){
      const docs=await f.request(credential.token,'api.docs',{document:'plugin/margin-reader/command/study.library.move'});assert(docs.ok,docs.error);assert.equal(JSON.parse(docs.data.markdown).method,'study.library.move');
    }
    report.bootstrapLayout=bootstrap.layout;
    const raw = async (method, params = {}) => {
      let stdout, failed = false;
      try { ({ stdout } = await run(launcher, ['api', method, '--data', JSON.stringify(params)], { cwd: employee.cwd, env, timeout: 45000, maxBuffer: 32 * 1024 * 1024 })); }
      catch (error) { if (!error.stdout) throw error; stdout = error.stdout; failed = true; }
      const reply = JSON.parse(stdout); assert.equal(Boolean(reply.error), failed, 'CLI exit status must match its JSON-RPC result'); return reply;
    };
    assert.equal((await raw('system.info')).result.workspace, employee.cwd);
    pass('New Work Team employee receives complete docs, schema and a working scope-bound generated launcher');
    report.surface = await require('./agent-surface.cjs').exercise(raw);
    report.surface.guardedOnlyMethods = Object.keys(report.surface.guardedMethods).filter(method => !report.surface.successfulMethods.includes(method));
    pass(`Actual employee mailbox exercised all ${report.surface.declared} declared commands; ${report.surface.successfulMethods.length} successful and ${report.surface.guardedOnlyMethods.length} guarded-only methods`);
    const original = await fs.readFile(path.join(employee.cwd, 'Books/source.pdf'));
    assert.equal(createHash('sha256').update(original).digest('hex'), report.surface.sourceHash);
    const exported = JSON.parse(await fs.readFile(path.join(employee.cwd, 'Exports/study.json'), 'utf8'));
    assert(exported.set.cards.some(card => card.image?.contentBase64));
    pass('Page editing, handwriting, capture and portable export preserve the original PDF and durable excerpt image');
    const own = await f.request(credential.token, 'plugin.call', { id: 'margin-reader', method: 'study.get', params: { setId: report.surface.studySetId }, employee: employee.id });
    assert.equal(own.data.id, report.surface.studySetId);
    for (const selector of [{ employee: other.id }, { team: 'Reader Team' }, { team: 'Other Team' }]) {
      const denied = await f.request(credential.token, 'plugin.call', { id: 'margin-reader', method: 'fs.list', ...selector });
      assert.equal(denied.ok, false);
    }
    const otherSets = await f.cli('plugin', 'call', 'margin-reader', 'study.list', '--employee', other.id);
    assert.equal(otherSets.sets.length, 0);
    await assert.rejects(run(launcher, ['--workspace', path.dirname(employee.cwd), 'tree'], { cwd: employee.cwd, env }), error => error.code === 2);
    pass('Employee identity cannot select a sibling, Team root, other Team or override its launcher scope');
    await f.stop(); await f.start(); await f.cli('session', 'open', employee.id);
    const restored = await raw('study.get', { setId: report.surface.studySetId });
    assert(!restored.error); assert(restored.result.cards.length >= 4);
    assert.equal((await raw('document.get', { id: report.surface.documentId })).result.id, report.surface.documentId);
    pass('Core restart preserves employee IDs, document IDs, study relationships and mailbox operation');
    const revoked = await f.request(null, 'auth.revoke', { id: employee.id });
    // Use the documented CLI spelling below when the Core names this operation differently.
    if (!revoked.ok) await f.cli('auth', 'revoke', employee.id);
    const denied = await raw('settings.get'); assert(denied.error);
    pass('Revoked employee credentials do not fall back to an operator or standalone runtime');
    report.fixtureActivity=await require('./host-plugin-bootstrap.cjs').verifyFixtureOnly(f.control,[employee.id,other.id]);
    pass('Only deterministic host-required identity/index initialization ran; no user work turns, real models, visible windows or real user Team changes');
    report.passed = true;
  } finally {
    await fs.mkdir(path.dirname(reportFile), { recursive: true });
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
    await fixture?.close(); await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
