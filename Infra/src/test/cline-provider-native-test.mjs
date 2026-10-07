// Real installed Cline ACP with a deterministic loopback gateway and disposable profile only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'

const binary=process.env.AGENTS_TEST_CLINE_BIN
if(!binary){console.log('SKIP set AGENTS_TEST_CLINE_BIN for native Cline gateway verification');process.exit(0)}
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-cline-provider-')),require=createRequire(import.meta.url),requests=[],updates=[]
const previous={home:process.env.AGENTS_COMPANY_HOME,binary:process.env.CLINE_BIN}
process.env.AGENTS_COMPANY_HOME=path.join(temp,'state');process.env.CLINE_BIN=binary
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
const model='deepseek-v4-flash',cwd=path.join(temp,'workspace'),png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='
fs.mkdirSync(cwd)
const gateway=http.createServer(async(req,res)=>{
 if(req.method!=='POST'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{id:model}]}));return}
 let raw='';for await(const chunk of req)raw+=chunk
 const body=JSON.parse(raw);requests.push({path:req.url,body,fixtureAuth:req.headers.authorization==='Bearer fixture-key-not-real'})
 res.writeHead(200,{'content-type':'text/event-stream'})
 const delta=(value,finish_reason=null)=>res.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model,choices:[{index:0,delta:value,finish_reason}]})+'\n\n')
 delta({role:'assistant',reasoning_content:'PRIVATE_GATEWAY_REASONING 春雨。'});delta({content:'GATEWAY_NATIVE_OK'});delta({},'stop');res.end('data: [DONE]\n\n')
})
await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));const endpoint=`http://127.0.0.1:${gateway.address().port}/school/v1`,directory=path.join(temp,'profile'),providerFile=path.join(directory,'data/settings/providers.json')
let client
try{
 const entry=path.join(temp,'client.cjs')
 await build({stdin:{contents:"export {clineClient} from './Infra/src/main/engines/cline-client';export {configureEngine} from './Infra/src/main/engines/configuration';export {probeProcessEngine} from './Infra/src/main/engines/process-probe'",resolveDir:root},outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 const {clineClient,configureEngine,probeProcessEngine}=require(entry)
 configureEngine('cline',{apiKey:'fixture-key-not-real',baseUrl:endpoint,model})
 fs.mkdirSync(path.dirname(providerFile),{recursive:true});fs.writeFileSync(providerFile,JSON.stringify({version:1,providers:{'openai-compatible':{settings:{provider:'openai-compatible',model:'employee-wrong-model',baseUrl:'https://employee-profile.invalid/v1'}},deepseek:{settings:{provider:'deepseek',model:'deepseek-flash',baseUrl:'https://api.deepseek.com'}}}}))
 const open=()=>clineClient({cwd,directory,env:{HOME:directory,USERPROFILE:directory},onUpdate:event=>updates.push(event)})
 client=await open();assert.equal(client.provider,'openai-compatible');assert.equal(client.model,model);assert.equal(client.managedReasoning,true);assert.equal(client.baseUrl,endpoint)
 const initialized=await client.call('initialize',{protocolVersion:1,clientInfo:{name:'agents-provider-test',version:'1'},clientCapabilities:{}});assert.equal(initialized.protocolVersion,1)
 const session=await client.call('session/new',{cwd,mcpServers:[]})
 assert.ok(session.models.availableModels.some(value=>value.modelId===model),'native custom provider catalogue contains configured model')
 await client.call('session/set_config_option',{sessionId:session.sessionId,configId:'model',value:model})
 const image=client.stageImages([{path:'approved.png',mimeType:'image/png',data:png}])
 await client.call('session/prompt',{sessionId:session.sessionId,prompt:[{type:'text',text:'Inspect this approved attachment. '+image.marker}]},45000);image.verify()
 assert.ok(updates.some(event=>event.sessionUpdate==='agent_message_chunk'&&event.content?.text.includes('GATEWAY_NATIVE_OK')))
 assert.ok(updates.some(event=>event.sessionUpdate==='agent_thought_chunk'&&event.content?.text.includes('PRIVATE_GATEWAY_REASONING')),'gateway reasoning survives as ACP private thought events')
 assert.ok(requests.some(({body})=>body.messages.some(message=>Array.isArray(message.content)&&message.content.some(part=>part.type==='image_url'&&part.image_url.url==='data:image/png;base64,'+png))))
 await client.close();client=undefined
 assert.equal(JSON.parse(fs.readFileSync(providerFile)).providers['openai-compatible'].settings.baseUrl,endpoint)
 client=await open();await client.call('initialize',{protocolVersion:1,clientInfo:{name:'agents-provider-test',version:'1'},clientCapabilities:{}})
 await client.call('session/load',{sessionId:session.sessionId,cwd,mcpServers:[]})
 await client.call('session/prompt',{sessionId:session.sessionId,prompt:[{type:'text',text:'Continue the existing native conversation.'}]},45000)
 assert.ok(requests.length>=2);assert.ok(requests.every(request=>request.path==='/school/v1/chat/completions'&&request.body.model===model&&request.fixtureAuth))
 assert.ok(!JSON.stringify(requests).includes('employee-profile.invalid'))
 await client.close();client=undefined
 const probe=await probeProcessEngine('cline');assert.equal(probe.model,model);assert.equal(probe.thinkingManaged,true);assert.equal(probe.text,'GATEWAY_NATIVE_OK')
 console.log('PASS installed Cline custom gateway: Core provider/model/URL authority, private reasoning, image bytes and same-session native resume; deterministic loopback only')
}catch(error){console.error(JSON.stringify({requests:requests.map(r=>({path:r.path,model:r.body.model,fixtureAuth:r.fixtureAuth})),updates:updates.map(u=>({kind:u.sessionUpdate,title:u.title,status:u.status})),fixture:process.env.AGENTS_TEST_KEEP?temp:undefined}));throw error
}finally{
 await client?.close();gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));if(!process.env.AGENTS_TEST_KEEP)fs.rmSync(temp,{recursive:true,force:true})
 if(previous.home===undefined)delete process.env.AGENTS_COMPANY_HOME;else process.env.AGENTS_COMPANY_HOME=previous.home
 if(previous.binary===undefined)delete process.env.CLINE_BIN;else process.env.CLINE_BIN=previous.binary
}
