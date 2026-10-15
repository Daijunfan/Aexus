// Prototype acceptance: original Mac Cline TUI/Core and target SDK. Not yet enabled in Agent creation.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const temp=fs.mkdtempSync('/tmp/cloudhosts-cline-hub-');
Object.assign(process.env,{CLOUD_HOSTS_HOME:path.join(temp,'core'),CLINE_DIR:path.join(temp,'profile'),CLINE_DATA_DIR:path.join(temp,'profile/data'),CLINE_HUB_DISCOVERY_PATH:path.join(temp,'hub.json'),CLINE_HUB_BUILD_ID:'cloudhosts-native-sdk-probe',CLINE_HUB_LOG_LEVEL:'error'});
const sdkFile=require('node:url').pathToFileURL(path.resolve(__dirname,'../Runtime/cline_sdk.mjs')).href;
const control=path.join(temp,'control');fs.mkdirSync(control);
fs.writeFileSync(path.join(control,'proof.txt'),'LOCAL_SHOULD_NOT_READ');
const project=path.resolve(__dirname,'..');
const registry=require(project+'/src/registry.cjs'),ssh=require(project+'/src/ssh.cjs'),{ClineWorker}=require(project+'/src/agent-cline-worker.cjs');
const target=registry.create({name:'Native Cline work',host:'bupt208',os:'linux',defaultDirectory:'/tmp'}),work='/tmp/'+path.basename(temp)+'-work';
const requests=[],turns=[['editor',{path:work+'/second.txt',new_text:'NATIVE_TOOLCHAIN_PROOF\n'}],['read_files',{files:[{path:work+'/second.txt'}]}],['search_codebase',{queries:['NATIVE_TOOLCHAIN_PROOF']}],['run_commands',{commands:['cat second.txt; pwd']}],['editor',{path:work+'/second.txt',old_text:'NATIVE_TOOLCHAIN_PROOF',new_text:'NATIVE_TOOLCHAIN_CHANGED'}],['read_files',{files:[{path:work+'/second.txt'}]}]];
const model=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;if(req.method!=='POST'){res.writeHead(200,{'content-type':'application/json'}).end('{"data":[]}');return}const body=JSON.parse(raw);requests.push(body);const turn=turns[requests.length-1],tool=!turn;const delta=turn?{role:'assistant',tool_calls:[{index:0,id:'probe-'+requests.length,type:'function',function:{name:turn[0],arguments:JSON.stringify(turn[1])}}]}:{role:'assistant',content:'NATIVE_HUB_DONE'};res.writeHead(200,{'content-type':'text/event-stream'});for(const[d,f]of [[delta,null],[{},tool?'stop':'tool_calls']])res.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:'native-fixture',choices:[{index:0,delta:d,finish_reason:f}]})+'\n\n');res.end('data: [DONE]\n\n')});
(async()=>{let core,hub,store,terminal,executor;const terminals=require('../src/terminals.cjs');try{
 assert.equal((await ssh.execute(target.id,'hostname','/tmp',20)).stdout.trim(),'gpubupt208');
 assert.equal((await ssh.execute(target.id,'mkdir -p '+ssh.quote(work)+'; printf REMOTE_NATIVE_EXECUTOR_PROOF > '+ssh.quote(work+'/proof.txt'),'/tmp',20)).exit_code,0);
 executor=new ClineWorker(target.id,work);const remote=await executor.request('initialize');
 await new Promise(r=>model.listen(0,'127.0.0.1',r));
 const settings=path.join(process.env.CLINE_DATA_DIR,'settings');fs.mkdirSync(settings,{recursive:true});
 const baseUrl='http://127.0.0.1:'+model.address().port+'/v1';
 const provider={provider:'openai-compatible',model:'native-fixture',apiKey:'fixture-only',baseUrl};
 fs.writeFileSync(path.join(settings,'providers.json'),JSON.stringify({version:1,lastUsedProvider:'openai-compatible',modes:{},providers:{'openai-compatible':{settings:provider,updatedAt:new Date().toISOString(),tokenSource:'manual'}}}));
 fs.writeFileSync(path.join(settings,'models.json'),JSON.stringify({version:1,providers:{'openai-compatible':{models:{'native-fixture':{id:'native-fixture',name:'Native Fixture'}}}}}));
 const {sdk}=await import(sdkFile);store=new sdk.SqliteSessionStore();store.init();
 const methods=Object.fromEntries(remote.methods.map(name=>[name,(...args)=>{const ctx=args.pop();if(name!=='readFile'&&name!=='webFetch')args[1]=work;return executor.request(name,args,{agentId:ctx.agentId,iteration:ctx.iteration,toolCallId:ctx.toolCallId,cwd:work},ctx.emitUpdate,ctx.signal)}]));
 const originalBuilder=new sdk.DefaultRuntimeBuilder();
 const builder={async build(input){
  input.config.systemPrompt=sdk.getClineDefaultSystemPrompt({...input.config.extensionContext?.workspace,rootPath:work,cwd:work,platform:remote.platform,providerId:input.config.providerId,mode:input.config.mode||'act',metadata:undefined});
  input.config.workspaceMetadata='';
  return originalBuilder.build(input);
 }};
 const host=new sdk.LocalRuntimeHost({sessionService:new sdk.CoreSessionService(store),runtimeBuilder:builder,capabilities:{toolExecutors:methods}});
 hub=await sdk.startHubWebSocketServer({host:'127.0.0.1',port:0,owner:{ownerId:'route-probe',discoveryPath:process.env.CLINE_HUB_DISCOVERY_PATH},workspaceRoot:control,sessionHost:host,runtimeHandlers:sdk.createLocalHubScheduleRuntimeHandlers(),eventLog:false,runQueue:false});
 core=await sdk.ClineCore.create({backendMode:'hub',hub:{endpoint:hub.url,authToken:hub.authToken,workspaceRoot:control},automation:{autoStart:false}});
 const session=await core.start({source:'cli',interactive:true,config:{cwd:control,providerId:'openai-compatible',modelId:'native-fixture',apiKey:'fixture-only',baseUrl,providerConfig:provider,enableTools:true,enableSpawnAgent:false,enableAgentTeams:false}});
 terminal=terminals.openTerminal({id:'probe',cwd:control},110,30,{kind:'agent',engine:'cline',command:'cline',executable:require('../src/agent-hosts.cjs').binary('cline'),args:['--id',session.sessionId,'--tui']});
 let screen='';const ready=Date.now()+20000;while(Date.now()<ready){screen=(await terminals.read(terminal.id,0)).output;if(screen.includes('Ask anything'))break;await new Promise(r=>setTimeout(r,150))}
 assert.match(screen,/Ask anything/);assert.equal(requests.length,0);
 await terminals.input(terminal.id,'Read proof.txt.');await new Promise(r=>setTimeout(r,180));await terminals.input(terminal.id,'\r');
 const done=Date.now()+20000;while(Date.now()<done&&requests.length<turns.length+1)await new Promise(r=>setTimeout(r,100));
 console.log(JSON.stringify({requests:requests.length,tools:turns.map(t=>t[0])}));
 fs.writeFileSync('/tmp/cloudhosts-cline-hub-screen.txt',(await terminals.read(terminal.id,0)).output);
 assert.equal(requests.length,turns.length+1);
 const results=requests.at(-1).messages.filter(m=>m.role==='tool').map(m=>JSON.parse(m.content)).flat();
 assert.ok(results.every(result=>result.success!==false),JSON.stringify(results));
 assert.ok(JSON.stringify(results).includes('NATIVE_TOOLCHAIN_CHANGED'));
 await new Promise(r=>setTimeout(r,500));
 await terminals.close(terminal.id);
 const before=requests.length;
 terminal=terminals.openTerminal({id:'probe',cwd:control},110,30,{kind:'agent',engine:'cline',command:'cline',executable:require('../src/agent-hosts.cjs').binary('cline'),args:['--id',session.sessionId,'--tui']});
 const resumed=Date.now()+15000;let restored='';while(Date.now()<resumed){restored=(await terminals.read(terminal.id,0)).output;if(restored.includes('NATIVE_HUB_DONE'))break;await new Promise(r=>setTimeout(r,150))}
 assert.ok(restored.includes('NATIVE_HUB_DONE'),'Original native TUI must show its previous task after reconnect');
 assert.equal(requests.length,before,'Reattachment must not start a model turn');
 assert.ok(!JSON.stringify(requests).includes('LOCAL_SHOULD_NOT_READ'),'No original local tool fallback');
 assert.ok(!JSON.stringify(requests).includes(control),'No controller work directory in native model context');
 assert.match(JSON.stringify(requests[0]),/Platform: linux/);
 console.log('PASS original Mac Cline TUI/Core to original Linux executors, native read/write/edit/search/command, same-history TUI reconnect, native target metadata, no routing prompt or source read');
 }finally{await terminals.shutdown();await hub?.close();await core?.dispose('probe');executor?.close();await ssh.execute(target.id,'rm -rf -- '+ssh.quote(work),'/tmp',20);model.closeAllConnections();await new Promise(r=>model.close(r));fs.rmSync(temp,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
