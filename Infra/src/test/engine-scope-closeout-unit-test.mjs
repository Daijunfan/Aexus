// Production-source contract tests with deterministic stores/transports; not a full Core or UI test.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {AsyncLocalStorage} from 'node:async_hooks'
const at=process.argv.indexOf('--root')
const root=at>=0?path.resolve(process.argv[at+1]):path.resolve(import.meta.dirname,'../../..')
const require=createRequire(path.join(root,'package.json'))
const ts=require(process.env.AEXUS_TEST_TYPESCRIPT_MODULE||'typescript')
const checks=[],hashes={}
const source=relative=>{const text=fs.readFileSync(path.join(root,relative),'utf8');hashes[relative]=createHash('sha256').update(text).digest('hex');return text}
function evaluate(text,stubs={},globals={}){
 const module={exports:{}}
 const result=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true})
 const failures=(result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error)
 assert.deepEqual(failures.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')),[])
 const context={exports:module.exports,module,process,structuredClone,console,setTimeout,clearTimeout,Buffer,...globals,require:id=>{
  if(Object.hasOwn(stubs,id))return stubs[id]
  if(id.startsWith('node:'))return require(id)
  throw Error('Unexpected dependency in isolated test: '+id)
 }}
 vm.runInNewContext(result.outputText,context,{timeout:3000})
 return module.exports
}
const plain=v=>JSON.parse(JSON.stringify(v))
const check=async(name,fn)=>{try{await fn();checks.push({name,passed:true});console.log('PASS '+name)}catch(error){checks.push({name,passed:false,error:error.stack});console.error('FAIL '+name+'\n'+error.stack)}}
const cut=(text,from,to)=>{const start=text.indexOf(from),end=text.indexOf(to,start+from.length);assert.ok(start>=0&&end>start,'Production function markers changed');return text.slice(start,end)}
const stampModule=path.join(root,'Infra/src/shared/presentation-events.ts')
const stamps=fs.existsSync(stampModule)?evaluate(source('Infra/src/shared/presentation-events.ts')):null
const management=cut(source('Infra/src/main/management.ts'),'export function managementTopology(','const immutableCreationLine=')
function topology(){
 const raw={groups:['Alpha','Beta','Mixed'],teamRoots:{Alpha:'/fixture/alpha',Beta:'/fixture/beta',Mixed:'/fixture/mixed'},sessions:[
  {id:'a',title:'Same name',group:'Alpha',managementRole:'governor',cwd:'/fixture/a',createdBy:{kind:'operator'}},
  {id:'a2',title:'Alpha employee',group:'Alpha',managementRole:'employee',cwd:'/fixture/a2',createdBy:{kind:'agent',employeeId:'a'}},
  {id:'b',title:'Same name',group:'Beta',managementRole:'governor',cwd:'/fixture/b',createdBy:{kind:'operator'}},
  {id:'b2',title:'Beta employee',group:'Beta',managementRole:'employee',cwd:'/fixture/b2',createdBy:{kind:'agent',employeeId:'b'}},
  {id:'x',title:'Explicitly linked',group:'Mixed',managementRole:'employee',cwd:'/fixture/x',createdBy:{kind:'operator'}},
  {id:'peer',title:'Private peer',group:'Mixed',managementRole:'governor',cwd:'/fixture/peer',createdBy:{kind:'operator'}}
 ],access:{revision:4,bindings:[]}}
 const relations=[{managerId:'a',employeeId:'a2',state:'active'},{managerId:'b',employeeId:'b2',state:'pending'},{managerId:'peer',employeeId:'x',state:'pending'}]
 let scoped=true,principal={kind:'operator'};const authorization=[]
 const projectEngineStore=store=>!scoped?store:{...store,groups:['Alpha','Mixed'],sessions:store.sessions.filter(c=>['a','a2','x'].includes(c.id)),teamRoots:{Alpha:store.teamRoots.Alpha}}
 const api=evaluate(management,{}, {readStore:()=>raw,projectEngineStore,requestContext:()=>({principal}),isGlobal:p=>p.kind==='operator',callerEmployee:p=>raw.sessions.find(c=>c.id===p.employeeId),emptyAccess:()=>({revision:0}),teamSettings:()=>({mode:'build'}),getCloudHost:()=>undefined,employeeSettings:()=>({mode:'build'}),publicEmployee:card=>({...card}),hasGlobalRole:(_,c)=>c.managementRole==='governor',managementRelations:()=>relations,isSupervisor:role=>role==='manager'||role==='governor',authorize:(cmd,args)=>{authorization.push([cmd,plain(args)]);if(cmd==='group.remove'&&args.name==='Mixed')throw Error('Protected peer remains in the real Team')}})
 return {raw,api,authorization,setScope:value=>scoped=value,setPrincipal:p=>principal=p}
}
await check('Scoped topology summary counts only linked Teams and employees',()=>{const t=topology(),v=t.api.managementTopology();assert.deepEqual(plain(v.summary),{teams:2,employees:3,deletableTeams:1,blockedTeams:1})})
await check('Pending and active relationships cannot expose foreign employee IDs',()=>{const v=topology().api.managementTopology();assert.deepEqual(plain(v.edges),[{managerId:'a',employeeId:'a2',state:'active'}]);assert.deepEqual(plain(v.pending),[]);assert.ok(!JSON.stringify(v).includes('Private peer'))})
await check('Employee-only linking does not publish peer counts, governor IDs or a Team root',()=>{const v=topology().api.managementTopology().teams.find(t=>t.name==='Mixed');assert.equal(v.employeeCount,1);assert.deepEqual(plain(v.governorIds),[]);assert.equal(v.directory,undefined)})
await check('teamsOnly has exactly the same scoped counts as the full topology',()=>{const t=topology();assert.deepEqual(plain(t.api.managementTopology(undefined,undefined,true).summary),plain(t.api.managementTopology().summary));assert.equal(t.api.managementTopology(undefined,undefined,true).summary.employees,3)})
await check('Creator filtering preserves the scoped Team roster and real authorization',()=>{const t=topology(),v=t.api.managementTopology(undefined,'operator');assert.equal(v.summary.employees,3);assert.equal(v.nodes.length,2);const team=v.teams.find(t=>t.name==='Mixed');assert.deepEqual(plain(team.allowedActions),[]);assert.match(team.deleteBlockedReason,/Protected peer/)})
await check('Unscoped administrator discovery and stored identities are preserved',()=>{const t=topology(),before=JSON.stringify(t.raw);t.setScope(false);const v=t.api.managementTopology();assert.equal(v.summary.teams,3);assert.equal(v.summary.employees,6);assert.equal(JSON.stringify(t.raw),before)})

const navigationText=source('Infra/src/main/presentation.ts')
function navigation(){let client='one';const saved=new Map(),notices=[];const api=evaluate(navigationText,{'../shared/core-paths':{APP_HOME:'/fixture'},'./request-context':{currentClientId:()=>client},'./atomic-file':{atomicJson:(file,value)=>saved.set(file,structuredClone(value)),readJson:(file,fallback)=>structuredClone(saved.get(file)??fallback())}});api.onViewChange((value,id)=>notices.push([id,plain(value)]));return {api,saved,notices,client:id=>client=id}}
await check('Each new window begins at the launcher and loading A does not select A in window B',()=>{const n=navigation();assert.equal(n.api.getView().layer,'launcher');n.api.loadEngineView('deep-research');n.client('two');assert.equal(n.api.getView().layer,'launcher');n.api.loadEngineView('PPT-maker');n.client('one');assert.equal(n.api.getView().engineId,'deep-research')})
await check('Messages navigation is remembered by both client and Engine ID',()=>{const n=navigation();n.api.loadEngineView('deep-research');n.api.setView({kind:'messages',employee:'a'});n.api.setView({kind:'home',layer:'launcher'});n.api.loadEngineView('PPT-maker');assert.equal(n.api.getMessagesView().employee,undefined);n.api.setView({kind:'messages',chatId:'g-b'});n.api.setView({kind:'home',layer:'launcher'});n.api.loadEngineView('deep-research');assert.equal(n.api.getMessagesView().employee,'a');n.client('two');n.api.loadEngineView('deep-research');assert.equal(n.api.getMessagesView().employee,undefined)})
await check('Returning home clears displayed IDs and changes only navigation persistence',()=>{const n=navigation();n.api.loadEngineView('deep-research');n.api.setView({kind:'messages',employee:'a',shared:true});const rev=n.api.getView().revision;n.api.setView({kind:'home',layer:'launcher'});const v=n.api.getView();assert.equal(v.layer,'launcher');assert.equal(v.engineId,undefined);assert.equal(v.employee,undefined);assert.equal(v.shared,false);assert.ok(v.revision>rev);assert.ok([...n.saved.keys()].every(file=>file.endsWith('message-navigation.json')))})

const apiText=source('Infra/src/renderer/src/api.ts')
function renderer(){
 const listeners=new Set(),calls=[];let implementation=async()=>({ok:true})
 const transport={mode:'web',onEvent:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},call:async(...args)=>{calls.push(args);return implementation(...args)}}
 const mod=evaluate(apiText,{'./web/transport':{createWebApi:()=>transport},'../../shared/presentation-events':stamps},{window:{agents:transport}})
 return {mod,calls,emit:event=>{for(const fn of listeners)fn(event)},response:fn=>implementation=fn}
}
const event=(engineScope,viewRevision,payload={employeeId:'a'})=>({channel:'management:activity',payload,presentation:{engineScope,viewRevision}})
await check('Delayed Engine A presentation events are discarded after loading B',()=>{const r=renderer(),seen=[];r.mod.selectEngineScope('deep-research',10);r.mod.api.onEvent(e=>seen.push(e));r.mod.selectEngineScope('PPT-maker',11);r.emit(event('deep-research',10));assert.equal(seen.length,0);r.emit(event('PPT-maker',11));assert.equal(seen.length,1)})
await check('A→home→A also discards events from the first visit to A',()=>{const r=renderer(),seen=[];r.mod.selectEngineScope('deep-research',10);r.mod.api.onEvent(e=>seen.push(e));r.mod.selectEngineScope(null,11);r.mod.selectEngineScope('deep-research',12);r.emit(event('deep-research',10));assert.equal(seen.length,0);r.emit(event('deep-research',12));assert.equal(seen.length,1)})
await check('Launcher does not consume already queued business events',()=>{const r=renderer(),seen=[];r.mod.selectEngineScope('deep-research',10);r.mod.api.onEvent(e=>seen.push(e));r.mod.selectEngineScope(null,11);r.emit(event('deep-research',10));assert.equal(seen.length,0)})
await check('Navigation/authentication/visibility still reach the application',()=>{const r=renderer(),seen=[];r.mod.selectEngineScope(null,3);const off=r.mod.api.onEvent(e=>seen.push(e));for(const channel of ['view:changed','client:authentication','desktop:visibility'])r.emit({channel,payload:{}});assert.equal(seen.length,3);off();r.emit({channel:'view:changed',payload:{}});assert.equal(seen.length,3)})
await check('Ordinary navigation within an Engine does not invalidate its current event stream',()=>{const r=renderer(),seen=[];r.mod.selectEngineScope('deep-research',4);r.mod.api.onEvent(e=>seen.push(e));r.mod.selectEngineScope('deep-research',5);r.emit(event('deep-research',4));assert.equal(seen.length,1)})
await check('A pending HTTP read keeps its original scope and does not populate the new Engine',async()=>{const r=renderer();let release;r.response(()=>new Promise(resolve=>release=resolve));r.mod.selectEngineScope('deep-research',2);const pending=r.mod.api.call('session.list');r.mod.selectEngineScope('PPT-maker',3);release({sessions:[{id:'a'}]});await assert.rejects(pending,e=>e.code==='ENGINE_SCOPE_STALE');assert.equal(r.calls.length,1);assert.equal(r.calls[0][2].engineScope,'deep-research')})
await check('A late successful mutation is not replayed automatically',async()=>{const r=renderer();let release,commits=0;r.response(()=>{commits++;return new Promise(resolve=>release=resolve)});r.mod.selectEngineScope('deep-research',2);const pending=r.mod.api.call('session.send',{employee:'a',clientMessageId:'stable-request'});r.mod.selectEngineScope('PPT-maker',3);release({sent:true});await assert.rejects(pending,e=>e.code==='ENGINE_SCOPE_STALE');assert.equal(commits,1);assert.equal(r.calls.length,1)})
await check('Malformed event stamps cannot enter a scoped view',()=>{assert.ok(stamps,'Presentation stamp module must exist');for(const stamp of [null,{engineScope:'deep-research',viewRevision:-1},{engineScope:'deep-research',viewRevision:'10'},{engineScope:'deep-research',viewRevision:Infinity}])assert.equal(stamps.acceptsPresentationEvent({channel:'session:message',payload:{},presentation:stamp},'deep-research',1),false)})

const fullServer=source('Infra/src/main/server.ts')
const eventSource=cut(fullServer,'export function presentationEvent(','/** Fan an event out to CLI clients.')
function producer(){
 const als=new AsyncLocalStorage(),states={one:{engineId:'deep-research',revision:10},two:{engineId:'PPT-maker',revision:20},home:{revision:30}}
 const getView=()=>states[als.getStore().clientId]
 const api=evaluate(eventSource,{}, {withCaller:(c,fn)=>als.run(c,fn),requestContext:()=>als.getStore(),getView,stampPresentationEvent:stamps?.stampPresentationEvent,engineSelection:()=>({resources:{employees:als.getStore().engineScope==='deep-research'?['a']:['b'],groups:als.getStore().engineScope==='deep-research'?['ga']:['gb'],channels:[]}}),listTerminals:()=>[{id:'ta',employee:'a'},{id:'tb',employee:'b'}],projectEngineResult:(_cmd,_a,p)=>p,sessionInfo:id=>({cardId:id}),scopeConversation:()=>false,scopeSchedule:()=>false})
 return {api,states}
}
await check('Core stamps the receiving window without changing the internal raw event',()=>{const p=producer(),raw={cardId:'a',message:'visible only in A'},before=JSON.stringify(raw);const v=p.api.presentationEvent('session:message',raw,'one');assert.deepEqual(plain(v.presentation),{engineScope:'deep-research',viewRevision:10});assert.equal(JSON.stringify(raw),before);assert.equal(p.api.presentationEvent('session:message',raw,'two'),null)})
await check('Terminal output and metadata never expose another Engine’s workspace',()=>{const p=producer();for(const [channel,payload] of [['terminal:data',{id:'ta'}],['terminal:changed',{id:'ta',employee:'a',cwd:'/private/alpha'}]]){assert.ok(p.api.presentationEvent(channel,payload,'one'));assert.equal(p.api.presentationEvent(channel,payload,'two'),null)}assert.equal(p.api.presentationEvent('terminal:data',{id:'missing'},'one'),null)})
await check('Group invalidations carry only IDs belonging to the receiving Engine',()=>{const p=producer();assert.ok(p.api.presentationEvent('chat:changed',{id:'ga',messageId:'ma'},'one'));assert.equal(p.api.presentationEvent('chat:changed',{id:'ga',messageId:'ma'},'two'),null)})
await check('Core suppresses business events while the receiving window is at home',()=>{const p=producer();assert.equal(p.api.presentationEvent('session:message',{cardId:'a'},'home'),null);const v=p.api.presentationEvent('engine-scope:changed',{revision:4},'home');assert.deepEqual(plain(v.presentation),{engineScope:null,viewRevision:30})})
await check('A real producer→receiver delayed event cannot cross the A/B view boundary',()=>{const p=producer(),r=renderer(),seen=[];r.mod.selectEngineScope('deep-research',10);r.mod.api.onEvent(e=>seen.push(e));const waiting=p.api.presentationEvent('session:message',{cardId:'a',text:'A private event'},'one');r.mod.selectEngineScope('PPT-maker',11);r.emit(waiting);assert.equal(seen.length,0)})
await check('Desktop and Web wiring retain the stamp all the way to transport',()=>{
 assert.match(fullServer,/desktopEvent\(visible\.channel,visible\.payload,visible\.presentation\)/)
 assert.match(source('Infra/src/main/index.ts'),/startRuntime\(\(channel, payload, presentation\)/)
 assert.match(source('Infra/src/main/index.ts'),/send\('api:event',\{channel,payload,\.\.\.\(presentation\?\{presentation\}:\{\}\)\}\)/)
 assert.match(source('Infra/src/main/runtime.ts'),/presentation\?:PresentationStamp/)
 assert.match(source('Infra/src/main/web/server.ts'),/send\(\{type:'event',\.\.\.visible\}\)/)
 assert.match(source('Infra/src/renderer/src/App.tsx'),/selectEngineScope\(next\.layer==='launcher'\?null:next\.engineId\?\?null,next\.revision\)/)
})

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-scope-sdk-'))
try{
 const sdk=await import(pathToFileURL(path.join(root,'Contract/node-client.mjs')).href+'?scope-test='+Date.now())
 const cli=path.join(temp,'fixture-cli.cjs'),other=path.join(temp,'other-cli.cjs')
 fs.writeFileSync(cli,`let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>{const r=JSON.parse(input);console.log(JSON.stringify({ok:true,data:{contractVersion:'1.0.0',command:r.command,data:{engineScope:process.env.AEXUS_ENGINE_ID??null,launcher:'original'}}}))})`)
 fs.writeFileSync(other,`let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>{const r=JSON.parse(input);console.log(JSON.stringify({ok:true,data:{contractVersion:'1.0.0',command:r.command,data:{launcher:'changed'}}}))})`)
 await check('An existing Node client cannot silently inherit a later global Engine selection',async()=>{const env={...process.env};delete env.AEXUS_ENGINE_ID;const c=sdk.createNodeClient({cli,env});env.AEXUS_ENGINE_ID='PPT-maker';assert.equal((await c.invoke('group.list')).engineScope,null)})
 await check('Two independent Node clients retain their own Engine scopes',async()=>{const env={...process.env};delete env.AEXUS_ENGINE_ID;const a=sdk.createNodeClient({cli,env,engineId:'deep-research'}),b=sdk.createNodeClient({cli,env,engineId:'PPT-maker'});const [ra,rb]=await Promise.all([a.invoke('group.list'),b.invoke('group.list')]);assert.equal(ra.engineScope,'deep-research');assert.equal(rb.engineScope,'PPT-maker')})
 await check('Changing the caller-owned launcher array cannot retarget an existing client',async()=>{const launcher=[process.execPath,cli],env={...process.env};delete env.AEXUS_ENGINE_ID;const c=sdk.createNodeClient({launcher,env});launcher[1]=other;assert.equal((await c.invoke('group.list')).launcher,'original')})
}finally{fs.rmSync(temp,{recursive:true,force:true})}

const out=path.join(root,'.aexus/artifacts/engine-scope-closeout-unit',new Date().toISOString().replaceAll(':','-')+'-'+process.pid)
fs.mkdirSync(out,{recursive:true})
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:checks.every(c=>c.passed),scope:'Production-source unit contracts with deterministic store and transport stubs; not Mac/Core/UI end-to-end acceptance',checks,sourceHashes:hashes,productionDataUsed:false,modelCalls:0},null,2)+'\n')
console.log(`${checks.filter(c=>c.passed).length}/${checks.length} passed; ${out}`)
process.exitCode=checks.every(c=>c.passed)?0:1
