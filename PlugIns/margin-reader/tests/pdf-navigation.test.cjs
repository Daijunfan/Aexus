'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { setup, pdfFixture } = require('./fixtures.cjs');
const { createPlugin } = require('../runtime.cjs');
const { createStore } = require('../lib/store.cjs');

test('PDF preferences are CLI/Core settings with bounds and survive restart', async t => {
  const { api, error, workspace } = await setup(t);
  assert.equal((await api('settings.get')).pdfMode, 'continuous');
  const values = { pdfMode: 'paged', pdfFit: 'page', pdfZoom: 1.5, pdfScrollSpeed: 2.25, pdfFocus: true };
  const changed = await api('settings.set', values);
  for (const [k,v] of Object.entries(values)) assert.equal(changed[k],v);
  for (const invalid of [{pdfMode:'horizontal'}, {pdfFit:'stretch'}, {pdfZoom:0.1}, {pdfZoom:4}, {pdfScrollSpeed:0}, {pdfScrollSpeed:5}, {pdfScrollSpeed:'fast'}, {pdfFocus:1}]) await error('settings.set', invalid, 'INVALID_PARAMS');
  const other = await createPlugin({workspace}); t.after(()=>other.close());
  const reply = await other.request({jsonrpc:'2.0',id:1,method:'settings.get'});
  for (const [k,v] of Object.entries(values)) assert.equal(reply.result[k],v);
});

test('old state receives additive PDF defaults without being rewritten by a read', async t => {
  const { workspace } = await setup(t);
  const store = await createStore(workspace); const state = await store.load();
  for (const key of ['pdfMode','pdfFit','pdfZoom','pdfScrollSpeed','pdfFocus']) delete state.settings[key];
  state.settings.theme = 'sepia'; state.settings.fontSize = 24;
  const text = JSON.stringify(state); await fs.writeFile(store.file,text);
  const loaded = await store.load(); assert.equal(loaded.settings.pdfMode,'continuous'); assert.equal(loaded.settings.theme,'sepia'); assert.equal(loaded.settings.fontSize,24);
  assert.equal(await fs.readFile(store.file,'utf8'),text);
});

test('PDF pageOffset is scale-independent; legacy offset and invalid-locator checks remain', async t => {
  const { api,error,workspace } = await setup(t); await fs.writeFile(path.join(workspace,'book.pdf'),pdfFixture());
  const doc = await api('document.open',{path:'book.pdf'});
  const loc = {page:2,pageOffset:0.375}; await api('reader.position.set',{id:doc.id,locator:loc});
  assert.deepEqual((await api('reader.position.get',{id:doc.id})).locator,loc);
  for (const locator of [{page:3,pageOffset:0},{page:1,pageOffset:-1},{page:1,pageOffset:1.01},{page:1,pageOffset:'0'},{page:1,pageOffset:0,offset:0}]) await error('reader.position.set',{id:doc.id,locator},'INVALID_LOCATOR');
  await api('reader.position.set',{id:doc.id,locator:{page:1,offset:0.5}});
});

test('responsive PDF geometry fills available width without old scale cap or distortion', async () => {
  const { pageGeometry,layoutPages,locate,positionTop } = await import('../ui/pdf-geometry.mjs');
  const page = {width:504,height:661.5}; const result = pageGeometry(page,2000,700,'width',1);
  assert.equal(result.width,2000); assert(result.scale>1.6); assert.equal(result.width/result.height,page.width/page.height);
  const fit = pageGeometry(page,1000,700,'page',1); assert(fit.width<=1000 && fit.height<=700); assert.equal(fit.height,700);
  const pages = layoutPages([page,{width:661.5,height:504},page],1000,700,'width',1);
  const position = {page:2,pageOffset:0.45}; const top = positionTop(position,pages,700);
  assert.deepEqual(locate(pages,top),position);
  // scrollTop rounds subpixel coordinates; a chapter jump must not report the previous page.
  assert.equal(locate(pages,Math.floor(pages[1].top)).page,2);
  const resized = layoutPages([page,{width:661.5,height:504},page],1300,900,'width',1);
  assert.deepEqual(locate(resized,positionTop(position,resized,900)),position);
  assert.equal(positionTop({page:1,offset:1},pages,700),pages[0].height-700);
});

test('one horizontal gesture plus momentum yields exactly one page, speed-independent', async () => {
  const { PdfGesture } = await import('../ui/pdf-gestures.mjs');
  for (const speed of [0.25,1,4]) {
    const g=new PdfGesture(); let turns=[];
    [8,20,40,90,60,42,30,20,10,5,1].forEach((deltaX,i)=>{const a=g.feed({deltaX,deltaY:2,deltaMode:0},{now:i*30,mode:'continuous',speed});if(a.type==='turn') turns.push(a.delta);});
    assert.deepEqual(turns,[1]);
    assert.equal(g.feed({deltaX:-80,deltaY:0,deltaMode:0},{now:800,mode:'continuous',speed}).delta,-1);
  }
});

test('vertical deltas respect speed and unit; diagonal drift never flips the page', async () => {
  const { PdfGesture } = await import('../ui/pdf-gestures.mjs');
  const g=new PdfGesture();
  assert.deepEqual(g.feed({deltaX:3,deltaY:40,deltaMode:0},{now:0,mode:'continuous',speed:2}),{type:'scroll',delta:80});
  assert.equal(g.feed({deltaX:80,deltaY:30,deltaMode:0},{now:30,mode:'continuous',speed:2}).type,'scroll');
  assert.equal(g.feed({deltaX:0,deltaY:2,deltaMode:1},{now:900,mode:'continuous',speed:0.5}).delta,16);
  assert.equal(g.feed({deltaX:0,deltaY:1,deltaMode:2},{now:1800,mode:'continuous',height:600,speed:1}).delta,600);
  assert.equal(g.feed({ctrlKey:true,deltaX:0,deltaY:100,deltaMode:0},{now:2000,mode:'continuous'}).type,'ignore');
});

test('paged vertical pan consumes the gesture, so reaching its edge cannot cascade pages', async () => {
  const { PdfGesture } = await import('../ui/pdf-gestures.mjs'); const g=new PdfGesture();
  assert.equal(g.feed({deltaX:0,deltaY:100,deltaMode:0},{now:0,mode:'paged',top:0,max:100}).type,'scroll');
  assert.equal(g.feed({deltaX:0,deltaY:200,deltaMode:0},{now:30,mode:'paged',top:100,max:100}).type,'consume');
  assert.deepEqual(g.feed({deltaX:0,deltaY:100,deltaMode:0},{now:700,mode:'paged',top:100,max:100}),{type:'turn',delta:1});
  assert.equal(g.feed({deltaX:0,deltaY:100,deltaMode:0},{now:730,mode:'paged',top:0,max:100}).type,'consume');
});
