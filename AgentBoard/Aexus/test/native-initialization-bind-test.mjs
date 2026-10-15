// Source-built Core with local SSH/native protocol fixtures. No real host or inference.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-native-init-bind-'))),bin=path.join(temp,'bin'),remote=path.join(temp,'remote'),home=path.join(temp,'user'),out=path.join(root,'artifacts/native-initialization-bind')
for(const directory of [bin,remote,home,out])fs.mkdirSync(directory,{recursive:true})
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
fs.writeFileSync(path.join(bin,'ssh'),`#!${process.execPath}
const args=process.argv.slice(2);if(args.includes('-R')){console.error('Allocated port '+args[args.indexOf('-R')+1].split(':').at(-1));setInterval(()=>{},1000)}else{const child=require('child_process').spawn('/bin/sh',['-c',args.at(-1)],{stdio:'inherit'});child.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>child.kill('SIGTERM'))}
`,{mode:0o755})
let native=fs.readFileSync(path.join(root,'test/fixtures/initialization-codex.cjs'),'utf8').replace("const employee=process.env.AGENTS_COMPANY_EMPLOYEE||'catalog'", "const employee=process.env.AGENTS_COMPANY_EMPLOYEE||path.basename(process.cwd())")
native=native.replace("    case 'thread/read':", `    case 'thread/fork':return result({thread:{id:crypto.randomUUID()}})
    case 'thread/delete':fs.appendFileSync(path.join(control,'deleted-native.jsonl'),JSON.stringify(p)+'\\n');return result({})
    case 'thread/read':if(p.includeTurns){const file=path.join(control,'external-'+p.threadId+'.json');if(fs.existsSync(file)){const reply=()=>result({thread:JSON.parse(fs.readFileSync(file,'utf8'))});if(fs.existsSync(path.join(control,'hold-read'))){fs.writeFileSync(path.join(control,'read-held'),'');const wait=setInterval(()=>{if(!fs.existsSync(path.join(control,'hold-read'))){clearInterval(wait);reply()}},20);return}return reply()}}
`)
fs.writeFileSync(path.join(bin,'fixture.cjs'),native)
fs.writeFileSync(path.join(bin,'codex'),`#!${process.execPath}
if(process.argv.includes('--version')){console.log('codex-cli fixture');process.exit(0)}if(process.argv[2]==='login'){console.log('Logged in');process.exit(0)}require(${JSON.stringify(path.join(bin,'fixture.cjs'))})
`,{mode:0o755})
let f
const checks=[];const pass=name=>{checks.push(name);console.log('PASS',name)}
try{
 const entry=path.join(temp,'daemon.cjs');await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({HOME:home,PATH:[bin,path.dirname(process.execPath),'/usr/bin','/bin','/usr/sbin','/sbin'].join(path.delimiter),CODEX_BIN:path.join(bin,'codex')},entry)
 const rpc=async(cmd,args={})=>{const response=await f.request(null,cmd,args);assert.ok(response.ok,response.error);return response.data},card=async id=>(await f.cli('session','list')).sessions.find(card=>card.id===id),transcript=id=>rpc('session.transcript',{employee:id}),idle=id=>f.until(async()=>!(await f.status(id)).busy,'idle '+id)
 const host=await f.cli('host','create','--data',JSON.stringify({name:'Fixture host',host:'fixture.invalid',os:'linux',defaultDirectory:remote}));await f.cli('group','add','Cloud','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
 const create=async(name,wait=true)=>{const value=await f.cli('card','create','--title',name,'--group','Cloud','--kind','cloud-native-worker','--engine','codex','--model','gpt-6-luna');if(wait)await f.ready(value.id);return card(value.id)}
 const external=employee=>{const id=randomUUID(),record={id,cwd:employee.cwd,turns:[{id:randomUUID(),items:[{id:'external-user',type:'userMessage',content:[{type:'text',text:'Existing external request'}]},{id:'external-answer',type:'agentMessage',text:'Existing external answer'}]}]};fs.writeFileSync(path.join(f.control,'external-'+id+'.json'),JSON.stringify(record));return id}
 const initial=await create('Fresh'),oldId=initial.threadId;assert.ok(oldId);assert.equal(initial.initialization.nativeBindId,oldId);assert.deepEqual((await transcript(initial.id)).items,[])
 const own=await f.request(null,'card.native-bind',{id:initial.id,sessionId:oldId});assert.equal(own.ok,false);assert.match(own.error,/本员工拥有/)
 const externalId=external(initial),bound=await rpc('card.native-bind',{id:initial.id,sessionId:externalId});assert.equal(bound.imported,2);assert.equal(bound.card.initialization.status,'pending');await f.ready(initial.id)
 const linked=await card(initial.id);assert.equal(linked.threadId,externalId);assert.equal(linked.nativeOwnership,'external');assert.equal(linked.initialization.nativeBindId,undefined);assert.ok(linked.nativeSessions.some(ref=>ref.id===oldId&&ref.ownership!=='external'));assert.match((await transcript(initial.id)).text,/Existing external answer/);assert.ok(!(await transcript(initial.id)).text.includes('private initialization'))
 const overwritten=await f.request(null,'card.native-bind',{id:initial.id,sessionId:external(initial)});assert.equal(overwritten.ok,false);assert.match(overwritten.error,/已有会话/);pass('fresh hidden initialization may bind once; owned native reference is archived, external history remains external and is reinitialized')
 const busy=await create('Worked'),busyNative=busy.threadId;await f.cli('session','send','--employee',busy.id,'--text','A real fixture task');await idle(busy.id);assert.equal((await card(busy.id)).initialization.nativeBindId,undefined);assert.equal((await f.request(null,'card.native-bind',{id:busy.id,sessionId:external(busy)})).ok,false);assert.equal((await card(busy.id)).threadId,busyNative);pass('ordinary work permanently clears binding eligibility and preserves its native context')
 const aware=await create('Aware'),group=await rpc('chat.create',{name:'Context only',members:[aware.id]});const message=await rpc('chat.post',{id:group.id,kind:'message',text:'Read this shared context without starting work'})
 await f.until(async()=>{const history=await rpc('chat.history',{id:group.id}),value=history.messages.find(item=>item.id===message.id);return value?.deliveries[0]?.status==='completed'},'awareness receipt')
 assert.equal((await card(aware.id)).initialization.nativeBindId,undefined);assert.deepEqual((await transcript(aware.id)).items,[]);assert.equal((await f.request(null,'card.native-bind',{id:aware.id,sessionId:external(aware)})).ok,false);pass('silent awareness invalidates binding evidence even with zero public transcript')
 const cloneSource=await create('CloneSource'),cloned=await f.cli('card','clone',cloneSource.id,'--title','Clone');await f.ready(cloned.id);assert.equal((await card(cloned.id)).initialization.nativeBindId,undefined);assert.equal((await f.request(null,'card.native-bind',{id:cloned.id,sessionId:external(await card(cloned.id))})).ok,false);assert.equal((await card(cloneSource.id)).initialization.nativeBindId,cloneSource.threadId);pass('cloned native history is never mistaken for fresh initialization')
 const race=await create('Race'),raceNative=race.threadId;fs.writeFileSync(path.join(f.control,'hold-read'),'');const pending=f.request(null,'card.native-bind',{id:race.id,sessionId:external(race)});await f.until(()=>fs.existsSync(path.join(f.control,'read-held')),'held remote metadata');await f.cli('session','send','--employee',race.id,'--text','Keep this original thread');await idle(race.id);fs.unlinkSync(path.join(f.control,'hold-read'));assert.equal((await pending).ok,false);assert.equal((await card(race.id)).threadId,raceNative);assert.match((await transcript(race.id)).text,/Keep this original thread/);pass('a concurrent accepted task invalidates a pending bind before any history replacement')
 const legacy=await create('Legacy');await f.stop();const stateFile=path.join(f.env.AGENTS_COMPANY_HOME,'sessions.json'),state=JSON.parse(fs.readFileSync(stateFile,'utf8'))
 delete state.sessions.find(value=>value.id===legacy.id).initialization.nativeBindId
 state.sessions.find(value=>value.id===busy.id).initialization.nativeBindId=busyNative // Deliberately stale fixture evidence must not permit replacing a public history.
 fs.writeFileSync(stateFile,JSON.stringify(state));await f.start()
 for(const candidate of [legacy,busy]){const rejected=await f.request(null,'card.native-bind',{id:candidate.id,sessionId:external(candidate)});assert.equal(rejected.ok,false);assert.match(rejected.error,/已有会话/)}
 assert.deepEqual((await transcript(legacy.id)).items,[]);assert.match((await transcript(busy.id)).text,/A real fixture task/);pass('legacy empty transcripts need provenance and existing public history rejects even stale exact-ID evidence')
 await f.cli('card','remove',initial.id);const deleted=fs.readFileSync(path.join(f.control,'deleted-native.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line).threadId);assert.ok(deleted.includes(oldId));assert.ok(!deleted.includes(externalId));assert.ok(fs.existsSync(path.join(f.control,'external-'+externalId+'.json')));pass('employee removal cleans owned initialization history but never deletes the bound external original')
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,checks,externalId,ownedInitializationId:oldId,realModelCalls:0,realHosts:0},null,2))
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true})}
