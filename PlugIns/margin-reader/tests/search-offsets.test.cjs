'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./fixtures.cjs'),{literalMatches,firstLiteral}=require('../lib/text-offsets.cjs');
test('literal search returns original offsets and lengths when Unicode lowercasing expands',()=>{
  const text='İ 🙂 İSTANBUL Alpha ALPHA';
  const hits=[...literalMatches(text,'alpha')];assert.equal(hits.length,2);for(const hit of hits)assert.equal(text.slice(hit.start,hit.end).toLowerCase(),'alpha');
  const city=firstLiteral(text,'i\u0307stanbul');assert.equal(text.slice(city.start,city.end),'İSTANBUL');assert.equal(city.end-city.start,8);
  assert.equal(firstLiteral(text,'alpha',true),null);assert.equal(firstLiteral(text,'ALPHA',true).start,text.lastIndexOf('ALPHA'));
});
test('document search links repeated blocks to their exact original DOM positions, including unindexed leading text',async t=>{
  const f=await setup(t),html='outside Alpha<h1>Offsets</h1><p>  İ 🙂 Alpha with two Alpha results.</p><p>Repeated Alpha</p><p>Repeated Alpha</p>';
  await fs.writeFile(path.join(f.workspace,'unicode.html'),html);const doc=await f.api('document.open',{path:'unicode.html'}),content=await f.api('document.content',{id:doc.id}),dom=new(require('jsdom').JSDOM)(content.html),body=dom.window.document.body.textContent;
  const before=await fs.readFile(path.join(f.workspace,'.margin-reader/state.json'));
  const search=await f.api('document.search',{id:doc.id,query:'ALPHA',limit:100});assert.equal(search.matches.length,4);assert.equal(search.truncated,false);
  const positions=search.matches.map(hit=>hit.locator.textOffset);assert.equal(new Set(positions).size,4);
  for(const hit of search.matches){assert.equal(body.slice(hit.locator.textOffset,hit.locator.textOffset+hit.matchLength),'Alpha');assert.equal(hit.excerpt.slice(hit.matchOffset,hit.matchOffset+hit.matchLength),'Alpha');}
  assert(positions[0]>body.indexOf('outside Alpha')+'outside Alpha'.length);
  const one=await f.api('document.search',{id:doc.id,query:'alpha',limit:1});assert.equal(one.matches.length,1);assert(one.truncated);
  assert.deepEqual(await fs.readFile(path.join(f.workspace,'.margin-reader/state.json')),before);dom.window.close();
});
test('workspace Boolean search never targets a negated or title-only term and preserves case-fold offsets',async t=>{
  const f=await setup(t),html='<h1>Index</h1><p>İstanbul 🙂 banned distraction. '+('filler '.repeat(40))+'ALPHA is the actual answer.</p>';
  await fs.writeFile(path.join(f.workspace,'boolean.html'),html);const doc=await f.api('document.open',{path:'boolean.html'}),content=await f.api('document.content',{id:doc.id}),dom=new(require('jsdom').JSDOM)(content.html),body=dom.window.document.body.textContent;
  const result=await f.api('library.search',{query:'NOT banned OR text:alpha',kind:'documents'});assert.equal(result.hits.length,1);assert.equal(result.hits[0].locator.textOffset,body.indexOf('ALPHA'));
  const double=await f.api('library.search',{query:'NOT NOT alpha',kind:'documents'});assert.equal(double.hits[0].locator.textOffset,body.indexOf('ALPHA'));
  dom.window.close();
});
