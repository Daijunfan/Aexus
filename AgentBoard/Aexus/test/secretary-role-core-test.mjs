import {desktopExecutable} from './fixtures/desktop-app.mjs'
// Real temporary Core, deterministic native initialization and actual plugin APIs; no real user/model state.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'

const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-secretary-role-')),out=path.join(root,'artifacts/secretary-role'),plugin=path.join(temp,'probe-plugin')
const application=process.env.AGENTS_COMPANY_TEST_APP,mode=application?(path.resolve(application).startsWith('/Applications/')?'installed':'candidate'):'source',lifecycle=path.join(temp,'bundle-lifecycle.jsonl')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');fs.mkdirSync(plugin)
const sshBin=fs.mkdtempSync(path.join(os.tmpdir(),'ac-secretary-role-ssh-'))
fs.writeFileSync(path.join(sshBin,'ssh'),`#!/usr/bin/env python3
import os,sys
if '-G' in sys.argv:
 print('hostname fixture');print('port 22');sys.exit(0)
if 'offline' in sys.argv:sys.exit(255)
os.execv('/bin/sh',['sh','-c',sys.argv[-1]])
`,{mode:0o755})
fs.writeFileSync(path.join(sshBin,'ssh-keyscan'),`#!/bin/sh
printf 'fixture ssh-ed25519 Zml4dHVyZS1rZXk=\\n'
`,{mode:0o755})
const remoteBase=path.join(temp,'remote');fs.mkdirSync(remoteBase)
const pluginId='secretary-probe',commands=[['identity','Read the actual host caller'],['create-chat','Create a chat through the existing host API'],['human-token','Attempt a protected human-only API']]
fs.writeFileSync(path.join(plugin,'agents-company.plugin.json'),JSON.stringify({schemaVersion:1,id:pluginId,name:'Secretary boundary probe',version:'1.0.0',scope:'application',runtime:'runtime.cjs',renderer:'index.html',cli:'cli.cjs',documentation:'API.md',schema:'schema.json'}))
fs.writeFileSync(path.join(plugin,'schema.json'),JSON.stringify({schemaVersion:1,pluginId,version:'1.0.0',commands:commands.map(([method,description])=>({method,description,agentAccess:'operator'}))}))
fs.writeFileSync(path.join(plugin,'API.md'),'---\nschema: agents-company.cli/v1\nplugin: '+pluginId+'\n---\n'+['Purpose','Workspace','Quick start','Commands','Files','Errors','Compatibility'].map(heading=>'## '+heading+'\n\nIsolated permission fixture.\n').join('\n'))
fs.writeFileSync(path.join(plugin,'index.html'),'<html><body>Isolated permission fixture</body></html>');fs.writeFileSync(path.join(plugin,'cli.cjs'),'process.exit(0)')
fs.writeFileSync(path.join(plugin,'runtime.cjs'),`exports.createPlugin=({requestHost})=>({request:async request=>{try{const cmd=request.method==='identity'?'auth.whoami':request.method==='create-chat'?'chat.create':'auth.agent-token';return {jsonrpc:'2.0',id:request.id,result:await requestHost({cmd,args:request.params||{}})}}catch(error){return {jsonrpc:'2.0',id:request.id,error:{code:-32000,message:error.message}}}}});`)
let f;const checks=[],report={passed:false,mode,checks,providerCalls:0,scope:application?'Actual supplied ASAR Core with isolated native fixtures and real plugin APIs':'Source-built temporary Core with isolated native fixtures and real plugin APIs'}
try{
 const entry=path.join(temp,'daemon.cjs'),overrides={AGENTS_COMPANY_PLUGIN_DIRS:plugin,PATH:sshBin+':'+process.env.PATH}
 if(application){
  const bundleRoot=application.endsWith('.app')?application:application.slice(0,application.indexOf('.app/')+4),executable=desktopExecutable(application)
  assert.ok(bundleRoot.endsWith('.app'),'AGENTS_COMPANY_TEST_APP must name a macOS app bundle or its executable');report.application=application;report.asarSha256=createHash('sha256').update(fs.readFileSync(path.join(bundleRoot,'Contents/Resources/app.asar'))).digest('hex');overrides.AGENTS_COMPANY_HIDDEN='1';overrides.AGENTS_COMPANY_BUILTIN_PLUGINS=path.join(bundleRoot,'Contents/Resources/plugins')
  fs.writeFileSync(entry,`const fs=require('node:fs'),{_electron:electron}=require('@playwright/test');
const env={...process.env};for(const key of ['ELECTRON_RUN_AS_NODE','AGENTS_COMPANY_WEB_URL','AGENTS_COMPANY_WEB','AGENTS_COMPANY_HEADLESS'])delete env[key];let closing=false;const record=value=>fs.appendFileSync(${JSON.stringify(lifecycle)},JSON.stringify(value)+'\\n');
const started=electron.launch({executablePath:${JSON.stringify(executable)},args:[],env}).then(async app=>{const hidden=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(window=>!window.isVisible()));record({event:'open',pid:app.process().pid,hidden});if(!hidden){await app.close();throw Error('Fixture bundle unexpectedly showed a window')}app.process().once('exit',()=>{if(!closing)process.exit(1)});return app});
const stop=()=>{if(closing)return;closing=true;void started.then(async app=>{const pid=app.process().pid;await app.close();record({event:'closed',pid});process.exit(0)},error=>{console.error(error.message);process.exit(1)})};process.on('message',message=>{if(message?.type==='agents-company:shutdown')stop()});process.once('SIGTERM',stop);process.once('SIGINT',stop);process.once('disconnect',stop);void started.catch(error=>{console.error(error.message);process.exit(1)});`)
 }else await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore(overrides,entry)
 const rpc=async(cmd,args={},auth=null)=>{const response=await f.request(auth,cmd,args);assert.ok(response.ok,response.error);return response.data},deny=async(auth,cmd,args={})=>{const response=await f.request(auth,cmd,args);assert.equal(response.ok,false,cmd+' must remain forbidden');return response.error}
 for(const name of ['A','B','Disposable'])await rpc('group.add',{name})
 const secretary=await f.create('Application helper','A','secretary'),worker=await f.create('Worker','A'),manager=await f.create('Manager','A','manager'),governor=await f.create('Governor','B','governor'),named=await f.create('Secretary','B','governor'),other=await f.create('Other worker','B')
 const token=await f.token(secretary.id),workerToken=await f.token(worker.id),managerToken=await f.token(manager.id),governorToken=await f.token(governor.id),namedToken=await f.token(named.id)
 const roles=await rpc('management.roles'),policy=roles.find(role=>role.value==='secretary'),who=await rpc('auth.whoami',{},token),read=JSON.parse(fs.readFileSync(path.join(f.control,secretary.id+'-read.json'),'utf8'))
 assert.deepEqual(roles.map(role=>role.value),['employee','manager','governor','secretary']);assert.equal(policy.appAdministrator,true);assert.equal(policy.requiresLocal,true);assert.equal(policy.userManaged,false)
 assert.equal(who.principal.kind,'agent');assert.equal(who.principal.employeeId,secretary.id);assert.equal(who.managementRole,'secretary');assert.equal(who.appAdministrator,true);assert.equal(who.roleDescription,policy.description);assert.match(who.roleDescription,/软件|插件/);assert.match(who.roleDescription,/其他员工|委派/)
 assert.deepEqual(read.operations,['identity','index']);assert.deepEqual(read.identity,who);assert.equal((await rpc('session.transcript',{employee:secretary.id})).items.length,0)
 const trace=(card,stage)=>JSON.parse(fs.readFileSync(path.join(f.control,card.id+'-'+stage+'.json'),'utf8'))
 for(const card of [worker,manager,governor]){assert.equal(trace(secretary,'thread-start').developerInstructions,trace(card,'thread-start').developerInstructions,'all four roles retain one byte-identical router');assert.equal(trace(secretary,'initializing').text,trace(card,'initializing').text,'role identity must not expand the common initialization prompt')}
 assert.equal((await rpc('auth.whoami',{},namedToken)).managementRole,'governor');assert.equal((await rpc('auth.whoami',{},namedToken)).appAdministrator,false)
 const identity=async()=> (await rpc('session.list')).sessions.map(card=>({id:card.id,role:card.managementRole,title:card.title,cwd:card.cwd,engine:card.engine,threadId:card.threadId})).sort((a,b)=>a.id.localeCompare(b.id))
 const initial=await identity()
 for(const [auth,actor] of [[workerToken,worker],[managerToken,manager],[governorToken,governor]]){
  await deny(auth,'card.create',{title:'Not a secretary',group:'A',engine:'codex',managementRole:'secretary'})
  await deny(auth,'session.new',{title:'Not a secretary session',group:'A',engine:'codex',managementRole:'secretary'})
  await deny(auth,'card.management-role',{id:actor.id,role:'secretary'})
  await deny(auth,'card.update',{id:actor.id,patch:{managementRole:'secretary'}})
  await deny(auth,'card.clone',{id:actor.id,title:'No cloned promotion',managementRole:'secretary'})
  await deny(auth,'card.remove',{ids:[secretary.id]});await deny(auth,'session.send',{employee:secretary.id,text:'No upward delegation'})
  const ownGroup=await rpc('chat.create',{name:'Self-owned '+actor.id,members:[actor.id]},auth);assert.equal(ownGroup.ownerId,actor.id);await rpc('chat.delete',{id:ownGroup.id},auth);await deny(auth,'channel.create',{name:'Forbidden channel'})
 }
 for(const [cmd,args] of [['card.management-role',{id:secretary.id,role:'employee'}],['card.remove',{ids:[secretary.id]}],['group.remove',{name:'A'}]])await deny(token,cmd,args)
 await deny(governorToken,'card.create',{title:'Peer Governor',group:'B',managementRole:'governor'});await deny(governorToken,'card.management-role',{id:named.id,role:'employee'});await deny(governorToken,'card.remove',{ids:[named.id]});await deny(managerToken,'card.remove',{ids:[other.id]})
 assert.deepEqual(await identity(),initial)
 checks.push('Real Secretary identity/initialization declares software administration; names confer no role; lower roles cannot grant Secretary; Secretary lifecycle preserves a ready administrator, and prior Governor/Manager boundaries remain')

 const child=await rpc('card.create',{title:'Managed Governor',group:'Disposable',engine:'codex',model:'gpt-6-luna',managementRole:'governor'},token);await f.ready(child.id);assert.deepEqual(child.createdBy,{kind:'agent',employeeId:secretary.id})
 await rpc('card.management-role',{id:child.id,role:'manager'},token);assert.equal((await rpc('session.list')).sessions.find(card=>card.id===child.id).managementRole,'manager')
 await rpc('card.management-role',{id:child.id,role:'governor'},token);await rpc('card.remove',{ids:[child.id]},token);assert.ok(fs.existsSync(child.cwd));await rpc('group.remove',{name:'Disposable'},token)
 const view=await rpc('team-view.create',{name:'Only B',teams:['B']},token);await rpc('team-view.select',{id:view.id},token)
 assert.deepEqual((await rpc('management.topology',{},token)).teams.map(team=>team.name).sort(),['A','B'])
 await rpc('session.send',{employee:secretary.id,text:'A bounded application administration request.'});await f.until(async()=>!(await f.status(secretary.id)).busy,'Secretary administration turn')
 const nativeWork=()=>JSON.parse(fs.readFileSync(path.join(f.control,secretary.id+'-work.json'),'utf8')).text,roleHeader=()=>JSON.parse(nativeWork().split('[Agents Company role]\n')[1].split('\n')[0])
 assert.equal((await f.status(secretary.id)).currentTask.viewId,undefined);assert.ok(!nativeWork().includes('[Agents Company task view]'));assert.deepEqual(roleHeader(),{employeeId:secretary.id,managementRole:'secretary',responsibility:who.roleDescription})
 const scheduled=await rpc('schedule.create',{spec:{name:'Application housekeeping',action:{type:'agent',employeeId:secretary.id,prompt:'Inspect application configuration only.'},afterSeconds:3600,enabled:false}},token);assert.equal(scheduled.action.viewId,undefined);await rpc('schedule.delete',{id:scheduled.id},token)
 checks.push('Secretary genuinely appoints, demotes and removes Governors; company filters do not constrain authority and no Governor task-view field is imposed')

 await rpc('settings.set',{pageZoom:1.1},token);assert.equal((await rpc('settings.get',{},token)).pageZoom,1.1)
 await rpc('settings.set',{pageZoom:1},governorToken);assert.equal((await rpc('settings.get')).pageZoom,1,'existing Governor settings ability is retained')
 const nonmemberGroup=await rpc('chat.create',{name:'Managed as a nonmember',members:[worker.id],ownerId:worker.id},token);assert.equal(nonmemberGroup.ownerId,worker.id);await rpc('chat.delete',{id:nonmemberGroup.id},token)
 const group=await rpc('chat.create',{name:'Secretary managed group',members:[worker.id,other.id],ownerId:worker.id})
 await rpc('chat.update',{id:group.id,name:'Application administration without membership'},token);assert.equal((await rpc('conversation.policy',{conversation:'group:'+group.id},token)).actorRole,'secretary')
 await rpc('chat.update',{id:group.id,members:[secretary.id,worker.id,other.id]});const groupPolicy=await rpc('conversation.policy',{conversation:'group:'+group.id});await rpc('conversation.role',{conversation:'group:'+group.id,employee:secretary.id,role:'admin',expectedRevision:groupPolicy.revision})
 await rpc('chat.update',{id:group.id,name:'Managed members'},token);await rpc('chat.mute',{id:group.id,member:other.id,muted:true},token)
 assert.deepEqual((await rpc('chat.get',{id:group.id},token)).memberIds,[secretary.id,worker.id,other.id]);assert.equal((await rpc('chat.get',{id:group.id},token)).mutes[other.id],null)
 const note=await rpc('chat.post',{id:group.id,text:'Operator context only.',kind:'message',clientMessageId:'operator-context'})
 await deny(token,'chat.post',{id:group.id,replyTo:note.id,text:null})
 await rpc('chat.update',{id:group.id,members:[secretary.id,worker.id,other.id]},token)
 const publicReply=await rpc('chat.post',{id:group.id,replyTo:note.id,text:'Explicit member reply.',clientMessageId:'secretary-reply'},token);assert.deepEqual(publicReply.author,{kind:'agent',employeeId:secretary.id})
 const channel=await rpc('channel.create',{name:'Managed news',engine:{kind:'external',location:'local',name:'Fixture publisher'}},token),destination=await rpc('channel.create',{name:'Moved author',engine:{kind:'external',location:'local',name:'Fixture publisher'}},token)
 const x=await rpc('channel.source-add',{plugin:'x',locator:'https://x.com/SecretaryTest',channelId:channel.id},token),youtube=await rpc('channel.source-add',{plugin:'youtube',locator:'@SecretaryFixture',channelId:channel.id},token)
 await rpc('channel.source-remove',{id:x.id},token);assert.equal((await rpc('channel.sources',{includeDisabled:true},token)).find(source=>source.id===x.id).enabled,false)
 await rpc('channel.source-update',{id:x.id,patch:{enabled:true,channelId:destination.id}},token);assert.equal((await rpc('channel.sources',{includeDisabled:true},token)).find(source=>source.id===x.id).channelId,destination.id);assert.equal((await rpc('channel.sources',{},token)).find(source=>source.id===youtube.id).plugin,'youtube')
 await rpc('channel.update',{id:channel.id,adminIds:[worker.id,other.id]},token);assert.equal((await rpc('conversation.policy',{conversation:'channel:'+channel.id},token)).actorRole,'secretary')
 await rpc('channel.update',{id:channel.id,adminIds:[secretary.id,worker.id,other.id]})
 const request=await rpc('channel.message-send',{id:channel.id,text:'A real administrator coordination request.',mentions:[worker.id],clientMessageId:'secretary-admin-request'},token)
 assert.deepEqual(request.author,{kind:'agent',employeeId:secretary.id});assert.equal(request.requestId,request.id);assert.deepEqual(request.deliveries.map(value=>[value.employeeId,value.mode]),[[worker.id,'work'],[other.id,'awareness']])
 const reply=await rpc('channel.message-post',{id:channel.id,replyTo:request.id,text:'Reply to the actual Secretary root.',clientMessageId:'worker-root-reply'},workerToken);assert.equal(reply.requestId,request.id);assert.deepEqual(reply.author,{kind:'agent',employeeId:worker.id})
 await deny(workerToken,'channel.message-send',{id:channel.id,text:'Employees cannot create management requests'});await deny(token,'channel.message-post',{id:channel.id,replyTo:request.id,text:'Forged root',requestId:'forged'})
 await f.until(async()=>{const info=await rpc('channel.context',{id:channel.id,entryId:reply.id},token);return info.deliveries.every(value=>value.status==='completed')},'Secretary silent awareness')
 await rpc('channel.update',{id:channel.id,adminIds:[worker.id,other.id]},token)
 await rpc('channel.context',{id:channel.id,entryId:reply.id},token);await deny(token,'channel.message-post',{id:channel.id,replyTo:reply.id,text:null})
 await rpc('messenger.conversation',{conversations:['employee:'+worker.id],patch:{archived:true}},token);assert.equal((await rpc('messenger.state',{},token)).conversations['employee:'+worker.id].archived,true)
 checks.push('Secretary manages group/channel offices without requiring its own membership; X/YouTube deployment, settings and personal organization keep original application permissions; administrative publication and history retain actual Agent authorship')

 const cloudHost=await rpc('host.create',{name:'Fixture cloud',host:'fixture',os:'linux',defaultDirectory:remoteBase});await rpc('group.add',{name:'Cloud',mode:'cloud',hostId:cloudHost.id})
 const localRoot=path.join(f.env.AGENTS_COMPANY_PROJECTS,'cloud')
 const cloudSecretary=await rpc('card.create',{title:'Core local secretary',group:'Cloud',managementRole:'secretary',workEnvironment:'local',engine:'codex'});await f.ready(cloudSecretary.id)
 assert.equal(cloudSecretary.managementRole,'secretary');assert.equal(cloudSecretary.kind,'worker');assert.equal(cloudSecretary.workEnvironment,'local');assert.equal(cloudSecretary.localWorkspaceRoot,localRoot);assert.equal(cloudSecretary.cwd,path.join(localRoot,'core-local-secretary'));assert.ok(fs.existsSync(cloudSecretary.cwd),'Core-local Secretary folder is a name-derived local directory')
 assert.equal(cloudSecretary.permissionMode,'bypassPermissions','a fresh Secretary inherits the Full access default')
 const restricted=await rpc('card.create',{title:'Restricted',group:'Cloud',workEnvironment:'local',engine:'codex',permissionMode:'acceptEdits'});await f.ready(restricted.id)
 assert.equal(restricted.permissionMode,'acceptEdits','an explicit restricted permission persists instead of the default')
 assert.match(await deny(null,'card.create',{title:'Team workspace secretary',group:'Cloud',managementRole:'secretary',engine:'codex'}),/Secretary 必须在 Core 所在主机本地运行/)
 assert.match(await deny(null,'card.create',{title:'Team workspace secretary',group:'Cloud',managementRole:'secretary',workEnvironment:'team',engine:'codex'}),/Secretary 必须在 Core 所在主机本地运行/)
 assert.match(await deny(null,'card.create',{title:'Cloud native secretary',group:'Cloud',managementRole:'secretary',kind:'cloud-native-worker',workEnvironment:'team',engine:'codex'}),/Secretary 必须在 Core 所在主机本地运行/)
 checks.push('Cloud Team accepts a Secretary only with an explicit Core-local workspace (name-derived local folder, Full access default, restricted permission persists); Team-workspace and cloud-native Secretaries are rejected with the original policy')

 const pluginCall=(id,method,params={},auth=token)=>rpc('plugin.call',{id,method,params},auth)
 // mininotion, margin-reader and cloud-hosts are no longer shipped, so the plugin-specific
 // assertions that required them are SKIPPED (retained scope, see secretary-retained-report).
 // The retained probe plugin still exercises the real plugin host on both sides of the boundary.
 const direct=await pluginCall(pluginId,'identity');assert.deepEqual(direct.principal,{kind:'agent',employeeId:secretary.id})
 const through=await pluginCall(pluginId,'create-chat',{name:'Plugin administered chat',members:[secretary.id,worker.id]});assert.ok((await rpc('chat.list',{},token)).some(value=>value.id===through.id));assert.equal((await pluginCall(pluginId,'human-token',{id:secretary.id})).credentialReturned,false)
 const pluginView=await rpc('plugin.view',{id:pluginId},token),viewRpc=async(method,params={})=>{const response=await fetch(new URL('./rpc',pluginView.url),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:method,method,params})});return response.json()}
 assert.deepEqual((await viewRpc('identity')).result.principal,{kind:'agent',employeeId:secretary.id});assert.equal((await viewRpc('human-token',{id:secretary.id})).result.credentialReturned,false)
 for(const [cmd,args] of [['session.acknowledge',{employee:worker.id,replyId:'not-human-read'}],['chat.acknowledge',{id:group.id,messageId:note.id}],['ui.click',{selector:'body'}],['ui.type',{selector:'body',text:'No simulation'}]])await deny(token,cmd,args)
 checks.push('The retained probe plugin is usable in authorized global scopes; direct and view-HTTP plugin host calls retain the Secretary principal and can provision employee credentials without plaintext and cannot fabricate user reads/UI actions; removed mininotion/margin-reader/cloud-hosts calls are skipped')

 await rpc('card.management-role',{id:secretary.id,role:'governor'})
 assert.equal((await rpc('auth.whoami',{},token)).appAdministrator,false);await rpc('chat.update',{id:through.id,name:'Owned group after Company downgrade'},token);await deny(token,'channel.sources',{})
 assert.equal((await viewRpc('identity')).result.managementRole,'governor');assert.ok((await viewRpc('create-chat',{name:'No stale Secretary grant',members:[worker.id]})).error);assert.ok(await pluginCall(pluginId,'identity'))
 await rpc('session.send',{employee:secretary.id,text:'Check the current explicit role after a user-approved downgrade.'});await f.until(async()=>!(await f.status(secretary.id)).busy,'downgraded native turn');assert.deepEqual(roleHeader(),{employeeId:secretary.id,managementRole:'governor'})
 await rpc('card.management-role',{id:secretary.id,role:'secretary'});assert.equal((await rpc('auth.whoami',{},token)).appAdministrator,true)
 await rpc('session.send',{employee:secretary.id,text:'Check the restored application administrator identity.'});await f.until(async()=>!(await f.status(secretary.id)).busy,'restored Secretary native turn');assert.deepEqual(roleHeader(),{employeeId:secretary.id,managementRole:'secretary',responsibility:who.roleDescription})
 await rpc('auth.revoke',{id:secretary.id});assert.ok((await viewRpc('identity')).error);await rpc('plugin.close',{id:pluginView.id})
 const renewed=await f.token(secretary.id);assert.equal((await rpc('auth.whoami',{},renewed)).managementRole,'secretary')
 await f.until(async()=>(await rpc('session.status')).every(card=>!card.busy),'all temporary native work idle')
 const retained=await identity();await f.stop();await f.start();assert.deepEqual(await identity(),retained);assert.equal((await rpc('auth.whoami',{},namedToken)).managementRole,'governor');assert.equal((await rpc('auth.whoami',{},namedToken)).appAdministrator,false);assert.equal((await rpc('auth.whoami',{},renewed)).appAdministrator,true)
 assert.equal((await rpc('session.list',{live:true})).length,0);assert.deepEqual(await rpc('terminal.list'),[])
 checks.push('Downgrade/revocation immediately affect existing plugin views without removing lawful Governor plugin access; restart preserves explicit roles and never promotes a Governor named Secretary')
 report.passed=true;report.secretaryId=secretary.id;console.log('PASS '+checks.join('; '))
}catch(error){report.error=error.message;throw error}
finally{await f?.close();if(application&&fs.existsSync(lifecycle)){report.bundleLifecycle=fs.readFileSync(lifecycle,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);const opened=report.bundleLifecycle.filter(value=>value.event==='open');report.allTestAppsClosed=opened.length===2&&opened.every(value=>value.hidden&&report.bundleLifecycle.some(closed=>closed.event==='closed'&&closed.pid===value.pid));if(!report.allTestAppsClosed)report.passed=false}fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,mode==='source'?'core-verification.json':mode+'-core-verification.json'),JSON.stringify(report,null,2));fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});fs.rmSync(sshBin,{recursive:true,force:true});if(application)assert.ok(report.allTestAppsClosed,'Both hidden test application processes must exit')}
