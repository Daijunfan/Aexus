'use strict';
// An immutable, versioned view of the CloudHosts registry. Only registry.cjs
// writes this file. The embedded Aexus Core cannot mutate it.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const KEYS = ['id','name','host','os','port','distribution','defaultDirectory','identityFile','knownHosts','sshConfig','jump','vm','desktop','hasPassword','createdAt','updatedAt','status'];
function project(rows) {
  const hosts = rows.map(({secret,password,...row}) => Object.fromEntries(KEYS.filter(key => key in row || key === 'hasPassword').map(key => [key, key === 'hasPassword' ? !!secret || !!row.hasPassword : row[key]])));
  return {
    schemaVersion: 1,
    source: 'cloudhosts',
    // Hash all raw fields, including credential rotation, without exposing credentials.
    projectionRevision: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
    generatedAt: Date.now(),
    hosts
  };
}
function filename(home) { return path.join(home, 'agentboard-host-projection.json'); }
function publish(rows, home) {
  if (!Array.isArray(rows) || typeof home !== 'string') throw Error('Invalid host projection');
  const file = filename(home), output = project(rows);
  fs.mkdirSync(home, {recursive: true, mode: 0o700});
  const tmp = file + '.' + process.pid + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(output), {mode: 0o600, flag: 'wx'});
    fs.renameSync(tmp, file);
  } finally { try { fs.rmSync(tmp, {force: true}); } catch {} }
  return {path:file,revision:output.projectionRevision};
}
function read(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (value?.schemaVersion !== 1 || value?.source !== 'cloudhosts' || !/^[a-f0-9]{64}$/.test(value.projectionRevision) || !Array.isArray(value.hosts)) throw Error('Invalid CloudHosts host projection');
  if (value.hosts.some(h => !h?.id || typeof h.id !== 'string' || 'secret' in h || 'password' in h)) throw Error('Private host data in projection');
  return value;
}
module.exports = {project,publish,read,filename};
