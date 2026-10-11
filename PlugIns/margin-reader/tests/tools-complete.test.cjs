'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./fixtures.cjs');
async function fixture(t){const f=await setup(t);let s=await f.api('study.create',{title:'Tools'});return {...f,get:()=>f.api('study.get',{setId:s.id}),change:async(method,p={})=>s=await f.api(method,{setId:s.id,expectedRevision:s.revision,...p})};}
test('named capture/pen presets clone validated settings, apply, archive, restore and undo',async t=>{
 const f=await fixture(t);let s=await f.change('study.capture.settings',{color:'#123456',tags:['one'],organize:'document',inMap:true});s=await f.change('study.tool.save',{kind:'capture',title:'Important'});const toolId=s.lastToolId;
 await f.change('study.capture.settings',{color:'pink',tags:[]});s=await f.change('study.tool.apply',{toolId});assert.equal(s.captureSettings.color,'#123456');assert.deepEqual(s.captureSettings.tags,['one']);
 s=await f.change('study.tool.save',{kind:'ink',title:'Marker',settings:{brush:'highlighter',opacity:.3,color:'teal',shape:'line',width:.007}});const pen=s.lastToolId;s=await f.change('study.tool.apply',{toolId:pen});assert.equal(s.inkSettings.opacity,.3);
 s=await f.change('study.tool.remove',{toolId:pen});assert(s.tools.find(t=>t.id===pen).deletedAt);await f.error('study.tool.apply',{setId:s.id,expectedRevision:s.revision,toolId:pen},'NOT_FOUND');s=await f.change('study.tool.remove',{toolId:pen,restore:true});assert(!s.tools.find(t=>t.id===pen).deletedAt);
 await f.error('study.tool.save',{setId:s.id,expectedRevision:s.revision,kind:'ink',title:'Bad',settings:{width:-1}},'INVALID_PARAMS');assert.equal((await f.get()).revision,s.revision);s=await f.change('study.undo');assert(s.tools.find(t=>t.id===pen).deletedAt);
});
test('palette, pinned menu and local font validation do not allow CSS or unknown actions',async t=>{
 const f=await fixture(t);let s=await f.change('study.palette.set',{colors:[{color:'#ffcc11',title:'Gold'},{color:'blue',title:'Blue'}]});assert.equal(s.palette[0].title,'Gold');
 s=await f.change('study.menu.set',{cardActions:['parts','review','source']});assert.deepEqual(s.menuSettings.cardActions,['parts','review','source']);
 const fonts=await f.api('system.fonts');assert(Array.isArray(fonts.fonts));assert(fonts.fonts.length>0);const font=fonts.fonts.find(n=>/^[\p{L}\p{N} _.,-]{1,100}$/u.test(n));assert(font);
 s=await f.change('study.appearance.set',{cardStyle:{fontFamily:font}});assert.equal(s.appearance.fontFamily,font);
 await f.error('study.appearance.set',{setId:s.id,expectedRevision:s.revision,cardStyle:{fontFamily:'x; background:url(https://outside)'}},'INVALID_PARAMS');
 await f.error('study.palette.set',{setId:s.id,expectedRevision:s.revision,colors:[{color:'#ffcc11',title:'Gold'},{color:'#ffcc11',title:'Duplicate'}]},'INVALID_PARAMS');
 await f.error('study.menu.set',{setId:s.id,expectedRevision:s.revision,cardActions:['execute-shell']},'INVALID_PARAMS');
});
test('style templates roundtrip only configuration and import atomically without copying documents or identity references',async t=>{
 const f=await fixture(t);let s=await f.change('study.note.create',{title:'Private note'});s=await f.change('study.capture.settings',{parentId:s.cards[0].id,color:'green',tags:['default']});s=await f.change('study.tool.save',{kind:'capture',title:'Reusable'});await f.change('study.palette.set',{colors:[{color:'#f1bb11',title:'Custom'}]});s=await f.get();
 await f.api('study.template.export',{setId:s.id,expectedRevision:s.revision,path:'theme.json'});const exported=JSON.parse(await fs.readFile(path.join(f.workspace,'theme.json')));assert.equal(exported.settings.captureSettings.parentId,undefined);assert(!JSON.stringify(exported).includes('Private note'));
 const other=await f.api('study.create',{title:'Other'}),result=await f.api('study.template.import',{setId:other.id,expectedRevision:other.revision,path:'theme.json'});assert.equal(result.cards.length,0);assert.equal(result.palette[0].color,'#f1bb11');assert.equal(result.tools[0].title,'Reusable');assert.notEqual(result.tools[0].id,s.tools[0].id);
 exported.settings.appearance={background:'red;position:fixed'};await fs.writeFile(path.join(f.workspace,'invalid.json'),JSON.stringify(exported));await f.error('study.template.import',{setId:other.id,expectedRevision:result.revision,path:'invalid.json'},'INVALID_PARAMS');assert.equal((await f.api('study.get',{setId:other.id})).revision,result.revision);
});
