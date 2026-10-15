import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fixtureCore} from './fixtures/headless-core.mjs'

process.env.AGENTS_COMPANY_EMBEDDED='1'
const f=await fixtureCore()
let checks=0
async function rpc(cmd,args={}){
 const result=await f.request(null,cmd,args)
 assert.equal(result.ok,true,cmd+': '+JSON.stringify(result));return result.data
}
async function denied(cmd,args={},code){
 const result=await f.request(null,cmd,args)
 assert.equal(result.ok,false,cmd)
 if(code)assert.equal(result.code,code)
}
try{
 const bad=spawnSync(process.execPath,[path.join(f.root,'bin/agents'),'help'],{env:{...process.env,AGENTS_COMPANY_HOME:''},encoding:'utf8'})
 assert.equal(bad.status,2)
 assert.match(bad.stderr,/private AGENTS_COMPANY_HOME/);checks++
 const views=await rpc('view.list')
 assert.deepEqual(views.views.map(v=>v.id),['company','messages','plan']);checks++
 const commands=await rpc('api.list',{all:true})
 for(const command of ['card.create','chat.send','plan.query','schedule.create','api.docs'])assert.ok(commands.some(c=>c.name===command))
 assert.ok(commands.every(c=>!c.name.startsWith('guardian.')));
 assert.ok(commands.some(c=>c.name==='plugin.call'));checks++
 // Mini Notion and Margin Reader are no longer shipped (root AGENTS.md: Aexus
 // dropped the legacy plugin products). The Core keeps the plugin plumbing, so
 // the removed plugins are excluded explicitly here — by proving they are gone
 // — instead of asserting that they are still installed.
 const plugins=await rpc('plugin.list')
 assert.deepEqual(plugins.map(plugin=>plugin.id),[],'No legacy plugin package may ship with the current product')
 const refusesPlugin=async(id,cmd,args)=>{const result=await f.request(null,cmd,args);assert.equal(result.ok,false,cmd);assert.match(String(result.error),new RegExp('Plugin not installed: '+id))}
 await refusesPlugin('mininotion','plugin.describe',{id:'mininotion'})
 await refusesPlugin('margin-reader','plugin.describe',{id:'margin-reader'})
 await refusesPlugin('mininotion','group.add',{name:'Removed Plugin Work',mode:'work',pluginId:'mininotion'})
 assert.ok(!(await rpc('group.list')).includes('Removed Plugin Work'),'A Work Team must not bind a removed plugin')
 await denied('api.docs',{document:'plugin/mininotion/index'})
 await denied('api.docs',{document:'plugin/margin-reader/schema'})
 await denied('guardian.snapshot',{},'GUARDIAN_DISABLED');checks++
 const index=await rpc('api.docs')
 assert.equal(index.document,'index')
 assert.match(index.markdown,/当前没有已安装插件/,'The index must report that no plugin is installed')
 assert.match(index.markdown,/Plan 是 Core 视图/,'Plan must stay documented as a Core view, not a plugin')
 assert.equal((await rpc('api.describe',{command:'schedule.create',all:true})).name,'schedule.create')
 assert.ok(await rpc('plan.query'));checks++
 // With every plugin product removed, a native Build Team is the only Team
 // kind the current product can create.
 await rpc('group.add',{name:'Native Work',mode:'build'});checks++
 await f.stop()
 const stateFile=path.join(f.env.AGENTS_COMPANY_HOME,'sessions.json')
 const state=JSON.parse(fs.readFileSync(stateFile,'utf8'))
 const archived=path.join(f.temp,'archived-team');fs.mkdirSync(archived)
 const oldWorkspace=path.join(archived,'older-employee');fs.mkdirSync(oldWorkspace)
 fs.writeFileSync(path.join(oldWorkspace,'user-file.txt'),'Keep unchanged')
 state.sessions.push({id:'legacy-work-employee',title:'Archived employee',engine:'codex',kind:'worker',group:'Legacy Work',cwd:oldWorkspace,createdAt:1,managementRole:'employee',initialization:{status:'ready'}})
 state.groups.push('Legacy Work')
 state.teamSettings={...(state.teamSettings??{}),'Legacy Work':{mode:'work',pluginId:'mininotion'}}
 state.teamRoots={...(state.teamRoots??{}),'Legacy Work':archived}
 fs.writeFileSync(stateFile,JSON.stringify(state))
 await f.start()
 const group=(await rpc('group.list',{details:true})).find(g=>g.name==='Legacy Work')
 assert.equal(group.pluginId,'mininotion')
 assert.equal(group.mode,'work')
 assert.equal(group.unsupported,undefined)
 assert.equal(fs.readFileSync(path.join(oldWorkspace,'user-file.txt'),'utf8'),'Keep unchanged')
 assert.deepEqual(fs.readdirSync(oldWorkspace),['user-file.txt']);checks++
 console.log('PASS embedded Core: '+checks+' groups; 0 model calls')
} finally {await f.close()}
