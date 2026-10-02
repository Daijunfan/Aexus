'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const opt = (type, description, required = false, extra = {}) => ({ type, description, ...(required ? { required: true } : {}), ...extra });
const str = (description, required = false, extra = {}) => opt('string', description, required, extra);
const num = (description, required = false, extra = {}) => opt('number', description, required, extra);
const obj = (description, required = false) => opt('object', description, required);
const rel = str('Workspace-relative path. Absolute paths, traversal and reserved metadata are rejected.', true);
const id = str('Stable document ID returned by document.open.', true);
const rev = num('Current document outline revision. Stale revisions fail with CONFLICT.', true, { integer: true, minimum: 1 });
const nodeId = str('Chapter ID returned by toc.list.', true);
const parentId = str('Parent chapter ID; null means top level.', false, { nullable: true });
const index = num('Zero-based sibling insertion index; omitted means append.', false, { integer: true, minimum: 0 });
const locator = obj('PDF: {page:1,pageOffset:0}; legacy offset remains accepted; audio/video: {time:0,endTime?:10}; flow document: {section:0,anchor:"heading-id"}.', true);
const commands = [];
function command(method, description, mutates, options = {}, examples) { commands.push({ method, description, agentAccess: 'workspace', ...(mutates ? { mutates: true } : {}), options, ...(examples ? { examples } : {}) }); }
command('system.info', 'Report parser capabilities, limits, plugin version and workspace.', false);
command('fs.list', 'List the immediate contents of a folder.', false, { path: str('Folder path; default is .') });
command('fs.tree', 'Read the expandable filesystem tree with explicit truncation information.', false, { path: str('Root folder; default is .'), depth: num('Maximum tree depth; default 32.', false, { integer: true, minimum: 1, maximum: 100 }) });
command('fs.mkdir', 'Create a real folder and any missing ancestors without overwriting files.', true, { path: rel });
command('fs.write', 'Create or update a UTF-8 text document. Updating requires expectedVersion.', true, { path: rel, content: str('UTF-8 document text.', true), expectedVersion: str('Version from fs.list; required when the destination already exists.') });
command('fs.move', 'Move or rename a file/folder; preserve document IDs and refuse existing destinations.', true, { path: rel, target: rel, expectedVersion: str('Optional source version for optimistic concurrency.') });
command('fs.copy', 'Copy a file/folder without overwriting. Copied documents get independent IDs when opened.', true, { path: rel, target: rel });
command('fs.trash', 'Move a file/folder into recoverable plugin trash, never permanently delete it.', true, { path: rel, expectedVersion: str('Optional source version for optimistic concurrency.') });
command('fs.batch', 'Move, copy or recoverably trash selected workspace files with preflight checks and rollback.', true, {
  action: str('Batch operation.', true, { enum: ['move','copy','trash'] }),
  items: opt('array', '1-500 items: {path,expectedVersion}. Read source versions from fs.list.', true),
  folder: str('Existing destination folder for move/copy. Omit for trash. Names are preserved.')
});
command('fs.trash.list', 'List recoverable deleted items.', false);
command('fs.restore', 'Restore a trashed item. Refuse conflicts; optionally select a new target.', true, { trashId: str('Trash ID.', true), target: str('New relative path; default is the original path.') });
command('import.begin', 'Begin a resumable file upload; bytes remain in private staging until finish.', true, { path: rel, totalBytes: num('Exact file size; maximum 512 MiB.', true, { integer: true, minimum: 0, maximum: 536870912 }) });
command('import.status', 'Read a pending upload and its next expected byte offset.', false, { uploadId: str('Upload ID.', true) });
command('import.chunk', 'Append one base64 chunk, checking its exact sequential offset.', true, { uploadId: str('Upload ID.', true), offset: num('Expected byte offset.', true, { integer: true, minimum: 0 }), contentBase64: str('Canonical base64, at most 4 MiB decoded.', true) });
command('import.finish', 'Finalize an upload, verify length/hash, save the original and parse it.', true, { parse: opt('boolean','False stores an uploaded original without registering a document. MRPKG files are always stored without parsing.'), uploadId: str('Upload ID.', true), sha256: str('Optional expected lowercase SHA-256 digest.'), password: str('Optional PDF password, never persisted.'), activate: opt('boolean', 'Select the imported document for reading; default true. False imports without changing the current document.') });
command('import.abort', 'Remove a pending upload, leaving existing documents untouched.', true, { uploadId: str('Upload ID.', true) });
command('web.import', 'Save a public article or document URL offline, including downloadable raster images.', true, { url: str('Public HTTP(S) URL. No login/paywall bypass.', true), folder: str('Destination folder; default is .'), name: str('Optional saved document name.') });
command('document.open', 'Parse a workspace file, import its original outline and return stable metadata.', true, { path: rel, password: str('Optional PDF password, never persisted.'), refresh: opt('boolean', 'Rebuild the parsed cache while preserving custom outline edits.'), activate: opt('boolean', 'Select the document for reading; default true. False leaves navigation unchanged.') });
command('document.preview', 'Render a bounded PNG cover/thumbnail without changing document registration, reading position or outline. Derived cache is disposable.', false, { path: rel, expectedVersion: str('Optional version from fs.list; stale requests fail with CONFLICT.'),page:num('One-based PDF thumbnail page; default 1.',false,{integer:true,minimum:1}) });
command('document.get', 'Get document metadata and whether the source changed externally.', false, { id });
command('document.content', 'Read one section/page as sanitized HTML and searchable plain text.', false, { id, section: num('Zero-based section; default 0.', false, { integer: true, minimum: 0 }), page: num('One-based PDF page; overrides section.', false, { integer: true, minimum: 1 }) });
command('document.search', 'Find literal text across the document and return jumpable reading locators.', false, { id, query: str('Search text.', true), caseSensitive: opt('boolean', 'Case-sensitive matching; default false.'), limit: num('Maximum matches; default 100.', false, { integer: true, minimum: 1, maximum: 1000 }) });
command('document.export', 'Export searchable content to a new portable text, Markdown, HTML or JSON file.', true, { id, format: str('Export format.', true, { enum: ['txt','md','html','json'] }), path: rel });
command('toc.list', 'Get the editable document outline and revision.', false, { id });
command('toc.add', 'Add a chapter at any valid locator and hierarchy position.', true, { id, expectedRevision: rev, title: str('Chapter title, 1–500 characters.', true), locator, parentId, index }, [{ id: 'DOCUMENT_ID', expectedRevision: 1, title: 'Introduction', locator: { page: 1 } }]);
command('toc.update', 'Edit a chapter title and/or its jump target.', true, { id, expectedRevision: rev, nodeId, title: str('New chapter title.'), locator: { ...locator, required: false } });
command('toc.remove', 'Delete a chapter; promote its children by default, or remove its whole subtree.', true, { id, expectedRevision: rev, nodeId, mode: str('Child handling; default promote.', false, { enum: ['promote','subtree'] }) });
command('toc.move', 'Reparent or reorder a chapter with its entire subtree. Cycles are rejected.', true, { id, expectedRevision: rev, nodeId, parentId, index });
command('toc.indent', 'Indent under the preceding sibling while preserving descendants.', true, { id, expectedRevision: rev, nodeId });
command('toc.outdent', 'Outdent one level and place immediately after the former parent.', true, { id, expectedRevision: rev, nodeId });
command('toc.reset', 'Replace the custom outline with the original parsed document outline.', true, { id, expectedRevision: rev });
command('reader.position.get', 'Get the durable reading position.', false, { id });
command('bookmark.list','List local document bookmarks with source validity and optional recoverable deleted entries.',false,{id,includeTrashed:opt('boolean','Include removed bookmarks.')});
command('bookmark.add','Bookmark a validated page/section without modifying the original file.',true,{id,expectedRevision:rev,title:str('Bookmark title, 1–200 characters.',true),locator});
command('bookmark.update','Rename, recoverably remove or restore a bookmark.',true,{id,expectedRevision:rev,bookmarkId:str('Bookmark UUID.',true),title:str('New title, 1–200 characters.'),deleted:opt('boolean','True removes recoverably; false restores.')});
command('reader.position.set', 'Validate and persist a jump/reading position. Positions use last-write-wins.', true, { id, locator });
command('settings.get', 'Get durable reader appearance and navigation preferences.', false);
command('settings.set', 'Persist preferences through the same API used by the renderer.', true, {
  theme: str('Reader theme.', false, { enum: ['light','dark','sepia'] }), view: str('Large folder tiles or compact list.', false, { enum: ['grid','list'] }),
  uiCustomAccent: str('Optional custom #RRGGBB seed; readable text/button shades are derived, null restores the preset.',false,{nullable:true}),
  uiCustomGlow: str('Optional custom #RRGGBB decorative glow; null restores the preset.',false,{nullable:true}),
  uiBackgroundStrength: num('Decorative backdrop strength, 0–1. Never changes source paper or ink.',false,{minimum:0,maximum:1}),
  expectedAppearanceVersion: str('Optional fingerprint from appearance.get; compare appearance only and never persist this control field.'),
  uiPalette: str('Visual accent palette; never changes document or annotation colors.',false,{enum:['azure','mint','violet','rose','amber','coral','iris','graphite']}),
  uiBackdrop: str('Decorative library/card-box backdrop; reading paper is unaffected.',false,{enum:['plain','glow','dots','contour']}),
  uiMotion: str('Interface motion preference. Operating-system reduced motion always takes precedence.',false,{enum:['system','full','reduced']}),
  fontSize: num('Flow text size.', false, { minimum: 12, maximum: 32 }), lineHeight: num('Flow line height.', false, { minimum: 1.2, maximum: 2.6 }),
  sidebarWidth: num('Explorer width.', false, { minimum: 180, maximum: 480 }), outlineWidth: num('Outline width.', false, { minimum: 200, maximum: 480 }),
  pdfMode: str('PDF layout: continuous vertical scroll or single-page navigation.', false, { enum: ['continuous','paged'] }),
  pdfTurnEffect: str('Paged reading animation; book uses a bounded 3D paper transition; reduced-motion overrides it.',false,{enum:['book','none']}),
  homeSection: str('Default browser section, independent of the selected reading document.',false,{enum:['library','studies']}),
  studyFolder: str('Current study-folder UUID or null for root.',false,{nullable:true}),
  studyLibraryView: str('Study collection presentation.',false,{enum:['grid','list']}),
  studyDocumentsView: str('Document presentation within a study set.',false,{enum:['grid','list']}),
  pdfFit: str('Fit available width or the whole page, without distortion or cropping.', false, { enum: ['width','page'] }),
  pdfZoom: num('PDF zoom relative to fit; independent of flow font size.', false, { minimum: 0.5, maximum: 3 }),
  pdfScrollSpeed: num('Vertical wheel/trackpad speed multiplier. Horizontal gestures always turn one page.', false, { minimum: 0.25, maximum: 4 }),
  pdfFocus: opt('boolean', 'Hide explorer and outline to use the full reading width.'),
  activeStudySet: str('Active study set UUID or null.', false, { nullable: true }),
  studyRatio: num('Document fraction of the document/mind-map split.',false,{minimum:0.3,maximum:0.7}),
  brightness:num('Document brightness multiplier.',false,{minimum:.25,maximum:1.5}),
  pdfDarkMode:str('PDF display colors; original preserves image colors.',false,{enum:['original','invert']}),
  readingMode:str('Normal or immersive reading.',false,{enum:['normal','immersive']}),
  studyLayout:str('Document and map arrangement.',false,{enum:['columns','rows','document','map']}),
  studyOrder:str('Relative document/map order.',false,{enum:['document-first','map-first']}),
  comparisonDirection:str('Comparison pane arrangement.',false,{enum:['auto','columns','rows']}),
  comparisonRatio:num('Primary pane fraction.',false,{minimum:.2,maximum:.8}),
  comparisonSecondaryRatio:num('Second pane fraction of the comparison area in a three-pane view.',false,{minimum:.2,maximum:.8}),
  reviewDefaultFront:str('Default question source for new review cards in this workspace; existing cards keep their rule.',false,{enum:['title','card']}),
  reviewDefaultReveal:str('Default group mode for newly configured cards; existing schedules are preserved.',false,{enum:['sequential','independent']}),
  presentationPointers:opt('boolean','Show transient click/touch points and a pen cursor for local demonstrations; default false.'),
  mediaRate:num('Audio/video playback speed.',false,{minimum:.25,maximum:3}),
  currentFolder: str('Current folder path.'), lastDocument: str('Last open document ID or null.', false, { nullable: true })
});
require('./mindmap-contracts.cjs').register({command,str,num,opt,obj});
require('./study-library-contracts.cjs').register({command,str,num,opt,obj});
require('./backup-job-contracts.cjs').register({command,str,num,opt,obj});
require('./appearance-contracts.cjs').register({command,str,num,opt,obj});
require('./advanced-contracts.cjs').register({command,str,num,opt,obj});
require('./study-contracts.cjs').register({command,str,num,opt,obj});
require('./av-contracts.cjs').register({command,str,num,opt,obj});
require('./local-contracts.cjs').register({command,str,num,opt,obj});
require('./content-contracts.cjs').register({command,str,num,opt,obj});
require('./package-contracts.cjs').register({command,str,num,opt,obj});
require('./export-contracts.cjs').register({command,str,num,opt,obj});
require('./ink-contracts.cjs').register({command,str,num,opt,obj});
require('./layout-contracts.cjs').register({command,str,num,opt,obj});
require('./reader-contracts.cjs').register({command,str,num,opt,obj});
require('./learning-contracts.cjs').register({command,str,num,opt,obj});
require('./capture-contracts.cjs').register({command,str,num,opt,obj});
require('./tools-contracts.cjs').register({command,str,num,opt,obj});
require('./workspace-contracts.cjs').register({command,str,num,opt,obj});
require('./tree-contracts.cjs').register({command,str,num,opt,obj});
require('./notebook-contracts.cjs').register({command,str,num,opt,obj});
require('./local-reading-contracts.cjs').register({command,str,num,opt,obj});
require('./virtual-contracts.cjs').register({command,str,num,opt,obj});
require('./backup-contracts.cjs').register({command,str,num,opt,obj});
commands.find(c=>c.method==='study.create').options.folderId=str('Optional study-folder UUID; null or omitted creates at the root.',false,{nullable:true});
commands.find(c=>c.method==='study.card.activate').options.excerptId=str('Optional excerpt part UUID; default first part.');
commands.find(c=>c.method==='study.review.configure').options.occlusionGroups=opt('array','One group number per image mask. Matching text/image group numbers reveal together in sequential mode; independent mode schedules separate questions.');
commands.find(c=>c.method==='study.review.configure').options.cloze.description='Use {{answer}} or grouped {{c1::answer::hint}}. Empty string clears cloze without discarding the saved question/answer.';
for(const method of ['study.review.preview','study.review.grade'])commands.find(c=>c.method===method).options.variantId=str('Optional cloze/image question group ID; default earliest due question.');
commands.find(c=>c.method==='reader.comparison.set').options.slot=num('Comparison pane slot; 1 is the second document, 2 is the third.',false,{integer:true,minimum:1,maximum:2});
for (const method of ['study.ink.add','study.card.ink.add','study.canvas.ink.add','study.map.ink.add']) {
  const c=commands.find(c=>c.method===method);
  c.options.width.required=false;
  c.options.width.description+=method==='study.ink.add'?' Omit to use document width, default 0.004.':['study.canvas.ink.add','study.map.ink.add'].includes(method)?' Omit to use canvasWidth, default 3.':' Omit to use cardWidth, or the legacy shared width, default 0.004.';
  c.options.geometry=obj('Optional raw-stroke intent: shape, straighten (off/auto/always), perfectShape, heldMs, aspectRatio (physical height/width), rulerAngle. Omitted settings follow study.ink.settings; heldMs defaults 0. The Core computes the saved path. Explicit scribbleErase:true permits a held dense scribble to erase; scribbleScope is scope or map, eraseRadius controls its radius, and document bands constrain visible source intervals. ruler optionally supplies {edges:[{a:[x,y],b:[x,y],group:top/bottom,t0:0..1,t1:0..1}],tolerance}; endpoints and tolerance use stroke coordinates. Edge positions t0/t1 permit discontinuous source segments across folded regions. Core snaps only a nearby along-edge gesture.');
  c.options.brush=str('Saved brush style.',false,{enum:['pen','pencil','highlighter']});
  c.options.opacity=num('Stroke opacity.',false,{minimum:.05,maximum:1});
}
commands.find(c=>c.method==='study.presentation.start').options.mode=str('Presentation format. map shows an animated branch context; cards preserves the original rich-card slides.',false,{enum:['cards','map']});
function generate() {
  fs.writeFileSync(path.join(root,'ui/mindmap-catalog.mjs'),'// Generated by scripts/contracts.cjs from mindmap-catalog.json.\nexport const CATALOG = '+fs.readFileSync(path.join(root,'ui/mindmap-catalog.json'),'utf8').trim()+';\n');
  const version = require('../package.json').version;
  fs.writeFileSync(path.join(root, 'schema.json'), JSON.stringify({ schemaVersion: 1, pluginId: 'margin-reader', version, transport: 'JSON-RPC 2.0', commands }, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'agents-company.plugin.json'), JSON.stringify({ schemaVersion: 1, id: 'margin-reader', name: 'Margin Reader', version, description: 'CLI-first 阅读与学习 · 学习集 · 摘录图片卡片 · 跨文档脑图', runtime: 'runtime.cjs', renderer: 'ui/index.html', cli: 'cli.cjs', documentation: 'API.md', schema: 'schema.json', autoAttach: true, workspaceDirectory: 'margin-reader-workspace', scope: 'workspace', license: 'MIT' }, null, 2) + '\n');
}
if (require.main === module) generate();
module.exports = { commands, generate };
