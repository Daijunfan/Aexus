#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {createInterface} from 'node:readline/promises'
import {createNodeClient} from '../../Contract/node-client.mjs'
const args=process.argv.slice(2),commands=['start','status','list','answer','resume','cancel','export'],command=commands.includes(args[0])?args.shift():'start',options={},positionals=[]
for(let i=0;i<args.length;i++){const value=args[i];if(!value.startsWith('--')){positionals.push(value);continue}const key=value.slice(2);if(!['topic','engines','answer','out','request-id','json','wait','defaults'].includes(key))throw Error('Unknown option '+value);if(['json','wait','defaults'].includes(key))options[key]=true;else{if(args[i+1]===undefined)throw Error('Missing value for '+value);options[key]=args[++i]}}
const client=createNodeClient(),readJSON=value=>JSON.parse(value.startsWith('@')?fs.readFileSync(value.slice(1),'utf8'):value),call=(name,value={})=>client.invoke('workflow.'+name,value),sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function exportFiles(job,target){
 if(job.status!=='completed')throw Error('Workflow has no approved final delivery')
 const output=path.resolve(target)
 if(fs.existsSync(output))throw Error('Output already exists; no file was overwritten: '+output)
 const files=[]
 for(const entry of job.files){const file=await call('file',{id:job.id,name:entry.name});if(createHash('sha256').update(file.content).digest('hex')!==entry.sha256)throw Error('Final file integrity mismatch');files.push(file)}
 fs.mkdirSync(output,{recursive:false})
 const written=[]
 try{for(const file of files){const target=path.join(output,file.name);fs.writeFileSync(target,file.content,{flag:'wx'});written.push(target)}}catch(error){for(const file of written)fs.rmSync(file);fs.rmdirSync(output);throw error}
 return {directory:output,files:job.files}
}
async function follow(job){
 const interactive=!!process.stdin.isTTY&&!options.json,terminal=interactive?createInterface({input:process.stdin,output:process.stderr}):null
 try{
  while(!['completed','failed','cancelled'].includes(job.status)){
   if(job.status==='waiting'){
    if(!interactive&&!options.defaults)return job
    const values={}
    if(interactive)for(const q of job.summary.questions??[]){const answer=await terminal.question('\n'+q.prompt+'\n建议：'+q.recommended+'\n回答（回车采用建议）：');values[q.id]=answer||q.recommended}
    job=await call('respond',{id:job.id,expectedRevision:job.revision,answer:{values},clientRequestId:randomUUID()})
   }
   await sleep(750);job=await call('get',{id:job.id})
  }
  return job
 }finally{terminal?.close()}
}
try{
 let result
 if(command==='list')result=await call('list',{engineId:'deep-research'})
 else if(command==='start'){
  const topic=options.topic??positionals.join(' ');if(!topic)throw Error('Usage: node Engine/deep-research/cli.mjs start --topic "调研任务" [--engines codex,claude] [--wait] [--out DIRECTORY]')
  const input={topic,...(options.engines?{engines:String(options.engines).split(',').map(engine=>({engine:engine.trim()}))}:{})}
  result=await call('start',{engineId:'deep-research',input,clientRequestId:options['request-id']??randomUUID()})
 }else{
  const id=positionals[0];if(!id)throw Error('Provide a workflow ID')
  const job=await call('get',{id});if(job.engineId!=='deep-research')throw Error('Workflow belongs to another Engine')
  if(command==='status')result=job
  if(command==='cancel')result=await call('cancel',{id})
  if(command==='answer')result=await call('respond',{id,expectedRevision:job.revision,answer:options.answer?readJSON(options.answer):{values:{}},clientRequestId:options['request-id']??randomUUID()})
  if(command==='resume')result=await call('resume',{id,expectedRevision:job.revision,clientRequestId:options['request-id']??randomUUID()})
  if(command==='export'){if(!options.out)throw Error('export requires --out DIRECTORY');result=await exportFiles(job,options.out)}
 }
 if(result?.id&&(options.wait||options.defaults||process.stdin.isTTY&&!options.json&&command==='start'))result=await follow(result)
 if(result?.status==='completed'&&options.out)result={...result,delivery:await exportFiles(result,options.out)}
 console.log(JSON.stringify({ok:true,data:result},null,options.json?0:2))
 if(result?.status==='failed'||result?.status==='cancelled')process.exitCode=1
}catch(error){console.error(JSON.stringify({ok:false,error:error.message,code:error.code??'RESEARCH_ERROR'}));process.exitCode=1}
