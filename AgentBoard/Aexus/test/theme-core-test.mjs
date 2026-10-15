import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore()
try{
 // The current Aexus brand default is white (src/shared/preferences.ts
 // DEFAULT_PREFERENCES/DEFAULT_VIEW_APPEARANCE); `theme` is the legacy Messages
 // alias, and violet remains a selectable theme in the list below.
 assert.equal((await f.cli('settings','get')).theme,'white')
 assert.deepEqual((await f.cli('settings','get')).viewAppearance,{company:{theme:'white',themeColor:'#526dc3'},messages:{theme:'white',themeColor:'#7953ce'},plan:{theme:'white',themeColor:'#526dc3'}})
 for(const theme of ['violet','blue','mint','teal','cyan','rose','coral','amber','indigo','graphite','white','light','space','black','midnight','sage']){
  await f.cli('settings','set','--theme',theme);assert.equal((await f.cli('settings','get')).theme,theme)
 }
 await f.cli('settings','set','--theme','custom','--theme-color','#F4CA37')
 const before=await f.cli('settings','get');assert.equal(before.themeColor,'#F4CA37')
 await assert.rejects(()=>f.cli('settings','set','--theme','unknown'),/Unknown theme/)
 await assert.rejects(()=>f.cli('settings','set','--theme','rose','--theme-color','#fff'),/six-digit hex/)
 assert.deepEqual(await f.cli('settings','get'),before)
 await f.stop();await f.start();assert.deepEqual(await f.cli('settings','get'),before)
 assert.ok((await f.cli('api','describe','settings.set')).args.includes('--theme-color #RRGGBB'))
 assert.deepEqual((await f.cli('session','list')).sessions,[]);assert.deepEqual(await f.cli('terminal','list'),[])
 console.log('PASS theme Core/CLI: ten colors, six legacy IDs, custom color flag, atomic validation and restart persistence; no employees, terminals or model calls')
}finally{await f.close()}
