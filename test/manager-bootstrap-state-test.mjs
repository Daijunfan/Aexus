// One fixed router and shared public docs for all roles; real Core/CLI authority and plugin persistence stay separate.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-router-matrix-')),entry=path.join(temp,'daemon.cjs'),out=path.join(root,'artifacts/employee-router')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');let f
try{
 await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({AGENTS_COMPANY_PLUGIN_DIRS:''},entry)
 const rpc=async(cmd,args={},auth=null)=>{const response=await f.request(auth,cmd,args);assert.ok(response.ok,response.error);return response.data},deny=async(auth,cmd,args)=>{const response=await f.request(auth,cmd,args);assert.equal(response.ok,false,cmd+' must remain forbidden');return response},trace=(card,suffix)=>JSON.parse(fs.readFileSync(path.join(f.control,card.id+'-'+suffix+'.json'),'utf8'))
 await f.cli('group','add','Routing Build');await f.cli('group','add','Routing Notes','--mode','work','--plugin','mininotion')
 const cards=[]
 for(const team of ['Routing Build','Routing Notes'])for(const role of ['employee','manager','governor']){const card=await f.cli('card','create','--title',role+' '+team,'--group',team,'--management-role',role,'--profession','Reference verifier','--engine','codex','--model','gpt-6-luna','--effort','low');await f.ready(card.id);cards.push(card)}
 const by=(role,team='Routing Build')=>cards.find(card=>card.managementRole===role&&card.group===team),worker=by('employee'),manager=by('manager'),governor=by('governor'),writer=by('employee','Routing Notes'),tokens=new Map(await Promise.all(cards.map(async card=>[card.id,await f.token(card.id)])))
 const index=await rpc('api.docs'),plugins=await rpc('plugin.list'),documents=['core/api','core/permissions','core/plan','core/scheduler','core/architecture',...plugins.flatMap(plugin=>['plugin/'+plugin.id+'/api','plugin/'+plugin.id+'/schema'])],reference=new Map()
 assert.equal(index.document,'index');assert.equal(index.catalogRoot,path.join(f.env.AGENTS_COMPANY_HOME,'api-docs'));assert.match(index.markdown,/Plan 是 Core 视图，不是 MiniNotion 插件/);assert.ok(index.markdown.length<16000)
 for(const document of documents)reference.set(document,await rpc('api.docs',{document}))
 const router=trace(cards[0],'thread-start').developerInstructions,initial=trace(cards[0],'initializing').text
 assert.ok(router.length>0&&router.length<1500);assert.ok(initial.length<2200)
 const evidence=[]
 for(const card of cards){
  const auth=tokens.get(card.id),read=trace(card,'read'),who=await f.call(auth,'auth','whoami')
  assert.equal(trace(card,'thread-start').developerInstructions,router,'the native router is byte-identical across roles and modes');assert.equal(trace(card,'initializing').text,initial);assert.deepEqual(trace(card,'initializing').environments,[]);assert.equal(trace(card,'initializing').documentationTools,true);assert.equal(trace(card,'initializing').readingTools,false)
  assert.ok(!router.includes(card.id)&&!initial.includes(card.id));assert.deepEqual(read.operations,['identity','index']);assert.ok(read.bytes.every(bytes=>bytes>0));assert.equal(read.index.document,'index');assert.deepEqual(read.identity,who);assert.equal(who.principal.employeeId,card.id);assert.equal(who.managementRole,card.managementRole);assert.equal(who.employee.cwd,card.cwd);assert.equal(who.employee.role,card.role);assert.equal(who.employee.role,'Reference verifier');assert.equal(who.employee.model,card.model);assert.equal(who.team,card.group)
  assert.equal(who.teamMode,card.group==='Routing Notes'?'work':'build');if(who.teamMode==='work')assert.equal(who.pluginId,'mininotion')
  assert.equal(fs.existsSync(path.join(card.cwd,'.agents-company')),false,'bootstrap does not create workspace copies or launchers');assert.deepEqual((await rpc('session.transcript',{employee:card.id})).items,[])
  const all=await f.call(auth,'api','list','--all');assert.deepEqual(all,await rpc('api.list',{all:true}));for(const command of ['card.create','card.remove','auth.agent-token','schedule.create','plan.query','plugin.call'])assert.equal((await f.call(auth,'api','describe',command,'--all')).name,command)
  assert.equal((await f.call(auth,'api','describe','schedule.create','--all')).inputSchema.type,'object')
  for(const document of documents){const copy=await f.call(auth,'api','docs',document);assert.deepEqual(copy,reference.get(document));assert.ok(!copy.path.startsWith(card.cwd+path.sep))}
  for(const plugin of plugins){const described=await f.call(auth,'plugin','describe',plugin.id);assert.equal(described.id,plugin.id);assert.ok(described.documentation.length>0);assert.ok(described.api.commands.length>0)}
  await deny(auth,'api.docs',{document:'../control.token'});evidence.push({role:card.managementRole,mode:who.teamMode,documents:documents.length,initialReads:read.operations})
 }
 assert.ok(!(await f.call(tokens.get(worker.id),'api','list')).some(command=>command.name==='card.create'),'default discovery keeps its existing authorization filter');await deny(tokens.get(worker.id),'api.describe',{command:'card.create'})
 const readInput=path.join(f.control,worker.id+'.work-document.json');fs.writeFileSync(readInput,JSON.stringify({operation:'document',document:'core/plan'}));await rpc('session.send',{employee:worker.id,text:'Read the Plan API needed for this task.'});await f.until(async()=>!(await f.status(worker.id)).busy,'ready employee reads detailed native documentation');assert.deepEqual(trace(worker,'work-document').document,reference.get('core/plan'));fs.rmSync(readInput);
 console.log('PASS six role/mode native routers and initialization prompts are byte-identical; actual identity/index read, full Core/plugin catalog and single-command schemas are visible without workspace copies')
 // Reading the full command catalog never changes execution authority.
 for(const target of [manager,governor,by('manager','Routing Notes'),writer])await deny(tokens.get(worker.id),'card.remove',{id:target.id})
 await deny(tokens.get(worker.id),'card.create',{title:'No implicit promotion',group:worker.group});await deny(tokens.get(worker.id),'auth.agent-token',{id:governor.id})
 for(const target of [governor,by('manager','Routing Notes'),writer])await deny(tokens.get(manager.id),'card.remove',{id:target.id})
 const peer=await f.create('Manager peer','Routing Build','manager');await deny(tokens.get(manager.id),'card.remove',{id:peer.id});await deny(tokens.get(governor.id),'card.remove',{id:by('governor','Routing Notes').id});await deny(tokens.get(governor.id),'card.create',{title:'Forbidden Governor',group:'Routing Build',managementRole:'governor'})
 const child=await f.call(tokens.get(manager.id),'card','create','--title','A genuinely managed employee','--model','gpt-6-luna','--effort','low');await f.ready(child.id);assert.equal(child.createdBy.employeeId,manager.id);assert.equal(trace(child,'read').identity.principal.employeeId,child.id);assert.equal(trace(child,'initializing').text,initial)
 await f.call(tokens.get(manager.id),'card','remove',child.id);assert.ok(fs.existsSync(child.cwd),'permitted record deletion preserves workspace files')
 const globalChild=await f.call(tokens.get(governor.id),'card','create','--title','Cross-team Manager','--group','Routing Notes','--management-role','manager','--model','gpt-6-luna','--effort','low');await f.ready(globalChild.id);await f.call(tokens.get(governor.id),'card','remove',globalChild.id)
 await deny(tokens.get(worker.id),'plugin.call',{id:'mininotion',employee:worker.id,method:'status',params:{}});await deny(tokens.get(writer.id),'plugin.call',{id:'cloud-hosts',employee:writer.id,method:'hosts.list',params:{}});await deny(tokens.get(writer.id),'plugin.call',{id:'mininotion',team:'Routing Notes',method:'page.list',params:{}})
 console.log('PASS complete documentation grants no new authority: employee/peer/Governor/cross-team removal and unbound plugin calls remain denied; existing Manager/Governor allowed operations still succeed')
 // Identity is not a directory marker; renames and role changes do not rewrite the router.
 fs.writeFileSync(path.join(manager.cwd,'AGENTS.md'),'USER_INSTRUCTIONS_PRESERVED\n')
 const shared=await f.cli('card','create','--title','Shared directory employee','--group','Routing Build','--directory-mode','bind','--cwd',manager.cwd,'--model','gpt-6-luna','--effort','low');await f.ready(shared.id);assert.equal(trace(shared,'thread-start').developerInstructions,router);assert.equal(trace(shared,'read').identity.principal.employeeId,shared.id);await deny(await f.token(shared.id),'card.remove',{id:manager.id})
 for(const role of ['manager','governor','employee']){await f.cli('card','management-role',worker.id,role);assert.equal((await f.call(tokens.get(worker.id),'auth','whoami')).managementRole,role);assert.equal((await rpc('workspace.docs',{employee:worker.id})).instructions,router)}
 await rpc('workspace.docs',{employee:manager.id});assert.equal(fs.readFileSync(path.join(manager.cwd,'AGENTS.md'),'utf8'),'USER_INSTRUCTIONS_PRESERVED\n');assert.equal(fs.existsSync(path.join(manager.cwd,'.agents-company')),false)
 // Company, Messages and Plan are presentation scopes; scheduler records and plugin documents remain separate.
 const author=tokens.get(writer.id),plugin=(method,params={})=>rpc('plugin.call',{id:'mininotion',employee:writer.id,method,params},author),tasks=[]
 for(const view of ['company','messages','plan']){
  await f.cli('view','select',view)
  const pagesBefore=await plugin('page.list'),job=await rpc('schedule.create',{spec:{name:view+' review',action:{type:'agent',employeeId:'self',prompt:'A real scheduled self task'},afterSeconds:3600,enabled:false,plan:{priority:'normal',tags:['router-check'],notes:view}}},author)
  const changed=await rpc('schedule.update',{id:job.id,expectedRevision:job.revision,patch:{name:view+' edited review',plan:{priority:'high',tags:['router-check'],notes:'Edited through the canonical scheduler'}}},author)
  assert.equal((await rpc('schedule.get',{id:job.id},author)).name,changed.name);assert.ok((await rpc('plan.query',{},author)).rows.some(row=>row.id===job.id));assert.deepEqual(await plugin('page.list'),pagesBefore,'Plan task edits never create Notion records')
  const page=await plugin('page.create',{title:view+' real plugin note',color:'white'}),markdown='# '+view+' verified\n\nWritten through the real scoped plugin API.'
  await plugin('page.write-markdown',{pageId:page.id,markdown});await plugin('page.update',{pageId:page.id,title:view+' edited plugin note'});assert.ok((await plugin('page.read-markdown',{pageId:page.id})).markdown.includes('Written through the real scoped plugin API.'));assert.equal((await plugin('page.get',{pageId:page.id})).title,view+' edited plugin note')
  assert.equal((await rpc('schedule.get',{id:job.id},author)).name,changed.name,'Notion edits do not alter the Core Plan task');tasks.push(job.id)
 }
 for(const id of tasks){await deny(tokens.get(worker.id),'schedule.update',{id,patch:{name:'Foreign edit'}});await rpc('schedule.delete',{id},author)}
 const runtime=path.join(f.env.AGENTS_COMPANY_HOME,'agent-access',writer.id);assert.ok(fs.existsSync(path.join(runtime,'bin','mininotion')));assert.ok(fs.existsSync(path.join(f.env.AGENTS_COMPANY_HOME,'cli','bin','agents')));assert.equal(fs.existsSync(path.join(writer.cwd,'.agents-company')),false)
 console.log('PASS all three Core views create/edit/read the same authorized scheduler records and real Notion pages independently; runtime launchers remain outside working documents')
 const before=fs.statSync(index.path).mtimeMs;await rpc('api.docs');assert.equal(fs.statSync(index.path).mtimeMs,before);await f.stop();await f.start();assert.deepEqual(await f.call(tokens.get(manager.id),'api','docs'),index);assert.equal(fs.readFileSync(path.join(manager.cwd,'AGENTS.md'),'utf8'),'USER_INSTRUCTIONS_PRESERVED\n');assert.equal((await f.cli('session','list','--live')).length,0);assert.deepEqual(await rpc('terminal.list'),[])
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,evidence,routerBytes:Buffer.byteLength(router),initializationBytes:Buffer.byteLength(initial),checks:['actual native identity and index tools only at initialization','one identical router/init prompt for every role and Build/Work','shared complete public Core/plugin documentation and explicit all-command discovery','execution authority unchanged after reading privileged schemas','shared directories cannot share identity or permissions','no generated workspace documents/launchers; user instructions preserved','Company/Messages/Plan canonical task create-edit-read','separate real plugin page write/edit/read','runtime launchers and catalog idempotence/restart'],providerCalls:0},null,2))
 console.log('PASS unified router, shared catalog, role boundaries and cross-view API delivery')
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true})}
