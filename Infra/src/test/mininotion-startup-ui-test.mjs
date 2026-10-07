// Cold process startup, not a prewarmed plugin: no plugin API before the first open.
// Optional real fixtures are copied into an isolated home, never edited in place.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url), { _electron: electron, expect } = require('@playwright/test');
const root = path.resolve(import.meta.dirname,'../../..'), run = promisify(execFile);
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mn-startup-ui-')));
const workspace = path.join(temp, 'work/mini-notion-workspace');
const out = process.env.AGENTS_COMPANY_TEST_ARTIFACTS || path.join(root, '.aexus/artifacts/mininotion-startup-ui');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(workspace, { recursive: true });
if (process.env.MININOTION_PERFORMANCE_FIXTURE) {
  fs.cpSync(process.env.MININOTION_PERFORMANCE_FIXTURE, workspace, { recursive: true });
} else {
  // Generate a durable existing notebook offline; no socket, GUI or running backend.
  const bundle = path.join(temp, 'seed.cjs');
  await build({ stdin: { contents: `
    import fs from 'node:fs';import path from 'node:path';
    import { DataService } from './Infra/src/backend/service';
    import { makePage } from './Infra/src/model';
    export async function seed(root) {
      const main=makePage({id:'startup-main',title:'Startup notebook',color:'white'});
      const save=(directory,page)=>{fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'index.mininotion.json'),JSON.stringify({format:'mininotion.page/v1',page}))};
      save(path.join(root,'Notebook'),main);
      for(let i=0;i<600;i++) save(path.join(root,'Notebook','Page-'+i),makePage({id:'startup-'+i,title:'Page '+i,color:'white',parentId:main.id,blocks:[{type:'paragraph',content:'Source details 中文🙂. '.repeat(2000)}]}));
      const service=new DataService(path.join(root,'.mininotion'),root);
      const reply=await service.request({jsonrpc:'2.0',id:'seed',method:'fs.sync',stateMode:'none'});
      if(reply.error)throw Error(reply.error.message);
    }`, resolveDir: path.join(root, 'Infra/Plugins/mini-notion'), loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  await require(bundle).seed(workspace);
}
const env = { ...process.env, AGENTS_COMPANY_HOME: path.join(temp, 'state'), AGENTS_COMPANY_WORKSPACES: path.join(temp, 'work'), AGENTS_COMPANY_PROJECTS: path.join(temp, 'projects'), AGENTS_COMPANY_HIDDEN: '1', AGENTS_COMPANY_PLUGIN_DIRS: '' };
for (const key of ['ELECTRON_RUN_AS_NODE', 'AGENTS_COMPANY_SOCKET', 'AGENTS_COMPANY_EMPLOYEE', 'AGENTS_COMPANY_URL', 'AGENTS_COMPANY_TOKEN', 'AGENTS_COMPANY_PLUGIN_RPC', 'AGENTS_COMPANY_BUILTIN_PLUGINS', 'MINI_NOTION_SOCKET', 'MINI_NOTION_WORKSPACE', 'MINI_NOTION_DATA_DIR']) delete env[key];
const cli = async (...args) => {
  const response = JSON.parse((await run(process.execPath, [root + '/Infra/src/cli/agents', ...args, '--json'], { env, cwd: root, timeout: 45000, maxBuffer: 64e6 })).stdout);
  assert.ok(response.ok, response.error); return response.data;
};
let app, page; const samples = [], errors = [];
try {
  for (let iteration = 0; iteration < 2; iteration++) {
    app = await electron.launch({ executablePath: process.env.AGENTS_COMPANY_TEST_APP || require('electron'), args: process.env.AGENTS_COMPANY_TEST_APP ? [] : [root], env });
    await (await app.firstWindow()).locator('.infinite-canvas').waitFor();
    const calls = [], start = performance.now();
    const pending = app.waitForEvent('window').then(value => {
      value.on('pageerror', error => errors.push(error.message));
      value.on('response', response => { try { const request = response.request(); if (request.method() === 'POST') calls.push(request.postDataJSON()?.method); } catch {} });
      return value;
    });
    await cli('plugin', 'open', 'mininotion'); page = await pending;
    await page.locator('.sidebar').waitFor({ timeout: 15000 });
    await page.locator('.page-title,.home-scroll').first().waitFor();
    await expect(page.locator('.save-status')).toContainText('已保存到本机');
    const readyMs = performance.now() - start;
    assert.ok(readyMs < 4000, `cold open took ${Math.round(readyMs)} ms (budget 4000 ms)`);
    assert.equal(calls.filter(method => method === 'workspace.get').length, 1, 'opening fetched the notebook more than once');
    const status = await cli('plugin', 'call', 'mininotion', 'status');
    assert.ok(status.pages >= 300, 'fixture is too small to reproduce startup regression');
    await page.screenshot({ path: path.join(out, `cold-open-${iteration}.png`), animations: 'disabled' });
    const closing = performance.now(); await app.close(); app = undefined;
    const closeMs = performance.now() - closing;
    assert.ok(closeMs < 5000, 'quit exceeded five seconds');
    let exited = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { process.kill(status.pid, 0); } catch (error) { if (error.code === 'ESRCH') { exited = true; break; } throw error; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(exited, 'cold open left an orphan backend after quit');
    samples.push({ iteration, pages: status.pages, readyMs, closeMs, calls });
    console.log(`PASS cold open ${iteration}: ${Math.round(readyMs)} ms; quit ${Math.round(closeMs)} ms; ${status.pages} pages`);
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ accepted: true, samples, errors }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify({ error: String(error), samples, errors }, null, 2));
  throw error;
} finally {
  await app?.close(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
