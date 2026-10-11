'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path');
const { setup } = require('./fixtures.cjs');
const A = require('../lib/appearance.cjs');
const theme = { schema:A.FORMAT, title:'海盐与暮光', settings:{theme:'dark',uiPalette:'mint',uiCustomAccent:'#FFEEDD',uiCustomGlow:'#00ff88',uiBackgroundStrength:.4} };
const content = JSON.stringify(theme);
test('portable appearance defaults and reads never rewrite an old workspace', async t => {
  const f=await setup(t);await f.api('settings.set',{fontSize:22});
  const file=path.join(f.workspace,'.margin-reader/state.json'),state=JSON.parse(await fs.readFile(file));
  for(const key of ['uiCustomAccent','uiCustomGlow','uiBackgroundStrength'])delete state.settings[key];
  await fs.writeFile(file,JSON.stringify(state));const before=await fs.readFile(file);
  const a=await f.api('appearance.get');assert.equal(a.appearance.uiCustomAccent,null);assert.equal(a.appearance.uiBackgroundStrength,1);assert.match(a.version,/^[a-f0-9]{64}$/);
  assert.deepEqual(await fs.readFile(file),before);
});
test('appearance concurrency ignores navigation but rejects stale appearance without persisting control fields', async t => {
  const f=await setup(t),first=await f.api('appearance.get');
  await f.api('settings.set',{fontSize:24,pdfZoom:1.5});
  const result=await f.api('settings.set',{uiCustomAccent:'#FFEEAA',expectedAppearanceVersion:first.version});
  assert.equal(result.uiCustomAccent,'#ffeeaa');assert.equal(result.fontSize,24);assert(!Object.hasOwn(result,'expectedAppearanceVersion'));
  const before=await fs.readFile(path.join(f.workspace,'.margin-reader/state.json'));
  await f.error('settings.set',{uiPalette:'rose',expectedAppearanceVersion:first.version},'CONFLICT');
  assert.deepEqual(await fs.readFile(path.join(f.workspace,'.margin-reader/state.json')),before);
  for(const patch of [{uiCustomAccent:'red'},{uiCustomGlow:'url(https://example.org)'},{uiCustomAccent:'#123'},{uiBackgroundStrength:1.1}])await f.error('settings.set',patch,'INVALID_PARAMS');
});
test('inspect imports only presentation fields, requires reviewed bytes and preserves documents and unrelated settings', async t => {
  const f=await setup(t);await f.api('fs.write',{path:'notes.md',content:'# Original'});const doc=await f.api('document.open',{path:'notes.md'});
  await f.api('settings.set',{fontSize:26});const snapshot=await f.api('appearance.get');
  const inspected=await f.api('appearance.theme.inspect',{content});assert.equal(inspected.theme.settings.uiCustomAccent,'#ffeedd');
  const loaded=await f.api('appearance.theme.import',{content,expectedSha256:inspected.sha256,expectedAppearanceVersion:snapshot.version});
  assert.equal(loaded.settings.lastDocument,doc.id);assert.equal(loaded.settings.fontSize,26);assert.equal(loaded.appearance.uiCustomGlow,'#00ff88');
  assert.equal(await fs.readFile(path.join(f.workspace,'notes.md'),'utf8'),'# Original');
  await f.error('appearance.theme.import',{content:content+' ',expectedSha256:inspected.sha256,expectedAppearanceVersion:loaded.version},'CONFLICT');
  await f.error('appearance.theme.import',{content,expectedSha256:inspected.sha256,expectedAppearanceVersion:snapshot.version},'CONFLICT');
});
test('portable export contains no navigation, fonts or document data and never overwrites', async t => {
  const f=await setup(t);await f.api('settings.set',{uiCustomAccent:'#abcdef',fontSize:28});
  const exported=await f.api('appearance.theme.export',{path:'theme.json',title:'配色分享'});
  const raw=await fs.readFile(path.join(f.workspace,'theme.json'),'utf8'),saved=JSON.parse(raw);
  assert.deepEqual(Object.keys(saved).sort(),['schema','settings','title']);assert.equal(saved.settings.uiCustomAccent,'#abcdef');
  assert(!raw.includes('fontSize'));assert(!raw.includes('lastDocument'));assert(!raw.includes(f.workspace));assert(exported.bytes<2048);
  await f.error('appearance.theme.export',{path:'theme.json'},'ALREADY_EXISTS');assert.equal(await fs.readFile(path.join(f.workspace,'theme.json'),'utf8'),raw);
  await f.error('appearance.theme.export',{path:'.AGENTS-COMPANY/theme.json'},'SCOPE_DENIED');
  await f.error('appearance.theme.export',{path:'theme.js'},'INVALID_PARAMS');
  const parsed=await f.api('appearance.theme.inspect',{path:'theme.json'});assert.equal(parsed.sha256,exported.sha256);
});
test('malicious and oversized theme data fail before any appearance changes', async t => {
  const f=await setup(t);await f.api('settings.set',{theme:'light'});const before=await fs.readFile(path.join(f.workspace,'.margin-reader/state.json'));
  const bad=[null,[],{...theme,schema:'other'},{...theme,title:42},{...theme,css:'@import evil'}, {...theme,settings:{lastDocument:'foreign'}}, {...theme,settings:{uiCustomAccent:'var(--evil)'}}, {...theme,settings:{uiPalette:'constructor'}}, JSON.parse('{"schema":"margin-reader.theme/v1","title":"x","settings":{"__proto__":{}}}')];
  for(const item of bad)await f.error('appearance.theme.inspect',{content:JSON.stringify(item)},'INVALID_THEME');
  await f.error('appearance.theme.inspect',{content:'{no'},'INVALID_THEME');
  await f.error('appearance.theme.inspect',{content:' '.repeat(65537)},'TOO_LARGE');
  await f.error('appearance.theme.inspect',{content,path:'theme.json'},'INVALID_PARAMS');
  await f.error('appearance.theme.inspect',{path:'../outside.json'},'SCOPE_DENIED');
  assert.deepEqual(await fs.readFile(path.join(f.workspace,'.margin-reader/state.json')),before);
});
test('a changed file after preview cannot be imported and symlink themes remain out of scope', async t => {
  const f=await setup(t),file=path.join(f.workspace,'theme.json');await fs.writeFile(file,content);
  const checked=await f.api('appearance.theme.inspect',{path:'theme.json'}),a=await f.api('appearance.get');
  await fs.writeFile(file,JSON.stringify({...theme,title:'Changed'}));
  await f.error('appearance.theme.import',{path:'theme.json',expectedSha256:checked.sha256,expectedAppearanceVersion:a.version},'CONFLICT');
  await fs.symlink(file,path.join(f.workspace,'link.json'));await f.error('appearance.theme.inspect',{path:'link.json'},'SCOPE_DENIED');
});
test('custom RGB seeds derive readable text and white-button contrast across all three modes', async () => {
  const { themeTokens, contrast }=await import('../ui/visual-theme.mjs');
  const colors=['#ffffff','#000000','#ffff00','#00ff00','#ff00ff','#0000ff','#abcdef','#102030','#fefefe'];
  for(let i=0;i<80;i++)colors.push('#'+((i*1664525+1013904223)&0xffffff).toString(16).padStart(6,'0'));
  for(const mode of ['light','dark','sepia'])for(const seed of colors){
    const tokens=themeTokens({theme:mode,uiCustomAccent:seed});
    assert(contrast(tokens['--accent'],tokens['--surface'])>=4.5,mode+' '+seed);
    for(const key of ['--accent-fill','--accent-end'])assert(contrast(tokens[key],'#ffffff')>=4.5,key+' '+seed);
  }
});
test('custom appearance survives encrypted backup and restore without losing current preferences', async t => {
  const f=await setup(t);await f.api('settings.set',{uiCustomAccent:'#123456',uiCustomGlow:'#dabcfe',uiBackgroundStrength:0,theme:'sepia'});
  const wanted=await f.api('appearance.get');await f.api('library.backup.create',{path:'styled.mrbackup',format:'segmented',password:'test theme password'});
  await f.api('library.backup.restore',{path:'styled.mrbackup',folder:'Restored',password:'test theme password'});
  const runtime=await require('../runtime.cjs').createPlugin({workspace:path.join(f.workspace,'Restored')});t.after(()=>runtime.close());
  const result=await runtime.request({jsonrpc:'2.0',id:1,method:'appearance.get',params:{}});assert.deepEqual(result.result,wanted);
});

test('untrusted backup appearance is validated before restored data can reach CSS',()=>{
  const validate=require('../lib/backup-reader.cjs').validateState;
  const state={schemaVersion:1,revision:0,settings:{theme:'light'},studySets:{},documents:{},trash:{},uploads:{}};
  assert.equal(validate(structuredClone(state)).settings.theme,'light');
  for(const patch of [{uiCustomAccent:'url(javascript:bad)'},{uiCustomGlow:'#fff'},{uiBackgroundStrength:2},{uiPalette:'toString'},{uiMotion:'unknown'}]){
    assert.throws(()=>validate({...structuredClone(state),settings:{...state.settings,...patch}}),error=>error.code==='INVALID_BACKUP');
  }
});
