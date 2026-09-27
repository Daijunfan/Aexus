import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {build} from 'esbuild'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-access-state-'))),run=promisify(execFile),home=path.join(temp,'state'),managerRoot=path.join(temp,'Agents-Managers'),legacyCwd=path.join(managerRoot,'Legacy')
fs.mkdirSync(home);fs.mkdirSync(legacyCwd,{recursive:true});fs.writeFileSync(path.join(managerRoot,'.agents-company-manager'),'agents-company-manager/v1\n')
const file=path.join(home,'sessions.json');fs.writeFileSync(file,JSON.stringify({access:{version:1,revision:0,globalManagerIds:['legacy_manager'],relations:[]},groups:['Managers'],sessions:[{id:'legacy_manager',title:'Legacy',group:'Managers',cwd:legacyCwd,engine:'codex',createdAt:1}],rooms:{},teamRoots:{Managers:managerRoot},teamSettings:{Managers:{mode:'build',directoryMode:'bind'}}}))
const control=path.join(temp,'fixture');fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'')
const env={...process.env,CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins')}
let service,ended
const cliAs=async(token,...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env:{...env,...(token?{AGENTS_COMPANY_TOKEN:token}:{})},timeout:15000})).stdout);assert.ok(reply.ok,reply.error);return reply.data},cli=(...args)=>cliAs(null,...args)
const start=async()=>{service=spawn(process.execPath,[root+'/bin/agents','serve'],{env,stdio:['ignore','ignore','ignore','ipc']});ended=new Promise(resolve=>service.once('exit',resolve));for(let i=0;i<100;i++){try{await cli('status');return}catch{await new Promise(resolve=>setTimeout(resolve,30))}}throw Error('Not started')}
const stop=async()=>{if(service.exitCode!==null||service.signalCode!==null)return;if(service.connected)service.send({type:'agents-company:shutdown'});else service.kill('SIGTERM');await ended}
const ready=async id=>{for(let i=0;i<200;i++){const card=(await cli('session','status','--employee',id))[0];if(card.initialization.status==='ready')return;if(card.initialization.status==='failed')throw Error(card.initialization.error);await new Promise(resolve=>setTimeout(resolve,30))}throw Error('Initialization timeout')}
try{
 await start()
 assert.equal(JSON.parse(fs.readFileSync(file)).sessions[0].managementRole,'governor');assert.deepEqual(JSON.parse(fs.readFileSync(file)).access.globalManagerIds,[])
 const later=await cli('card','create','--title','Later','--group','Managers'),laterToken=(await cli('auth','agent-token',later.id)).token
 await ready(later.id)
 assert.equal((await cliAs(laterToken,'auth','whoami')).globalManager,false)
 await stop();await start();assert.equal((await cliAs(laterToken,'auth','whoami')).globalManager,false)
 await cli('group','add','Hosts','--mode','work','--plugin','cloud-hosts');const hostWorker=await cli('card','create','--title','Operator','--group','Hosts'),credential=await cli('auth','agent-token',hostWorker.id)
 await ready(hostWorker.id);await cli('session','open',hostWorker.id)
 await assert.rejects(()=>cliAs(credential.token,'plugin','call','cloud-hosts','hosts.list','--employee',hostWorker.id))
 await cli('management','global',hostWorker.id,'on');assert.ok(Array.isArray(await cliAs(credential.token,'plugin','call','cloud-hosts','hosts.list','--employee',hostWorker.id)))
 await cli('management','global',hostWorker.id,'off');await assert.rejects(()=>cliAs(credential.token,'plugin','call','cloud-hosts','hosts.list','--employee',hostWorker.id))
 const mailbox=path.join(hostWorker.cwd,'.agents-company/ipc/cloud-hosts',hostWorker.id),id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';fs.writeFileSync(path.join(mailbox,id+'.request.json'),JSON.stringify({jsonrpc:'2.0',id,method:'hosts.list',params:{}}))
 for(let i=0;i<100&&!fs.existsSync(path.join(mailbox,id+'.response.json'));i++)await new Promise(resolve=>setTimeout(resolve,20))
 assert.match(JSON.parse(fs.readFileSync(path.join(mailbox,id+'.response.json'))).error.message,/Authentication/)
 await cli('group','add','Notes','--mode','work','--plugin','mininotion');const writer=await cli('card','create','--title','Writer','--group','Notes'),writerToken=(await cli('auth','agent-token',writer.id)).token
 await ready(writer.id);assert.ok(await cliAs(writerToken,'plugin','call','mininotion','status','--employee',writer.id))
 await assert.rejects(()=>cliAs(writerToken,'workspace','list','.','--employee',hostWorker.id))
 await assert.rejects(()=>cliAs(writerToken,'plugin','call','mininotion','status','--workspace',managerRoot))
 const bundle=path.join(temp,'atomic.cjs');await build({stdin:{contents:`import {readStore,writeStore,updateStore} from ${JSON.stringify(root+'/src/main/store.ts')};const stale=readStore();updateStore(store=>{store.viewport={x:1,y:2,zoom:1}});let denied=false;try{writeStore(stale)}catch{denied=true}if(!denied)throw Error('Stale write accepted')`,loader:'ts',resolveDir:root},outfile:bundle,bundle:true,platform:'node',format:'cjs',logLevel:'silent'});await run(process.execPath,[bundle],{env})
 const good=fs.readFileSync(file);fs.writeFileSync(file,'{corrupt')
 await assert.rejects(()=>cli('group','list'));await assert.rejects(()=>cliAs(laterToken,'auth','whoami'))
 assert.equal(fs.readFileSync(file,'utf8'),'{corrupt');fs.writeFileSync(file,good)
 console.log('PASS one-time explicit legacy migration, copied markers cannot elevate, plugin/mailbox identity preserved, stale atomic writes and corrupt authority state fail closed')
}finally{if(service&&!service.killed)await stop();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
