'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {createMatcher}=require('../lib/literal-links.cjs'),{setup}=require('./fixtures.cjs');
const row=title=>({title,setId:randomUUID(),cardId:randomUUID(),setTitle:'Dictionary'});
test('literal dictionary considers entries beyond 1,000 without truncating short terms',()=>{
  const rows=Array.from({length:5000},(_,i)=>row('Long dictionary entry '+i));rows.push(row('Beta'));
  const matcher=createMatcher(rows);assert.equal(matcher.size,5001);
  assert.deepEqual([...matcher.matches('Long dictionary entry 4999 / Beta')].map(v=>v.targets[0].title),['Long dictionary entry 4999','Beta']);
});
test('longest non-overlapping title wins and ambiguous equal titles retain every candidate',()=>{
  const matcher=createMatcher([row('alpha'),row('alpha beta'),row('ALPHA BETA'),row('gamma')]);
  const hits=[...matcher.matches('alpha beta gamma')];assert.equal(hits.length,2);assert.equal(hits[0].targets.length,2);assert.equal(hits[0].end,10);
  const whole=createMatcher([row('cat'),row('词条')],{wholeWords:true});
  assert.deepEqual([...whole.matches('concatenate cat_ cat! 中文词条文字 𐐀cat cat𐐀')].map(v=>v.at),[17,24]);
});
test('case-fold expansions preserve exact original UTF-16 text and surrogate boundaries',()=>{
  const text='İstanbul 🙂 BETA 与中文';const hits=[...createMatcher([row('beta'),row('中文')]).matches(text)];
  assert.deepEqual(hits.map(v=>text.slice(v.at,v.end)),['BETA','中文']);
  const sensitive=[...createMatcher([row('BETA')],{caseSensitive:true}).matches(text+' beta')];assert.equal(sensitive.length,1);
});
test('public rich-card rendering links a large dictionary across body/note/comments and remains read-only',async t=>{
  const f=await setup(t),set=await f.api('study.create',{title:'All dictionary entries'}),file=path.join(f.workspace,'.margin-reader/state.json'),state=JSON.parse(await fs.readFile(file,'utf8')),s=state.studySets[set.id];
  const make=(title,text='')=>({id:randomUUID(),title,text,note:'',tags:[],color:'yellow',parentId:null,source:null,image:null});
  s.cards=Array.from({length:1200},(_,i)=>make('Dictionary-long-entry-'+i));const target=make('Beta');s.cards.push(target);
  const card=make('Reader','İstanbul 🙂 BETA and `Beta`');card.note='[[Beta|词条]]';card.comments=[{id:randomUUID(),text:'A comment about Beta.'}];s.cards.push(card);
  await fs.writeFile(file,JSON.stringify(state));const before=await fs.readFile(file);
  const rendered=await f.api('study.card.render',{setId:set.id,cardId:card.id});
  assert(rendered.links.some(l=>l.cardId===target.id));assert.equal(rendered.linkStatus.dictionaryTerms,1201);
  const dom=new(require('jsdom').JSDOM)(rendered.html);assert.equal(dom.window.document.body.textContent.trim(),'İstanbul 🙂 BETA and Beta');assert.equal(dom.window.document.querySelector('a').textContent,'BETA');assert.equal(dom.window.document.querySelectorAll('code a').length,0);dom.window.close();
  assert.match(rendered.noteHtml,/reader-internal-link/);assert.match(rendered.comments[0].html,/reader-internal-link/);
  assert.equal(rendered.linkStatus.complete,true);assert.deepEqual(await fs.readFile(file),before);
});
test('automatic link budget is explicit, keeps all text and never drops the dictionary tail',()=>{
  const M=require('../lib/study-links.cjs'),setId=randomUUID(),target={id:randomUUID(),title:'Term',text:'',note:''},source={id:randomUUID(),title:'Reader',text:'Term '.repeat(220),note:''};
  const set={id:setId,title:'Set',cards:[target,source]},state={studySets:{[setId]:set}};
  const result=M.render(state,set,source);assert.equal(result.linkStatus.complete,false);assert.equal(result.linkStatus.rendered,200);assert.equal(result.linkStatus.limit,200);
  const dom=new(require('jsdom').JSDOM)(result.html);assert.equal(dom.window.document.querySelectorAll('a').length,200);assert.equal(dom.window.document.body.textContent.trim(),source.text.trim());dom.window.close();
});

test('Chinese and ASCII semicolon keyword aliases match whole terms without duplicating the same card candidate',()=>{
 const M=require('../lib/study-links.cjs'),setId=randomUUID(),target={id:randomUUID(),title:'条件概率； probability ; Probability',text:'',note:''},source={id:randomUUID(),title:'Reader',text:'复习条件概率，then PROBABILITY.',note:''};
 const set={id:setId,title:'Set',cards:[target,source]},state={studySets:{[setId]:set}};
 const result=M.render(state,set,source),dom=new(require('jsdom').JSDOM)(result.html);
 assert.deepEqual([...dom.window.document.querySelectorAll('a')].map(a=>a.textContent),['条件概率','PROBABILITY']);assert.equal(result.choices.length,0);assert.equal(result.links.length,1);assert.equal(result.links[0].cardId,target.id);dom.window.close();
});
