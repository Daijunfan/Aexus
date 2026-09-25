import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-bootstrap-state-'))),run=promisify(execFile)
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins')}
let service,ended
const call=async(token,...args)=>{const value=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env:{...env,AGENTS_COMPANY_TOKEN:token??''},timeout:20000,maxBuffer:4*1024*1024})).stdout);assert.ok(value.ok,value.error);return value.data},cli=(...args)=>call(undefined,...args)
const start=async()=>{service=spawn(process.execPath,[root+'/bin/agents','serve'],{env,stdio:'ignore'});ended=new Promise(resolve=>service.once('exit',resolve));for(let n=0;n<100;n++){try{await cli('status');return}catch{await new Promise(resolve=>setTimeout(resolve,40))}}throw Error('Service not ready')}
const stop=async()=>{service.kill('SIGTERM');await ended}
const apiFile=card=>path.join(card.cwd,'.agents-company/employees',card.id,'API.md')
try{
 await start();await cli('group','add','Build');await cli('group','add','Work','--mode','work','--plugin','mininotion')
 const manager=await cli('card','create','--title','Lead','--group','Build','--management-role','manager'),work=await cli('card','create','--title','PluginLead','--group','Work','--management-role','manager')
 for(const card of [manager,work]){assert.match(fs.readFileSync(apiFile(card),'utf8'),/### card.create/);assert.match(fs.readFileSync(path.join(card.cwd,'AGENTS.md'),'utf8'),/agents card create/);assert.match(fs.readFileSync(path.join(card.cwd,'CLAUDE.md'),'utf8'),/Agents Company CLI/)}
 assert.match(fs.readFileSync(path.join(work.cwd,'AGENTS.md'),'utf8'),/Work workspace tools/)
 assert.ok(fs.existsSync(path.join(work.cwd,'.agents-company/plugins/mininotion/API.md')))
 const token=(await cli('auth','agent-token',manager.id)).token
 const child=await call(token,'card','create','--title','Child');assert.equal(child.group,'Build');assert.equal(child.createdBy.employeeId,manager.id)
 assert.ok((await call(token,'management','topology')).edges.some(edge=>edge.employeeId===child.id))
 const other=await cli('card','create','--title','Other','--group','Work');await assert.rejects(()=>call(token,'session','status','--employee',other.id))
 const help=await call(token,'help');assert.ok(help.some(cmd=>cmd.name==='card.create'));assert.ok(!help.some(cmd=>cmd.name==='host.credentials'))
 // Ordinary Employee -> Manager -> Employee updates physical role handbooks immediately.
 const promoted=await cli('card','create','--title','Promoted','--group','Build');assert.ok(!fs.readFileSync(apiFile(promoted),'utf8').includes('### card.create'))
 await cli('card','management-role',promoted.id,'manager');assert.match(fs.readFileSync(apiFile(promoted),'utf8'),/### card.create/)
 await cli('card','management-role',promoted.id,'employee');assert.ok(!fs.readFileSync(apiFile(promoted),'utf8').includes('### card.create'))
 // Sharing a Build folder does not overwrite another employee's authority handbook.
 const shared=await cli('card','create','--title','SharedEmployee','--group','Build','--directory-mode','bind','--cwd',manager.cwd)
 assert.match(fs.readFileSync(apiFile(manager),'utf8'),/### card.create/);assert.ok(!fs.readFileSync(apiFile(shared),'utf8').includes('### card.create'))
 const custom='\nUSER_INSTRUCTIONS_PRESERVED\n';fs.appendFileSync(path.join(manager.cwd,'AGENTS.md'),custom)
 await cli('workspace','docs','--employee',manager.id);assert.match(fs.readFileSync(path.join(manager.cwd,'AGENTS.md'),'utf8'),/USER_INSTRUCTIONS_PRESERVED/)
 await cli('management','global',manager.id,'on');assert.match(fs.readFileSync(apiFile(manager),'utf8'),/### host.credentials/)
 await cli('management','global',manager.id,'off');assert.ok(!fs.readFileSync(apiFile(manager),'utf8').includes('### host.credentials'))
 const legacy=path.join(manager.cwd,'.agents-company/manager/API.md');assert.ok(!fs.readFileSync(legacy,'utf8').includes('### host.credentials'))
 // New invalid native Manager must fail BEFORE trying SSH or creating any folder.
 await assert.rejects(()=>cli('card','create','--title','Invalid','--group','Build','--kind','cloud-native-worker','--management-role','manager'))
 assert.ok(!(await cli('session','list')).sessions.some(card=>card.title==='Invalid'))
 // Missing instructions are repaired by ordinary startup, no engine or new employee required.
 await stop();fs.rmSync(path.join(manager.cwd,'CLAUDE.md'));fs.rmSync(apiFile(manager));await start()
 assert.ok(fs.existsSync(path.join(manager.cwd,'CLAUDE.md')));assert.match(fs.readFileSync(apiFile(manager),'utf8'),/### card.create/)
 assert.equal((await cli('session','list','--live')).length,0)
 console.log('PASS bootstrap state: ordinary Build+Work composition, creator+auto edge, target-state authorization, role-aware help, promotion/demotion/global refresh, shared directories, user instructions, invalid cloud Manager rejection and missing-doc restart repair')
}finally{if(service&&!service.killed)await stop();fs.rmSync(temp,{recursive:true,force:true})}
