'use strict';
// Portable appearance contains presentation data only, never executable CSS or assets.
const fs = require('node:fs/promises');
const S = require('./safety.cjs');
const FORMAT = 'margin-reader.theme/v1';
const MAX_BYTES = 64 * 1024;
const DEFAULTS = Object.freeze({
  theme: 'light', uiPalette: 'azure', uiBackdrop: 'glow', uiMotion: 'system',
  uiCustomAccent: null, uiCustomGlow: null, uiBackgroundStrength: 1
});
const ENUMS = {
  theme: ['light', 'dark', 'sepia'],
  uiPalette: ['azure', 'mint', 'violet', 'rose', 'amber', 'coral', 'iris', 'graphite'],
  uiBackdrop: ['plain', 'glow', 'dots', 'contour'],
  uiMotion: ['system', 'full', 'reduced']
};
const KEYS = Object.keys(DEFAULTS);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function checkPatch(value, code = 'INVALID_PARAMS') {
  S.assert(object(value) && Object.keys(value).every(k => KEYS.includes(k)), code, 'Only portable appearance fields are allowed.');
  const patch = {};
  for (const [key, item] of Object.entries(value)) {
    if (ENUMS[key]) S.assert(ENUMS[key].includes(item), code, `Unsupported appearance ${key}.`);
    else if (key === 'uiBackgroundStrength') S.assert(Number.isFinite(item) && item >= 0 && item <= 1, code, 'Backdrop strength must be between 0 and 1.');
    else S.assert(item === null || typeof item === 'string' && /^#[0-9a-f]{6}$/i.test(item), code, 'Custom colors must be #RRGGBB or null.');
    patch[key] = typeof item === 'string' && item.startsWith('#') ? item.toLowerCase() : item;
  }
  return patch;
}
function appearance(settings) {
  const picked = Object.fromEntries(KEYS.map(key => [key, settings[key] === undefined ? DEFAULTS[key] : settings[key]]));
  return checkPatch(picked, 'STATE_CORRUPT');
}
function version(settings) { return S.digest(JSON.stringify(appearance(settings))); }
function checkVersion(settings, expected) {
  if (expected !== undefined) S.assert(typeof expected === 'string' && /^[a-f0-9]{64}$/.test(expected), 'INVALID_PARAMS', 'Supply the appearance version returned by appearance.get.');
  if (expected !== undefined) S.assert(version(settings) === expected, 'CONFLICT', 'Appearance changed elsewhere. Reopen or compare the latest theme before saving.', { currentVersion: version(settings) });
}
function settingsPatch(settings, params) {
  const { expectedAppearanceVersion, ...patch } = params;
  checkVersion(settings, expectedAppearanceVersion);
  return { ...patch, ...checkPatch(Object.fromEntries(Object.entries(patch).filter(([key]) => KEYS.includes(key)))) };
}
function title(value) {
  S.assert(typeof value === 'string' && value.trim().length > 0 && value.length <= 80 && !/[\x00-\x1f\x7f]/.test(value), 'INVALID_THEME', 'Theme title must have 1–80 characters without control characters.');
  return value.trim();
}
function validateTheme(value) {
  S.assert(object(value) && Object.keys(value).every(k => ['schema', 'title', 'settings'].includes(k)), 'INVALID_THEME', 'A theme must contain only schema, title and settings.');
  S.assert(value.schema === FORMAT && object(value.settings), 'INVALID_THEME', 'Unsupported theme format.');
  return { schema: FORMAT, title: title(value.title), settings: { ...DEFAULTS, ...checkPatch(value.settings, 'INVALID_THEME') } };
}
async function read(store, p) {
  S.assert((p.path !== undefined) !== (p.content !== undefined), 'INVALID_PARAMS', 'Provide one theme path or JSON content, not both.');
  let bytes;
  if (p.path !== undefined) bytes = await S.readBounded(await S.safePath(store.workspace, S.relative(p.path)), MAX_BYTES);
  else {
    S.assert(typeof p.content === 'string' && Buffer.byteLength(p.content) <= MAX_BYTES, 'TOO_LARGE', 'Theme JSON exceeds 64 KiB.');
    bytes = Buffer.from(p.content);
  }
  let parsed;
  try { parsed = JSON.parse(bytes.toString('utf8')); }
  catch { S.fail('INVALID_THEME', 'Theme JSON is malformed.'); }
  return { theme: validateTheme(parsed), sha256: S.digest(bytes), bytes: bytes.length };
}
async function inspect(store, p) { return read(store, p); }
async function get(store) {
  const state = await store.load();
  return { appearance: appearance(state.settings), version: version(state.settings) };
}
async function exportTheme(store, p) {
  const relative = S.relative(p.path);
  S.assert(relative.toLowerCase().endsWith('.json'), 'INVALID_PARAMS', 'Export a theme to a new .json file.');
  const file = await S.safePath(store.workspace, relative);
  await require('./files.cjs').parentExists(store.workspace, relative);
  return store.transaction(async (state, rollback) => {
    const theme = validateTheme({ schema: FORMAT, title: p.title || 'My reader theme', settings: p.settings === undefined ? appearance(state.settings) : p.settings });
    const bytes = Buffer.from(JSON.stringify(theme, null, 2) + '\n');
    // Reserve exclusively before registering cleanup: never delete someone else's file.
    const handle = await fs.open(file, 'wx', 0o600).catch(error => {
      if (error.code === 'EEXIST') S.fail('ALREADY_EXISTS', 'Theme destination already exists.');
      throw error;
    });
    rollback(() => fs.rm(file, { force: true }));
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    return { path: relative, title: theme.title, sha256: S.digest(bytes), bytes: bytes.length, theme };
  });
}
async function importTheme(store, p) {
  S.assert(/^[a-f0-9]{64}$/.test(p.expectedSha256), 'INVALID_PARAMS', 'Supply the inspected theme SHA-256.');
  const input = await read(store, p);
  S.assert(input.sha256 === p.expectedSha256, 'CONFLICT', 'Theme file changed after preview. Inspect it again.');
  return store.transaction(async state => {
    checkVersion(state.settings, p.expectedAppearanceVersion);
    Object.assign(state.settings, input.theme.settings);
    return { title: input.theme.title, appearance: appearance(state.settings), version: version(state.settings), settings: state.settings };
  });
}
const methods = new Set(['appearance.get', 'appearance.theme.export', 'appearance.theme.inspect', 'appearance.theme.import']);
async function request(store, method, p) {
  if (method === 'appearance.get') return get(store);
  if (method === 'appearance.theme.export') return exportTheme(store, p);
  if (method === 'appearance.theme.inspect') return inspect(store, p);
  if (method === 'appearance.theme.import') return importTheme(store, p);
  S.fail('METHOD_NOT_FOUND', 'Unknown appearance operation.');
}
module.exports = { FORMAT, DEFAULTS, KEYS, MAX_BYTES, methods, request, checkPatch, appearance, version, checkVersion, settingsPatch, validateTheme };
