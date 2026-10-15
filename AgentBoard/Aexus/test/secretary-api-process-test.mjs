// Actual Cline/Pi adapter transports with deterministic ACP/RPC peers, no inference.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-api-process-'))),checks=[];let f
try{
 fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir');const entry=path.join(temp,'daemon.cjs')
 await build({entryPoints:[path.join(root,'src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 let fixture=fs.readFileSync(path.join(root,'test/fixtures/process-adapter.cjs'),'utf8')
 fixture=fixture.replace("title:name==='agents_company_documentation'?'Agents Company documentation':'Agents Company discussion'","title:name==='agents_company_documentation'?'Agents Company documentation':name==='agents_company_api'?'Agents Company API':'Agents Company discussion'")
 const marker=' const post=control&&employee?workPostArgs(text,control,employee):undefined';assert.equal(fixture.split(marker).length,2)
 const hook=`
 const apiFile=control&&employee?path.join(control,employee+'.api-request.json'):undefined;
 if(apiFile&&fs.existsSync(apiFile)){const input=JSON.parse(fs.readFileSync(apiFile,'utf8'));try{const response=await nativeTool('agents_company_api',input);const envelope=acp?JSON.parse(response.result.content[0].text):response.result;if(!envelope?.ok)throw Error(JSON.stringify(response));note('api-result',envelope);finish('API_TRANSPORT_OK')}catch(error){note('api-result',{ok:false,error:error.message});finish('API_TRANSPORT_ERROR')}return}
 `
 fixture=fixture.replace(marker,hook+marker);const fixtureFile=path.join(temp,'api-process.cjs');fs.writeFileSync(fixtureFile,fixture,{mode:0o755});f=await fixtureCore({CLINE_BIN:fixtureFile,PI_BIN:fixtureFile},entry)
 const rpc=async(cmd,args={})=>{const r=await f.request(null,cmd,args);assert.ok(r.ok,r.error);return r.data}
 await rpc('group.add',{name:'API adapters'})
 for(const engine of ['cline','pi']){
  await rpc('engine.configure',{engine,patch:{apiKey:'fixture-only-not-a-real-key'}})
  const card=await rpc('card.create',{title:engine+' Secretary',group:'API adapters',managementRole:'secretary',engine,model:'deepseek-flash'});await f.ready(card.id)
  const session=(await rpc('session.open',{cardId:card.id})).sessionId;await rpc('config.permission',{id:session,mode:'bypassPermissions'})
  const job=await rpc('schedule.create',{spec:{name:engine+' API task',enabled:false,action:{type:'agent',employeeId:card.id,prompt:'NO_MODEL_TASK'},rule:{kind:'interval',everySeconds:3600}}})
  const file=path.join(f.control,card.id+'.api-request.json'),output=path.join(f.control,card.id+'-api-result.json')
  const call=async(command,args={})=>{fs.rmSync(output,{force:true});fs.writeFileSync(file,JSON.stringify({command,args}));await rpc('session.send',{id:session,text:'CALL_THE_REGISTERED_API',sourceView:'plan'});await f.until(()=>fs.existsSync(output),'native '+engine+' API response');await f.until(async()=>!(await f.status(card.id)).busy,'idle');const result=JSON.parse(fs.readFileSync(output));assert.equal(result.ok,true,result.error);return result.data}
  const query=await call('plan.query',{filter:{search:job.id}});assert.equal(query.rows[0].id,job.id);assert.equal(query.rows[0].employee.role,'secretary')
  const updated=await call('schedule.update',{id:job.id,expectedRevision:job.revision,patch:{name:engine+' UPDATED'}});assert.equal(updated.id,job.id)
  assert.equal((await call('schedule.get',{id:job.id})).name,engine+' UPDATED');await call('schedule.delete',{id:job.id,expectedRevision:updated.revision});assert.equal((await call('plan.query',{filter:{search:job.id}})).total,0)
  assert.deepEqual(await rpc('terminal.list'),[]);checks.push(engine+' registered native transport: plan.query → schedule.update → get → delete → query, real employee identity and revisions')
 }
 const out=path.join(root,'artifacts/secretary-plan-api');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'process-adapters.json'),JSON.stringify({passed:true,checks,providerCalls:0},null,2));console.log('PASS '+checks.join('; '))
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true})}
