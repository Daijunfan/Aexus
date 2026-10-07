'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { setup, pdfFixture } = require('./fixtures.cjs');
const { loadImage, createCanvas } = require('@napi-rs/canvas');
const { createPlugin } = require('../runtime.cjs');
const { digest } = require('../lib/safety.cjs');

test('quiet folder import preserves the currently open book', async t => {
  const { api, workspace } = await setup(t); const bytes = pdfFixture();
  await fs.writeFile(path.join(workspace,'current.pdf'),bytes);
  const current = await api('document.open',{path:'current.pdf'});
  await api('reader.position.set',{id:current.id,locator:{page:2}});
  await api('fs.mkdir',{path:'Target'});
  const upload = await api('import.begin',{path:'Target/new.pdf',totalBytes:bytes.length});
  await api('import.chunk',{uploadId:upload.uploadId,offset:0,contentBase64:bytes.toString('base64')});
  const imported = await api('import.finish',{uploadId:upload.uploadId,activate:false});
  assert.equal(imported.pageCount,2);assert.equal((await api('settings.get')).lastDocument,current.id);
  assert.equal((await api('reader.position.get',{id:current.id})).locator.page,2);
  await api('document.open',{path:'Target/new.pdf',activate:false});assert.equal((await api('settings.get')).lastDocument,current.id);
});

test('standalone CLI returns the same native thumbnail without a window', async t => {
  const { api,workspace }=await setup(t);await fs.writeFile(path.join(workspace,'cli.pdf'),pdfFixture());
  const expected=await api('document.preview',{path:'cli.pdf'});
  const env={...process.env};for(const k of ['AGENTS_WORKSPACE','AGENTS_COMPANY_PLUGIN_RPC','AGENTS_COMPANY_TOKEN','AGENTS_COMPANY_TOKEN_FILE'])delete env[k];
  const exec=require('node:util').promisify(require('node:child_process').execFile);
  const output=await exec(process.execPath,[path.resolve(__dirname,'../cli.cjs'),'--workspace',workspace,'api','document.preview','--data',JSON.stringify({path:'cli.pdf'})],{env,maxBuffer:2*1024*1024});
  const reply=JSON.parse(output.stdout);assert(!reply.error);assert.equal(reply.result.contentBase64,expected.contentBase64);assert.equal(reply.result.cacheHit,true);
});

test('PDF cover is a real PNG, cached without opening or registering the book', async t => {
  const { api, workspace } = await setup(t);
  const source = pdfFixture(); await fs.writeFile(path.join(workspace,'cover.pdf'),source);
  const before = await api('settings.get');
  const first = await api('document.preview',{path:'cover.pdf'});
  assert.equal(first.kind,'image');assert.equal(first.page,1);assert.equal(first.pageCount,2);assert.equal(first.cacheHit,false);
  const bytes = Buffer.from(first.contentBase64,'base64');assert.equal(bytes.subarray(1,4).toString(),'PNG');
  const image = await loadImage(bytes);assert(image.width>100&&image.width<=360&&image.height<=480);
  const canvas = createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,image.width,image.height).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<160&&pixels[i+3]>0)ink++;
  assert(ink>20,'Cover must contain actual rendered text, not an empty placeholder');
  assert.equal((await api('document.preview',{path:'cover.pdf'})).contentBase64,first.contentBase64);
  assert.equal((await api('document.preview',{path:'cover.pdf'})).cacheHit,true);
  assert.deepEqual(await api('settings.get'),before);
  assert.equal((await api('fs.list')).entries[0].documentId,undefined);
  assert.equal(digest(await fs.readFile(path.join(workspace,'cover.pdf'))),digest(source));
  const other=await createPlugin({workspace});t.after(()=>other.close());
  const cached=await other.request({jsonrpc:'2.0',id:1,method:'document.preview',params:{path:'cover.pdf'}});assert.equal(cached.result.cacheHit,true);
});

test('HTML miniature uses the real title, text and local image with inert scripts', async t => {
  const { api,workspace }=await setup(t);const canvas=createCanvas(140,90),ctx=canvas.getContext('2d');ctx.fillStyle='#1488ec';ctx.fillRect(0,0,140,90);
  const image=await canvas.encode('png');await fs.writeFile(path.join(workspace,'picture.png'),image);
  const content='<h1>阅读器测试 · 中文博客</h1><p>这是真实的正文摘要。</p><img src="picture.png"><script>throw new Error("do not execute")</script><iframe src="http://127.0.0.1:1/private"></iframe>';
  await api('fs.write',{path:'blog.html',content});
  const preview=await api('document.preview',{path:'blog.html'});
  assert.equal(preview.kind,'image');assert.equal(preview.width,360);assert.equal(preview.height,480);assert.equal(preview.hasImage,true);
  assert.match(preview.title,/中文博客/);assert.match(preview.excerpt,/真实的正文/);assert.doesNotMatch(preview.excerpt,/do not execute/);
  const before=preview.version;
  await fs.writeFile(path.join(workspace,'blog.html'),'<h1>Updated title</h1><p>New content with no image.</p>');
  const error=await api('document.preview',{path:'blog.html'});assert.equal(error.cacheHit,false);assert.notEqual(error.version,before);assert.equal(error.hasImage,false);
});

test('preview CLI contract rejects stale versions, traversal, protected paths and links', async t => {
  const { api,error,workspace,parent }=await setup(t);
  await fs.writeFile(path.join(workspace,'document.pdf'),pdfFixture());
  await fs.writeFile(path.join(parent,'outside.pdf'),pdfFixture());
  await fs.symlink(path.join(parent,'outside.pdf'),path.join(workspace,'linked.pdf'));
  await fs.link(path.join(parent,'outside.pdf'),path.join(workspace,'hard.pdf'));
  for(const bad of ['../outside.pdf',path.join(parent,'outside.pdf'),'.agents-company/test.pdf','linked.pdf','hard.pdf'])await error('document.preview',{path:bad},'SCOPE_DENIED');
  await error('document.preview',{path:'document.pdf',expectedVersion:'stale'},'CONFLICT');
  await error('document.preview',{path:'missing.pdf'},'NOT_FOUND');
  await error('document.preview',{path:'document.pdf',width:9000},'INVALID_PARAMS');
  await fs.writeFile(path.join(workspace,'bad.pdf'),'not a PDF');
  const fallback=await api('document.preview',{path:'bad.pdf'});assert.equal(fallback.kind,'fallback');assert(fallback.reason);
  await fs.writeFile(path.join(workspace,'data.bin'),'data');assert.equal((await api('document.preview',{path:'data.bin'})).kind,'fallback');
});

test('read-only previews preserve existing page/outline and deduplicate concurrent requests', async t => {
  const { api,workspace }=await setup(t);await fs.writeFile(path.join(workspace,'book.pdf'),pdfFixture());
  const doc=await api('document.open',{path:'book.pdf'});
  await api('reader.position.set',{id:doc.id,locator:{page:2}});
  await api('toc.add',{id:doc.id,expectedRevision:doc.revision,title:'Keep me',locator:{page:2}});
  const before=await fs.readFile(path.join(workspace,'.margin-reader/state.json'),'utf8');
  const results=await Promise.all(Array.from({length:6},()=>api('document.preview',{path:'book.pdf'})));
  assert(results.every(r=>r.contentBase64===results[0].contentBase64));
  assert.equal(await fs.readFile(path.join(workspace,'.margin-reader/state.json'),'utf8'),before);
  await api('fs.move',{path:'book.pdf',target:'renamed.pdf'});
  assert.equal((await api('document.preview',{path:'renamed.pdf'})).kind,'image');
  assert.equal((await api('reader.position.get',{id:doc.id})).locator.page,2);
});
