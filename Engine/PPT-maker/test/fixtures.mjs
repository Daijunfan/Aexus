import {clone} from '../scene.mjs';
import {create,respond,run,describe,retry,cancel} from '../runtime.mjs';
import {sha256} from '../archive.mjs';
export const brief='为团队制作一份项目协作方案，明确问题、角色、流程与下一步。所有图表数据来自所给资料。';
export const source={name:'项目数据.md',content:'用户提供的测试数据：第一阶段12，第二阶段18，第三阶段23。所有数据仅用于测试演示，不代表真实业务成绩。'};
export function outline(count=8){const names=['让协作变成可交付的结果','把问题说清楚','三个角色，各自负责','工作如何交接','同一组事实，两种视角','数据与约束','检查每一份交付','开始下一次协作'];return {title:'从想法到可编辑的演示',slides:Array.from({length:count},(_,i)=>({id:'s'+(i+1),title:names[i%names.length],purpose:'第'+(i+1)+'页：让用户理解清晰分工与可检查产物。'}))};}
export function content(plan){
 const types=['cover','statement','cards','timeline','split','chart','table','closing'];
 return {title:plan.title,slides:plan.slides.map((s,i)=>{
  const layout=types[i%types.length],base={id:s.id,title:s.title,layout,subtitle:'让结构、观点与证据保持一致',body:['围绕明确目标组织工作','将细节放在演讲者备注'],sourceIds:['S1'],notes:'说明本页的关键观点与执行方式。测试资料仅用于验证排版和数据保真。'};
  if(layout==='cards')Object.assign(base,{items:[{label:'策划',body:'明确受众和目标，组织论证顺序。'},{label:'设计',body:'用一致版式呈现清楚的观点。'},{label:'审校',body:'独立核对原始资料和最终内容。'}]});
  if(layout==='timeline')Object.assign(base,{items:[{label:'准备',body:'提供目标与资料。'},{label:'协作',body:'按角色独立处理。'},{label:'检查',body:'验证文字和数据。'},{label:'交付',body:'导出可编辑文件。'}]});
  if(layout==='split')Object.assign(base,{items:[{label:'用户需求',body:'关心最终能否直接使用，以及后续是否可继续编辑。'},{label:'制作流程',body:'采用结构化文稿和原生对象，保存编辑与版本。'}]});
  if(layout==='chart')Object.assign(base,{chart:{type:'bar',categories:['第一阶段','第二阶段','第三阶段'],series:[{name:'测试数据',values:[12,18,23]}],unit:'测试单位'},body:['来源为用户提供的演示数据。'],sourceIds:['S2']});
  if(layout==='table')Object.assign(base,{table:{columns:['检查对象','对应标准','交付形态'],rows:[['文字','未溢出、可编辑','文本框'],['图表','数据与资料一致','内嵌工作簿'],['表格','行列结构保留','原生单元格']]},body:[]});
  return base;
 })};
}
export function createFakeClient(options={}){
 const groups=[],workers=[],transcripts=new Map(),requests=new Map(),calls=[],replyOverride=options.replyOverride,interrupts=[];let sent=0;
 const client={calls,requests,workers,groups,interrupts,async info(){return {contractVersion:'1.0.0'}},async describe(){return {}},async invoke(command,args={}){
  calls.push({command,args:clone(args)});
  if(command==='engine.check')return {ready:options.noEngines?false:['codex','claude'].includes(args.engine),engine:args.engine};
  if(command==='group.list')return [...groups];
  if(command==='group.add'){groups.push(args.name);return {name:args.name};}
  if(command==='session.list')return {sessions:clone(workers)};
  if(command==='card.create'){const card={...args,id:'employee-'+(workers.length+1),initialization:{status:'ready'}};workers.push(card);transcripts.set(card.id,[]);return clone(card);}
  if(command==='session.status'){const w=workers.find(w=>w.id===args.employee);if(!w)return [];const running=options.unrelatedBusy?.(w);return [{id:w.id,initialization:{status:'ready'},busy:!!running,acknowledging:false,waitingApproval:false,...(running?{currentTask:{messageId:'unrelated'}}:{})}];}
  if(command==='session.transcript')return {shown:clone(transcripts.get(args.employee)??[])};
  if(command==='session.send'){
   if(requests.has(args.clientMessageId))return requests.get(args.clientMessageId);
   const header=args.text.split('\n\n')[1],task=JSON.parse(header),receipt={messageId:'message-'+(++sent),queued:false};requests.set(args.clientMessageId,receipt);
   let result;
   if(task.kind==='outline')result={outline:outline(task.payload.slideCount)};
   else if(task.kind==='content')result=content(task.payload.outline);
   else if(task.kind==='design')result={slides:content(task.payload.outline).slides.map(s=>({id:s.id,layout:s.layout,rationale:'根据本页观点选择对应原生版式'}))};
   else if(task.kind==='review')result={verdict:options.reviewRevise?'revise':'pass',summary:'已检查所提供资料、页序和对象文本。',issues:options.reviewRevise?[{severity:'blocking',slideId:task.payload.deck.slides[0].id,message:'测试阻断意见'}]:[]};
   else if(task.kind==='edit'){const e=task.payload.slide.elements.find(e=>e.type==='text'&&!e.locked&&e.role==='title')??task.payload.slide.elements.find(e=>e.type==='text'&&!e.locked);result={edits:[{elementId:e.id,text:'精简后的核心观点'}],notes:'按用户要求修改这一页，其他页面保持原样。'};}
   else if(task.kind==='fill')result={slides:task.payload.template.map(s=>({id:s.id,edits:s.slots.filter(e=>e.role==='title').map(e=>({elementId:e.id,text:'模板中的新标题'})),notes:s.notes}))};
   else throw Error('Unknown task kind '+task.kind);
   const answer=replyOverride?replyOverride(task,result):result;
   const items=transcripts.get(args.employee);items.push({role:'user',text:args.text,outbound:{taskId:receipt.messageId}},{role:'assistant',blocks:[{kind:'text',text:JSON.stringify({taskId:task.taskId,...answer})}]});
   if(options.loseSend&&!options.lost){options.lost=true;throw Object.assign(Error('模拟消息已接受但响应丢失'),{code:'CONTRACT_TRANSPORT_ERROR'});}
   return receipt;
  }
  if(command==='session.interrupt'){interrupts.push(args);return {ok:true};}
  if(command==='session.dequeue')return {ok:true};
  if(command==='view.open')return {ok:true};
  throw Error('Fake contract does not implement '+command);
 }};
 return client;
}
/** A deterministic host of the PUBLIC runtime contract, not an Infra implementation import. */
export function createHarness(client=createFakeClient()){
 const jobs=new Map(),dedup=new Map();let counter=0;
 const view=job=>({id:job.id,engineId:'PPT-maker',engineVersion:'1.0.0',status:job.status,revision:job.revision,createdAt:job.createdAt,updatedAt:Date.now(),summary:describe(job.state),files:job.files,error:job.error});
 const checkpoint=async(job,state)=>{job.state=clone(state);job.revision++;};
 const kick=job=>{job.status='running';job.revision++;const controller=new AbortController();job.controller=controller;job.pending=run(job.state,{id:job.id,client,signal:controller.signal,checkpoint:s=>checkpoint(job,s)}).then(result=>{job.state=result.state;job.status=result.status;job.revision++;job.files=(result.artifacts??[]).map(a=>{const bytes=Buffer.from(a.content,a.encoding==='base64'?'base64':'utf8');return {name:a.name,description:a.description,mediaType:a.mediaType,encoding:a.encoding??'utf8',bytes:bytes.length,sha256:sha256(bytes)};});job.artifacts=result.artifacts??[];delete job.error;}).catch(error=>{job.status=controller.signal.aborted?'cancelled':'failed';job.error=error.message;job.revision++;});};
 const api={jobs,client,view,kick,async wait(id){await jobs.get(id).pending;return view(jobs.get(id));},async call(command,args={}){
  if(command==='workflow.start'){
   const key='start/'+args.clientRequestId,payload=JSON.stringify(args.input);if(dedup.has(key)){const old=dedup.get(key);if(old.payload!==payload)throw Error('请求键被用于不同输入');return view(jobs.get(old.id));}
   if(args.engineId!=='PPT-maker')throw Error('unknown engine');const state=create(args.input),job={id:'wf_ppt_test_'+(++counter),createdAt:Date.now()+counter,revision:1,status:'running',state,files:[]};jobs.set(job.id,job);dedup.set(key,{id:job.id,payload});kick(job);return view(job);
  }
  if(command==='workflow.list')return {jobs:[...jobs.values()].map(view)};
  const job=jobs.get(args.id);if(!job)throw Error('工作流不存在');
  if(command==='workflow.get')return view(job);
  if(command==='workflow.file'){if(job.status!=='completed')throw Error('只有最终文件可下载');const a=job.artifacts.find(f=>f.name===args.name),meta=job.files.find(f=>f.name===args.name);if(!a)throw Error('文件不存在');return {...meta,content:a.content};}
  if(command==='workflow.respond'||command==='workflow.resume'){
   const key=command+'/'+args.clientRequestId,payload=JSON.stringify(args);if(dedup.has(key)){const old=dedup.get(key);if(old.payload!==payload)throw Error('请求键复用');return view(job);}
   if(job.revision!==args.expectedRevision)throw Error('工作流修订冲突');
   if(command==='workflow.respond'){if(job.status!=='waiting')throw Error('当前不等待输入');job.state=respond(clone(job.state),args.answer);}else{if(job.status!=='failed')throw Error('当前无需恢复');job.state=retry(clone(job.state));}
   dedup.set(key,{id:job.id,payload});kick(job);return view(job);
  }
  if(command==='workflow.cancel'){job.controller.abort(Error('用户取消'));await job.pending;await cancel(job.state,{id:job.id,client,signal:new AbortController().signal,checkpoint:s=>checkpoint(job,s)});job.status='cancelled';job.revision++;return view(job);}
  throw Error('Unknown workflow command');
 }};
 const invoke=client.invoke.bind(client);client.invoke=(command,args={})=>command.startsWith('workflow.')?api.call(command,args):invoke(command,args);
 return api;
}
export async function draft(harness,input={}){const view=await harness.call('workflow.start',{engineId:'PPT-maker',input:{brief,materials:[source],slideCount:8,confirmOutline:false,...input},clientRequestId:'test-'+Math.random()});return harness.wait(view.id);}
