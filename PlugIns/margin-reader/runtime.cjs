'use strict';
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const schema = require('./schema.json');
const { createStore } = require('./lib/store.cjs');
const { createPreviews } = require('./lib/preview.cjs');
const { createStudies } = require('./lib/study.cjs');
const { fileCommand, parentExists } = require('./lib/files.cjs');
const { openDocument, documentCommand, findDocument } = require('./lib/documents.cjs');
const { FORMATS } = require('./lib/parsers.cjs');
const { importURL } = require('./lib/web.cjs');
const { assert, fail, ReaderError, LIMITS, relative, safePath, readBounded, exists, writeNew, errorResponse } = require('./lib/safety.cjs');
const methods = new Map(schema.commands.map(command => [command.method, command]));
function validate(method, params) {
  const command = methods.get(method); assert(command, 'METHOD_NOT_FOUND', `Method is not declared in schema.json: ${method}`);
  assert(params && typeof params === 'object' && !Array.isArray(params), 'INVALID_PARAMS', 'params must be an object.');
  const options = command.options || {};
  for (const key of Object.keys(params)) assert(Object.hasOwn(options, key), 'INVALID_PARAMS', `Unknown parameter: ${key}`);
  for (const [key, rule] of Object.entries(options)) {
    const value = params[key];
    if (value === undefined) { assert(!rule.required, 'INVALID_PARAMS', `Missing parameter: ${key}`); continue; }
    if (value === null && rule.nullable) continue;
    assert(rule.type === 'array' ? Array.isArray(value) : value !== null && typeof value === rule.type && (rule.type !== 'object' || !Array.isArray(value)), 'INVALID_PARAMS', `${key} must be ${rule.type}.`);
    if (rule.enum) assert(rule.enum.includes(value), 'INVALID_PARAMS', `Unsupported ${key}: ${value}`);
    if (rule.type === 'number') {
      assert(Number.isFinite(value) && (!rule.integer || Number.isInteger(value)), 'INVALID_PARAMS', `${key} must be a finite ${rule.integer ? 'integer' : 'number'}.`);
      assert((rule.minimum === undefined || value >= rule.minimum) && (rule.maximum === undefined || value <= rule.maximum), 'INVALID_PARAMS', `${key} is outside its allowed range.`);
    }
  }
  return command;
}
exports.createPlugin = async ({ workspace }) => {
  assert(typeof workspace === 'string' && workspace, 'INVALID_WORKSPACE', 'A workspace is required.');
  workspace = await fs.realpath(workspace); assert((await fs.stat(workspace)).isDirectory(), 'INVALID_WORKSPACE', 'Workspace must be an existing directory.');
  const store = await createStore(workspace), events = new EventEmitter();
  const localReading=require('./lib/local-reading.cjs').createLocalReading(store);
  const previews = createPreviews(store), studies = createStudies(store,localReading);
  let closed = false, watcher, debounce;
  const emit = () => { if (!closed) events.emit('change', { type: 'library.changed', at: new Date().toISOString() }); };
  async function execute(method, p) {
    if(require('./lib/mindmap-designs.cjs').methods.has(method))return require('./lib/mindmap-designs.cjs').request(store,method,p);
    if(require('./lib/xmind-interchange.cjs').methods.has(method))return require('./lib/xmind-interchange.cjs').request(store,method,p);
    if(require('./lib/mindmap-tools.cjs').methods.has(method))return require('./lib/mindmap-tools.cjs').request(store,method,p);
    if(require('./lib/mindmap.cjs').methods.has(method))return require('./lib/mindmap.cjs').request(store,method,p);
    if(require('./lib/study-library.cjs').methods.has(method))return require('./lib/study-library.cjs').request(store,method,p);
    if(require('./lib/backup-jobs.cjs').methods.has(method))return require('./lib/backup-jobs.cjs').request(store,method,p);
    if(require('./lib/appearance.cjs').methods.has(method))return require('./lib/appearance.cjs').request(store,method,p);
    if(require('./lib/local-reading.cjs').methods.has(method))return localReading.request(method,p);
    const readerState=require('./lib/reader-state.cjs');
    if(readerState.methods.has(method))return readerState.request(store,method,p);
    if(method.startsWith('library.backup.'))return require('./lib/library-backup.cjs')[method.slice(15)](store,p);
    if(method==='library.index')return require('./lib/library-search.cjs').index(store,p);
    if(method==='library.search')return require('./lib/library-search.cjs').search(store,p);
    if(method==='system.fonts')return require('./lib/study-tools.cjs').fonts();
    if (method === 'system.info') return { plugin: 'margin-reader', version: schema.version, workspace, contract: 'agents-company.cli/v1', formats: FORMATS.map(format => ({ format, available: require('./lib/av-document.cjs').FORMATS.includes(format)?require('./lib/av-document.cjs').available():format !== 'rtf' || process.platform === 'darwin', ...(require('./lib/av-document.cjs').FORMATS.includes(format)?{dependency:'installed FFmpeg/ffprobe'}:{}), ...(format === 'doc' ? { mode: 'text' } : {}), ...(format === 'rtf' ? { dependency: 'macOS textutil' } : {}) })), limits: LIMITS, features: { studySets: true, noteCards: true, cardLinks: true, cardTags: true, studyHistory: true, bookmarks: true, pdfHandwriting: true, inkLayers: true, pressureInk: true, cardInk: true, lassoExcerpts: true, comparison: true, pdfComposition: true, notebooks: true, extendedNotes: true, foldPages: true, personalizedFSRS: true, reviewScheduler: 'FSRS', excerptCards: true, mindMap: true, pdfReadingModes: ['continuous', 'paged'], adjustableScrollSpeed: true, editableOutline: true, offlineWebImport: true, fileTree: true, folderGrid: true, drmRemoval: false, ocr: false }, commands: [...methods.keys()] };
    if (method === 'pdf.compose') return require('./lib/pdf-edit.cjs').compose(store,p);
    if (method === 'reader.comparison.set') return store.transaction(async state=>{if(p.documentId===null){state.settings.comparison=null;return null;}const doc=findDocument(state,p.documentId);const locator=require('./lib/outline.cjs').validateLocator(p.locator,await require('./lib/documents.cjs').parsedDocument(store,doc));return state.settings.comparison={documentId:doc.id,locator};});
    if (method === 'reader.tabs.close') return store.transaction(async state=>{state.settings.openDocuments=(state.settings.openDocuments||[]).filter(id=>id!==p.id);return state.settings.openDocuments;});
    if (method === 'document.preview') return previews.get(p);
    if(method==='document.av.info')return studies.request(method,p);
    if (method==='document.pdf.export' || method.startsWith('study.') || method.startsWith('link.')) return studies.request(method,p);
    if (method === 'settings.get') return (await store.load()).settings;
    if (method === 'settings.set') return store.transaction(async state => {
      if (p.studyFolder !== undefined) require('./lib/study-library.cjs').folder(require('./lib/study-library.cjs').data(state),p.studyFolder);
      if (p.currentFolder !== undefined) { const file = await safePath(workspace, p.currentFolder, { root: true }); assert((await exists(file))?.isDirectory(), 'NOT_FOUND', 'Navigation folder does not exist.'); }
      if (p.lastDocument !== undefined && p.lastDocument !== null) findDocument(state, p.lastDocument);
      if (p.activeStudySet !== undefined && p.activeStudySet !== null) require('./lib/study-model.cjs').findSet(state,p.activeStudySet);
      Object.assign(state.settings, require('./lib/appearance.cjs').settingsPatch(state.settings, p)); return state.settings;
    });
    if (method.startsWith('fs.') || method.startsWith('import.')) {
      const result = await fileCommand(store, method, p);
      if (method === 'import.abort') { await fs.rm(await store.meta(`uploads/${result.stagingFile}`), { force: true }); return { aborted: true }; }
      if (method === 'import.finish') {
        if (p.parse === false || /\.(mrpkg|mrbackup)$/.test(result.path.toLowerCase())) return {...result,registered:false};
        try { return await openDocument(store, { path: result.path, password: p.password, activate: p.activate }); }
        catch (error) { error.details = { ...(error.details || {}), savedPath: result.path }; throw error; }
      }
      return result;
    }
    if (method === 'web.import') {
      const folder = relative(p.folder ?? '.', { root: true });
      assert((await exists(await safePath(workspace, folder, { root: true })))?.isDirectory(), 'NOT_FOUND', 'Destination folder does not exist.');
      const imported = await importURL(p.url, { name: p.name });
      const saved = await store.transaction(async (_state, rollback) => {
        const ext = path.extname(imported.name), stem = imported.name.slice(0, -ext.length);
        let rel;
        for (let i = 0; i < 10000; i++) {
          const name = i ? `${stem} (${i + 1})${ext}` : imported.name;
          rel = folder === '.' ? name : `${folder}/${name}`;
          if (!(await exists(await safePath(workspace, rel)))) break;
          assert(i < 9999, 'ALREADY_EXISTS', 'Too many documents have the same name.');
        }
        const file = await safePath(workspace, rel); await parentExists(workspace, rel);
        await writeNew(file, imported.bytes); rollback(() => fs.rm(file, { force: true })); return rel;
      });
      try { return await openDocument(store, { path: saved }, imported); }
      catch (error) { error.details = { ...(error.details || {}), savedPath: saved }; throw error; }
    }
    return documentCommand(store, method, p);
  }
  return {
    async request(request) {
      const id = request?.id;
      try {
        assert(!closed, 'RUNTIME_CLOSED', 'Reader runtime is closed.');
        assert(request?.jsonrpc === '2.0' && (typeof id === 'string' || typeof id === 'number' && Number.isFinite(id)) && typeof request.method === 'string', 'INVALID_REQUEST', 'Expected a JSON-RPC 2.0 request with a string or numeric ID.');
        const params = request.params === undefined ? {} : request.params;
        const command = validate(request.method, params);
        const result = await execute(request.method, params);
        if (command.mutates) emit();
        return { jsonrpc: '2.0', id, result };
      } catch (error) { return errorResponse(id, error); }
    },
    async readAsset(asset) {
      if (asset.startsWith('study-card/') || asset.startsWith('study-media/')) return studies.readAsset(asset);
      const match = /^original\/([0-9a-f-]{36})$/.exec(asset); assert(match, 'SCOPE_DENIED', 'Only stable original document references are exposed.');
      const state=await store.load(),doc = findDocument(state, match[1]);
      if(doc.virtual)return {bytes:await require('./lib/virtual-document.cjs').bytes(store,state,doc),mimeType:'application/pdf'};
      const file = await safePath(workspace, doc.path);
      const mimeType = ({ pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', epub: 'application/epub+zip', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8' })[doc.format] || require('./lib/av-document.cjs').MIME[doc.format] || 'application/octet-stream';
      return { bytes: await readBounded(file), mimeType };
    },
    async subscribe(listener) {
      events.on('change', listener);
      if (!watcher) {
        try { watcher = fsSync.watch(workspace, { recursive: true }, (_event, name) => {
          if (!meaningfulWorkspaceChange(name)) return;
          clearTimeout(debounce); debounce = setTimeout(emit, 180); debounce.unref?.();
        }); watcher.on('error', () => { watcher?.close(); watcher = null; }); } catch {}
      }
      return () => { events.off('change', listener); if (!events.listenerCount('change')) { watcher?.close(); watcher = null; clearTimeout(debounce); } };
    },
    async close() { closed = true; watcher?.close(); clearTimeout(debounce); events.removeAllListeners(); await previews.close(); await localReading.close(); await studies.close(); await store.flush(); }
  };
};
// Host mailboxes persist events.json after every emitted change. Watching that
// control traffic creates an endless feedback loop that starves UI debouncing.
// Only committed reader state and user files should trigger a library refresh.
function meaningfulWorkspaceChange(name) {
  if (!name) return true;
  const normalized = String(name).replaceAll('\\', '/');
  const parts = normalized.split('/').map(require('./lib/safety.cjs').protectedName);
  if (parts.some(part => part === '.agents-company' || part === '.git')) return false;
  if (parts.includes('.margin-reader')) return parts.length===2&&parts[0]==='.margin-reader'&&parts[1]==='state.json';
  return true;
}
exports.validate = validate;
exports.meaningfulWorkspaceChange = meaningfulWorkspaceChange;
