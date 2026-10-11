import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
// Require the separate executable bundle: inlining its main guard would launch a second service.
const { startServer } = createRequire(path.join(process.cwd(), 'package.json'))(path.resolve('dist-cli/server.cjs'));
import { BackendClient } from '../src/backend/client';
import { applyWorkspaceDelta } from '../src/core/stateDelta';

const until = async (check: () => boolean) => {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('event stream did not become ready');
};
test('legacy subscribers get a full snapshot; hosted bootstrap omits it without losing subsequent deltas', async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mn-startup-stream-')));
  const server = await startServer(path.join(root, '.mininotion'), root);
  const full = new BackendClient({ workspace: root, clientId: 'gui-full', autoStart: false });
  const compact = new BackendClient({ workspace: root, clientId: 'gui-compact', autoStart: false });
  const defaults = new BackendClient({ workspace: root, clientId: 'gui-delta-default', autoStart: false });
  const stops: (() => void)[] = [];
  t.after(async () => { stops.forEach(stop => stop()); await server.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const page = await full.call('page.create', { title: '原生页面🙂', color: 'white' });
  const snapshots: any[] = [], deltas: any[] = [], defaultEvents: any[] = [];
  stops.push(await full.subscribe(event => snapshots.push(event)));
  stops.push(await compact.subscribe(event => deltas.push(event), undefined, { delta: true, initialState: false }));
  stops.push(await defaults.subscribe(event => defaultEvents.push(event), undefined, { delta: true }));
  await until(() => snapshots.length > 0 && defaultEvents.length > 0 && server.service.desktopClients.has('gui-compact'));
  assert.equal(snapshots[0].type, 'state');
  assert.equal(defaultEvents[0].type, 'state', 'delta alone must not silently change legacy bootstrap');
  assert.equal(deltas.length, 0, 'host must not receive a discarded initial notebook');
  const baseline = await compact.call('workspace.get');
  await full.call('page.update', { pageId: page.id, title: '更新成功🙂' });
  await until(() => deltas.some(event => event.type === 'delta'));
  const event = deltas.find(event => event.type === 'delta');
  const reconstructed = applyWorkspaceDelta(baseline, event.delta);
  assert.ok(reconstructed);
  assert.equal(reconstructed.pages.find(item => item.id === page.id)?.title, '更新成功🙂');
  assert.deepEqual(reconstructed, await compact.call('workspace.get'));
  assert.ok(snapshots.some(item => item.workspace?.pages.some((p: any) => p.title === '更新成功🙂')));
  assert.equal((await full.call('fs.audit')).valid, true);
});
