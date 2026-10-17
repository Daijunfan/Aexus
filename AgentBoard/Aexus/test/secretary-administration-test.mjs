// Real dispatcher + disposable files/identity records. No native process or inference.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-admin-')),home=path.join(temp,'state'),previous=process.env.AGENTS_COMPANY_HOME
let core
try{
 process.env.AGENTS_COMPANY_HOME=home;fs.mkdirSync(home);fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
 const cards=[['secretary','secretary','codex'],['peer','secretary','codex'],['worker','employee','claude'],['governor','governor','codex'],['cline','employee','cline']].map(([id,role,engine])=>{const cwd=path.join(temp,id);fs.mkdirSync(cwd);return {id,title:id,engine,kind:'worker',group:'A',cwd,createdAt:1,managementRole:role,initialization:{status:'ready'},effort:engine==='cline'?undefined:'high',thinking:false}})
 fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify({sessions:cards,groups:['A'],teamRoots:{A:temp},rooms:{}}))
 const entry=path.join(temp,'core.cjs')
 await build({stdin:{contents:"export {handleRequest} from './src/main/server';export {authenticate,agentCredential} from './src/main/agent-access';export {operatorContext,withCaller} from './src/main/authorization';export {readStore} from './src/main/store';export {closeChannels} from './src/main/channels';export {assetIndex} from './src/main/asset-index';export {stopConversationNotices} from './src/main/conversation-notices'",resolveDir:root},outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 core=createRequire(import.meta.url)(entry)
 const secretary=core.authenticate(core.agentCredential('secretary').token),governor=core.authenticate(core.agentCredential('governor').token),worker=core.authenticate(core.agentCredential('worker').token)
 const call=(cmd,args={},actor=secretary)=>core.handleRequest({cmd,args},actor)
 const capabilities=await call('api.capabilities')
 for(const command of ['assets.tree','assets.file','workspace.reveal','channel.file-download','transfer.upload-begin','messenger.forward','messenger.media-open','chat.edit','auth.agent-token','auth.revoke','card.management-role','config.get','config.effort','settings.set'])assert.equal(capabilities.commands.find(item=>item.name===command)?.callable,true,command)
 assert.equal(capabilities.identity.principal.kind,'agent')
 const schedulerStatus=await call('schedule.status');assert.equal(typeof schedulerStatus.file,'string');assert.equal((await call('schedule.status',{},governor)).file,undefined)
 for(const cmd of ['session.acknowledge','chat.acknowledge','channel.acknowledge','ui.click'])assert.equal(capabilities.commands.find(item=>item.name===cmd)?.callable,false,cmd)
 for(const cmd of ['assets.tree','administration.audit'])await assert.rejects(call(cmd,{},governor),/user|Secretary|Forbidden/i)
 for(const id of ['secretary','peer','governor','worker']){assert.equal((await call('config.get',{id})).employeeId,id);await call('config.effort',{id,effort:'default'});assert.equal((await call('config.get',{id})).effort,'default')}
 await call('config.thinking',{id:'worker',enabled:true});assert.equal((await call('config.get',{id:'worker'})).thinking,true)
 await assert.rejects(call('config.thinking',{id:'worker',enabled:'off'}),/boolean/)
 await assert.rejects(call('config.thinking',{id:'secretary',enabled:true}),/does not support/)
 await assert.rejects(call('config.effort',{id:'cline',effort:'high'}),/does not support/)
 await assert.rejects(call('config.effort',{id:'worker',effort:'imaginary'}),/effort/)
 await assert.rejects(call('config.effort',{id:'secretary',effort:'default'},worker),/Forbidden/);await call('config.effort',{id:'worker',effort:'default'},worker);await assert.rejects(call('config.permission',{id:'worker',mode:'bypassPermissions'},worker),/Forbidden/)
 await call('settings.set',{defaultCodexEffort:'default',defaultClaudeEffort:'default',defaultOpenCodeEffort:'default',defaultClaudeThinking:true})
 assert.equal((await call('config.get',{id:'peer'})).effort,'default');assert.equal(core.readStore().sessions.find(card=>card.id==='peer').thinking,false)
 const created=await call('chat.create',{name:'Managed without membership',members:['worker'],ownerId:'worker'})
 const policy=await call('conversation.policy',{conversation:'group:'+created.id});assert.equal(policy.actorRole,'secretary');assert.ok(policy.allowedActions.includes('delete-group'))
 await call('chat.update',{id:created.id,name:'Admin renamed',expectedRevision:created.revision})
 const workspace=await call('conversation.workspace',{conversation:'group:'+created.id})
 await call('conversation.file',{conversation:workspace.conversation,operation:'mkdir',path:'admin-folder'})
 await call('conversation.file',{conversation:workspace.conversation,operation:'write',path:'admin-folder/report.txt',content:'admin fixture'})
 assert.equal(fs.readFileSync(path.join(workspace.root,'admin-folder/report.txt'),'utf8'),'admin fixture')
 const tree=await call('assets.tree');assert.ok(JSON.stringify(tree).includes('Admin renamed'))
 await assert.rejects(call('chat.get',{id:created.id},governor),/member/)
 const provisioned=await call('auth.agent-token',{id:'worker'});assert.equal(provisioned.issued,true);assert.equal(provisioned.credentialReturned,false);assert.equal(provisioned.token,undefined)
 await call('card.management-role',{id:'worker',role:'secretary'});assert.equal(core.readStore().sessions.find(card=>card.id==='worker').managementRole,'secretary')
 await call('card.management-role',{id:'worker',role:'employee'});await call('card.management-role',{id:'peer',role:'employee'})
 await call('card.management-role',{id:'peer',role:'secretary'});core.agentCredential('peer');await call('auth.revoke',{id:'peer'});await assert.rejects(call('card.management-role',{id:'secretary',role:'employee'}),/at least one ready Secretary/);await call('card.management-role',{id:'peer',role:'employee'});await assert.rejects(call('card.management-role',{id:'secretary',role:'employee'}),/at least one ready Secretary/)
 await assert.rejects(call('card.remove',{ids:['worker','secretary']}),/at least one ready Secretary/)
 assert.ok(core.readStore().sessions.some(card=>card.id==='worker'))
 await assert.rejects(call('auth.revoke',{id:'secretary'}),/at least one ready Secretary/)
 const revokedToken=core.agentCredential('worker').token;await call('auth.revoke',{id:'worker'});assert.throws(()=>core.authenticate(revokedToken),/Invalid|revoked/i)
 const audit=await call('administration.audit');assert.ok(audit.entries.length>5);assert.ok(audit.entries.every(entry=>entry.actor.kind==='agent'&&entry.actor.employeeId==='secretary'))
 assert.ok(audit.entries.some(entry=>entry.status==='failed'));let cursor,pages=[];do{const page=await call('administration.audit',{limit:2,...(cursor?{beforeId:cursor}:{})});pages.push(...page.entries);cursor=page.nextCursor}while(cursor);assert.deepEqual(pages.map(entry=>entry.id),audit.entries.map(entry=>entry.id));assert.ok(!JSON.stringify(audit).includes('admin fixture'));assert.ok(!JSON.stringify(audit).includes('"token"'))
 assert.equal((await call('session.list')).sessions.length,5)
 console.log('PASS secretary administration: real Agent identity; cross-view catalog; closed-session reasoning controls; default persistence; member-independent governance/assets; scoped credential provisioning; role lifecycle and atomic last-admin guard; redacted actor audit; lower roles and human receipts protected; zero native inference')
}finally{await core?.assetIndex.close();core?.stopConversationNotices();core?.closeChannels();if(previous===undefined)delete process.env.AGENTS_COMPANY_HOME;else process.env.AGENTS_COMPANY_HOME=previous;fs.rmSync(temp,{recursive:true,force:true})}
