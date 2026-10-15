// Native protocol checks use disposable profiles and a local model fixture only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-shared-config-')),require=createRequire(import.meta.url)
const save=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value))}
const cline=path.join(temp,'cline'),pi=path.join(temp,'pi'),requests=[],models=['glm-fixture','qwen-fixture']
const gateway=http.createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk
 const body=JSON.parse(raw);requests.push({body,fixtureAuth:req.headers.authorization==='Bearer fixture-native-key'})
 res.writeHead(200,{'content-type':'text/event-stream'})
 const emit=delta=>res.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta,finish_reason:null}]})+'\n\n')
 emit({role:'assistant'});emit({content:'NATIVE_CONFIG_OK'});res.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\n');res.end('data: [DONE]\n\n')
})
await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));const baseUrl='http://127.0.0.1:'+gateway.address().port+'/v1'
save(path.join(cline,'data/settings/providers.json'),{version:1,lastUsedProvider:'openai-compatible',modes:{},providers:{'openai-compatible':{settings:{provider:'openai-compatible',model:models[0],baseUrl,apiKey:'fixture-native-key'},updatedAt:new Date().toISOString(),tokenSource:'manual'}}})
save(path.join(cline,'data/settings/models.json'),{version:1,providers:{'openai-compatible':{models:Object.fromEntries(models.map(id=>[id,{id,name:id}]))}}})
save(path.join(pi,'settings.json'),{defaultProvider:'juapi-fixture',defaultModel:models[0],defaultThinkingLevel:'low'})
save(path.join(pi,'models.json'),{providers:{'juapi-fixture':{baseUrl,api:'openai-completions',models:models.map(id=>({id,name:id,reasoning:true,thinkingLevelMap:{off:null,low:'low',high:'high',max:'max'}}))}}})
save(path.join(pi,'auth.json'),{'juapi-fixture':{type:'api_key',key:'fixture-native-key'}})
const previous={};for(const [name,value] of Object.entries({AGENTS_COMPANY_HOME:path.join(temp,'state'),CLINE_DIR:cline,CLINE_DATA_DIR:path.join(cline,'data'),PI_CODING_AGENT_DIR:pi,CLINE_BIN:process.env.AGENTS_TEST_CLINE_BIN,PI_BIN:process.env.AGENTS_TEST_PI_BIN})){previous[name]=process.env[name];if(value)process.env[name]=value}
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let c,p
try{
 const entry=path.join(temp,'helpers.cjs')
 await build({stdin:{contents:"export {configureEngine,processProvider,engineEnvironment,engineProcessEnvironment,publicEngineConfiguration} from './src/main/engines/configuration';export {clineClient} from './src/main/engines/cline-client';export {piClient} from './src/main/engines/pi-client'",resolveDir:root},outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 const api=require(entry)
 api.configureEngine('cline',{sharedClineConfig:true});api.configureEngine('pi',{sharedPiConfig:true})
 for(const engine of ['cline','pi']){
  const provider=api.processProvider(engine);assert.equal(provider.model,models[0]);assert.equal(provider.baseUrl,baseUrl);assert.deepEqual(provider.modelIds,models)
  assert.equal(api.publicEngineConfiguration(engine).hasApiKey,true);assert.ok(!JSON.stringify(api.publicEngineConfiguration(engine)).includes('fixture-native-key'))
  const env=api.engineProcessEnvironment(engine,{ANTHROPIC_AUTH_TOKEN:'wrong-claude-key',OPENAI_API_KEY:'wrong-openai-key',DEEPSEEK_API_KEY:'wrong-inherited-key'})
  assert.equal(env[engine==='cline'?'CLINE_API_KEY':'DEEPSEEK_API_KEY'],'fixture-native-key');assert.equal(env.ANTHROPIC_AUTH_TOKEN,undefined);assert.equal(env.OPENAI_API_KEY,undefined)
 }
 const beforeCline=fs.readFileSync(path.join(cline,'data/settings/providers.json'),'utf8'),beforePi=fs.readFileSync(path.join(pi,'models.json'),'utf8')
 if(process.env.AGENTS_TEST_CLINE_BIN){
  c=await api.clineClient({cwd:temp,directory:path.join(temp,'employee-cline')})
  await c.call('initialize',{protocolVersion:1,clientCapabilities:{}})
  const session=await c.call('session/new',{cwd:temp,mcpServers:[]});assert.ok(models.every(id=>session.models.availableModels.some(m=>m.modelId===id)))
  await c.call('session/prompt',{sessionId:session.sessionId,prompt:[{type:'text',text:'Reply only NATIVE_CONFIG_OK.'}]},45000)
  await c.close();c=undefined
 }
 if(process.env.AGENTS_TEST_PI_BIN){
  let settled;const finished=new Promise(resolve=>settled=resolve),texts=[]
  p=api.piClient({cwd:temp,directory:path.join(temp,'employee-pi'),onEvent:e=>{if(e.type==='message_update'&&e.assistantMessageEvent?.type==='text_delta')texts.push(e.assistantMessageEvent.delta);if(e.type==='agent_settled')settled()}})
  const catalog=await p.call('get_available_models');assert.deepEqual(catalog.models.filter(m=>m.provider==='juapi-fixture').map(m=>m.id).sort(),models.slice().sort())
  assert.equal((await p.call('get_state')).thinkingLevel,'low')
  await p.call('prompt',{message:'Reply only NATIVE_CONFIG_OK.'});await Promise.race([finished,new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Pi fixture timeout')),20000);t.unref()})])
  assert.equal(texts.join(''),'NATIVE_CONFIG_OK');await p.close();p=undefined
 }
 assert.equal(fs.readFileSync(path.join(cline,'data/settings/providers.json'),'utf8'),beforeCline);assert.equal(fs.readFileSync(path.join(pi,'models.json'),'utf8'),beforePi)
 assert.ok(requests.every(r=>r.fixtureAuth&&r.body.model===models[0]))
 if(process.env.AGENTS_TEST_PI_BIN)assert.ok(requests.some(r=>r.body.reasoning_effort==='low'),'Pi preserves the native thinking level')
 // Built-in Pi providers are valid without a models.json override.
 save(path.join(pi,'settings.json'),{defaultProvider:'deepseek',defaultModel:'deepseek-flash',defaultThinkingLevel:'low'})
 save(path.join(pi,'auth.json'),{deepseek:{type:'api_key',key:'fixture-deepseek-native-key'}})
 const builtInSettings=fs.readFileSync(path.join(pi,'settings.json'),'utf8'),builtInModels=fs.readFileSync(path.join(pi,'models.json'),'utf8')
 const builtIn=api.processProvider('pi');assert.equal(builtIn.provider,'deepseek');assert.equal(builtIn.model,'deepseek-flash');assert.equal(builtIn.baseUrl,undefined);assert.equal(builtIn.managedReasoning,true,'Native thinking low must not be rejected as Thinking off')
 assert.equal(api.engineEnvironment('pi').DEEPSEEK_API_KEY,'fixture-deepseek-native-key');assert.equal(api.publicEngineConfiguration('pi').hasApiKey,true)
 assert.equal(fs.readFileSync(path.join(pi,'settings.json'),'utf8'),builtInSettings);assert.equal(fs.readFileSync(path.join(pi,'models.json'),'utf8'),builtInModels)
 save(path.join(pi,'settings.json'),{defaultProvider:'deepseek',defaultModel:'deepseek-flash',defaultThinkingLevel:'off'})
 assert.equal(api.processProvider('pi').managedReasoning,false,'Explicit native Thinking off retains strict validation')
 console.log('PASS native Pi built-in DeepSeek without a custom model registry override')
 console.log('PASS shared native provider/model/key/catalog, private employee profiles, real Cline/Pi protocols and native thinking; local fixture only')
}finally{
 await c?.close();await p?.close();gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));fs.rmSync(temp,{recursive:true,force:true})
 for(const [name,value] of Object.entries(previous))if(value===undefined)delete process.env[name];else process.env[name]=value
}
