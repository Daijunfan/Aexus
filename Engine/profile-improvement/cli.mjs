#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {createNodeClient} from '../../Contract/node-client.mjs'
import {encodeBase64,inspectDocument} from './document.mjs'
import {startProfile,readWord} from './workflow.mjs'
import {layoutTools} from './layout.mjs'
const help=`Profile Improvement · Aexus Contract 1.0\n\nnode Engine/profile-improvement/cli.mjs run --resume ./resume.docx --targets "后端开发；测试开发" --output ./final\nnode Engine/profile-improvement/cli.mjs start --resume ./resume.docx --targets "后端开发" [--jd ./job.txt --engine pi --model ID --request-id KEY]\nnode Engine/profile-improvement/cli.mjs status WORKFLOW_ID\nnode Engine/profile-improvement/cli.mjs resume WORKFLOW_ID [--wait --output ./final]\nnode Engine/profile-improvement/cli.mjs cancel WORKFLOW_ID\nnode Engine/profile-improvement/cli.mjs download WORKFLOW_ID --output ./final\nnode Engine/profile-improvement/cli.mjs list\nnode Engine/profile-improvement/cli.mjs doctor\n\nrun waits for final files; start returns immediately. Ctrl+C stops watching, not the saved workflow. Downloads never overwrite files. No direct model provider or Infra-internal imports.\n`
function options(argv){const out={positional:[]};for(let i=0;i<argv.length;i++){const value=argv[i];if(!value.startsWith('--')){out.positional.push(value);continue}const key=value.slice(2);if(!['resume','targets','jd','engine','model','request-id','output','wait'].includes(key)||key in out)throw Error('Unknown or duplicate option: '+value);if(key==='wait')out[key]=true;else{const next=argv[++i];if(!next||next.startsWith('--'))throw Error(value+' requires a value');out[key]=next}}return out}
async function download(client,job,directory){
 if(job.status!=='completed'||!job.files.length)throw Error('任务尚未交付，不下载草稿。')
 const root=path.resolve(directory),files=[]
 for(const file of job.files){if(path.basename(file.name)!==file.name)throw Error('Invalid deliverable filename');const to=path.join(root,file.name);if(fs.existsSync(to))throw Error('文件已存在，拒绝覆盖：'+to);files.push({to,bytes:await readWord(client,job.id,file)})}
 fs.mkdirSync(root,{recursive:true});const created=[]
 try{for(const file of files){fs.writeFileSync(file.to,file.bytes,{flag:'wx',mode:0o600});created.push(file.to)}}catch(error){for(const file of created)fs.unlinkSync(file);throw error}
 return created
}
try{
 const [command,...argv]=process.argv.slice(2)
 if(!command||['help','--help','-h'].includes(command)){console.log(help);process.exit(0)}
 const args=options(argv),client=createNodeClient();let job
 if(command==='doctor'){const tools=layoutTools();console.log(JSON.stringify({ok:tools.ready,data:{...tools,dependencyInstallation:'npm --prefix Engine/profile-improvement ci'}},null,2));process.exit(tools.ready?0:1)}
 if(command==='list'){console.log(JSON.stringify({ok:true,data:await client.invoke('workflow.list',{engineId:'profile-improvement'})},null,2));process.exit(0)}
 if(['start','run'].includes(command)){
  if(!args.resume||!args.targets)throw Error('--resume and --targets are required')
  const stat=fs.statSync(args.resume);if(!stat.isFile()||stat.size>4*1024*1024)throw Error('Resume must be a DOCX file no larger than 4 MiB')
  const bytes=fs.readFileSync(args.resume),name=path.basename(args.resume);inspectDocument(bytes,name)
  const id=args['request-id']??randomUUID();console.error(JSON.stringify({clientRequestId:id,notice:'Keep this ID to retry the same submission after an unknown transport outcome.'}))
  job=await startProfile(client,{resume:{name,data:encodeBase64(bytes)},targets:args.targets,...(args.jd?{jobDescription:fs.readFileSync(args.jd,'utf8')}:{}),...(args.engine?{engine:args.engine}:{}),...(args.model?{model:args.model}:{})},id)
 }else{
  const id=args.positional[0];if(!id)throw Error('Workflow ID is required')
  job=await client.invoke('workflow.get',{id});if(job.engineId!=='profile-improvement')throw Error('This job belongs to a different Engine')
  if(command==='resume')job=await client.invoke('workflow.resume',{id,expectedRevision:job.revision,clientRequestId:args['request-id']??randomUUID()})
  else if(command==='cancel')job=await client.invoke('workflow.cancel',{id})
  else if(!['status','download'].includes(command))throw Error('Unknown command: '+command)
 }
 if(command==='run'||args.wait){let revision=-1;while(job.status==='running'){if(job.revision!==revision){console.error(JSON.stringify({id:job.id,status:job.status,phase:job.summary.phase,revision:job.revision}));revision=job.revision}await new Promise(resolve=>setTimeout(resolve,800));job=await client.invoke('workflow.get',{id:job.id})}}
 let paths
 if(command==='download'||args.output){if(!args.output)throw Error('--output is required');paths=await download(client,job,args.output)}
 console.log(JSON.stringify({ok:!['failed','cancelled'].includes(job.status),data:job,...(paths?{paths}:{})},null,2))
 if(['failed','cancelled'].includes(job.status))process.exitCode=1
}catch(error){console.log(JSON.stringify({ok:false,error:error.message,code:error.code??'PROFILE_ENGINE_ERROR'}));process.exitCode=1}
