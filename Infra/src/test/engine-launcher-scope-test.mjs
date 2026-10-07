// Black-box CLI -> scoped Core. Disposable identities, local protocol fixtures, no real model or user data.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'.aexus/artifacts/engine-launcher-complete'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-scope-core-')),checks=[]
const require=createRequire(import.meta.url),{controlEndpoint}=require('../cli/platform.cjs')
fs.mkdirSync(out,{recursive:true})
const assertCheck=(label,condition=true)=>{assert.ok(condition,label);checks.push(label);console.log('PASS '+label)}
let f
try{
 fs.writeFileSync(path.join(directory,'package.json'),fs.readFileSync(path.join(root,'package.json')))
 for(const name of ['node_modules','Infra','Contract'])fs.symlinkSync(path.join(root,name),path.join(directory,name))
 fs.mkdirSync(path.join(directory,'Engine'))
 for(const name of fs.readdirSync(path.join(root,'Engine'))){const source=path.join(root,'Engine',name);fs.cpSync(source,path.join(directory,'Engine',name),{recursive:true,filter:file=>!path.relative(source,file).split(path.sep).some(part=>['node_modules','.git','artifacts'].includes(part))})}
 for(const id of ['scope-lab-a','scope-lab-b']){
  const engine=path.join(directory,'Engine',id);fs.mkdirSync(engine)
  fs.writeFileSync(path.join(engine,'engine.json'),JSON.stringify({id,name:id,version:'1.0.0',contractVersion:'1.0.0',description:'Disposable parallelism verifier',ui:'Page.tsx',cli:'cli.mjs',runtime:'runtime.mjs',requiredCommands:['group.list','group.add','workspace.write','workspace.list'],inputSchema:{type:'object'},outputSchema:{type:'object'}}))
  fs.writeFileSync(path.join(engine,'Page.tsx'),'export default function Page(){return null}')
  fs.writeFileSync(path.join(engine,'cli.mjs'),'export {}')
  fs.writeFileSync(path.join(engine,'runtime.mjs'),`export const create=input=>({team:input.team,ticks:0,limit:input.limit??12});export const describe=s=>({team:s.team,ticks:s.ticks});export const respond=s=>s;export async function run(s,c){if(!(await c.client.invoke('group.list',{})).includes(s.team))await c.client.invoke('group.add',{name:s.team,mode:'build'});while(s.ticks<s.limit){c.signal.throwIfAborted();s.ticks++;await c.client.invoke('workspace.write',{team:s.team,path:'tick.txt',content:String(s.ticks)});await c.checkpoint(s);await new Promise(r=>setTimeout(r,60))}return {status:'completed',state:s,artifacts:[{name:'result.txt',mediaType:'text/plain',description:'Final verified tick',content:String(s.ticks)}]}}`)
 }
 await build({entryPoints:Object.fromEntries(['daemon','message-index-worker','asset-index-worker'].map(name=>[name,path.join(root,'Infra/src/main',name+'.ts')])),outdir:path.join(directory,'.aexus/out/main'),platform:'node',format:'cjs',bundle:true,packages:'external',define:{__AGENTS_PROJECT_ROOT__:'undefined'},logLevel:'silent'})
 f=await fixtureCore({},path.join(directory,'.aexus/out/main/daemon.js'))
 const raw=(scope,cmd,args={},token)=>new Promise((resolve,reject)=>{
  const socket=net.connect(controlEndpoint(f.env.AGENTS_COMPANY_HOME));let data='';socket.setEncoding('utf8');socket.setTimeout(25000,()=>socket.destroy(Error('Test request timeout: '+cmd)));socket.on('error',reject);socket.on('connect',()=>socket.write(JSON.stringify({cmd,args,auth:token??fs.readFileSync(path.join(f.env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim(),...(scope!==undefined?{engineScope:scope}:{})})+'\n'));socket.on('data',part=>{data+=part;if(data.includes('\n')){socket.end();resolve(JSON.parse(data.split('\n')[0]))}})
 })
 const call=async(scope,cmd,args={})=>{const result=await raw(scope,cmd,args);assert.ok(result.ok,cmd+': '+result.error);return result.data}
 const reject=async(scope,cmd,args={})=>{const result=await raw(scope,cmd,args);assert.equal(result.ok,false,cmd+' must be rejected');return result}
 const A='workspace-audit',B='deep-research'
 assert.equal((await call(null,'view.get')).layer,'launcher')
 assert.equal((await reject(null,'view.select',{id:'messages'})).code,'ENGINE_NOT_LOADED')
 assert.equal((await call(null,'session.list')).sessions.length,0)
 await call(undefined,'group.add',{name:'Legacy',mode:'build'})
 assert.deepEqual(await call(A,'group.list'),[])
 await call(A,'group.add',{name:'Alpha',mode:'build'});await call(B,'group.add',{name:'Beta',mode:'build'})
 const a=await call(A,'card.create',{title:'Alex',group:'Alpha',engine:'codex',kind:'worker',model:'gpt-6-luna'}),b=await call(B,'card.create',{title:'Alex',group:'Beta',engine:'codex',kind:'worker',model:'gpt-6-luna'})
 await f.ready(a.id);await f.ready(b.id)
 assert.deepEqual((await call(A,'session.list')).sessions.map(s=>s.id),[a.id]);assert.deepEqual(await call(B,'group.list'),['Beta'])
 assert.deepEqual((await f.cli('--engine-scope',A,'session','list')).sessions.map(s=>s.id),[a.id])
 await reject(A,'session.transcript',{employee:b.id});await reject(A,'workspace.write',{employee:b.id,path:'x.txt',content:'not allowed'});await reject(A,'card.remove',{id:b.id})
 assertCheck('Homepage rejects content navigation; scoped CLI isolates same-name employees and denies foreign direct operations')
 const ga=await call(A,'chat.create',{name:'Alpha room',members:[a.id]}),gb=await call(B,'chat.create',{name:'Beta room',members:[b.id]})
 const ca=await call(A,'channel.create',{name:'Alpha channel',engine:{kind:'employees',employeeIds:[a.id]}}),cb=await call(B,'channel.create',{name:'Beta channel',engine:{kind:'employees',employeeIds:[b.id]}})
 const channelId=value=>value.channel?.id??value.id
 assert.deepEqual((await call(A,'chat.list')).map(g=>g.id),[ga.id]);assert.ok((await call(B,'channel.list')).every(c=>c.id===channelId(cb)))
 await reject(A,'chat.get',{id:gb.id});await reject(A,'channel.get',{id:channelId(cb)});await reject(A,'channel.history',{id:channelId(cb)});await reject(A,'conversation.file',{conversation:'group:'+gb.id,operation:'write',path:'x.txt',content:'not allowed'})
 await reject(A,'channel.create',{name:'Foreign participant',engine:{kind:'employees',employeeIds:[b.id]}})
 assertCheck('Groups, channels and direct files retain per-Engine membership boundaries')
 const rule={kind:'once',at:new Date(Date.now()+3600000).toISOString()}
 const ja=await call(A,'schedule.create',{spec:{name:'Alpha weekly review',action:{type:'agent',employeeId:a.id,prompt:'Independent scheduled work'},rule}})
 const jb=await call(B,'schedule.create',{spec:{name:'Beta review',action:{type:'agent',employeeId:b.id,prompt:'Other scheduled work'},rule}})
 const ea=await call(A,'schedule.create',{spec:{name:'Alpha event',action:{type:'agent',employeeId:a.id,prompt:'Signal work'},rule:{kind:'event',event:'signal',cooldownSeconds:0}}})
 assert.deepEqual((await call(A,'schedule.list')).map(j=>j.id).sort(),[ja.id,ea.id].sort());assert.equal((await call(B,'plan.query')).total,1)
 await reject(A,'schedule.get',{id:jb.id});await reject(A,'schedule.run',{id:jb.id});await reject(B,'schedule.trigger',{id:ea.id,eventId:'forbidden'})
 assertCheck('Plan list, query, manual execution and event rules cannot target another Engine')
 await call(A,'workspace.write',{employee:a.id,path:'alpha.txt',content:'ONLY_ALPHA',create:true});await call(B,'workspace.write',{employee:b.id,path:'beta.txt',content:'ONLY_BETA',create:true})
 await call(A,'conversation.file',{conversation:'group:'+ga.id,operation:'write',path:'original.txt',content:'USER_ORIGINAL',create:true})
 await call(B,'conversation.file',{conversation:'group:'+gb.id,operation:'write',path:'other.txt',content:'OTHER_ORIGINAL',create:true})
 const workspace=await call(A,'conversation.workspace',{conversation:'group:'+ga.id,employee:a.id}),token=await f.token(a.id)
 const original=await raw(A,'conversation.file',{conversation:'group:'+ga.id,operation:'write',path:'original.txt',content:'illegal'},token);assert.equal(original.ok,false)
 const owned=await raw(A,'conversation.file',{conversation:'group:'+ga.id,operation:'write',path:workspace.memberDirectory+'/own.txt',content:'own'},token);assert.equal(owned.ok,true,owned.error)
 for(let i=0;i<3;i++){
  const [ta,tb]=await Promise.all([call(A,'assets.tree'),call(B,'assets.tree')]);assert.ok(!JSON.stringify(ta).includes('Beta'));assert.ok(!JSON.stringify(tb).includes('Alpha'))
  await new Promise(r=>setTimeout(r,150))
  const [sa,sb]=await Promise.all([call(A,'assets.search',{query:'alpha'}),call(B,'assets.search',{query:'beta'})]);assert.ok(sa.entries.every(n=>n.name!=='beta.txt'));assert.ok(sb.entries.every(n=>n.name!=='alpha.txt'))
 }
 assertCheck('Simultaneous asset indexes do not replace each other; group originals remain read-only for ordinary members')
 const extra=await f.create('Peer','Legacy'),legacy=await f.create('Guest','Legacy')
 await call(undefined,'workspace.write',{employee:extra.id,path:'peer-secret.txt',content:'PEER'})
 await call(A,'infra.bind',{engineId:A,resources:{employees:[legacy.id]}})
 const tree=await call(A,'assets.tree');assert.ok(!JSON.stringify(tree).includes(extra.id))
 await reject(A,'workspace.list',{team:'Legacy',path:'.'});
 await reject(A,'assets.file',{id:'team:Legacy',operation:'read',path:'peer-secret.txt'})
 await call(A,'infra.unbind',{engineId:A,resources:{employees:[legacy.id]}})
 await call(A,'group.rename',{name:'Alpha',nextName:'Alpha renamed'})
 assert.ok((await call(A,'group.list')).includes('Alpha renamed'));assert.equal((await call(A,'session.list')).sessions.find(s=>s.id===a.id).cwd,a.cwd)
 assertCheck('Explicit employee-only linking excludes peer Team files; display renames preserve workspace identities')
 for(const card of [a,b])fs.writeFileSync(path.join(f.control,card.id+'.hold-user'),'')
 await call(A,'session.send',{employee:a.id,text:'ALPHA_BACKGROUND',clientMessageId:'alpha-background'});await call(B,'session.send',{employee:b.id,text:'BETA_BACKGROUND',clientMessageId:'beta-background'})
 await f.until(async()=>(await f.status(a.id)).busy&&(await f.status(b.id)).busy,'both engines working')
 await call(null,'view.load-engine',{engineId:A});await call(A,'view.layer',{layer:'infra'});await call(A,'view.launcher')
 assert.equal((await call(null,'view.get')).layer,'launcher');assert.ok((await f.status(a.id)).busy&&(await f.status(b.id)).busy)
 await call(null,'view.load-engine',{engineId:B});fs.unlinkSync(path.join(f.control,a.id+'.hold-user'));await f.until(async()=>!(await f.status(a.id)).busy,'A finishes while B is viewed');assert.ok((await f.status(b.id)).busy)
 await call(B,'session.interrupt',{id:b.id});fs.unlinkSync(path.join(f.control,b.id+'.hold-user'))
 assert.equal((await call(A,'session.transcript',{employee:a.id})).items.filter(i=>i.role==='user'&&i.text==='ALPHA_BACKGROUND').length,1)
 await call(B,'view.launcher');await call(undefined,'schedule.run',{id:ja.id});await f.until(async()=>(await call(A,'schedule.history',{id:ja.id})).some(run=>run.status==='succeeded'),'background schedule from home')
 assertCheck('Two real native workers run concurrently; viewing, returning home, switching and cancellation do not cross tasks; Plan runs from home')
 const wa=await call(undefined,'workflow.start',{engineId:'scope-lab-a',input:{team:'Workflow Alpha',limit:15},clientRequestId:'wa'}),wb=await call(undefined,'workflow.start',{engineId:'scope-lab-b',input:{team:'Workflow Beta',limit:35},clientRequestId:'wb'})
 await f.until(async()=>(await call(undefined,'workflow.get',{id:wa.id})).summary.ticks>1&&(await call(undefined,'workflow.get',{id:wb.id})).summary.ticks>1,'parallel workflows advance')
 await call(null,'view.load-engine',{engineId:B});await call(B,'view.launcher')
 await reject(A,'workflow.get',{id:wa.id})
 await f.until(async()=>(await call(undefined,'workflow.get',{id:wa.id})).status==='completed','workflow A complete')
 await call('scope-lab-b','workflow.cancel',{id:wb.id});assert.equal((await call(undefined,'workflow.get',{id:wa.id})).status,'completed')
 assert.deepEqual(await call('scope-lab-a','group.list'),['Workflow Alpha']);assert.deepEqual(await call('scope-lab-b','group.list'),['Workflow Beta'])
 assertCheck('Autonomous workflows preserve their own Engine scope while the user views another Engine or the homepage')
 await call(A,'infra.unbind',{engineId:A,resources:{groups:[ga.id]}});await f.stop();await f.start()
 assert.ok(!(await call(A,'chat.list')).some(g=>g.id===ga.id));assert.equal((await call(undefined,'chat.get',{id:ga.id})).name,'Alpha room')
 assert.equal((await call(undefined,'workflow.get',{id:wa.id})).status,'completed');assert.equal((await call(undefined,'workflow.file',{id:wa.id,name:'result.txt'})).content,'15')
 assertCheck('Restart preserves associations, explicit exclusions, original conversations and verified workflow delivery')
 fs.writeFileSync(path.join(out,'scope-core.json'),JSON.stringify({passed:true,checks,modelCalls:0,productionDataUsed:false},null,2))
}catch(error){fs.writeFileSync(path.join(out,'scope-core-failure.json'),JSON.stringify({passed:false,checks,error:error.stack},null,2));throw error}finally{await f?.close();fs.rmSync(directory,{recursive:true,force:true})}
