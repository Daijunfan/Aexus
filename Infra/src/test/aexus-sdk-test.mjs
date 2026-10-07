// Disposable CLI transport fixture: no Core, model, credentials or production filesystem access.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {createNodeClient} from '../../../Contract/node-client.mjs'
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-sdk-')),cli=path.join(directory,'cli with spaces.mjs'),log=path.join(directory,'requests.jsonl'),checks=[]
const ok=(value,label)=>{assert.ok(value,label);checks.push(label);console.log('PASS '+label)}
fs.writeFileSync(cli,`
import fs from 'node:fs';
const args=process.argv.slice(2),mode=process.env.AEXUS_FIXTURE_MODE,record=process.env.AEXUS_FIXTURE_LOG;
fs.appendFileSync(record,JSON.stringify({args,identity:process.env.AGENTS_COMPANY_EMPLOYEE})+'\\n');
if(args[0]==='session'){
 console.log(JSON.stringify({type:'snapshot',following:args[args.indexOf('--employee')+1],transcript:[]}));
 if(mode==='bad-stream'){console.log('broken json');process.exit(0)}
 if(mode==='hold-stream')setInterval(()=>{},1000);
}else{
 if(mode==='early-close'){process.exit(4)}
 const input=JSON.parse(fs.readFileSync(0,'utf8'));
 if(mode==='timeout'){setTimeout(()=>{},5000)}
 else if(mode==='null'){console.log('null')}
 else if(mode==='invalid'){console.log('not JSON')}
 else if(mode==='denied'){console.log(JSON.stringify({ok:false,error:'Not allowed',code:'FORBIDDEN'}));process.exitCode=1}
 else if(args[2]==='contract.describe'){console.log(JSON.stringify({ok:true,data:{command:{name:'session.follow',transport:'stream'}}}))}
 else console.log(JSON.stringify({ok:true,data:{contractVersion:mode==='mismatch'?'2.0.0':'1.0.0',command:input.command,data:input.args}}));
}
`)
const client=(mode='valid',extra={})=>createNodeClient({cli,env:{...process.env,AGENTS_COMPANY_EMPLOYEE:'original-employee',AEXUS_FIXTURE_MODE:mode,AEXUS_FIXTURE_LOG:log},...extra})
const count=()=>fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).length:0
try{
 const payload={text:'Unicode 中文 with literal $(do-not-run) ; " quotes\n'.repeat(5000),count:3}
 assert.deepEqual(await client().invoke('chat.send',payload),payload)
 const seen=JSON.parse(fs.readFileSync(log,'utf8').split('\n')[0]);assert.equal(seen.identity,'original-employee');assert.deepEqual(seen.args,['api','call','contract.call','--args','@-','--json'])
 assert.deepEqual(await client('valid',{launcher:[process.execPath,cli]}).invoke('group.list',{identity:'same'}),{identity:'same'});assert.throws(()=>client('valid',{launcher:[]}),e=>e.code==='CONTRACT_REQUEST_INVALID')
 ok(true,'Large mixed-language JSON uses stdin and preserves the assigned employee; paths with spaces require no shell')
 for(const [mode,code] of [['null','CONTRACT_TRANSPORT_ERROR'],['invalid','CONTRACT_TRANSPORT_ERROR'],['denied','FORBIDDEN'],['mismatch','CONTRACT_RESPONSE_INVALID'],['early-close','CONTRACT_TRANSPORT_ERROR'],['timeout','CONTRACT_TRANSPORT_ERROR']]){
  const before=count();await assert.rejects(client(mode,{timeout:mode==='timeout'?150:3000}).invoke('chat.send',{text:'x'.repeat(500000)}),e=>e.code===code);assert.equal(count(),before+1,mode+' must not automatically retry a mutation')
 }
 ok(true,'Malformed/null responses, original denial, version mismatch, closed stdin and timeout become typed errors without automatic mutation retries')
 const cycle={};cycle.self=cycle;const before=count();await assert.rejects(client().invoke('chat.send',cycle),e=>e.code==='CONTRACT_REQUEST_INVALID');assert.equal(count(),before)
 await assert.rejects(createNodeClient({cli:path.join(directory,'missing.mjs'),timeout:3000}).invoke('group.list'),e=>e.code==='CONTRACT_TRANSPORT_ERROR')
 ok(true,'Invalid JSON arguments do not start a process; missing CLI paths reject without crashing the caller')
 const events=[];for await(const event of client().follow('employee with spaces'))events.push(event)
 assert.deepEqual(events,[{type:'snapshot',following:'employee with spaces',transcript:[]}])
 await assert.rejects(async()=>{for await(const event of client('bad-stream').follow('e'))void event},e=>e.code==='CONTRACT_TRANSPORT_ERROR')
 const abort=new AbortController();let snapshots=0
 for await(const event of client('hold-stream').follow('e',{signal:abort.signal})){assert.equal(event.type,'snapshot');snapshots++;abort.abort()}
 assert.equal(snapshots,1)
 const early=new AbortController();early.abort();const after=count();await assert.rejects(async()=>{for await(const event of client().follow('e',{signal:early.signal}))void event},e=>e.name==='AbortError');assert.equal(count(),after)
 ok(true,'Original snapshots, malformed stream data and explicit cancellation terminate without duplicate subscriptions or fabricated completion events')
 const out=path.resolve(import.meta.dirname,'../../../.aexus/artifacts/aexus-architecture/closeout');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'sdk.json'),JSON.stringify({passed:true,checks,processes:count(),paidModels:0},null,2))
}finally{fs.rmSync(directory,{recursive:true,force:true})}
