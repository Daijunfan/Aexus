// Source-built preferences contract; every write and restart uses a disposable Core home.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-view-appearance-')),entry=path.join(temp,'daemon.cjs');let f
try{
 fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
 await build({entryPoints:[path.join(root,'Infra/src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({},entry);const rpc=async(cmd,args={})=>{const result=await f.request(null,cmd,args);assert.ok(result.ok,result.error);return result.data},settings=()=>rpc('settings.get'),patch=value=>rpc('settings.set',value)
 const themes=value=>Object.fromEntries(Object.entries(value.viewAppearance).map(([key,appearance])=>[key,appearance.theme]))
 assert.deepEqual(themes(await settings()),{company:'white',messages:'violet',plan:'white'})
 await f.cli('settings','set','--view','company','--theme','black');await f.cli('settings','set','--view','plan','--theme','light')
 assert.deepEqual(themes(await settings()),{company:'black',messages:'violet',plan:'light'})
 await f.cli('settings','set','--theme','teal','--theme-color','#43A8BA');assert.deepEqual(themes(await settings()),{company:'black',messages:'teal',plan:'light'})
 await patch({viewAppearance:{company:{themeColor:'#CFAD32'}}});assert.equal((await settings()).viewAppearance.company.theme,'black');assert.equal((await settings()).viewAppearance.messages.themeColor,'#43A8BA')
 await f.cli('settings','set','--view-appearance',JSON.stringify({messages:{theme:'rose'},plan:{theme:'white'}}))
 let value=await settings();assert.deepEqual(themes(value),{company:'black',messages:'rose',plan:'white'});assert.equal(value.theme,'rose');assert.equal(value.viewAppearance.company.themeColor,'#CFAD32')
 // Another client's scoped patch cannot overwrite a view or color it did not edit.
 await patch({viewAppearance:{plan:{theme:'black'}}});await patch({viewAppearance:{company:{theme:'white'}}});value=await settings();assert.equal(value.viewAppearance.plan.theme,'black');assert.equal(value.viewAppearance.company.themeColor,'#CFAD32')
 await patch({theme:'blue',viewAppearance:{messages:{theme:'mint'}}});assert.equal((await settings()).theme,'mint')
 const file=path.join(f.env.AGENTS_COMPANY_HOME,'sessions.json')
 for(const invalid of [{viewAppearance:{company:{theme:'invalid'}}},{viewAppearance:{plan:{themeColor:'#fff'}}},{viewAppearance:{company:{theme:'black'},messages:{themeColor:'red'}}},{viewAppearance:{other:{theme:'white'}}},{viewAppearance:null},{viewAppearance:[]},{viewAppearance:{company:null}},{viewAppearance:{company:{fontSize:99}}},{unexpectedPreference:true}]){
  const before=fs.readFileSync(file,'utf8'),result=await f.request(null,'settings.set',invalid);assert.equal(result.ok,false,JSON.stringify(invalid));assert.equal(fs.readFileSync(file,'utf8'),before,'bad patch cannot partially persist')
 }
 await assert.rejects(()=>f.cli('settings','set','--view','not-a-view','--theme','white'),/company, messages or plan/)
 await assert.rejects(()=>f.cli('settings','set','--view','plan','--page-zoom','1.1'),/requires --theme/)
 const saved=await settings();await f.stop();await f.start();assert.deepEqual(await settings(),saved)
 await f.cli('group','add','Keep my team');const employee=await f.create('Preserved employee','Keep my team'),identity=(await f.cli('session','list')).sessions
 await f.stop();const legacy=JSON.parse(fs.readFileSync(file,'utf8'));delete legacy.preferences.viewAppearance;legacy.preferences.theme='teal';legacy.preferences.themeColor='#124F64';fs.writeFileSync(file,JSON.stringify(legacy));await f.start()
 value=await settings();assert.deepEqual(themes(value),{company:'white',messages:'teal',plan:'white'});assert.equal(value.viewAppearance.messages.themeColor,'#124F64');assert.deepEqual((await f.cli('session','list')).sessions,identity)
 await patch({language:'zh-CN'});assert.deepEqual(themes(await settings()),themes(value));assert.ok(JSON.parse(fs.readFileSync(file,'utf8')).preferences.viewAppearance)
 const schema=(await f.cli('api','describe','settings.set')).inputSchema;assert.ok(schema.properties.viewAppearance.properties.company.properties.theme.enum.includes('black'));assert.equal(schema.properties.viewAppearance.additionalProperties,false)
 const denied=await f.request(await f.token(employee.id),'settings.set',{viewAppearance:{company:{theme:'black'}}});assert.equal(denied.ok,false);assert.deepEqual(themes(await settings()),themes(value));assert.deepEqual(await f.cli('terminal','list'),[])
 const out=path.join(root,'.aexus/artifacts/view-settings');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'core-verification.json'),JSON.stringify({passed:true,checks:['neutral Company/Plan defaults and preserved Messages legacy color','independent CLI and authenticated API patches','nested field merge and concurrent different-view edits','legacy aliases never recolor Company or Plan','atomic invalid-field/theme/color rejection','full restart persistence','legacy store migration preserves employee/native/workspace identity','operator-only settings and machine-readable schema'],providerCalls:0},null,2));console.log('PASS independent view appearance Core/CLI, atomic partial patches, compatibility, migration and identity preservation')
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true})}
