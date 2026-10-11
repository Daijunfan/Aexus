'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./fixtures.cjs');
test('visual palettes have readable text and white primary labels in every light/dark/warm mode',async()=>{
 const {PALETTES,themeTokens,contrast}=await import('../ui/visual-theme.mjs');
 assert.equal(Object.keys(PALETTES).length,8);
 for(const [uiPalette,p] of Object.entries(PALETTES))for(const theme of ['light','dark','sepia']){
  const t=themeTokens({uiPalette,theme});
  for(const token of ['--text','--muted','--accent'])assert(contrast(t[token],t['--surface'])>=4.5,`${uiPalette}/${theme}/${token}`);
  for(const color of [p.fill,p.end])assert(contrast('#ffffff',color)>=4.5,`${uiPalette}/primary/${color}`);
 }
});
test('appearance defaults are additive and reading an old library does not rewrite bytes',async t=>{
 const f=await setup(t);await f.api('settings.set',{theme:'sepia',fontSize:22});
 const file=path.join(f.workspace,'.margin-reader/state.json'),state=JSON.parse(await fs.readFile(file));
 for(const k of ['uiPalette','uiBackdrop','uiMotion'])delete state.settings[k];
 const before=JSON.stringify(state);await fs.writeFile(file,before);
 const settings=await f.api('settings.get');assert.equal(settings.uiPalette,'azure');assert.equal(settings.uiBackdrop,'glow');assert.equal(settings.uiMotion,'system');assert.equal(settings.fontSize,22);
 assert.equal(await fs.readFile(file,'utf8'),before);
});
test('public appearance settings reject unsupported values without partial writes and preserve unrelated settings',async t=>{
 const f=await setup(t);await f.api('settings.set',{uiPalette:'mint',uiBackdrop:'contour',uiMotion:'reduced',fontSize:20});
 const file=path.join(f.workspace,'.margin-reader/state.json'),before=await fs.readFile(file);
 for(const value of [{uiPalette:'url(evil)'},{uiBackdrop:'external'},{uiMotion:true},{uiPalette:null},{uiMotion:'reduced',uiBackdrop:'bad'}])await f.error('settings.set',value,'INVALID_PARAMS');
 assert.deepEqual(await fs.readFile(file),before);
 const s=await f.api('settings.set',{uiPalette:'violet'});assert.equal(s.uiBackdrop,'contour');assert.equal(s.fontSize,20);assert.equal(s.uiMotion,'reduced');
});
test('appearance settings survive encrypted complete-library backup and restore',async t=>{
 const f=await setup(t),values={theme:'dark',uiPalette:'rose',uiBackdrop:'dots',uiMotion:'reduced'};
 await f.api('settings.set',values);await f.api('library.backup.create',{path:'appearance.mrbackup',format:'segmented',password:'visual test passphrase'});
 await f.api('library.backup.restore',{path:'appearance.mrbackup',folder:'Restored',password:'visual test passphrase'});
 const state=JSON.parse(await fs.readFile(path.join(f.workspace,'Restored/.margin-reader/state.json')));
 for(const [k,v] of Object.entries(values))assert.equal(state.settings[k],v);
});
test('every palette exposed by the UI is declared in the public settings schema',async()=>{
 const {PALETTES,BACKDROPS}=await import('../ui/visual-theme.mjs'),options=require('../schema.json').commands.find(c=>c.method==='settings.set').options;
 assert.deepEqual(options.uiPalette.enum,Object.keys(PALETTES));assert.deepEqual(options.uiBackdrop.enum,Object.keys(BACKDROPS));
});
