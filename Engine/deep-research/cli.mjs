#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {createInterface} from 'node:readline/promises'
import {createNodeClient} from '../../Contract/node-client.mjs'
if(process.argv.includes('--help')||process.argv.includes('-h')){
 console.log(`Deep Research 1.5.0
Usage: node Engine/deep-research/cli.mjs COMMAND [WORKFLOW_ID] [OPTIONS]
Commands: prepare, start, status, list, answer, pause, amend, resume, cancel, fork, export
Start: --topic TEXT --engines codex,claude --depth standard|deep|exhaustive
       --source-policy JSON|@file --materials JSON|@file --language zh-CN|en
       --attachments JSON_ARRAY_OF_EXPLICIT_FILE_PATHS|@file
Prepare: --attachments JSON_ARRAY_OF_EXPLICIT_FILE_PATHS|@file --json
Follow-up: fork WORKFLOW_ID --topic TEXT [--reuse-materials]
Export: export WORKFLOW_ID --out NEW_DIRECTORY [--format pdf|docx|all]
Control: --answer JSON|@file, --update JSON|@file, --request-id ID
Output: --json --wait --defaults --out NEW_DIRECTORY
Pause saves a checkpoint. Amend requires a paused workflow; resume is explicit.
--defaults authorizes each clarification using its recommended answers.
Background materials are sent to the configured models after scope confirmation.`)
 process.exit(0)
}
const args=process.argv.slice(2),commands=['prepare','start','status','list','answer','resume','pause','amend','cancel','fork','export'],command=commands.includes(args[0])?args.shift():'start',options={},positionals=[]
for(let i=0;i<args.length;i++){const value=args[i];if(!value.startsWith('--')){positionals.push(value);continue}const key=value.slice(2);if(!['topic','engines','answer','depth','source-policy','materials','language','update','out','request-id','json','wait','defaults','attachments','format','reuse-materials'].includes(key))throw Error('Unknown option '+value);if(['json','wait','defaults','reuse-materials'].includes(key))options[key]=true;else{if(args[i+1]===undefined)throw Error('Missing value for '+value);options[key]=args[++i]}}
const client=createNodeClient({engineId:'deep-research'}),readJSON=value=>JSON.parse(value.startsWith('@')?fs.readFileSync(value.slice(1),'utf8'):value),call=(name,value={})=>client.invoke('workflow.'+name,value),sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function preparedAttachments(){
 if(!options.attachments)throw Error('prepare requires --attachments JSON array or @file')
 const names=readJSON(options.attachments)
 if(!Array.isArray(names)||!names.length||names.length>6||names.some(name=>typeof name!=='string'||!name.trim()))throw Error('Provide 1–6 explicit file paths')
 let total=0
 const files=names.map(name=>{
  const file=path.resolve(name),stat=fs.statSync(file)
  if(!stat.isFile()||!stat.size||stat.size>4*1024*1024||(total+=stat.size)>4*1024*1024)throw Error('Attachments must be regular files, at most 4 MiB in total')
  return {name:path.basename(file),encoding:'base64',content:fs.readFileSync(file).toString('base64')}
 })
 return call('prepare',{engineId:'deep-research',input:{files}})
}
function verifiedFile(file){
 if(file.encoding!==undefined&&!['utf8','base64'].includes(file.encoding))throw Error('Unsupported final file encoding')
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(file.name))throw Error('Invalid final filename')
 const bytes=Buffer.from(file.content,file.encoding==='base64'?'base64':'utf8')
 if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Final file integrity mismatch')
 return {...file,data:bytes}
}
async function exportFiles(job,target){
 if(job.status!=='completed')throw Error('Workflow has no approved final delivery')
 const output=path.resolve(target),format=options.format
 if(format&&!['pdf','docx','all'].includes(format))throw Error('Export format must be pdf, docx or all; omit for the three original final files')
 if(fs.existsSync(output))throw Error('Output already exists; no file was overwritten: '+output)
 const files=[]
 if(!format||format==='all')for(const entry of job.files)files.push(verifiedFile(await call('file',{id:job.id,name:entry.name})))
 for(const alternate of format==='all'?['docx','pdf']:format?[format]:[])files.push(verifiedFile(await call('export',{id:job.id,format:alternate})))
 fs.mkdirSync(output,{recursive:false})
 const written=[]
 try{for(const file of files){const target=path.join(output,file.name);fs.writeFileSync(target,file.data,{flag:'wx'});written.push(target)}}catch(error){for(const file of written)fs.rmSync(file);fs.rmdirSync(output);throw error}
 return {directory:output,files:files.map(({content,data,...file})=>file)}
}

async function follow(job){
 const interactive=!!process.stdin.isTTY&&!options.json,terminal=interactive?createInterface({input:process.stdin,output:process.stderr}):null
 try{
  while(!['completed','failed','paused','cancelled'].includes(job.status)){
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
 if(command==='prepare')result=await preparedAttachments()
 else if(command==='list')result=await call('list',{engineId:'deep-research'})
 else if(command==='start'){
  const topic=options.topic??positionals.join(' ');if(!topic)throw Error('Usage: node Engine/deep-research/cli.mjs start --topic "调研任务" [--engines codex,claude] [--wait] [--out DIRECTORY]')
  const input={topic,...(options.depth?{depth:options.depth}:{}),...(options.language?{language:options.language}:{}),...(options['source-policy']?{sourcePolicy:readJSON(options['source-policy'])}:{}),...(options.materials?{materials:readJSON(options.materials)}:{}),...(options.engines?{engines:String(options.engines).split(',').map(engine=>({engine:engine.trim()}))}:{})}
  if(options.attachments)input.materials=[...(input.materials??[]),...(await preparedAttachments()).materials]
  result=await call('start',{engineId:'deep-research',input,clientRequestId:options['request-id']??randomUUID()})
 }else{
  const id=positionals[0];if(!id)throw Error('Provide a workflow ID')
  const job=await call('get',{id});if(job.engineId!=='deep-research')throw Error('Workflow belongs to another Engine')
  if(command==='status')result=job
  if(command==='fork'){if(!options.topic)throw Error('fork requires --topic TEXT');result=await call('fork',{id,expectedRevision:job.revision,input:{topic:options.topic,reuseMaterials:!!options['reuse-materials'],...(options.depth?{depth:options.depth}:{}),...(options.language?{language:options.language}:{}),...(options['source-policy']?{sourcePolicy:readJSON(options['source-policy'])}:{})},clientRequestId:options['request-id']??randomUUID()})}
  if(command==='pause')result=await call('pause',{id})
  if(command==='amend'){if(!options.update)throw Error('amend requires --update JSON or @file');result=await call('amend',{id,expectedRevision:job.revision,update:readJSON(options.update),clientRequestId:options['request-id']??randomUUID()})}
  if(command==='cancel')result=await call('cancel',{id})
  if(command==='answer')result=await call('respond',{id,expectedRevision:job.revision,answer:options.answer?readJSON(options.answer):{values:{}},clientRequestId:options['request-id']??randomUUID()})
  if(command==='resume')result=await call('resume',{id,expectedRevision:job.revision,clientRequestId:options['request-id']??randomUUID()})
  if(command==='export'){if(!options.out)throw Error('export requires --out DIRECTORY');result=await exportFiles(job,options.out)}
 }
 if(result?.id&&(options.wait||options.defaults||process.stdin.isTTY&&!options.json&&['start','fork'].includes(command)))result=await follow(result)
 if(result?.status==='completed'&&options.out)result={...result,delivery:await exportFiles(result,options.out)}
 console.log(JSON.stringify({ok:true,data:result},null,options.json?0:2))
 if(result?.status==='failed'||result?.status==='cancelled')process.exitCode=1
}catch(error){console.error(JSON.stringify({ok:false,error:error.message,code:error.code??'RESEARCH_ERROR'}));process.exitCode=1}
