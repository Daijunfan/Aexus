#!/usr/bin/env node
// QA-owned live acceptance of the file station (文件中转站) folder round trip.
//
// Written because tests/station-live.cjs and tests/station-folder-live.cjs look
// up a host literally named "BUPT Windows", which is not registered (the
// registry carries "BUPT-Windows" and no such alias), so both abort on an
// assertion before finishing. This orchestrator resolves hosts from the real
// registry and exercises the same product path with isolated data.
//
// Safety: copies the registry into a throwaway CLOUD_HOSTS_HOME, only ever
// creates uniquely named temporary directories on the target hosts, and removes
// them in a finally block. It never edits the production registry, station
// index, host files or user sessions.
//
//   node tests/qa-station-roundtrip-live.cjs [linux-host-name] [windows-host-name]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'artifacts/full-acceptance-20261015');
const PRODUCTION_HOME = path.join(os.homedir(), 'Library/Application Support/Toolbox/CloudHosts');
const taskHome = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-station-live-'));
process.env.CLOUD_HOSTS_HOME = taskHome;
fs.copyFileSync(path.join(PRODUCTION_HOME, 'hosts.json'), path.join(taskHome, 'hosts.json'));
const {rpc, state} = require(path.join(ROOT, 'cli.cjs'));

const requested = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const LINUX = requested[0] || 'GPU-server';
const WINDOWS = requested[1] || 'DJF-Windows';
const report = {generatedAt: new Date().toISOString(), requested: {linux: LINUX, windows: WINDOWS}, hosts: [], failures: []};

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function finish(job, timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;
  while (job.state === 'running') {
    assert.ok(Date.now() < deadline, `transfer ${job.id} timed out`);
    await new Promise((r) => setTimeout(r, 250));
    job = (await rpc('station.list')).jobs.find((row) => row.id === job.id);
  }
  return job;
}

(async () => {
  const hosts = await rpc('hosts.list');
  const created = [];
  try {
    const tag = 'qa-station-' + crypto.randomUUID();
    const source = path.join(taskHome, '设计资料');
    fs.mkdirSync(path.join(source, '子目录', 'empty'), {recursive: true});
    fs.writeFileSync(path.join(source, '子目录', 'notes.txt'), 'Folder topology round trip.');
    fs.writeFileSync(path.join(source, 'bytes.bin'), crypto.randomBytes(1024 * 1024));
    const sourceSha = sha(path.join(source, 'bytes.bin'));
    fs.writeFileSync(path.join(taskHome, 'single.bin'), crypto.randomBytes(64 * 1024));
    const singleSha = sha(path.join(taskHome, 'single.bin'));

    const item = await rpc('station.import', {path: source});
    assert.equal(item.type, 'folder', 'imported item must be a folder');

    for (const name of [LINUX, WINDOWS]) {
      const host = hosts.find((h) => h.name === name);
      if (!host) { report.failures.push({host: name, stage: 'resolve', error: `host ${name} is not registered`}); continue; }
      const entry = {host: name, os: host.os};
      try {
        const command = host.os === 'windows'
          ? `$p=Join-Path $env:TEMP '${tag}';New-Item -ItemType Directory -Path $p -Force|Out-Null;[Console]::WriteLine($p)`
          : `mkdir -p /home/djf/.cache/${tag};printf '%s' /home/djf/.cache/${tag}`;
        const prepared = await rpc('hosts.exec', {id: host.id, command});
        assert.equal(prepared.exit_code, 0, prepared.stderr);
        const directory = prepared.stdout.trim();
        assert.ok(directory, 'temp directory not reported');
        created.push({host, directory});
        entry.directory = directory;

        const sent = await finish(await rpc('station.send', {item: item.id, host: host.id, directory}));
        assert.equal(sent.state, 'done', sent.error);
        // src/station.cjs:163 reports the station item's own digest. A folder item
        // has no single digest (only files get item.sha256 at import, line 51),
        // so a folder send legitimately reports sha256: undefined and the
        // product verifies each transferred file instead (line 161). Integrity is
        // proven below by fetching the tree back and hashing every leaf.
        entry.reportedSha256 = sent.result?.sha256 ?? null;
        entry.sentBytes = sent.result?.bytes ?? null;
        assert.ok(sent.result?.bytes > 0, 'folder send transferred no bytes');
        if (item.type === 'file') assert.equal(sent.result?.sha256, sourceSha, 'file sent checksum mismatch');
        else assert.equal(sent.result?.sha256, undefined, 'folder send should not claim a single digest');

        // A second send of the same name must be refused, not silently overwritten.
        const again = await finish(await rpc('station.send', {item: item.id, host: host.id, directory}));
        entry.duplicateRefused = again.state === 'failed' && /同名/.test(again.error || '');
        assert.ok(entry.duplicateRefused, `duplicate send was not refused: ${again.state} ${again.error}`);

        // src/station.cjs:128 fetchFile commits a brand-new item tree and returns
        // it as the job result; the job itself is not a station item.
        const fetched = await finish(await rpc('station.fetch', {host: host.id, directory, path: item.name}));
        assert.equal(fetched.state, 'done', fetched.error);
        const fetchedItem = fetched.result;
        assert.ok(fetchedItem?.id, 'fetch did not report the new station item');
        const values = (await rpc('station.list')).items;
        const leaf = values.find((row) => row.parent === fetchedItem.id && row.name === 'bytes.bin');
        const nested = values.find((row) => row.parent === fetchedItem.id && row.name === '子目录');
        assert.ok(leaf && leaf.sha256 === sourceSha, 'binary leaf missing or changed after fetch');
        assert.ok(nested, 'nested folder missing after fetch');
        assert.ok(values.some((row) => row.parent === nested.id && row.name === 'empty' && row.type === 'folder'), 'empty folder was dropped');
        entry.folderRoundTrip = true;
        entry.emptyFolderRetained = true;
        entry.checksum = sourceSha;

        // A single-file item does carry a digest: prove the file contract too.
        const single = await rpc('station.import', {path: path.join(taskHome, 'single.bin')});
        assert.equal(single.type, 'file', 'imported single file must be a file');
        assert.equal(single.sha256, singleSha, 'imported file digest mismatch');
        const sentFile = await finish(await rpc('station.send', {item: single.id, host: host.id, directory}));
        assert.equal(sentFile.state, 'done', sentFile.error);
        assert.equal(sentFile.result?.sha256, singleSha, 'file sent checksum mismatch');
        assert.equal(sentFile.result?.bytes, fs.statSync(path.join(taskHome, 'single.bin')).size, 'file sent byte count mismatch');
        entry.fileDigestVerified = true;
        await rpc('station.remove', {item: single.id});
      } catch (error) {
        entry.error = error.message.split('\n')[0];
        report.failures.push({host: name, stage: 'roundtrip', error: entry.error});
      }
      report.hosts.push(entry);
    }

    const exported = path.join(taskHome, 'exported');
    await rpc('station.export', {item: item.id, destination: exported});
    report.exportMatches = sha(path.join(exported, 'bytes.bin')) === sourceSha;
    assert.ok(report.exportMatches, 'exported file differs from the source');
  } catch (error) {
    report.failures.push({stage: 'setup', error: error.message.split('\n')[0]});
  } finally {
    for (const {host, directory} of created) {
      const command = host.os === 'windows'
        ? `Remove-Item -LiteralPath '${directory.replace(/'/g, "''")}' -Recurse -Force`
        : `rm -rf '${directory}'`;
      try { await rpc('hosts.exec', {id: host.id, command}); } catch {}
    }
    const server = await state();
    if (server) process.kill(server.pid, 'SIGTERM');
    fs.rmSync(taskHome, {recursive: true, force: true});
  }
  report.passed = report.failures.length === 0;
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(path.join(OUT, 'qa-station-roundtrip.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.passed ? 0 : 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
