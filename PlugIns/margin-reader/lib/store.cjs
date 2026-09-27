'use strict';
const fs = require('node:fs/promises');
const lockfile = require('proper-lockfile');
const { safePath, ensureDir, atomicWrite, exists, assert } = require('./safety.cjs');
const META = '.margin-reader';
function initialState() {
  return { schemaVersion: 1, revision: 0, documents: {}, uploads: {}, trash: {}, studySets: {}, settings: { theme: 'light', view: 'grid', fontSize: 18, lineHeight: 1.8, sidebarWidth: 240, outlineWidth: 280, currentFolder: '.', lastDocument: null, activeStudySet: null, studyRatio: 0.53, pdfMode: 'continuous', pdfFit: 'width', pdfZoom: 1, pdfScrollSpeed: 1, pdfFocus: false } };
}
async function createStore(workspace) {
  for (const dir of [META, `${META}/cache`, `${META}/uploads`, `${META}/trash`]) await ensureDir(workspace, dir, true);
  const file = await safePath(workspace, `${META}/state.json`, { internal: true });
  let queue = Promise.resolve();
  async function load() {
    if (!(await exists(file))) return initialState();
    await safePath(workspace, `${META}/state.json`, { internal: true });
    let state;
    try { state = JSON.parse(await fs.readFile(file, 'utf8')); } catch { assert(false, 'STATE_CORRUPT', 'State is unreadable. Restore .margin-reader/state.json from backup; no data was replaced.'); }
    assert(state?.schemaVersion === 1 && Number.isInteger(state.revision) && state.documents && state.uploads && state.trash && state.settings, 'STATE_CORRUPT', 'Unsupported or corrupt reader state.');
    // Additive defaults preserve old libraries and their reading positions.
    state.settings = { ...initialState().settings, ...state.settings };
    state.studySets ??= {};
    assert(typeof state.studySets === 'object' && !Array.isArray(state.studySets), 'STATE_CORRUPT', 'Study set storage is corrupt.');
    return state;
  }
  function transaction(callback) {
    const task = queue.then(async () => {
      await safePath(workspace, `${META}/state.json.lock`, { internal: true });
      let compromised;
      const undo = [];
      const release = await lockfile.lock(file, { realpath: false, stale: 120000, update: 10000, retries: { retries: 100, minTimeout: 30, maxTimeout: 200 }, onCompromised: error => { compromised = error; } });
      try {
        const state = await load();
        const result = await callback(state, action => undo.push(action));
        if (compromised) throw compromised;
        state.revision++;
        await safePath(workspace, `${META}/state.json`, { internal: true });
        await atomicWrite(file, JSON.stringify(state, null, 2) + '\n');
        return result;
      } catch (error) {
        for (const action of undo.reverse()) { try { await action(); } catch (rollbackError) { error.message += '; rollback failed: ' + rollbackError.message; } }
        throw error;
      } finally { await release(); }
    });
    queue = task.catch(() => {});
    return task;
  }
  return { workspace, file, load, transaction, flush: () => queue, meta: rel => safePath(workspace, `${META}/${rel}`, { internal: true }), mkdir: rel => ensureDir(workspace, `${META}/${rel}`, true) };
}
module.exports = { createStore, META };
