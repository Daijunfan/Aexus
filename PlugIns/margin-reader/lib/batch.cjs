'use strict';
const path = require('node:path');
const { assert, relative, safePath, exists, checkVersion } = require('./safety.cjs');
const { applyFileCommand, inspectSubtree } = require('./files.cjs');

// Check the whole selection before touching any file. The shared store owns
// rollback and the final state commit, just as for single-file mutations.
async function batchCommand(store, params) {
  assert(['move', 'copy', 'trash'].includes(params.action), 'INVALID_PARAMS', 'Invalid batch action.');
  assert(Array.isArray(params.items) && params.items.length > 0 && params.items.length <= 500, 'INVALID_PARAMS', 'Select between 1 and 500 files/folders.');
  const items = params.items.map(item => {
    assert(item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).every(key => ['path','expectedVersion'].includes(key)), 'INVALID_PARAMS', 'Each item must contain only path and expectedVersion.');
    assert(typeof item.expectedVersion === 'string' && item.expectedVersion.length > 0 && item.expectedVersion.length <= 128, 'INVALID_PARAMS', 'Each item needs expectedVersion from fs.list.');
    return { path: relative(item.path), expectedVersion: item.expectedVersion };
  });
  const key = value => process.platform === 'darwin' ? value.normalize('NFD').toLocaleLowerCase('en-US') : value;
  const paths = items.map(item => key(item.path));
  assert(new Set(paths).size === paths.length, 'INVALID_PARAMS', 'Duplicate source paths are not allowed.');
  for (const from of paths) assert(!paths.some(other => other !== from && other.startsWith(from + '/')), 'INVALID_PARAMS', 'Select a folder or its descendants, not both.');
  const trash = params.action === 'trash';
  assert(trash ? params.folder === undefined : typeof params.folder === 'string', 'INVALID_PARAMS', trash ? 'Trash does not accept a destination folder.' : 'A destination folder is required.');
  const folder = trash ? null : relative(params.folder, { root: true });
  return store.transaction(async (state, rollback) => {
    if (!trash) assert((await exists(await safePath(store.workspace, folder, { root: true })))?.isDirectory(), 'NOT_FOUND', 'Destination folder does not exist.');
    const plan = [], destinations = new Set(), budget = { n: 0 };
    for (const item of items) {
      try {
        const source = await safePath(store.workspace, item.path), st = await exists(source);
        assert(st, 'NOT_FOUND', `Source does not exist: ${item.path}`);
        checkVersion(st, item.expectedVersion); await inspectSubtree(source, budget);
        let target;
        if (!trash) {
          target = folder === '.' ? path.posix.basename(item.path) : `${folder}/${path.posix.basename(item.path)}`;
          assert(!paths.some(from => key(target) === from || key(target).startsWith(from + '/')), 'INVALID_PATH', 'Destination cannot be a selected source or inside a selected folder.');
          assert(!destinations.has(key(target)), 'ALREADY_EXISTS', `Selected items have the same destination name: ${target}`);
          destinations.add(key(target));
          assert(!(await exists(await safePath(store.workspace, target))), 'ALREADY_EXISTS', `Destination already exists: ${target}`);
        }
        plan.push({ ...item, ...(target ? { target } : {}) });
      } catch (error) { error.details = { ...error.details, failedPath: item.path, action: params.action }; throw error; }
    }
    const results = [];
    for (const item of plan) {
      try {
        const result = await applyFileCommand(store, state, rollback, `fs.${params.action}`, item);
        results.push({ source: item.path, ...result });
      } catch (error) { error.details = { ...error.details, failedPath: item.path, action: params.action }; throw error; }
    }
    return { action: params.action, count: results.length, items: results };
  });
}
module.exports = { batchCommand };
