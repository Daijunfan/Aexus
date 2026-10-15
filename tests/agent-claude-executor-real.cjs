// Actual official Claude Code tool implementations; no inference, native read-state checks.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process'),{randomBytes}=require('node:crypto');
const cli=process.env.CLOUD_HOSTS_CLAUDE_TEST_BIN||require('../src/agent-hosts.cjs').binary('claude');
const temp=fs.mkdtempSync('/tmp/cloudhosts-claude-tools-'),work=path.join(temp,'work'),plugin=path.join(temp,'plugin'),profile=path.join(temp,'profile');
for(const p of [work,profile,path.join(plugin,'.claude-plugin'),path.join(plugin,'hooks')])fs.mkdirSync(p,{recursive:true});
fs.writeFileSync(path.join(plugin,'.claude-plugin/plugin.json'),JSON.stringify({name:'native-executor',version:'0.0.1'}));
fs.writeFileSync(path.join(plugin,'hooks/hooks.json'),JSON.stringify({modules:['./register.js']}));
fs.copyFileSync(path.join(__dirname,'../Runtime/claude_executor_mod.mjs'),path.join(plugin,'hooks/register.js'));
const token=randomBytes(32).toString('hex'),queue=[],pending=new Map();let sequence=0,waiting,ready,child,output='',providerRequests=[];
const attached=new Promise(resolve=>ready=resolve);
function dispatch(){if(waiting&&queue.length){const res=waiting;waiting=undefined;res.end(JSON.stringify(queue.shift()))}}
const server=http.createServer(async(req,res)=>{
 if(req.url.startsWith('/disabled-provider')){providerRequests.push({url:req.url,method:req.method});res.writeHead(403).end('This native execution worker cannot make model requests');return}
 if(req.headers.authorization!=='Bearer '+token){res.writeHead(403).end();return}
 if(req.url==='/next'){
  waiting=res;const timer=setTimeout(()=>{if(waiting===res){waiting=undefined;res.end('{}')}},15000);
  res.on('close',()=>{clearTimeout(timer);if(waiting===res)waiting=undefined});dispatch();return;
 }
 let body='';for await(const data of req)body+=data;
 const value=JSON.parse(body);
 if(req.url==='/ready')ready(value);
 if(req.url==='/result'){pending.get(value.id)?.(value.result);pending.delete(value.id)}
 res.end('{}');
});
const call=tool=>new Promise(resolve=>{const id=++sequence;pending.set(id,resolve);queue.push({id,tool});dispatch()});
(async()=>{try{
 const version=execFileSync(cli,['--version'],{encoding:'utf8'});assert.match(version,/\d+\.\d+\.\d+/);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 const env={...process.env,CLAUDE_CONFIG_DIR:profile,DISABLE_NONESSENTIAL_TRAFFIC:'1',CLOUD_HOSTS_EXEC_URL:url,CLOUD_HOSTS_EXEC_TOKEN:token};
 const settings={env:{ANTHROPIC_BASE_URL:url+'/disabled-provider',ANTHROPIC_API_KEY:'native-tools-only',ANTHROPIC_AUTH_TOKEN:'native-tools-only'}};
 child=spawn(cli,['-p','/native-executor','--plugin-dir',plugin,'--no-session-persistence','--settings',JSON.stringify(settings),'--allowedTools','Read,Write,Edit,Bash,NotebookEdit'],{cwd:work,env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',data=>output=(output+data).slice(-3000));child.stderr.on('data',data=>output=(output+data).slice(-3000));
 let timer;const info=await Promise.race([attached,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Native executor did not attach: '+output)),15000)})]).finally(()=>clearTimeout(timer));
 assert.ok(info.tools.some(tool=>tool.name==='Read'));assert.ok(providerRequests.every(request=>!request.url.includes('/messages')),JSON.stringify(providerRequests));
 const file=path.join(work,'proof.txt');
 const write=await call({tool:'Write',file_path:file,content:'ORIGINAL_NATIVE_PROOF\n'});assert.equal(write.result.type,'create',JSON.stringify(write));
 const read=await call({tool:'Read',file_path:file});assert.match(read.result.file.content,/ORIGINAL_NATIVE_PROOF/);
 const edit=await call({tool:'Edit',file_path:file,old_string:'ORIGINAL_NATIVE_PROOF',new_string:'ORIGINAL_NATIVE_CHANGED'});assert.equal(edit.result.newString,'ORIGINAL_NATIVE_CHANGED',JSON.stringify(edit));
 const shell=await call({tool:'Bash',command:'cat proof.txt; pwd'});assert.match(shell.result.stdout,/ORIGINAL_NATIVE_CHANGED/);
 fs.writeFileSync(file,'EXTERNAL_EDIT\n');
 const stale=await call({tool:'Edit',file_path:file,old_string:'EXTERNAL_EDIT',new_string:'must not overwrite'});assert.equal(stale.result.staleRecovered,true,JSON.stringify(stale));
 assert.match(stale.text,/modified on disk/);
 const mismatch=await call({tool:'Edit',file_path:file,old_string:'ORIGINAL_NATIVE_CHANGED',new_string:'wrong'});
 assert.ok(mismatch.isError||mismatch.deny,JSON.stringify(mismatch));
 assert.equal(fs.readFileSync(file,'utf8'),'must not overwrite\n');assert.ok(providerRequests.every(request=>!request.url.includes('/messages')),JSON.stringify(providerRequests));
 console.log('PASS original Claude Read/Write/Edit/Bash, native structured results and read-version protection; zero inference requests; provider preflights remain blocked');
 }finally{if(child){child.kill('SIGTERM');await new Promise(resolve=>child.exitCode!==null?resolve():child.once('close',resolve))}server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
