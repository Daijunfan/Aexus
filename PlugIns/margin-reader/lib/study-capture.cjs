'use strict';
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { JSDOM } = require('jsdom');
const { assert, ReaderError, writeNew, readBounded, digest } = require('./safety.cjs');
const { findDocument, parsedDocument, sourceStatus } = require('./documents.cjs');
const { validateLocator } = require('./outline.cjs');
const M = require('./study-model.cjs');
function selection(input, parsed, locator, text) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 'INVALID_PARAMS', 'selection must be an object.');
  if (parsed.kind === 'pdf') {
    assert(Object.keys(input).every(k => ['rects','polygon'].includes(k)), 'INVALID_PARAMS', 'PDF selection accepts rects only.');
    let polygon;assert(input.rects===undefined||Array.isArray(input.rects),'INVALID_PARAMS','rects must be an array.');const rects = [...(input.rects || [])];
    if(input.polygon){const p=input.polygon;assert(p.page===locator.page&&Array.isArray(p.points)&&p.points.length>=3&&p.points.length<=2048&&p.points.every(pt=>Array.isArray(pt)&&pt.length===2&&pt.every(v=>Number.isFinite(v)&&v>=0&&v<=1)),'INVALID_LOCATOR','Invalid lasso polygon.');assert(!rects.length,'INVALID_PARAMS','Choose rectangles or a polygon.');polygon={page:p.page,points:p.points};const xs=p.points.map(v=>v[0]),ys=p.points.map(v=>v[1]);rects.push({page:p.page,x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)});}
    assert(Array.isArray(rects) && rects.length <= 2000, 'INVALID_PARAMS', 'At most 2000 selection rectangles are accepted.');
    const normalized = rects.map(r => {
      assert(r && Object.keys(r).every(k => ['page','x','y','width','height'].includes(k)), 'INVALID_PARAMS', 'Invalid PDF rectangle.');
      assert(Number.isInteger(r.page) && r.page >= 1 && r.page <= parsed.pageCount, 'INVALID_LOCATOR', 'PDF selection page is outside the book.');
      assert(['x','y','width','height'].every(k => Number.isFinite(r[k])) && r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0 && r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001, 'INVALID_LOCATOR', 'Rectangle must be inside the page, in normalized coordinates.');
      return { page: r.page, x: r.x, y: r.y, width: Math.min(r.width,1-r.x), height: Math.min(r.height,1-r.y) };
    });
    assert(new Set(normalized.map(r => r.page)).size <= 12, 'TOO_LARGE', 'Select at most 12 pages per card.');
    assert(!normalized.length || normalized.some(r => r.page === locator.page), 'INVALID_LOCATOR', 'The source page must be part of the selected region.');
    return { rects: normalized, ...(polygon?{polygon}:{}) };
  }
  assert(Object.keys(input).every(k => ['start','end'].includes(k)), 'INVALID_PARAMS', 'Flow selections accept start/end character offsets only.');
  if (input.start === undefined && input.end === undefined) return {};
  const dom = new JSDOM(parsed.sections[locator.section].html);
  try {
    const body = dom.window.document.body.textContent;
    assert(Number.isInteger(input.start) && Number.isInteger(input.end) && input.start >= 0 && input.end > input.start && input.end <= body.length, 'INVALID_LOCATOR', 'Text selection offsets are outside the source.');
    const normalize = s => s.replace(/\s+/g, ' ').trim();
    assert(normalize(body.slice(input.start,input.end)) === normalize(text), 'SOURCE_CHANGED', 'Selected text does not match the current document. Select it again.');
    return { start: input.start, end: input.end };
  } finally { dom.window.close(); }
}
let running = 0; const waiting = [];
async function acquire() { if (running < 2) running++; else await new Promise(resolve => waiting.push(resolve)); }
function release() { const next = waiting.shift(); if (next) next(); else running--; }
function createCapture(store) {
  let closed = false; const cancels = new Set(), pending = new Set();
  async function image(args) {
    await acquire();
    try {
      assert(!closed, 'RUNTIME_CLOSED', 'Reader is closed.');
      return await new Promise((resolve,reject) => {
        const worker = new Worker(path.join(__dirname,'study-image-worker.cjs'), { workerData: args, stdout:true, stderr:true, resourceLimits:{maxOldGenerationSizeMb:768,stackSizeMb:8} });
        let done = false, timer;
        const stop = () => finish(new ReaderError('RUNTIME_CLOSED','Reader closed during capture. No card was saved.'));
        const finish = (error,result) => { if(done)return;done=true;clearTimeout(timer);cancels.delete(stop);worker.terminate().finally(()=>error?reject(error):resolve(result)); };
        cancels.add(stop); worker.stdout.resume();worker.stderr.resume();
        timer=setTimeout(()=>finish(new ReaderError('CAPTURE_TIMEOUT','Excerpt image exceeded 90 seconds. Select a smaller passage.')),90000);
        worker.once('message',m=>m.error?finish(new ReaderError(m.error.code,m.error.message)):finish(null,m.result));
        worker.once('error',e=>finish(new ReaderError('CAPTURE_FAILED',e.message)));
        worker.once('exit',code=>{if(!done)finish(new ReaderError('CAPTURE_FAILED',`Capture worker exited (${code}).`));});
      });
    } finally { release(); }
  }
  function duplicate(set, p, fingerprint) {
    const all = [...set.cards, ...set.cardTrash.flatMap(t => t.cards)], previous = all.find(c => c.captureId === p.captureId);
    if (!previous) return null;
    assert(previous.fingerprint === fingerprint && set.cards.includes(previous), 'CONFLICT', 'This capture ID was already used or removed. Use a new capture ID for a new excerpt.');
    return { setId:set.id, revision:set.revision, card:previous, duplicate:true };
  }
  async function create(p) {
    assert(M.UUID.test(p.captureId), 'INVALID_PARAMS', 'captureId must be a UUID for safe retries.');
    assert(typeof p.text === 'string' && p.text.length <= 12000, 'INVALID_PARAMS', 'Excerpt text must be at most 12000 characters.');
    M.color(p.color);
    const fingerprint = digest(JSON.stringify([p.documentId,p.expectedSourceVersion,p.text,p.locator,p.selection || {},p.color,p.title || '',p.parentId || null]));
    const initial = await store.load(), set = M.findSet(initial,p.setId), prior = duplicate(set,p,fingerprint); if(prior)return prior;
    M.revision(set,p.expectedRevision);
    assert(set.documentIds.includes(p.documentId), 'NOT_MEMBER', 'Add this document to the study set before making an excerpt.');
    assert(set.cards.length < 10000, 'TOO_LARGE', 'This study set has reached its 10000-card limit.');
    const doc = findDocument(initial,p.documentId);
    assert(doc.sourceVersion === p.expectedSourceVersion,'SOURCE_CHANGED','The document changed. Reopen it and select the passage again.');
    const parsed = await parsedDocument(store,doc), locator = validateLocator(p.locator,parsed), selected = selection(p.selection || {},parsed,locator,p.text);
    assert(p.text.trim() || selected.rects?.length, 'INVALID_PARAMS', 'Select some text or a PDF image area.');
    if (p.parentId) M.card(set,p.parentId);
    const rendered = await image({ workspace:store.workspace, filename:doc.path, sourceVersion:doc.sourceVersion, rects:selected.rects, polygon:selected.polygon, text:p.text, title:doc.title, password:p.password });
    assert(!closed,'RUNTIME_CLOSED','Reader closed before saving the card.');
    const id = randomUUID();
    return store.transaction(async(state,rollback)=>{
      const fresh = M.findSet(state,p.setId), previous = duplicate(fresh,p,fingerprint);if(previous)return previous;
      M.revision(fresh,p.expectedRevision);
      const source = findDocument(state,p.documentId);
      assert(fresh.documentIds.includes(source.id),'NOT_MEMBER','This document was removed from the study set.');
      assert(source.sourceVersion === p.expectedSourceVersion && !(await sourceStatus(store,source)).changed,'SOURCE_CHANGED','Document changed during capture. Nothing was saved.');
      const now = new Date().toISOString(), card = { id, captureId:p.captureId, fingerprint, title:M.title(p.title || p.text.trim().split('\n')[0].slice(0,100) || `第 ${locator.page} 页摘录`), text:p.text, note:'', color:p.color, parentId:null, collapsed:false, createdAt:now, updatedAt:now,
        source:{documentId:doc.id,path:doc.path,title:doc.title,format:doc.format,hash:doc.hash,sourceVersion:doc.sourceVersion,locator,selection:selected}, image:{kind:rendered.kind,width:rendered.width,height:rendered.height,mimeType:'image/png'} };
      await store.mkdir(`study-assets/${fresh.id}`); const file=await store.meta(`study-assets/${fresh.id}/${id}.png`);
      await writeNew(file,Buffer.from(rendered.bytes));rollback(()=>fs.rm(file,{force:true}));
      require('./study-history.cjs').checkpoint(fresh);
      fresh.cards.push(card);if(p.parentId)M.move(fresh,card,p.parentId);M.touch(fresh);
      return {setId:fresh.id,revision:fresh.revision,card,duplicate:false};
    });
  }
  return { create(p) {const work=create(p);pending.add(work);work.then(()=>pending.delete(work),()=>pending.delete(work));return work;},
    async close(){closed=true;for(const stop of [...cancels])stop();await Promise.allSettled([...pending]);} };
}
async function cardImage(store, setId, cardId) {
  const state=await store.load(), set=M.findSet(state,setId);assert(M.card(set,cardId).image,'NOT_FOUND','Text notes do not have a captured image.');
  assert(M.UUID.test(setId)&&M.UUID.test(cardId),'INVALID_PARAMS','Invalid card image reference.');
  return {bytes:await readBounded(await store.meta(`study-assets/${setId}/${cardId}.png`),8*1024*1024),mimeType:'image/png'};
}
module.exports={createCapture,cardImage};
