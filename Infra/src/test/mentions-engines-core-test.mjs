// Source-built Core, native protocol fixtures and loopback providers only. No real credentials or hosts.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),require=createRequire(import.meta.url),logs=['progress/Agents-company1.md','share_chat/Agents-company1-channel-views.md']
if(process.getuid?.()===0){const{uid,gid}=fs.statSync(root);for(const file of [...logs,'Infra/src/test/mentions-engines-core-test.mjs'])fs.chownSync(path.join(root,file),uid,gid);process.setgroups([gid]);process.setgid(gid);process.setuid(uid);const user=os.userInfo();Object.assign(process.env,{HOME:user.homedir,USER:user.username,LOGNAME:user.username,TMPDIR:'/tmp'})}
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-mentions-engines-'))),out=path.join(root,'.aexus/artifacts/mentions-engines-cloud'),checks=[],report={passed:false,platform:process.platform,checks},run=promisify(execFile)
fs.mkdirSync(out,{recursive:true});fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
const note=text=>{console.log(text);checks.push(text);for(const file of logs)fs.appendFileSync(path.join(root,file),'\n- ['+new Date().toISOString()+'] '+text+'\n')}
let f,provider,relay
try{
 const entry=path.join(temp,'daemon.cjs');await build({entryPoints:[path.join(root,'Infra/src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 // SSH transport fixture executes only scripts in this temporary, loopback test setup.
 const bin=path.join(temp,'bin');fs.mkdirSync(bin)
 fs.writeFileSync(path.join(bin,'ssh'),`#!${process.execPath}\nconst args=process.argv.slice(2);if(args.includes('-R')){console.error('Allocated port '+args[args.indexOf('-R')+1].split(':').at(-1));setInterval(()=>{},1000)}else{const child=require('node:child_process').spawn('/bin/sh',['-c',args.at(-1)],{stdio:'inherit'});child.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>child.kill('SIGTERM'))}\n`,{mode:0o755})
 fs.writeFileSync(path.join(bin,'codex'),`#!${process.execPath}\nif(process.argv.includes('--version')){console.log('codex-fixture');process.exit(0)}if(process.argv.includes('login')){console.log('fixture authenticated');process.exit(0)}require(${JSON.stringify(path.join(root,'Infra/src/test/fixtures/initialization-codex.cjs'))});\n`,{mode:0o755})
 const adapter=path.join(root,'Infra/src/test/fixtures/process-adapter.cjs')
 f=await fixtureCore({CLINE_BIN:adapter,PI_BIN:adapter,PATH:bin+path.delimiter+process.env.PATH,CLAUDE_CONFIG_DIR:path.join(temp,'claude'),ANTHROPIC_API_KEY:'ambient-personal-key',DEEPSEEK_API_KEY:'ambient-other-key',OPENAI_API_KEY:'ambient-openai-key'},entry)
 const rpc=async(cmd,args={},auth=null)=>{const response=await f.request(auth,cmd,args);assert.ok(response.ok,cmd+': '+response.error);return response.data},deny=async(cmd,args,auth)=>assert.equal((await f.request(auth,cmd,args)).ok,false,cmd+' must reject')
 await rpc('group.add',{name:'Studio'});await rpc('group.add',{name:'Plugin',mode:'work',pluginId:'mininotion'})
 const pluginCards=[]
 for(const engine of ['cline','pi']){
  await rpc('engine.configure',{engine,patch:{apiKey:'school-'+engine+'-fixture',baseUrl:'https://school.invalid/v1',model:'deepseek-v4-flash'}})
  assert.deepEqual((await rpc('engine.capabilities',{engine})).workspaceModes,['build','cloud','work'])
  const card=await rpc('card.create',{title:engine+' writer',group:'Plugin',engine});await f.ready(card.id);pluginCards.push(card)
  assert.equal(card.engine,engine);assert.equal(card.model,'deepseek-v4-flash');const token=await f.token(card.id)
  const own=await rpc('plugin.call',{id:'mininotion',method:'fs.info',params:{},employee:card.id},token);assert.equal(own.root,card.cwd)
  await deny('plugin.call',{id:'mininotion',method:'fs.info',params:{},team:'Plugin'},token)
  await rpc('session.send',{employee:card.id,text:'UNICODE_FIXTURE'});await f.until(async()=>!(await f.status(card.id)).busy,'plugin employee turn')
  assert.ok(JSON.stringify(await rpc('session.transcript',{employee:card.id})).includes('春'))
  const job=await rpc('schedule.create',{spec:{name:engine+' self',action:{type:'agent',employeeId:'self',prompt:'PLUGIN_PLAN'},afterSeconds:3600,enabled:false}},token)
  assert.equal((await rpc('plan.query',{},token)).rows[0].id,job.id)
 }
 await deny('plugin.call',{id:'mininotion',method:'fs.info',params:{},employee:pluginCards[1].id},await f.token(pluginCards[0].id))
 note('PASS Cline/Pi：插件 Team 创建、学校自定义模型、真实初始化、原生回复、本人插件 API 与 Plan；跨员工/Team 插件访问拒绝。')
 const cloud=path.join(f.temp,'cloud');fs.mkdirSync(cloud)
 const host=await rpc('host.create',{name:'Fixture',host:'fixture',os:'linux',defaultDirectory:cloud})
 await rpc('group.add',{name:'Cloud',mode:'cloud',hostId:host.id,remote:{host:'fixture',os:'linux',directory:cloud},directory:cloud})
 const local=await f.create('Local target','Studio'),cards=[]
 for(const kind of ['worker','cloud-native-worker'])for(const role of ['manager','governor']){
  const card=await rpc('card.create',{title:kind+' '+role,group:'Cloud',kind,engine:'codex',managementRole:role,model:'gpt-6-luna',effort:'low'});await f.ready(card.id);cards.push(card)
  assert.ok(card.cwd.startsWith(cloud));const token=await f.token(card.id),identity=await rpc('auth.whoami',{},token);assert.equal(identity.managementRole,role);assert.equal(identity.globalManager,role==='governor')
  const launcher=path.join(card.cwd,'.agents-company/employees',card.id,'Infra/src/cli/agents')
  const invoke=async(...args)=>JSON.parse((await run(launcher,[...args,'--json'],{env:{PATH:'/usr/bin:/bin',HOME:temp},timeout:15000})).stdout)
  assert.equal((await invoke('auth','whoami')).data.principal.employeeId,card.id)
  const hired=await invoke('card','create','--title','child '+card.id,'--group','Cloud','--engine','pi');assert.ok(hired.ok,hired.error);await f.ready(hired.data.id)
  assert.equal(hired.data.createdBy.employeeId,card.id);assert.equal(hired.data.managementRole,'employee')
  const spec={name:'Delegated',action:{type:'agent',employeeId:hired.data.id,prompt:'DELEGATED'},afterSeconds:3600,enabled:false}
  assert.ok((await rpc('schedule.create',{spec},token)).id)
  if(role==='manager')await deny('schedule.create',{spec:{...spec,action:{...spec.action,employeeId:local.id}}},token)
  else assert.ok((await rpc('schedule.create',{spec:{...spec,action:{...spec.action,employeeId:local.id}}},token)).id)
  await deny('card.create',{title:'Forbidden Secretary',group:'Cloud',managementRole:'secretary'},token)
 }
 const manager=cards[0],governor=cards[1],mt=await f.token(manager.id),gt=await f.token(governor.id)
 const spec={name:'No upward',action:{type:'agent',employeeId:governor.id,prompt:'NEVER',viewId:'all'},afterSeconds:3600,enabled:false}
 await deny('schedule.create',{spec},mt);await deny('schedule.create',{spec:{...spec,action:{...spec.action,employeeId:cards[3].id}}},gt)
 await deny('card.create',{title:'Native Secretary',group:'Cloud',kind:'cloud-native-worker',managementRole:'secretary'},null)
 await rpc('card.management-role',{id:manager.id,role:'governor'});assert.equal((await rpc('auth.whoami',{},mt)).globalManager,true)
 await rpc('card.management-role',{id:manager.id,role:'manager'})
 await f.stop();await f.start();for(const card of cards){const saved=(await rpc('session.list')).sessions.find(value=>value.id===card.id);assert.equal(saved.managementRole,card.managementRole);assert.equal(saved.cwd,card.cwd)}
 note('PASS 云端角色：本地引擎云工作区/云端原生 Manager 与 Governor 均可创建、初始化、经身份绑定远端 CLI 招聘及排期；启动不降级，跨 Team/向上/同级 Plan 与 Secretary 边界保留。')
 await f.close();f=undefined
 // Validate actual child environments and upstream HTTP authentication with distinct dummy credentials.
 process.env.AGENTS_COMPANY_HOME=path.join(temp,'credential-state');process.env.CLAUDE_CONFIG_DIR=path.join(temp,'claude');process.env.CLINE_BIN=adapter;process.env.PI_BIN=adapter
 const bundle=path.join(temp,'providers.cjs')
 await build({stdin:{contents:`export * from ${JSON.stringify(path.join(root,'Infra/src/main/engines/configuration.ts'))};export * from ${JSON.stringify(path.join(root,'Infra/src/main/engines/cline-compat.ts'))};export * from ${JSON.stringify(path.join(root,'Infra/src/main/engines/cline-client.ts'))};export * from ${JSON.stringify(path.join(root,'Infra/src/main/engines/pi-client.ts'))};`,resolveDir:root,loader:'ts'},outfile:bundle,bundle:true,platform:'node',format:'cjs',packages:'external',logLevel:'silent'})
 const core=require(bundle),seen=[]
 provider=http.createServer((req,res)=>{seen.push({authorization:req.headers.authorization,xApiKey:req.headers['x-api-key'],path:req.url});req.resume();req.on('end',()=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[]}))})});await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+provider.address().port+'/v1'
 core.configureEngine('claude',{apiKey:'personal-claude-fixture',baseUrl:'https://api.deepseek.com/anthropic'})
 for(const engine of ['cline','pi'])core.configureEngine(engine,{apiKey:'school-'+engine+'-fixture',baseUrl:url,model:'deepseek-v4-flash'})
 const ambient={PATH:process.env.PATH,ANTHROPIC_API_KEY:'ambient-personal',ANTHROPIC_AUTH_TOKEN:'ambient-token',ANTHROPIC_BASE_URL:'https://personal.invalid',OPENAI_API_KEY:'ambient-openai',OPENAI_BASE_URL:'https://wrong.invalid',DEEPSEEK_API_KEY:'ambient-deepseek',CLINE_API_KEY:'ambient-cline',PI_API_KEY:'ambient-pi'}
 for(const engine of ['cline','pi']){const env=core.engineProcessEnvironment(engine,ambient);assert.equal(env.ANTHROPIC_API_KEY,undefined);assert.equal(env.ANTHROPIC_AUTH_TOKEN,undefined);assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.OPENAI_BASE_URL,url);assert.equal(env[engine==='cline'?'CLINE_API_KEY':'DEEPSEEK_API_KEY'],'school-'+engine+'-fixture');assert.equal(env[engine==='cline'?'DEEPSEEK_API_KEY':'CLINE_API_KEY'],undefined)}
 const claudeEnv=core.engineProcessEnvironment('claude',ambient);assert.equal(claudeEnv.ANTHROPIC_API_KEY,'personal-claude-fixture');assert.equal(claudeEnv.DEEPSEEK_API_KEY,undefined);assert.equal(claudeEnv.CLINE_API_KEY,undefined)
 core.configureEngine('pi',{apiKey:''});assert.equal(core.engineProcessEnvironment('pi',ambient).DEEPSEEK_API_KEY,undefined);assert.equal(core.engineEnvironment('cline').CLINE_API_KEY,'school-cline-fixture');assert.equal(core.engineEnvironment('claude').ANTHROPIC_API_KEY,'personal-claude-fixture')
 relay=await core.prepareClineCompatibility(path.join(temp,'cline-relay'),undefined,undefined,undefined,'school-cline-fixture')
 const settings=JSON.parse(fs.readFileSync(path.join(temp,'cline-relay/data/settings/providers.json'),'utf8')),endpoint=settings.providers['openai-compatible'].settings.baseUrl
 const response=await fetch(endpoint+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer wrong-personal-key','x-api-key':'wrong-personal-key'},body:JSON.stringify({messages:[]})});assert.equal(response.status,200);assert.deepEqual(seen,[{authorization:'Bearer school-cline-fixture',xApiKey:undefined,path:'/v1/chat/completions'}])
 assert.ok(!JSON.stringify(core.publicEngineConfiguration('cline')).includes('school-cline-fixture'));assert.ok(!fs.readFileSync(path.join(process.env.AGENTS_COMPANY_HOME,'engines/settings.json'),'utf8').includes('school-cline-fixture'))
 note('PASS 凭据隔离：独立加密读写、清除/配置不串用、缺失 Key 不读环境兜底；实际 Cline 中继请求强制学校 Key，错误个人 Key 和 x-api-key 未抵达上游。')
 const capture=path.join(temp,'capture.cjs'),keys=['CLINE_API_KEY','DEEPSEEK_API_KEY','ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','OPENAI_API_KEY','OPENAI_BASE_URL']
 fs.writeFileSync(capture,`#!${process.execPath}\nconst fs=require('node:fs');const engine=process.argv.includes('--acp')?'cline':'pi';fs.writeFileSync(${JSON.stringify(temp)}+'/'+engine+'-env.json',JSON.stringify(Object.fromEntries(${JSON.stringify(keys)}.map(key=>[key,process.env[key]??null]))));require(${JSON.stringify(adapter)});\n`,{mode:0o755})
 Object.assign(process.env,ambient,{CLINE_BIN:capture,PI_BIN:capture});core.configureEngine('pi',{apiKey:'school-pi-fixture'})
 const cline=await core.clineClient({cwd:temp,directory:path.join(temp,'spawn-cline')});try{await cline.call('initialize',{protocolVersion:1})}finally{await cline.close()}
 const pi=core.piClient({cwd:temp,directory:path.join(temp,'spawn-pi')});try{await pi.call('get_state')}finally{await pi.close()}
 for(const engine of ['cline','pi']){const env=JSON.parse(fs.readFileSync(path.join(temp,engine+'-env.json'),'utf8'));assert.equal(env[engine==='cline'?'CLINE_API_KEY':'DEEPSEEK_API_KEY'],'school-'+engine+'-fixture');for(const name of ['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','OPENAI_API_KEY',engine==='cline'?'DEEPSEEK_API_KEY':'CLINE_API_KEY'])assert.equal(env[name],null,engine+' child must not inherit '+name)}
 note('PASS 实际 Cline ACP / Pi RPC 子进程：分别只收到各自学校 Key，Claude Key、环境 DeepSeek Key 和其他引擎 Key 均未继承；全过程仅协议替身。')
 report.passed=true
}catch(error){report.error=error.stack;note('FAIL 专项：'+error.message);throw error}finally{await relay?.close();if(provider)await new Promise(resolve=>provider.close(resolve));await f?.close();fs.writeFileSync(path.join(out,'core-verification.json'),JSON.stringify(report,null,2));fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
