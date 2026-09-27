import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const run=promisify(execFile),project=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-dir-')))
const home=path.join(temp,'state'),work=path.join(temp,'work'),projects=path.join(temp,'projects'),legacy=path.join(temp,'legacy')
fs.mkdirSync(home);fs.mkdirSync(path.join(legacy,'staff'),{recursive:true});fs.writeFileSync(path.join(legacy,'staff','keep.md'),'Keep this exact work.\n')
const old={groups:['Legacy'],rooms:{},teamRoots:{Legacy:legacy},sessions:[{id:'legacy-worker',title:'Legacy worker',engine:'codex',group:'Legacy',cwd:path.join(legacy,'staff'),threadId:'old-thread',createdAt:1}]}
const oldWork=path.join(temp,'old-work');fs.mkdirSync(path.join(oldWork,'child'),{recursive:true});fs.writeFileSync(path.join(oldWork,'child','plan.md'),'Existing plugin work')
old.groups.push('Old Work');old.teamRoots['Old Work']=oldWork;old.teamSettings={'Old Work':{mode:'work',pluginId:'mininotion'}}
const oldBound=path.join(temp,'old-bound');fs.mkdirSync(oldBound);old.groups.push('Old Bound');old.teamRoots['Old Bound']=oldBound;old.teamSettings['Old Bound']={mode:'work',pluginId:'mininotion',directoryMode:'bind'}
old.sessions.push({id:'old-owner',title:'Owner',engine:'codex',group:'Old Work',cwd:oldWork,createdAt:1},{id:'old-child',title:'Child',engine:'codex',group:'Old Work',cwd:path.join(oldWork,'child'),createdAt:1})
fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify(old))
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_WORKSPACES:work,AGENTS_COMPANY_PROJECTS:projects}
const executable=process.env.AGENTS_COMPANY_TEST_CLI||process.execPath,prefix=process.env.AGENTS_COMPANY_TEST_CLI?[]:[path.join(project,'bin/agents')]
const server=spawn(executable,[...prefix,'serve'],{env,stdio:['ignore','pipe','pipe']}),done=new Promise(r=>server.once('exit',r));let log='';server.stderr.on('data',d=>log+=d)
const cli=async(...args)=>{const reply=JSON.parse((await run(executable,[...prefix,...args,'--json'],{env,timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
let checks=0;const ok=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label)}
try{
  for(let i=0;i<100&&!fs.existsSync(path.join(home,'agents.sock'));i++)await new Promise(r=>setTimeout(r,50))
  await cli('group','add','project1','--mode','build')
  ok(fs.statSync(path.join(projects,'project1')).isDirectory(),'Build creates its exact Team-named project directory')
  await cli('group','add','Plans','--mode','work','--plugin','mininotion')
  const pluginBase=path.join(work,'mini-notion-workspace'),pluginRoot=path.join(pluginBase,'Plans')
  ok(fs.existsSync(path.join(pluginRoot,'AGENTS.md')),'Work creates the plugin-defined workspace and CLI Markdown documentation')
  const defaultEmployee=await cli('card','create','--title','Default worker','--group','Plans','--directory-mode','default')
  const existingFolder=path.join(pluginRoot,'Existing worker');fs.mkdirSync(existingFolder)
  const boundEmployee=await cli('card','create','--title','Bound worker','--group','Plans','--directory-mode','bind','--cwd',existingFolder)
  const pluginApi=fs.readFileSync(path.join(project,'build/plugins/mini-notion/API.md'),'utf8')
  for(const employee of [defaultEmployee,boundEmployee]){
    assert.equal(fs.readFileSync(path.join(employee.cwd,'.agents-company/plugins/mininotion/API.md'),'utf8'),pluginApi)
    assert.ok(fs.existsSync(path.join(employee.cwd,'.agents-company/bin/mininotion')))
    assert.ok(fs.readFileSync(path.join(employee.cwd,'AGENTS.md'),'utf8').includes('.agents-company/README.md'))
  }
  ok(defaultEmployee.cwd===path.join(pluginRoot,'Default worker')&&boundEmployee.cwd===existingFolder,'default and bound Work employees each receive their own copied plugin API and launcher')
  await cli('group','add','More plans','--mode','work','--plugin','mininotion')
  ok((await cli('session','list')).teamRoots['More plans']===path.join(pluginBase,'More plans'),'Teams using the same plugin have separate fixed folders')
  await assert.rejects(()=>cli('group','add','../escape','--mode','build'))
  await assert.rejects(()=>cli('group','add','Escape','--root',temp))
  await assert.rejects(()=>cli('group','root','Plans',temp))
  ok(!fs.existsSync(path.join(temp,'escape')),'arbitrary Team roots and path-like Build names are rejected')
  const hire=(title,cwd,mode='create',group='Plans')=>cli('card','create','--title',title,'--group',group,'--cwd',cwd,'--directory-mode',mode,'--avatar','cloud')
  const worker=await hire('Writer','department/writer')
  const manager=await hire('Manager','department','existing')
  ok(worker.cwd===path.join(manager.cwd,'writer')&&fs.existsSync(path.join(worker.cwd,'.agents-company/bin/mininotion')),'create and existing modes support nested staff workspaces with bound CLI launchers')
  await assert.rejects(()=>hire('Root','.','existing'))
  await assert.rejects(()=>hire('Wrong new','department','create'))
  await assert.rejects(()=>hire('Wrong existing','missing','existing'))
  const separate=await hire('Same seat','department/writer','create','More plans')
  ok(separate.cwd===path.join(pluginBase,'More plans/department/writer'),'separate Work Teams can use the same relative employee path')
  await assert.rejects(()=>hire('Duplicate','department/writer','existing','Plans'))
  await assert.rejects(()=>hire('Escape','../bad'))
  fs.symlinkSync(projects,path.join(pluginRoot,'outward'))
  await assert.rejects(()=>hire('Link','outward/escape'))
  ok(!fs.existsSync(path.join(pluginRoot,'missing'))&&!fs.existsSync(path.join(projects,'escape')),'root ownership, duplicates, missing selections and symlink escapes are blocked before writing')
  const builder=await hire('Builder','.','existing','project1')
  const nested=await hire('Builder child','src/employee','create','project1')
  ok(builder.cwd===path.join(projects,'project1')&&nested.cwd.startsWith(builder.cwd+'/'),'Build accepts its project root or nested employee folders')
  await cli('group','rename','project1','project renamed')
  const renamed=(await cli('session','list')).sessions.find(c=>c.id===nested.id)
  ok(renamed.group==='project renamed'&&renamed.cwd===path.join(projects,'project1','src/employee')&&fs.realpathSync(nested.cwd)===renamed.cwd&&!fs.existsSync(path.join(projects,'project renamed')),'Build Team display name changes while existing paths remain intact')
  await cli('group','migrate','Legacy')
  const migrated=(await cli('session','list')).sessions.find(c=>c.id==='legacy-worker')
  ok(migrated.cwd===path.join(projects,'Legacy/staff')&&fs.readFileSync(path.join(migrated.cwd,'keep.md'),'utf8')==='Keep this exact work.\n'&&!migrated.threadId,'legacy migration preserves work and resets the engine working directory')
  ok(fs.realpathSync(legacy)===path.join(projects,'Legacy')&&fs.readdirSync(path.join(home,'backups')).some(n=>n.startsWith('before-directory-migration')),'migration leaves a metadata backup and a compatible old-path link')
  await cli('group','configure','Old Bound','--mode','work','--plugin','mininotion')
  ok((await cli('session','list')).teamRoots['Old Bound']===oldBound,'an unchanged legacy Work binding remains usable without moving its files')
  await cli('group','migrate','Old Work')
  const oldChild=(await cli('session','list')).sessions.find(c=>c.id==='old-child'),oldOwner=(await cli('session','list')).sessions.find(c=>c.id==='old-owner')
  ok(oldOwner.cwd===path.join(pluginBase,'Old Work','old-work')&&oldChild.cwd===path.join(oldOwner.cwd,'child')&&fs.readFileSync(path.join(oldChild.cwd,'plan.md'),'utf8')==='Existing plugin work','legacy Work migration preserves nested work and makes former root owners strict descendants')
  ok(JSON.parse(fs.readFileSync(path.join(oldChild.cwd,'.agents-company/workspace.json'))).workspace===oldChild.cwd,'migration refreshes employee CLI guides and launchers to the canonical scope')
  await cli('view','open','team','--name','Plans');ok((await cli('view','get')).kind==='team','CLI can open Team details without a renderer')
  await cli('view','close');ok((await cli('view','get')).kind==='home','CLI close works without a window')
  await cli('view','open','employee');await cli('view','close')
  await cli('view','open','conversation','--employee',worker.id);await cli('view','details','on')
  ok((await cli('view','get')).details,'employee details is an explicit CLI operation')
  await cli('view','details','off');await cli('view','close')
  ok(!(await cli('session','list','--live')).length,'navigation alone consumes no model calls and does not create a session')
  console.log(`PASS=${checks} FAIL=0 — headless, no model calls`)
}catch(error){console.error(log);throw error}finally{server.kill('SIGTERM');await done;fs.rmSync(temp,{recursive:true,force:true})}
