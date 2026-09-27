import { $, decorate, run, toast, describeError, activity, field, showDialog, modalDirty, parentPath, joinPath } from './dom.js';
import { api, subscribe, notifyHost, token, flushRequests } from './transport.js';
import { Library } from './library.js';
import { Outline } from './outline.js';
import { ReaderRenderer } from './reader.js';
import { PdfGesture } from './pdf-gestures.mjs';
import { ReaderTools } from './reader-tools.js';
import { Bookmarks } from './bookmarks.js';
import { StudyController } from './study.js';
decorate();
const state = { settings: null, document: null, opening: false, rendering: false };
const pdfGesture = new PdfGesture();
let positionEpoch = 0, savingPosition = 0, navigationQueue = Promise.resolve(), resizeTimer, progressScrubbing = false;
let password, openGeneration = 0, refreshTimer, positionTimer, positionDraft, saveFailure, positionQueue = Promise.resolve(), renderQueue = Promise.resolve(), suppressScroll = false;
const renderer = new ReaderRenderer(run(locator => navigateLocator(locator)));
const library = new Library({ openDocument: openDocument, navigate: openFolder, changed: refreshDocument });
const outline = new Outline({ getDocument: () => state.document, getLocator: () => renderer.currentLocator(state.document), navigate: navigateLocator, changed: refreshDocument });
new Bookmarks({getDocument:()=>state.document,getLocator:()=>renderer.currentLocator(state.document),navigate:navigateLocator,changed:refreshDocument});
const study = new StudyController({
  redrawDocument:renderDocument, getDocument: () => state.document, getRenderer: () => renderer, getPassword: () => password, openDocument, openFolder, navigate: navigateLocator,
  beforeNavigate: async () => { if((study.ink?.dirty||study.cardInk?.dirty))throw new Error('请先保存或放弃尚未保存的笔画。'); await savePosition(); ++openGeneration; },
  showHome: async () => { state.document = null; state.opening = false; password = undefined; await renderer.clear(); state.settings = await api('settings.get'); setReading(false); applySettings(); }
});
const readerTools = new ReaderTools({closeDocument:()=>study.current?study.home(study.current.id):openFolder(library.folder),getDocument:()=>state.document,openDocument:async path=>{const member=study.current?.documents.find(d=>d.path===path);if(member)await study.member(member.id);else await openDocument(path);},created:async doc=>{if(study.current){await study.change('study.documents.add',{paths:[doc.path]});await study.member(doc.id);}else await openDocument(doc.path);await library.refresh();}});
function applySettings() {
  const settings = state.settings;
  document.body.dataset.theme = settings.theme;
  document.documentElement.style.setProperty('--explorer', `${settings.sidebarWidth}px`);
  document.documentElement.style.setProperty('--outline', `${settings.outlineWidth}px`);
  document.documentElement.style.setProperty('--study-document', `${settings.studyRatio || .53}fr`);
  document.documentElement.style.setProperty('--study-map', `${1-(settings.studyRatio || .53)}fr`);
  library.view = settings.view;
  syncPdfControls();
  notifyHost('appearance', { theme: settings.theme === 'dark' ? 'dark' : 'light' });
}
async function setSettings(patch) {
  const result = await api('settings.set', patch); state.settings = result; applySettings(); return result;
}
function syncPdfControls() {
  const pdf = state.document?.kind === 'pdf', settings = state.settings || {};
  $('reader-view').classList.toggle('pdf-document', pdf);
  $('workspace').classList.toggle('focus-reading', pdf && Boolean(settings.pdfFocus) && !study.current);
  $('pdf-controls').hidden = !pdf;
  $('pdf-progress').hidden = !pdf || settings.pdfMode !== 'paged';
  $('pdf-vertical-progress').hidden = !pdf || settings.pdfMode === 'paged';
  $('pdf-continuous').setAttribute('aria-pressed', settings.pdfMode !== 'paged');
  $('pdf-paged').setAttribute('aria-pressed', settings.pdfMode === 'paged');
  $('pdf-focus').hidden = Boolean(study.current);
  $('pdf-focus').setAttribute('aria-pressed', Boolean(settings.pdfFocus));
  $('pdf-focus').textContent = settings.pdfFocus ? '显示侧栏' : '专注阅读';
  $('pdf-fit').value = settings.pdfFit || 'width';
  if (document.activeElement !== $('pdf-speed')) $('pdf-speed').value = settings.pdfScrollSpeed || 1;
  $('pdf-speed-value').value = `${settings.pdfScrollSpeed || 1}×`;
  $('pdf-reset-zoom').textContent = `${Math.round((settings.pdfZoom || 1) * 100)}%`;
}
function updatePageIndicators() {
  const doc = state.document; if (!doc) return;
  const page = doc.kind === 'pdf' ? doc.position.page : doc.position.section + 1;
  const total = doc.kind === 'pdf' ? doc.pageCount : doc.sectionCount;
  if (document.activeElement !== $('page-number')) $('page-number').value = page;
  $('page-number').max = total; $('page-total').textContent = `/ ${total}`;
  $('previous-page').disabled = page <= 1; $('next-page').disabled = page >= total;
  if (doc.kind === 'pdf') {
    const slider = $('pdf-page-progress'); slider.max = total;
    if (!progressScrubbing) slider.value = page;
    slider.setAttribute('aria-valuetext', `第 ${page} 页，共 ${total} 页`);
    $('pdf-progress-value').value = `${page} / ${total}`;
    const vertical = $('pdf-document-progress'), scroll = $('reader-scroll');
    vertical.value = Math.round(scroll.scrollTop / Math.max(1, scroll.scrollHeight - scroll.clientHeight) * 100000);
    vertical.setAttribute('aria-valuetext', `第 ${page} 页，共 ${total} 页`);
  }
  $('reading-position').textContent = doc.kind === 'pdf' ? `第 ${page} / ${total} 页${doc.pageLabels?.[page - 1] ? ` · ${doc.pageLabels[page - 1]}` : ''}` : `第 ${page} / ${total} 节 · ${doc.sections[page - 1]?.title || ''}`;
}
function setReading(reading) {
  if (reading) library.selection.reset();
  $('workspace').classList.toggle('reading', reading); $('library-view').hidden = reading; $('reader-view').hidden = !reading; $('outline-pane').hidden = !reading; $('outline-divider').hidden = !reading;
  syncPdfControls(); study.mount(reading);
}
async function savePosition() {
  clearTimeout(positionTimer); positionTimer = null;
  const draft = positionDraft; positionDraft = null;
  if (!draft) return positionQueue;
  $('reader-save-status').textContent = '正在保存位置…';
  positionQueue = positionQueue.catch(() => {}).then(async () => {
    savingPosition++;
    try {
      await api('reader.position.set', draft); saveFailure = null;
      $('reader-save-status').textContent = '阅读位置已保存';
    } catch (error) {
      saveFailure = error; positionDraft ||= draft;
      $('reader-save-status').textContent = '保存失败 · 点击重试';
      toast(describeError(error), true); throw error;
    } finally { savingPosition--; }
  });
  return positionQueue;
}
function positionChanged() {
  if (!state.document || suppressScroll || state.rendering || $('reader-view').hidden) return;
  const locator = renderer.currentLocator(state.document);
  if (JSON.stringify(locator) === JSON.stringify(state.document.position)) return;
  positionEpoch++;
  state.document.position = locator; positionDraft = { id: state.document.id, locator };
  updatePageIndicators();
  clearTimeout(positionTimer); positionTimer = setTimeout(() => savePosition().catch(() => {}), 450);
}
$('reader-scroll').addEventListener('scroll', positionChanged, { passive: true });
$('reader-save-status').addEventListener('click', run(savePosition));
async function flush() {
  await savePosition(); await flushRequests();
  if (saveFailure) throw saveFailure;
  if ((study.ink?.dirty||study.cardInk?.dirty)) throw new Error('还有尚未保存的笔画，请保存或明确放弃。');
  if (modalDirty()) throw new Error('还有尚未保存的对话框内容，请保存或明确取消后再关闭。');
}
async function openFolder(folder = '.') {
  if((study.ink?.dirty||study.cardInk?.dirty))throw new Error('请先保存或放弃尚未保存的笔画。');
  if (study.current) await study.leave();
  await savePosition(); ++openGeneration; library.selection.reset();
  await setSettings({ currentFolder: folder, lastDocument: null });
  state.document = null; password = undefined; library.folder = folder; library.activePath = null; library.selected = null;
  setReading(false); await renderer.clear(); await readerTools.refresh(); await library.refresh();
}
async function openDocument(path, options = {}) {
  if((study.ink?.dirty||study.cardInk?.dirty))throw new Error('请先保存或放弃尚未保存的笔画。');
  if (study.current && options.studySetId !== study.current.id) await study.leave();
  await savePosition(); const generation = ++openGeneration; state.opening = true; activity('正在读取文档…');
  try {
    const doc = await api('document.open', { path, ...(options.refresh ? { refresh: true } : {}), ...(options.password ? { password: options.password } : {}) });
    if (generation !== openGeneration) return;
    const wasSame = state.document?.id === doc.id;
    state.document = doc; password = options.password || (wasSame ? password : undefined); outline.selected = wasSame ? outline.selected : null;
    library.folder = parentPath(doc.path); library.setActive(doc.path);
    state.settings = await api('settings.get');
    setReading(true); updateDocumentHeader(); outline.render(); await renderDocument(); await library.refresh();
  } catch (error) {
    if (error.code === 'PASSWORD_REQUIRED' && !options.password) {
      showDialog({ title: '打开加密 PDF', html: field('password', '文档密码', '', { type: 'password', required: true, help: '密码仅在本次读取期间使用，不写入工作区。' }), submit: '打开', onSubmit: values => openDocument(path, { password: values.password, refresh: true, studySetId: options.studySetId }) });
    } else throw error;
  } finally { if (generation === openGeneration) state.opening = false; activity(''); }
}
function updateDocumentHeader() {
  const doc = state.document; if (!doc) return;
  $('document-title').textContent = doc.title; $('document-path').textContent = doc.path; $('format-label').textContent = doc.format.toUpperCase();
  updatePageIndicators(); syncPdfControls();
  const warnings = [...(doc.sourceChanged ? ['源文件已在外部修改，请点击“重新解析文档”。自定义目录会保留，失效目标会标记。'] : []), ...(doc.warnings || [])];
  $('document-warning').textContent = warnings.join('\n'); $('document-warning').hidden = !warnings.length;
}
async function renderDocument() {
  const generation = openGeneration;
  renderQueue = renderQueue.catch(() => {}).then(async () => {
    if (!state.document || generation !== openGeneration) return;
    suppressScroll = true; state.rendering = true;
    try { await renderer.show(state.document, {...state.settings,unfoldPage:async page=>{await api('document.fold',{id:state.document.id,expectedRevision:state.document.revision,pages:state.document.foldedPages.filter(n=>n!==page)});await refreshDocument();await renderDocument();},extendedNotes:study.current?.cards.filter(c=>c.anchor?.documentId===state.document.id&&!c.anchorChanged)||[],editExtendedNote:card=>study.map.edit(card)}, password); updateDocumentHeader(); study.readerRendered(); await readerTools.refresh(); }
    finally { state.rendering = false; requestAnimationFrame(() => { suppressScroll = false; positionChanged(); }); }
  });
  return renderQueue;
}
async function navigateLocator(locator) {
  if (!state.document) return;
  await savePosition();
  const id = state.document.id; positionEpoch++;
  const position = await api('reader.position.set', { id, locator });
  if (state.document?.id !== id) return;
  state.document.position = position.locator; await renderDocument();
}
async function refreshDocument() {
  if (!state.document || state.opening) return;
  const id = state.document.id, previous = state.document, observedEpoch = positionEpoch;
  let fresh;
  try { fresh = await api('document.get', { id }); }
  catch (error) { if (error.code === 'NOT_FOUND') { await openFolder('.'); return; } throw error; }
  if (state.document?.id !== id) return;
  const localPending = positionDraft?.id === id || savingPosition > 0 || observedEpoch !== positionEpoch || state.rendering;
  const changedPosition = !localPending && JSON.stringify(fresh.position) !== JSON.stringify(previous.position);
  if (localPending) fresh.position = state.document.position;
  state.document = fresh; library.setActive(fresh.path); updateDocumentHeader(); outline.render();
  if (changedPosition && !fresh.sourceChanged) await renderDocument();
}
async function refreshFromEvent() {
  if (state.opening || study.busy) return;
  const freshSettings = await api('settings.get');
  const old = state.settings;
  state.settings = freshSettings; applySettings(); await readerTools.refresh();
  await study.refreshList();
  if (freshSettings.activeStudySet) {
    if (study.current?.id !== freshSettings.activeStudySet || (freshSettings.lastDocument || null) !== (state.document?.id || null)) { await study.restore(freshSettings); return; }
    await study.refresh();
    if (state.document) await refreshDocument();
    if (state.document && old && ['fontSize','lineHeight','pdfMode','pdfFit','pdfZoom','pdfFocus','sidebarWidth','outlineWidth'].some(key => old[key] !== freshSettings[key])) await renderDocument();
    return;
  }
  if (study.current) { await study.leave(false); await openFolder(freshSettings.currentFolder); return; }
  if (freshSettings.lastDocument && freshSettings.lastDocument !== state.document?.id && !positionDraft) {
    const doc = await api('document.get', { id: freshSettings.lastDocument });
    state.document = doc; library.folder = parentPath(doc.path); library.setActive(doc.path); setReading(true); updateDocumentHeader(); outline.render(); await renderDocument();
  }
  if (!state.document) library.folder = freshSettings.currentFolder;
  try { await library.refresh(); }
  catch (error) { if (error.code === 'NOT_FOUND') { library.folder = '.'; await setSettings({ currentFolder: '.' }); await library.refresh(); } else throw error; }
  await refreshDocument();
  if (state.document && old && ['fontSize','lineHeight','pdfMode','pdfFit','pdfZoom','pdfFocus','sidebarWidth','outlineWidth'].some(key => old[key] !== freshSettings[key])) await renderDocument();
}
const bind = (id, fn) => $(id).addEventListener('click', run(fn));
bind('home', () => openFolder('.')); bind('back-library', () => study.current ? study.home(study.current.id) : openFolder(library.folder));
bind('grid-view', async () => { await setSettings({ view: 'grid' }); library.renderFiles(); });
bind('list-view', async () => { await setSettings({ view: 'list' }); library.renderFiles(); });
bind('theme', async () => { const themes = ['light','dark','sepia']; await setSettings({ theme: themes[(themes.indexOf(state.settings.theme) + 1) % themes.length] }); });
for (const [id, delta] of [['font-smaller',-2],['font-larger',2]]) bind(id, async () => {
  await savePosition();
  if (state.document?.kind === 'pdf') await setSettings({ pdfZoom: Math.min(3, Math.max(0.5, Math.round((state.settings.pdfZoom + delta / 20) * 100) / 100)) });
  else await setSettings({ fontSize: Math.min(32, Math.max(12, state.settings.fontSize + delta)) });
  if (state.document) await renderDocument();
});
function pageBy(delta, absolute) {
  const documentId = state.document?.id;
  navigationQueue = navigationQueue.catch(() => {}).then(async () => {
    const doc = state.document; if (!doc || doc.id !== documentId) return;
    const current = doc.kind === 'pdf' ? doc.position.page : doc.position.section + 1;
    const target = Math.min(doc.kind === 'pdf' ? doc.pageCount : doc.sectionCount, Math.max(1, absolute ?? current + delta));
    if (!Number.isInteger(target)) return;
    await navigateLocator(doc.kind === 'pdf' ? { page: target } : { section: target - 1 });
  });
  return navigationQueue;
}
bind('previous-page', () => pageBy(-1)); bind('next-page', () => pageBy(1));
$('page-number').addEventListener('change', run(() => pageBy(0, Number($('page-number').value))));
bind('reopen-document', () => state.document && openDocument(state.document.path, { refresh: true, password, studySetId: study.current?.id }));
bind('search-document', () => { $('search-panel').hidden = !$('search-panel').hidden; if (!$('search-panel').hidden) $('search-query').focus(); });
bind('close-search', () => { $('search-panel').hidden = true; });
bind('toggle-outline', () => { $('workspace').classList.toggle('outline-open'); });
async function pdfPreference(patch) {
  if (state.document?.kind !== 'pdf') return;
  positionChanged(); await savePosition();
  await setSettings(patch); pdfGesture.reset(); await renderDocument();
}
bind('pdf-continuous', () => pdfPreference({ pdfMode: 'continuous' }));
bind('pdf-paged', () => pdfPreference({ pdfMode: 'paged' }));
bind('pdf-focus', () => pdfPreference({ pdfFocus: !state.settings.pdfFocus }));
bind('pdf-reset-zoom', () => pdfPreference({ pdfZoom: 1 }));
$('pdf-fit').addEventListener('change', run(() => pdfPreference({ pdfFit: $('pdf-fit').value, pdfZoom: 1 })));
$('pdf-speed').addEventListener('input', () => { $('pdf-speed-value').value = `${$('pdf-speed').value}×`; });
$('pdf-speed').addEventListener('change', run(() => setSettings({ pdfScrollSpeed: Number($('pdf-speed').value) })));
$('pdf-document-progress').addEventListener('input', () => {
  const scroll = $('reader-scroll');
  scroll.scrollTop = Number($('pdf-document-progress').value) / 100000 * (scroll.scrollHeight - scroll.clientHeight);
  positionChanged();
});
$('pdf-page-progress').addEventListener('input', () => { progressScrubbing = true; $('pdf-progress-value').value = `${$('pdf-page-progress').value} / ${state.document?.pageCount}`; });
$('pdf-page-progress').addEventListener('change', run(() => { const page = Number($('pdf-page-progress').value); progressScrubbing = false; return pageBy(0, page); }));
$('reader-scroll').addEventListener('wheel', event => {
  if (state.document?.kind !== 'pdf' || $('dialog').open || !event.cancelable) return;
  const scroller = $('reader-scroll');
  const action = pdfGesture.feed(event, { now: performance.now(), mode: state.settings.pdfMode, speed: state.settings.pdfScrollSpeed, height: scroller.clientHeight, top: scroller.scrollTop, max: scroller.scrollHeight - scroller.clientHeight });
  if (action.type === 'ignore') return;
  event.preventDefault();
  if (action.type === 'scroll') scroller.scrollTop += action.delta;
  else if (action.type === 'turn') pageBy(action.delta).catch(error => toast(describeError(error), true));
}, { passive: false });
// Reflow automatically after a window, side panel or search-panel resize.
const pdfResize = new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.document?.kind === 'pdf' && !state.opening && !$('reader-view').hidden) renderDocument().catch(error => toast(describeError(error), true));
  }, 120);
});
pdfResize.observe($('reader-scroll'));
$('search-form').addEventListener('submit', run(async event => {
  event.preventDefault(); const doc = state.document; if (!doc) return;
  const result = await api('document.search', { id: doc.id, query: $('search-query').value, limit: 200 });
  if (state.document?.id !== doc.id) return;
  $('search-results').replaceChildren();
  if (!result.matches.length) { $('search-results').textContent = '没有找到匹配内容。'; return; }
  for (const match of result.matches) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'search-hit';
    const meta = document.createElement('small'); meta.textContent = doc.kind === 'pdf' ? `第 ${match.locator.page} 页` : `第 ${match.locator.section + 1} 节`;
    const text = document.createElement('span'); text.textContent = match.excerpt;
    button.append(meta, text); button.addEventListener('click', run(() => navigateLocator(match.locator))); $('search-results').append(button);
  }
  if (result.truncated) { const note = document.createElement('small'); note.textContent = '仅显示前 200 项，请缩小搜索范围。'; $('search-results').append(note); }
}));
bind('export-document', () => {
  const doc = state.document; if (!doc) return;
  showDialog({ title: '导出可读内容', html: field('format', '导出格式', 'html', { choices: [['html','离线 HTML'],['md','Markdown 文本'],['txt','纯文本'],['json','正文与目录 JSON']] }) + field('path', '保存路径（相对文库）', joinPath(library.folder, `${doc.title.replace(/[\\/:*?"<>|]/g, '-')}-export.html`), { required: true, help: '不会覆盖现有文件。PDF 导出的是文本层，原版 PDF 保留在文库中。' }), submit: '导出', onSubmit: async values => { const result = await api('document.export', { id: doc.id, format: values.format, path: values.path }); await library.refresh(); toast(`已导出：${result.path}`); } });
});
function divider(id, property, minimum, maximum, direction = 1) {
  const el = $(id);
  const split=()=>id==='outline-divider'&&study.current&&!study.outline;
  const ratio=value=>Math.max(.3,Math.min(.7,value));
  const paint=value=>{document.documentElement.style.setProperty('--study-document',`${value}fr`);document.documentElement.style.setProperty('--study-map',`${1-value}fr`);};
  el.addEventListener('pointerdown', event => {
    if(split()){const start=event.clientX,initial=state.settings.studyRatio||.53,width=$('reader-view').clientWidth+$('study-pane').clientWidth;let value=initial;el.setPointerCapture(event.pointerId);const move=e=>{value=ratio(initial+(e.clientX-start)/width);paint(value);};const stop=run(async()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',stop);el.removeEventListener('pointercancel',stop);await setSettings({studyRatio:value});});el.addEventListener('pointermove',move);el.addEventListener('pointerup',stop,{once:true});el.addEventListener('pointercancel',stop,{once:true});return;}
    const start = event.clientX, initial = state.settings[property]; el.setPointerCapture(event.pointerId);
    let value = initial;
    const move = current => { value = Math.round(Math.min(maximum, Math.max(minimum, initial + direction * (current.clientX - start)))); document.documentElement.style.setProperty(property === 'sidebarWidth' ? '--explorer' : '--outline', `${value}px`); };
    const stop = run(async () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', stop); await setSettings({ [property]: value }); if (state.document?.kind === 'pdf') await renderDocument(); });
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', stop, { once: true });
  });
  el.addEventListener('keydown', run(async event => { if (!['ArrowLeft','ArrowRight'].includes(event.key)) return; event.preventDefault(); if(split()){await setSettings({studyRatio:ratio((state.settings.studyRatio||.53)+(event.key==='ArrowRight'?.02:-.02))});return;} await setSettings({ [property]: Math.min(maximum, Math.max(minimum, state.settings[property] + (event.key === 'ArrowRight' ? 10 : -10) * direction)) }); }));
}
divider('explorer-divider', 'sidebarWidth', 180, 480); divider('outline-divider', 'outlineWidth', 200, 480, -1);
// LibraryDrag owns synchronous drag/drop cancellation and destination feedback.
document.addEventListener('keydown', run(async event => {
  if (state.document?.kind === 'pdf' && !$('dialog').open && !event.metaKey && !event.ctrlKey && !event.altKey && !event.target.closest('input,textarea,select,[contenteditable],[role=treeitem]')) {
    if (['ArrowRight','ArrowLeft','PageDown','PageUp',' '].includes(event.key)) {
      event.preventDefault();
      await pageBy(['ArrowLeft','PageUp'].includes(event.key) || event.key === ' ' && event.shiftKey ? -1 : 1);
      return;
    }
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); $('file-input').click(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f' && state.document) { event.preventDefault(); $('search-panel').hidden = false; $('search-query').focus(); }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); await flush(); toast('更改已保存'); }
}));
window.addEventListener('message', async event => {
  if (event.source !== parent || event.data?.token !== token || event.data?.type !== 'agents-plugin:flush') return;
  try { await flush(); notifyHost('flushed', { id: event.data.id }); }
  catch (error) { notifyHost('flushed', { id: event.data.id, error: describeError(error) }); }
});
window.addEventListener('error', event => { if (event.error) toast(describeError(event.error), true); });
async function initialize() {
  state.settings = await api('settings.get'); applySettings(); library.folder = state.settings.currentFolder;
  try { await library.refresh(); } catch { library.folder = '.'; await setSettings({ currentFolder: '.' }); await library.refresh(); }
  await study.refreshList();
  const restoredStudy = state.settings.activeStudySet ? await study.restore(state.settings) : false;
  if (!restoredStudy && state.settings.lastDocument) {
    try { const doc = await api('document.get', { id: state.settings.lastDocument }); await openDocument(doc.path); }
    catch (error) { toast(describeError(error), true); }
  }
  subscribe(() => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refreshFromEvent().catch(error => toast(describeError(error), true)), 250); });
  notifyHost('ready'); document.body.dataset.ready = 'true';
}
initialize().catch(error => { activity(''); $('folder-count').textContent = '连接失败'; toast(describeError(error), true); });
