// Source markers preserve development roots; portable packages keep data outside replaceable code.
import {directoryName} from '../shared/directory-names.ts'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'

const run=promisify(execFile),root=path.resolve(import.meta.dirname,'../../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-plugin-location-')))
const source=path.join(temp,'Infra/Plugins/cloud-hosts'),builtin=path.join(temp,'builtin/cloud-hosts'),legacy=path.join(temp,'develop/Agents-company-workspace/cloud-hosts-workspace')
fs.mkdirSync(source,{recursive:true});fs.mkdirSync(legacy,{recursive:true})
fs.writeFileSync(path.join(legacy,'saved-before-upgrade.md'),'keep this page\n')
fs.cpSync(path.join(root,'Infra/src/resources/plugins/cloud-hosts'),builtin,{recursive:true})
fs.writeFileSync(path.join(builtin,'source-location.json'),JSON.stringify({source})+'\n')
const env={...process.env,HOME:temp,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(temp,'builtin'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),CODEX_BIN:path.join(root,'Infra/src/test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex')}
delete env.AGENTS_COMPANY_WORKSPACES
const control=path.join(temp,'fixture');fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'');env.AC_INIT_FIXTURE=control
const daemon=spawn(process.execPath,[root+'/Infra/src/cli/agents','serve'],{env,stdio:'ignore'}),done=new Promise(resolve=>daemon.once('exit',resolve))
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/Infra/src/cli/agents',...args,'--json'],{env,timeout:15000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
try{
 for(let i=0;i<100;i++){try{if((await cli('status')).running)break}catch{}await new Promise(resolve=>setTimeout(resolve,50))}
 const view=await cli('plugin','view','cloud-hosts'),home=path.join(source,'workspaces/default')
 assert.equal(view.workspace,home)
 assert.equal(fs.readFileSync(path.join(home,'saved-before-upgrade.md'),'utf8'),'keep this page\n')
 assert.equal(fs.readFileSync(path.join(legacy,'saved-before-upgrade.md'),'utf8'),'keep this page\n')
 await cli('plugin','close',view.id)
 const team=await cli('group','add','Research','--mode','work','--plugin','cloud-hosts')
 assert.equal(team.teamRoots.Research,path.join(source,'workspaces',directoryName('Research','team')))
 assert.ok(!fs.existsSync(path.join(team.teamRoots.Research,'saved-before-upgrade.md')))
 const employee=await cli('card','create','--title','Reader','--group','Research','--directory-mode','default','--engine','codex','--model','gpt-6-luna','--effort','low')
 const cloudDocs=await cli('api','docs','plugin/cloud-hosts/api');assert.match(cloudDocs.markdown,/plugin: cloud-hosts/);assert.ok(cloudDocs.path.startsWith(path.join(env.AGENTS_COMPANY_HOME,'api-docs')+path.sep));assert.equal(fs.readFileSync(cloudDocs.path,'utf8'),cloudDocs.markdown);assert.ok(!fs.existsSync(path.join(employee.cwd,'.agents-company/plugins/cloud-hosts/API.md')))
 const installed=await cli('plugin','install',path.join(root,'Infra/src/examples/plugin-starter'))
 assert.equal(installed.plugin.id,'workspace-notes')
 const notes=await cli('group','add','Notes','--mode','work','--plugin','workspace-notes')
 assert.equal(notes.teamRoots.Notes,path.join(env.AGENTS_COMPANY_HOME,'workspaces/workspace-notes-workspace',directoryName('Notes','team')))
 assert.ok(!fs.existsSync(path.join(env.AGENTS_COMPANY_HOME,'plugins/workspace-notes/workspaces')),'installable code must not contain user workspaces')
 const writer=await cli('card','create','--title','Writer','--group','Notes','--directory-mode','default','--engine','codex','--model','gpt-6-luna','--effort','low')
 const notesDocs=await cli('api','docs','plugin/workspace-notes/api');assert.match(notesDocs.markdown,/plugin: workspace-notes/);assert.ok(notesDocs.path.startsWith(path.join(env.AGENTS_COMPANY_HOME,'api-docs')+path.sep));assert.equal(fs.readFileSync(notesDocs.path,'utf8'),notesDocs.markdown);assert.ok(!fs.existsSync(path.join(writer.cwd,'.agents-company/plugins/workspace-notes/API.md')))
 const mini=path.join(temp,'builtin/mini-notion');fs.cpSync(path.join(root,'Infra/src/resources/plugins/mini-notion'),mini,{recursive:true});fs.rmSync(path.join(mini,'source-location.json'),{force:true});
 const oldMini=path.join(temp,'develop/Agents-company-workspace/mini-notion-workspace'),newMini=path.join(env.AGENTS_COMPANY_HOME,'workspaces/mini-notion-workspace');
 fs.mkdirSync(oldMini,{recursive:true});fs.writeFileSync(path.join(oldMini,'cleared.md'),'must stay cleared');
 fs.mkdirSync(path.join(newMini,'.agents-company'),{recursive:true});fs.writeFileSync(path.join(newMini,'.agents-company/legacy-import.json'),JSON.stringify({version:1,completed:true,reason:'explicit-reset'}));
 const clean=await cli('plugin','view','mininotion');
 assert.deepEqual(await cli('plugin','call','mininotion','page.tree'),[]);assert.equal(fs.existsSync(path.join(newMini,'default')),false);await cli('plugin','close',clean.id);
 console.log('PASS explicit workspace reset prevents old legacy content from being imported again')
 console.log('PASS legacy files copied without moving; source-marker roots preserved; portable plugin data stays outside code; current CLI docs resolve through the shared catalog without workspace copies')
}finally{daemon.kill('SIGTERM');await done;fs.rmSync(temp,{recursive:true,force:true})}
