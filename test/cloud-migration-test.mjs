import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-cmig-'))),home=path.join(temp,'state'),local=path.join(temp,'local'),run=promisify(execFile),project=path.resolve(import.meta.dirname,'..')
fs.mkdirSync(home);fs.mkdirSync(local);fs.writeFileSync(path.join(local,'keep.txt'),'unchanged')
const remote={host:'cloud.example',directory:'/srv/project',os:'linux'},threadId='11111111-1111-4111-8111-111111111111'
fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify({groups:['Existing'],teamRoots:{Existing:local},teamSettings:{Existing:{mode:'build'}},sessions:[{id:'local-person',title:'Local','engine':'codex',group:'Existing',cwd:local,createdAt:1},{id:'old-cloud-person',title:'Cloud','engine':'codex',group:'Existing',cwd:local,remote,threadId,createdAt:1}]}))
const env={...process.env,AGENTS_COMPANY_HOME:home},executable=process.env.AGENTS_COMPANY_TEST_CLI||process.execPath,prefix=process.env.AGENTS_COMPANY_TEST_CLI?[]:[path.join(project,'bin/agents')]
const server=spawn(executable,[...prefix,'serve'],{env,stdio:'ignore'}),done=new Promise(r=>server.once('exit',r))
const cli=async(...args)=>JSON.parse((await run(executable,[...prefix,...args,'--json'],{env,timeout:10000})).stdout).data
try{
 for(let i=0;i<100&&!fs.existsSync(path.join(home,'agents.sock'));i++)await new Promise(r=>setTimeout(r,40))
 const state=await cli('session','list'),cloud=state.sessions.find(c=>c.id==='old-cloud-person'),unchanged=state.sessions.find(c=>c.id==='local-person'),raw=JSON.parse(fs.readFileSync(path.join(home,'sessions.json')))
 assert.equal(unchanged.group,'Existing');assert.equal(state.teamSettings.Existing.mode,'build');assert.equal(cloud.title,'Cloud');assert.equal(cloud.threadId,threadId);assert.equal(cloud.cwd,'/srv/project');assert.equal(state.teamSettings[cloud.group].mode,'cloud');assert.deepEqual(state.teamSettings[cloud.group].remote,remote);assert.ok(!raw.sessions.find(c=>c.id===cloud.id).remote)
 assert.ok(fs.readdirSync(path.join(home,'backups')).some(name=>name.startsWith('before-cloud-teams-')));assert.equal(fs.readFileSync(path.join(local,'keep.txt'),'utf8'),'unchanged')
 console.log('PASS legacy per-employee SSH becomes a cloud Team; local members, names, native IDs and files remain intact; backup created')
}finally{server.kill('SIGTERM');await done;fs.rmSync(temp,{recursive:true,force:true})}
