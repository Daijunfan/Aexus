// Opt-in installed engines, deterministic loopback model and disposable SSH target only.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fixtureCore} from './fixtures/headless-core.mjs'
const engines=[['cline',process.env.AGENTS_TEST_CLINE_BIN],['pi',process.env.AGENTS_TEST_PI_BIN]].filter(([,binary])=>binary)
if(!engines.length){console.log('SKIP set AGENTS_TEST_CLINE_BIN / AGENTS_TEST_PI_BIN for installed-engine protocol tests');process.exit(0)}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-process-native-')),run=promisify(execFile),bin=path.join(temp,'bin');fs.mkdirSync(bin)
fs.writeFileSync(path.join(bin,'ssh'),`#!${process.execPath}
const args=process.argv.slice(2);if(args.includes('-R')){console.error('Allocated port '+args[args.indexOf('-R')+1].split(':').at(-1));setInterval(()=>{},1000)}else{const child=require('node:child_process').spawn('/bin/sh',['-c',args.at(-1)],{stdio:'inherit'});child.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>child.kill('SIGTERM'))}
`,{mode:0o755})
let scenario={name:'idle'},requests=[]
const model=http.createServer(async(req,res)=>{
 let text='';for await(const chunk of req)text+=chunk
 if(req.method!=='POST'){res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'deepseek-flash'}]}));return}
 const body=JSON.parse(text),record={scenario:scenario.name,body};requests.push(record)
 const tools=(body.tools??[]).map(t=>t.function?.name??t.name)
 const tool=scenario.tool&&!scenario.called
 if(tool){scenario.called=true;record.offered=tools}
 res.writeHead(200,{'content-type':'text/event-stream'})
 const chunk=(delta,finish_reason=null)=>res.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:'deepseek-flash',choices:[{index:0,delta,finish_reason}]})+'\n\n')
 if(tool){chunk({role:'assistant',tool_calls:[{index:0,id:'call_fixture',type:'function',function:{name:scenario.tool,arguments:JSON.stringify(scenario.input)}}]});chunk({},'tool_calls')}
 else{chunk({role:'assistant',content:'FIXTURE_OK'});chunk({},'stop')}
 res.end('data: [DONE]\n\n')
})
await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));const endpoint=`http://127.0.0.1:${model.address().port}/v1`
const f=await fixtureCore({PATH:bin+path.delimiter+process.env.PATH,...Object.fromEntries(engines.map(([e,p])=>[e.toUpperCase()+'_BIN',p]))})
const rpc=async(cmd,args={})=>{const value=await f.request(null,cmd,args);assert.ok(value.ok,value.error);return value.data}
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='
const hasImage=records=>records.some(record=>record.body.messages?.some(message=>Array.isArray(message.content)&&message.content.some(part=>part.type==='image_url'&&part.image_url?.url==='data:image/png;base64,'+png)))
const idle=card=>f.until(async()=>!(await f.status(card.id)).busy,'native turn '+scenario.name)
const send=async(card,name,extra={})=>{scenario={name,...extra};await rpc('session.send',{employee:card.id,text:name,...(extra.images?{images:extra.images}:{})})}
const error=async card=>(await rpc('session.snapshot',{id:(await f.status(card.id)).sessionId})).error
try{
 await f.cli('group','add','Local');const remote=path.join(f.temp,'remote');fs.mkdirSync(remote)
 const host=await f.cli('host','create','--data',JSON.stringify({name:'Fixture',host:'fixture',os:'linux',defaultDirectory:remote}));await f.cli('group','add','Cloud','--mode','cloud','--host-id',host.id,'--remote-dir',remote)
 for(const [engine,binary] of engines){
  await rpc('engine.configure',{engine,patch:{apiKey:'fixture-key-not-real'}})
  for(const group of engine==='cline'?['Local','Cloud']:['Cloud']){
   const card=await f.cli('card','create','--title',engine+'-'+group,'--group',group,'--engine',engine),profile=path.join(f.env.AGENTS_COMPANY_HOME,'agent-access',card.id,engine)
   fs.mkdirSync(profile,{recursive:true})
   if(engine==='cline'){
    await run(binary,['auth','deepseek','--apikey','fixture-key-not-real','--modelid','deepseek-flash','--config',profile,'--data-dir',path.join(profile,'data')],{env:{...f.env,HOME:profile,USERPROFILE:profile},timeout:20000})
    const settingsFile=path.join(profile,'data/settings/providers.json'),settings=JSON.parse(fs.readFileSync(settingsFile));settings.providers.deepseek.settings.baseUrl=endpoint;fs.writeFileSync(settingsFile,JSON.stringify(settings))
   }else fs.writeFileSync(path.join(profile,'models.json'),JSON.stringify({providers:{deepseek:{baseUrl:endpoint,apiKey:'fixture-key-not-real',api:'openai-completions'}}}))
   const opened=await f.cli('session','open',card.id)
   if(group==='Local'){
    await rpc('workspace.write',{employee:card.id,path:'image.png',contentBase64:png,create:true})
    await send(card,'CLINE_IMAGE_NATIVE',{images:['image.png']});await idle(card)
    assert.ok(!await error(card),await error(card));const wire=requests.filter(r=>r.scenario===scenario.name);assert.ok(wire.length,'native model request was captured')
    assert.ok(hasImage(wire),'image bytes must reach the actual native provider request')
    assert.ok(!JSON.stringify(wire).includes('agents-company-image:'),'private attachment marker is removed before model submission')
    await f.cli('session','close',opened.sessionId);await send(card,'CLINE_IMAGE_RESUME_NATIVE');await idle(card)
    assert.ok(!await error(card),await error(card));assert.ok(hasImage(requests.filter(r=>r.scenario===scenario.name)),'resumed native context retains images')
    console.log('PASS installed Cline: actual image request and native resume, loopback model only')
   }else{
    for(const decision of ['deny','allow']){
     const name=engine.toUpperCase()+'_CLOUD_'+decision.toUpperCase(),input={path:'native-'+decision+'.txt',content:'written over Tunnel'}
     await send(card,name,{tool:'tunnel__write_file',input})
     await f.until(async()=>{const s=await f.status(card.id);if(!s.busy)throw Error('No approval: '+await error(card));return (await f.cli('approval','list',s.sessionId)).length},'native cloud approval')
     const s=await f.status(card.id),approval=(await f.cli('approval','list',s.sessionId))[0]
     await rpc('approval.respond',{id:s.sessionId,requestId:approval.id,decision});await idle(card)
     assert.ok(!await error(card),await error(card));assert.equal(fs.existsSync(path.join(card.cwd,input.path)),decision==='allow')
     const wire=requests.find(r=>r.scenario===name&&r.offered);assert.ok(wire,'native tool request captured');assert.ok(wire.offered.includes('tunnel__write_file'),JSON.stringify(wire.offered));assert.ok(wire.offered.every(t=>t.startsWith('tunnel__')),JSON.stringify(wire.offered))
    }
    const currentId=(await f.status(card.id)).sessionId
    await send(card,engine.toUpperCase()+'_CLOUD_CANCEL',{tool:'tunnel__execute',input:{command:'sleep 2; printf bad > native-cancelled.txt'}})
    await f.until(async()=>(await f.cli('approval','list',currentId)).length,'native command approval')
    const pending=(await f.cli('approval','list',currentId))[0];await rpc('approval.respond',{id:currentId,requestId:pending.id,decision:'allow'})
    await new Promise(resolve=>setTimeout(resolve,150));await rpc('session.interrupt',{employee:card.id});await idle(card);await new Promise(resolve=>setTimeout(resolve,2200))
    assert.ok(!fs.existsSync(path.join(card.cwd,'native-cancelled.txt')),engine+' cancels the remote command')
    if(engine==='cline'){
     await f.cli('config','plan',currentId,'on')
     await send(card,'CLINE_CLOUD_PLAN',{tool:'tunnel__write_file',input:{path:'plan-forbidden.txt',content:'bad'}});await idle(card)
     assert.ok(!fs.existsSync(path.join(card.cwd,'plan-forbidden.txt')));await f.cli('config','plan',currentId,'off')
     await rpc('workspace.write',{employee:card.id,path:'cloud-image.png',contentBase64:png,create:true})
     await send(card,'CLINE_CLOUD_IMAGE_NATIVE',{images:['cloud-image.png']});await idle(card)
     assert.ok(!await error(card),await error(card));assert.ok(hasImage(requests.filter(r=>r.scenario===scenario.name)))
    }
    console.log('PASS installed '+engine+': cloud MCP tools only, actual deny/allow, remote-file result and remote command cancellation, loopback model/SSH fixture only')
   }
   await f.cli('session','close',(await f.status(card.id)).sessionId)
  }
 }
 assert.ok(requests.every(r=>r.body.model==='deepseek-flash'&&(r.body.reasoning_effort==='none'||r.body.thinking?.type==='disabled')),'Thinking off and model selection are preserved on the wire')
 console.log('PASS installed-engine verification; '+requests.length+' deterministic loopback model requests; no paid calls or real hosts')
}finally{if(process.env.AGENTS_TEST_KEEP){await f.stop();console.log('FIXTURE_STATE '+f.temp)}else await f.close();model.closeAllConnections();await new Promise(resolve=>model.close(resolve));fs.rmSync(temp,{recursive:true,force:true})}
