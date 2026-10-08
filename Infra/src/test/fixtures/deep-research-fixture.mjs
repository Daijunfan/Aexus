// Disposable Core + real adapter lifecycle, deterministic native responses and public-page transport.
// The production Engine has no fixture switch. Test code only changes this child process's transports.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {fixtureCore} from './headless-core.mjs'
import {documents,material} from './deep-research-answer.mjs'
const root=path.resolve(import.meta.dirname,'../../../..')
export async function researchFixture({application,port}={}){
 const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'aexus-research-fixture-'))),control=path.join(temp,'control');fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'')
 const answer=pathToFileURL(path.join(import.meta.dirname,'deep-research-answer.mjs')).href
 let codex=fs.readFileSync(path.join(import.meta.dirname,'initialization-codex.cjs'),'utf8')
 codex=codex.replace('async function readWorkDocument(text){',`async function readWorkDocument(text){\n if(text.includes('[AEXUS_DEEP_RESEARCH_TASK]')){const value=await import(${JSON.stringify(answer)});fs.writeFileSync(path.join(control,employee+'.reply.txt'),JSON.stringify(value.reply(text,'codex')))}\n`)
 codex=codex.replace("if(!hidden&&!ack&&fs.existsSync(path.join(control,employee+'.hold-user')))return", "if(!hidden&&!ack&&(fs.existsSync(path.join(control,employee+'.hold-user'))||text.includes('[AEXUS_DEEP_RESEARCH_TASK]')&&fs.existsSync(path.join(control,'hold-research'))))return")
 const codexProtocol=path.join(temp,'codex-protocol.cjs');fs.writeFileSync(codexProtocol,codex)
 const binary=path.join(temp,'codex')
 fs.writeFileSync(binary,`#!${process.execPath}\nconst args=process.argv.slice(2);if(args.includes('--version')){console.log('codex deterministic-research-fixture');process.exit(0)}if(args[0]==='login'){console.log(JSON.stringify({loggedIn:true}));process.exit(0)}require(${JSON.stringify(codexProtocol)});\n`,{mode:0o755})
 const claudeBinary=path.join(temp,'claude')
 fs.writeFileSync(claudeBinary,`#!${process.execPath}\nconst args=process.argv.slice(2);if(args.includes('--version'))console.log('Claude deterministic-research-fixture');else if(args.includes('--help'))console.log('stream-json');else if(args[0]==='auth')console.log(JSON.stringify({loggedIn:true}));else process.exitCode=1;\n`,{mode:0o755})
 let sdk=fs.readFileSync(path.join(import.meta.dirname,'discussion-claude-sdk.mjs'),'utf8')
 sdk=`import {reply as researchReply} from ${JSON.stringify(answer)};\n`+sdk
 sdk=sdk.replace("while(!closed&&!interrupted&&fs.existsSync(file('.hold-user')))","while(!closed&&!interrupted&&(fs.existsSync(file('.hold-user'))||text.includes('[AEXUS_DEEP_RESEARCH_TASK]')&&fs.existsSync(path.join(control,'hold-research'))))")
 sdk=sdk.replace("   if(closed)return\n   if(!interrupted){", "   if(!hidden&&!ack&&text.includes('[AEXUS_DEEP_RESEARCH_TASK]'))response=JSON.stringify(researchReply(text,'claude'))\n   if(closed)return\n   if(!interrupted){")
 const sdkFile=path.join(temp,'claude-sdk.mjs');fs.writeFileSync(sdkFile,sdk);fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'))
 const pages=Object.fromEntries(documents.map(d=>[d.url,material(d.url)])),pageFile=path.join(control,'pages.json');fs.writeFileSync(pageFile,JSON.stringify(pages))
 const preload=path.join(temp,'pages.cjs')
 fs.writeFileSync(preload,`const fs=require('node:fs'),https=require('node:https'),dns=require('node:dns'),{EventEmitter}=require('node:events'),{Readable}=require('node:stream');
const nativeRequest=https.request,nativeLookup=dns.lookup,control=${JSON.stringify(control)},pages=JSON.parse(fs.readFileSync(${JSON.stringify(pageFile)},'utf8'));
const fake=host=>/^(alpha|beta|gamma)\\.research\\.test$/.test(host);
dns.lookup=function(host,options,callback){if(typeof options==='function'){callback=options;options={}}if(!fake(host))return nativeLookup.call(this,host,options,callback);queueMicrotask(()=>options?.all?callback(null,[{address:'93.184.216.34',family:4}]):callback(null,'93.184.216.34',4))};
https.request=function(value,options,callback){const url=new URL(value);if(!fake(url.hostname))return nativeRequest.call(this,value,options,callback);const req=new EventEmitter();let destroyed=false;req.setTimeout=()=>req;req.destroy=error=>{destroyed=true;if(error)queueMicrotask(()=>req.emit('error',error));return req};req.end=()=>{options.lookup(url.hostname,{all:true},error=>{if(error){req.destroy(error);return}if(destroyed)return;fs.appendFileSync(control+'/page-reads.jsonl',JSON.stringify({url:url.href,at:Date.now()})+'\\n');const body=pages[url.href],response=Readable.from([Buffer.from(body??'Not found')]);response.statusCode=fs.existsSync(control+'/fail-sources')?503:body?200:404;response.headers={'content-type':'text/html; charset=utf-8'};callback(response)})};if(options.signal){if(options.signal.aborted)req.destroy(options.signal.reason);else options.signal.addEventListener('abort',()=>req.destroy(options.signal.reason),{once:true})}return req};\n`)
 let f
 try{
  f=await fixtureCore({AC_INIT_FIXTURE:control,CODEX_BIN:binary,CLAUDE_BIN:claudeBinary,CLAUDE_CONFIG_DIR:path.join(temp,'claude-home'),NODE_OPTIONS:[process.env.NODE_OPTIONS??'','--require '+JSON.stringify(preload)].join(' '),...(port?{AGENTS_COMPANY_WEB:'1',AGENTS_COMPANY_WEB_PORT:String(port)}:{})},application?path.join(application,'.aexus/out/main/daemon.js'):undefined)
  const rpc=async(cmd,args={},auth=null)=>{const value=await f.request(auth,cmd,args);if(!value.ok)throw Object.assign(Error(value.error),{code:value.code});return value.data}
  await rpc('engine.configure',{engine:'claude',patch:{sdkPath:sdkFile}})
  const invoke=async(command,args={})=>(await rpc('contract.call',{version:'1.0.0',command,args})).data
  const wait=async(check,label,timeout=45000)=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,100))}throw Error('Timeout '+label)}
  const stage=async(id,phase)=>wait(async()=>{const job=await invoke('workflow.get',{id});if(job.status==='failed')throw Error(job.error);return job.summary.phase===phase&&['waiting','completed'].includes(job.status)?job:false},phase)
  return {f,control,temp,preload,invoke,rpc,wait,stage,close:async()=>{await f.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}}
 }catch(error){await f?.close();fs.rmSync(temp,{recursive:true,force:true});throw error}
}
