// Current identity/turn/approval guards, using isolated records and the real dispatcher.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-api-boundary-')),home=path.join(temp,'state'),previous=process.env.AGENTS_COMPANY_HOME
fs.mkdirSync(home);process.env.AGENTS_COMPANY_HOME=home;fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let core
try{
 fs.writeFileSync(path.join(home,'sessions.json'),JSON.stringify({sessions:[{id:'secretary',title:'Secretary',engine:'codex',kind:'worker',group:'A',cwd:temp,createdAt:1,initialization:{status:'ready'},managementRole:'secretary'}],groups:['A'],teamRoots:{A:temp},rooms:{}}))
 const entry=path.join(temp,'test.cjs');await build({stdin:{contents:"export * from './Infra/src/main/api-tool';export {prepareDocumentationTool} from './Infra/src/main/documentation-tool';export {approvalsFor,answerApproval} from './Infra/src/main/approvals';export {revokeAgentCredential} from './Infra/src/main/agent-access';export {setManagementRole} from './Infra/src/main/management';export {withCaller,operatorContext} from './Infra/src/main/authorization';export {closeChannels} from './Infra/src/main/channels'",resolveDir:root},bundle:true,platform:'node',format:'cjs',packages:'external',outfile:entry,define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 core=createRequire(import.meta.url)(entry);const state={cardId:'secretary',running:true,permissionMode:'default',currentTask:{messageId:'turn-a'}},sid='boundary-session',call=(command,args={},signal)=>core.invokeApiTool(state,{command,args},'fixture',signal)
 core.prepareDocumentationTool(state);core.prepareApiTool(state,sid,()=>{})
 const original=await call('settings.get');assert.equal(original.ok,true)
 for(const flag of ['acknowledging','privateInitialization']){state[flag]=true;await assert.rejects(call('settings.get'),/current employee work turn/);state[flag]=false}
 state.running=false;await assert.rejects(call('settings.get'),/current employee work turn/);state.running=true
 const originalTask=state.currentTask;delete state.currentTask;await assert.rejects(call('settings.get'),/current employee work turn/);state.currentTask=originalTask
 for(const input of [{command:'settings.get',auth:'operator'},{command:'settings.set',args:[]},{command:44}])await assert.rejects(core.invokeApiTool(state,input,'bad'),/Provide|Choose/)
 state.permissionMode='bypassPermissions';await assert.rejects(call('auth.agent-token',{id:'secretary'}),/not available/);await assert.rejects(call('settings.set',{createdBy:{kind:'operator'}}),/internal|reserved|cannot|Forbidden/i);await assert.rejects(call('not.real'),/not available/)
 const lateWrite=call('settings.set',{language:'zh-CN'});state.planMode=true;await assert.rejects(lateWrite,/permissions changed/);state.planMode=false
 const revokedBypass=call('settings.set',{language:'zh-CN'});state.permissionMode='default';await assert.rejects(revokedBypass,/permissions changed/)
 state.permissionMode='dontAsk';await assert.rejects(call('settings.set',{language:'zh-CN'}),/disabled/);state.permissionMode='default'
 const pending=async()=>{for(let i=0;i<100;i++){const item=core.approvalsFor(sid)[0];if(item)return item;await new Promise(r=>setTimeout(r,5))}throw Error('Missing native approval')},allow=item=>core.answerApproval(sid,item.id,true)
 let request=call('settings.set',{language:'zh-CN'}),rejected=assert.rejects(request,/current employee work turn/);let approval=await pending();state.currentTask={messageId:'turn-b'};allow(approval);await rejected
 request=call('settings.set',{language:'zh-CN'});rejected=assert.rejects(request,/permissions changed/);approval=await pending();state.planMode=true;allow(approval);await rejected;state.planMode=false
 const abort=new AbortController();request=call('settings.set',{language:'zh-CN'},abort.signal);rejected=assert.rejects(request,/Declined|aborted/);await pending();abort.abort();await rejected;assert.deepEqual(core.approvalsFor(sid),[])
 request=call('settings.set',{language:'zh-CN'});rejected=assert.rejects(request,/not available/);approval=await pending();core.withCaller(core.operatorContext(),()=>core.setManagementRole('secretary','employee'));allow(approval);await rejected
 core.withCaller(core.operatorContext(),()=>core.setManagementRole('secretary','secretary'));assert.deepEqual(await call('settings.get'),original)
 request=call('settings.set',{language:'zh-CN'});rejected=assert.rejects(request,/revoked|Invalid|credential/i);approval=await pending();core.revokeAgentCredential('secretary');allow(approval);await rejected
 await assert.rejects(call('settings.get'),/revoked|Invalid|credential/i);assert.equal(fs.existsSync(path.join(home,'agent-access/secretary/token')),false)
 console.log('PASS API boundary: idle/init/awareness denied; raw identity injection and human-only APIs denied; Ask/dontAsk/Plan enforced; changed turn, planning, role, token and abort rechecked before writes; settings unchanged')
}finally{core?.closeChannels();if(previous===undefined)delete process.env.AGENTS_COMPANY_HOME;else process.env.AGENTS_COMPANY_HOME=previous;fs.rmSync(temp,{recursive:true,force:true})}
