// Real Mac Claude model loop + original tools over SSH. Model replies are local fixtures.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const temp=fs.mkdtempSync('/tmp/cloudhosts-claude-route-'),control=path.join(temp,'controller'),profile=path.join(temp,'profile');
fs.mkdirSync(control);fs.mkdirSync(profile);process.env.CLOUD_HOSTS_HOME=path.join(temp,'core');
const registry=require('../src/registry.cjs'),ssh=require('../src/ssh.cjs'),route=require('../src/agent-claude-route.cjs');
const host=registry.create({name:'Native work',host:'bupt208',os:'linux',defaultDirectory:'/tmp'}),work='/tmp/'+path.basename(temp)+'-work';
const requests=[],metadataRequests=[],turns=[['Write',{file_path:work+'/proof.txt',content:'ORIGINAL_CLAUDE_PROOF\n'}],['Read',{file_path:work+'/proof.txt'}],
 ['Edit',{file_path:work+'/proof.txt',old_string:'ORIGINAL_CLAUDE_PROOF',new_string:'ORIGINAL_CLAUDE_CHANGED'}],['Bash',{command:'cat proof.txt; pwd'}]];
const model=http.createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;
 if(!/^\/v1\/messages(?:\?|$)/.test(req.url)){res.writeHead(200,{'content-type':'application/json'}).end('{}');return}
 const body=JSON.parse(raw),main=body.tools?.some(tool=>tool.name==='Write');
 (main?requests:metadataRequests).push(body);const turn=main?turns[requests.length-1]:undefined,id='native-'+requests.length+'-'+metadataRequests.length;
 res.writeHead(200,{'content-type':'text/event-stream'});
 const event=(type,value)=>res.write('event: '+type+'\ndata: '+JSON.stringify({type,...value})+'\n\n');
 event('message_start',{message:{id,type:'message',role:'assistant',model:body.model,content:[],stop_reason:null,stop_sequence:null,usage:{input_tokens:100,output_tokens:1}}});
 event('content_block_start',{index:0,content_block:turn?{type:'tool_use',id,name:turn[0],input:{}}:{type:'text',text:''}});
 event('content_block_delta',{index:0,delta:turn?{type:'input_json_delta',partial_json:JSON.stringify(turn[1])}:{type:'text_delta',text:main?'ORIGINAL_CLAUDE_DONE':'Native route QA'}});
 event('content_block_stop',{index:0});event('message_delta',{delta:{stop_reason:turn?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:10}});event('message_stop',{});res.end();
});
(async()=>{let bridge,child;try{
 assert.equal((await ssh.execute(host.id,'hostname','/tmp',20)).stdout.trim(),'gpubupt208');
 assert.equal((await ssh.execute(host.id,'mkdir -p -- '+ssh.quote(work),'/tmp',20)).exit_code,0);
 await new Promise(resolve=>model.listen(0,'127.0.0.1',resolve));
 bridge=await route.open({targetHostId:host.id,cwd:work},{controlCwd:control});
 const workInfo=await (await fetch(bridge.environment.CLOUD_HOSTS_ROUTE_URL,{method:'POST',headers:{authorization:'Bearer '+bridge.environment.CLOUD_HOSTS_ROUTE_TOKEN},body:JSON.stringify({operation:'environment'})})).json();
 assert.equal(workInfo.result.platform,'linux');
 const settings={model:'native-fixture',env:{ANTHROPIC_BASE_URL:'http://127.0.0.1:'+model.address().port,ANTHROPIC_API_KEY:'fixture-only',ANTHROPIC_AUTH_TOKEN:'fixture-only'}};
 const args=['-p','Perform the requested file operations and finish.','--session-id',randomUUID(),'--settings',JSON.stringify(settings),
  '--allowedTools','Read,Write,Edit,Bash','--tools','Read,Write,Edit,Bash','--output-format','stream-json','--verbose',...bridge.args];
 child=spawn(require('../src/agent-hosts.cjs').binary('claude'),args,{cwd:control,env:{...process.env,...bridge.environment,CLAUDE_CONFIG_DIR:profile,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'},stdio:['ignore','pipe','pipe']});
 let output='',error='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk);
 const deadline=setTimeout(()=>child.kill('SIGTERM'),40000);
 const exit=await new Promise(resolve=>child.once('close',resolve));clearTimeout(deadline);
 fs.writeFileSync('/tmp/cloudhosts-claude-route-output.jsonl',output);fs.writeFileSync('/tmp/cloudhosts-claude-route-errors.log',error);
 assert.equal(exit,0,error+'\n'+output.slice(-2000));assert.equal(requests.length,turns.length+1);
 const results=requests.at(-1).messages.flatMap(message=>Array.isArray(message.content)?message.content:[]).filter(block=>block.type==='tool_result');
 assert.equal(results.length,turns.length);assert.ok(results.every(result=>!result.is_error),JSON.stringify(results));
 const content=await ssh.files(host.id,'native_io',{operation:'read',args:{path:'proof.txt'}},work);
 assert.equal(Buffer.from(content.data,'base64').toString(),'ORIGINAL_CLAUDE_CHANGED\n');assert.equal(fs.existsSync(path.join(control,'proof.txt')),false);
 const first=JSON.stringify({system:requests[0].system,messages:requests[0].messages});
 if(first.includes(control)||first.includes(fs.realpathSync(control)))fs.writeFileSync('/tmp/cloudhosts-claude-route-first.json',JSON.stringify({system:requests[0].system,messages:requests[0].messages},null,2));
 assert.ok(!first.includes(control)&&!first.includes(fs.realpathSync(control)),'Controller directory must not enter model context');
 assert.ok(first.includes(work),'The native model sees the work directory');
 assert.doesNotMatch(first,/cloud_docs|cloud_api|CLOUD_HOSTS_|native-execution|via SSH|routing instructions/);
 console.log('PASS original Mac Claude model loop to original Linux Read/Write/Edit/Bash; native schemas and results, target-only effects, unchanged task, native work metadata, no routing prompt');
 }finally{child?.kill('SIGTERM');await bridge?.close();await ssh.execute(host.id,'rm -rf -- '+ssh.quote(work),'/tmp',20);model.closeAllConnections();await new Promise(resolve=>model.close(resolve));fs.rmSync(temp,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
