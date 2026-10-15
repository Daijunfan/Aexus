// Isolated end-to-end Manager Team control through the real host socket, without inference or UI.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{spawn,execFile}from 'node:child_process';import{promisify}from 'node:util';import{createRequire}from 'node:module';import{build}from 'esbuild';import assert from 'node:assert/strict'
const run=promisify(execFile),require=createRequire(import.meta.dirname),root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-manager-')),control=path.join(temp,'fixture')
// Onboarding must be deterministic and must never reach a billed model: the same
// native protocol fixture test/fixtures/headless-core.mjs uses.
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control};let manager=path.join(temp,'Agents-Managers');fs.mkdirSync(manager);manager=fs.realpathSync(manager)
fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'')
fs.writeFileSync(path.join(manager,'.agents-company-manager'),'agents-company-manager/v1\n')
const sdk=require.resolve('@anthropic-ai/claude-agent-sdk'),bundle=path.join(temp,'env.cjs');await build({stdin:{contents:"export {childEnv} from './src/main/exec'",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:bundle,logLevel:'silent'});const {childEnv}=require(bundle)
const daemon=spawn(process.execPath,[root+'/bin/agents','serve'],{env,stdio:'ignore'}),done=new Promise(resolve=>daemon.once('exit',resolve));let director
const credentials=new Map()
// The company CLI is one shared launcher in the Core data home
// (src/main/plugins/documents.ts ensureCompanyLauncher); it is no longer copied
// into an employee's working directory, so invoke it by its real path.
const launcher=path.join(env.AGENTS_COMPANY_HOME,'cli','bin','agents')
const cli=async(cwd,...args)=>{const response=JSON.parse((await run(launcher,[...args,'--json'],{cwd,env:{...childEnv(cwd),...env,PATH:childEnv(cwd).PATH,AGENTS_COMPANY_TOKEN_FILE:credentials.get(cwd)},timeout:25000})).stdout);assert.ok(response.ok,response.error);return response.data}
const bootstrap=async(...args)=>{const response=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env,timeout:25000})).stdout);assert.ok(response.ok,response.error);return response.data}
// `management.global` (and every interaction command) is gated on the employee
// finishing onboarding, so poll the real lifecycle state instead of racing it.
const ready=async id=>{for(let n=0;n<400;n++){const [status]=await bootstrap('session','status','--employee',id);if(status?.initialization?.status==='failed')throw Error('Employee initialization failed: '+status.initialization.error);if(status?.initialization?.status==='ready')return;await new Promise(resolve=>setTimeout(resolve,50))}throw Error('Employee never reached initialization.status=ready: '+id)}
try{
 for(let n=0;n<100;n++){try{if((await bootstrap('status')).running)break}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
 assert.ok(!fs.existsSync(path.join(manager,'API.md'))&&!fs.existsSync(path.join(manager,'agents')))
 await bootstrap('group','add','Managers','--mode','build','--directory-mode','bind','--root',manager)
 // A new employee inherits the user's configured engine permission
 // (src/main/server.ts card.create), so configure that default through the
 // documented API and assert it is honoured instead of assuming a shipped value.
 await bootstrap('settings','set','--default-permission','acceptEdits')
 director=await bootstrap('card','create','--title','Director','--group','Managers','--engine','codex','--model','gpt-6-luna','--effort','low')
 await ready(director.id);await bootstrap('management','global',director.id,'on');credentials.set(director.cwd,(await bootstrap('auth','agent-token',director.id)).file)
 assert.equal(director.permissionMode,'acceptEdits')
 assert.ok(fs.existsSync(launcher),'Shared company CLI launcher is missing')
 assert.ok(!fs.existsSync(path.join(director.cwd,'.agents-company','bin')),'The company CLI must not be copied into an employee directory')
 // The per-employee handbook was replaced by one shared ROUTER_PROMPT plus the
 // Core API documents, which the read-only documentation tool serves out of the
 // Core data home (src/main/api-documents.ts). No handbook copy belongs in an
 // employee's working directory any more.
 const docs=path.join(env.AGENTS_COMPANY_HOME,'api-docs')
 assert.ok(fs.existsSync(path.join(docs,'core','API.md'))&&fs.existsSync(path.join(docs,'core','PERMISSIONS.md')),'Shared Core API documents were not materialized')
 assert.ok(!fs.existsSync(path.join(director.cwd,'.agents-company','employees')),'Employee directory must not receive a private handbook copy')
 const directorDocs=await cli(director.cwd,'api','docs','core/plan')
 assert.match(directorDocs.markdown,/Plan/, 'Shared Core documents must be readable through the employee identity')
 assert.equal(directorDocs.catalogRoot,docs)
 assert.equal((await cli(director.cwd,'status')).running,true)
 const originalPath=process.env.PATH;process.env.PATH='/usr/bin:/bin';const finderEnv=childEnv(director.cwd);process.env.PATH=originalPath
 assert.ok(finderEnv.PATH.split(path.delimiter).some(folder=>fs.existsSync(path.join(folder,'node'))),'Finder environment must include Node for the Manager launcher')
 assert.equal(JSON.parse((await run(launcher,['status','--json'],{cwd:director.cwd,env:{...finderEnv,...env,PATH:finderEnv.PATH,AGENTS_COMPANY_TOKEN_FILE:credentials.get(director.cwd)}})).stdout).data.running,true)
 const assistant=await cli(director.cwd,'card','create','--title','Assistant','--group','Managers','--engine','codex')
 await ready(assistant.id);await bootstrap('management','global',assistant.id,'on');credentials.set(assistant.cwd,(await bootstrap('auth','agent-token',assistant.id)).file)
 assert.equal(assistant.permissionMode,'acceptEdits')
 assert.ok(!fs.existsSync(path.join(assistant.cwd,'.agents-company')),'Each Manager uses the shared Core launcher, not a private copy')
 assert.equal((await cli(assistant.cwd,'status')).running,true)
 // Every employee identity resolves the same Core-global reference material;
 // nothing is copied per employee.
 assert.deepEqual(await cli(assistant.cwd,'api','docs','core/plan'),directorDocs)
 const bound=path.join(manager,'Bound');fs.mkdirSync(bound)
 const boundEmployee=await cli(director.cwd,'card','create','--title','Bound','--group','Managers','--directory-mode','bind','--cwd',bound)
 assert.equal(boundEmployee.cwd,fs.realpathSync(bound))
 assert.ok(!fs.existsSync(path.join(boundEmployee.cwd,'.agents-company')),'A bound employee directory must stay free of generated handbooks')
 await cli(director.cwd,'card','remove',boundEmployee.id)
 await assert.rejects(()=>cli(director.cwd,'card','create','--title','Outside','--group','Managers','--directory-mode','bind','--cwd',temp))
 await cli(director.cwd,'group','add','Demo','--mode','build')
 const worker=await cli(assistant.cwd,'card','create','--title','Worker','--group','Demo','--engine','codex','--model','gpt-6-luna','--effort','low')
 await ready(worker.id)
 await cli(director.cwd,'card','update',worker.id,'--role','Reviewer','--color','#7089c4')
 const changed=(await cli(assistant.cwd,'session','list')).sessions.find(s=>s.id===worker.id);assert.equal(changed.role,'Reviewer');assert.equal(changed.color,'#7089c4')
 await cli(director.cwd,'room','bounds','Demo','--width','850','--height','640');assert.equal((await cli(assistant.cwd,'room','layout','Demo')).bounds.width,850)
 const when=new Date(Date.now()+86400000).toISOString(),job=await cli(assistant.cwd,'schedule','create','--name','Future check','--employee',worker.id,'--at',when,'--prompt','Read the test workspace only','--model','gpt-6-luna','--effort','low')
 assert.equal((await cli(director.cwd,'schedule','get',job.id)).id,job.id)
 assert.ok((await cli(director.cwd,'schedule','preview',job.id,'--count','1')).times.length>0)
 await cli(assistant.cwd,'schedule','pause',job.id);await cli(assistant.cwd,'schedule','resume',job.id);await cli(director.cwd,'schedule','delete',job.id)
 await cli(assistant.cwd,'card','remove',worker.id);await cli(director.cwd,'group','remove','Demo')
 assert.ok(!(await cli(director.cwd,'session','list')).sessions.some(s=>s.id===worker.id));assert.ok(!(await cli(director.cwd,'group','list')).includes('Demo'))
 console.log('PASS two Manager employees control other Teams, employees and schedule configuration through CLI; no window or model call')
}finally{daemon.kill('SIGTERM');await done;fs.rmSync(temp,{recursive:true,force:true})}
