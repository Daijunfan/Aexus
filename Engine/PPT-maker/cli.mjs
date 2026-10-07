#!/usr/bin/env node
/** PPT-maker CLI: public workflow operations and deterministic local document tools. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createNodeClient} from '../../Contract/node-client.mjs';
import {ENGINE_ID} from './model.mjs';
import {prepareRevision} from './workflow.mjs';
import {validateDeck,inspectDeck} from './scene.mjs';
import {renderGenerated} from './render.mjs';
import {importTemplate,exportNative} from './template.mjs';
import {inspectPptx,decodeBase64,sha256} from './archive.mjs';
const usage=`PPT-maker — editable slides via Aexus Contract 1.0

Workflow commands (preserve a request key when retrying):
  start --input JSON|@input.json --request-id KEY
  start --template template.pptx [--brief TEXT] --request-id KEY
  list
  get --id WORKFLOW_ID
  respond --id ID --revision N --answer JSON|@answer.json --request-id KEY
  resume --id ID --revision N --request-id KEY
  cancel --id ID
  fork --id COMPLETED_ID --request-id KEY
  download --id ID --output final.pptx

Document tools (local files only; no model calls):
  inspect --file input.pptx [--output scene.json]
  validate --file final.pptx
  check --input @scene.json
  render --input @scene.json --output final.pptx
  patch --template original.pptx --input @edited-scene.json --output final.pptx

All output files use exclusive creation. Existing files are never overwritten.
Full protocol and response actions: docs/API.md.
`;
function flags(argv){const out={};for(let i=0;i<argv.length;i++){const key=argv[i];if(!key.startsWith('--')||i+1>=argv.length||argv[i+1].startsWith('--'))throw Error('参数无效：'+key);if(key.slice(2) in out)throw Error('参数重复：'+key);out[key.slice(2)]=argv[++i];}return out;}
async function json(value){if(!value)throw Error('缺少JSON参数');return JSON.parse(value.startsWith('@')?await fs.readFile(value.slice(1),'utf8'):value);}
function required(args,...names){for(const name of names)if(!args[name])throw Error('缺少 --'+name);}
async function exclusive(file,bytes){if(!file)throw Error('缺少 --output');await fs.writeFile(file,bytes,{flag:'wx'});}
export async function main(argv=process.argv.slice(2),client=createNodeClient()){
 if(!argv.length||argv[0]==='help'||argv[0]==='--help'){console.log(usage);return;}
 const command=argv[0],args=flags(argv.slice(1));let result;
 const id=()=>{required(args,'id');return args.id;},mutation=()=>{required(args,'revision','request-id');const expectedRevision=Number(args.revision);if(!Number.isInteger(expectedRevision)||expectedRevision<1)throw Error('revision必须为正整数');return {id:id(),expectedRevision,clientRequestId:args['request-id']};};
 if(command==='start'){
  required(args,'request-id');let input=args.input?await json(args.input):{};
  if(args.template){const bytes=await fs.readFile(args.template);if(bytes.length>4*1024*1024)throw Error('模板超过4MiB');input={...input,template:{name:path.basename(args.template),content:bytes.toString('base64')}};}
  if(args.brief)input.brief=args.brief;
  result=await client.invoke('workflow.start',{engineId:ENGINE_ID,input,clientRequestId:args['request-id']});
 }else if(command==='list')result=await client.invoke('workflow.list',{engineId:ENGINE_ID});
 else if(command==='get')result=await client.invoke('workflow.get',{id:id()});
 else if(command==='respond')result=await client.invoke('workflow.respond',{...mutation(),answer:await json(args.answer)});
 else if(command==='resume')result=await client.invoke('workflow.resume',mutation());
 else if(command==='cancel')result=await client.invoke('workflow.cancel',{id:id()});
 else if(command==='fork'){required(args,'request-id');result=await client.invoke('workflow.start',{engineId:ENGINE_ID,input:await prepareRevision(client,id()),clientRequestId:args['request-id']});}
 else if(command==='download'){
  required(args,'output');const job=await client.invoke('workflow.get',{id:id()});if(job.engineId!==ENGINE_ID||job.status!=='completed'||job.files.length!==1)throw Error('该任务尚无最终PPTX');const f=await client.invoke('workflow.file',{id:job.id,name:job.files[0].name});if(f.encoding!=='base64')throw Error('PPTX需要二进制workflow.file协议');const bytes=decodeBase64(f.content,32*1024*1024);if(bytes.length!==f.bytes||sha256(bytes)!==f.sha256)throw Error('文件长度或SHA256校验不通过');await inspectPptx(bytes);await exclusive(args.output,bytes);result={output:path.resolve(args.output),bytes:bytes.length,sha256:f.sha256};
 }else if(command==='inspect'){
  required(args,'file');const bytes=await fs.readFile(args.file),deck=await importTemplate(bytes,{name:path.basename(args.file)});if(args.output)await exclusive(args.output,JSON.stringify(deck,null,2)+'\n');result={deck:args.output?undefined:deck,output:args.output?path.resolve(args.output):undefined,quality:inspectDeck(deck),package:await inspectPptx(bytes)};
 }else if(command==='validate'){required(args,'file');result=await inspectPptx(await fs.readFile(args.file));}
 else if(command==='check'){const deck=await json(args.input);validateDeck(deck);result=inspectDeck(deck);if(!result.passed)process.exitCode=2;}
 else if(command==='render'){const deck=await json(args.input),r=await renderGenerated(deck);await exclusive(args.output,r.bytes);result={output:path.resolve(args.output),quality:r.quality,package:r.validation};}
 else if(command==='patch'){required(args,'template');const bytes=await fs.readFile(args.template),base=await importTemplate(bytes,{name:path.basename(args.template)}),r=await exportNative(bytes,base,await json(args.input));await exclusive(args.output,r.bytes);result={output:path.resolve(args.output),package:r.validation,preservation:r.templatePreservation};}
 else throw Error('未知命令：'+command+'。运行 --help 查看用法。');
 console.log(JSON.stringify({ok:true,data:result},null,2));return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(JSON.stringify({ok:false,error:error.message,code:error.code??'PPT_MAKER_ERROR'}));process.exitCode=1;});
