// New Work Teams live under plugin folders; direct plugin data is copied once from the old root.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'

const run=promisify(execFile),root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-plugin-location-')))
const source=path.join(temp,'PlugIns/browser'),builtin=path.join(temp,'builtin/browser'),legacy=path.join(temp,'develop/Agents-company-workspace/browser-workspace')
fs.mkdirSync(source,{recursive:true});fs.mkdirSync(legacy,{recursive:true})
fs.writeFileSync(path.join(legacy,'saved-before-upgrade.md'),'keep this page\n')
fs.cpSync(path.join(root,'build/plugins/browser'),builtin,{recursive:true})
fs.writeFileSync(path.join(builtin,'source-location.json'),JSON.stringify({source})+'\n')
const env={...process.env,HOME:temp,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(temp,'builtin'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects')}
delete env.AGENTS_COMPANY_WORKSPACES
const daemon=spawn(process.execPath,[root+'/bin/agents','serve'],{env,stdio:'ignore'}),done=new Promise(resolve=>daemon.once('exit',resolve))
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:15000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
try{
 for(let i=0;i<100;i++){try{if((await cli('status')).running)break}catch{}await new Promise(resolve=>setTimeout(resolve,50))}
 const view=await cli('plugin','view','browser'),home=path.join(source,'workspaces/default')
 assert.equal(view.workspace,home)
 assert.equal(fs.readFileSync(path.join(home,'saved-before-upgrade.md'),'utf8'),'keep this page\n')
 assert.equal(fs.readFileSync(path.join(legacy,'saved-before-upgrade.md'),'utf8'),'keep this page\n')
 await cli('plugin','close',view.id)
 const team=await cli('group','add','Research','--mode','work','--plugin','browser')
 assert.equal(team.teamRoots.Research,path.join(source,'workspaces/Research'))
 assert.ok(!fs.existsSync(path.join(team.teamRoots.Research,'saved-before-upgrade.md')))
 const employee=await cli('card','create','--title','Reader','--group','Research','--directory-mode','default')
 assert.ok(fs.existsSync(path.join(employee.cwd,'.agents-company/plugins/browser/API.md')))
 const installed=await cli('plugin','install',path.join(root,'examples/plugin-starter'))
 assert.equal(installed.plugin.id,'workspace-notes')
 const notes=await cli('group','add','Notes','--mode','work','--plugin','workspace-notes')
 assert.equal(notes.teamRoots.Notes,path.join(env.AGENTS_COMPANY_HOME,'plugins/workspace-notes/workspaces/Notes'))
 const writer=await cli('card','create','--title','Writer','--group','Notes','--directory-mode','default')
 assert.ok(fs.existsSync(path.join(writer.cwd,'.agents-company/plugins/workspace-notes/API.md')))
 console.log('PASS legacy plugin files are copied without moving; built-in and installed plugins give each Team a fixed plugin-owned root and each employee CLI docs')
}finally{daemon.kill('SIGTERM');await done;fs.rmSync(temp,{recursive:true,force:true})}
