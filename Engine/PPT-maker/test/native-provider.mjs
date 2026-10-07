import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {outline,content as makeContent} from './fixtures.mjs';
const textOf=m=>typeof m?.content==='string'?m.content:Array.isArray(m?.content)?m.content.filter(p=>p.type==='text').map(p=>p.text).join('\n'):'';
function answer(task){
 const p=task.payload;let result;
 if(task.kind==='outline')result={outline:outline(p.slideCount)};
 else if(task.kind==='content')result=makeContent(p.outline);
 else if(task.kind==='design')result={slides:makeContent(p.outline).slides.map(s=>({id:s.id,layout:s.layout,rationale:'依据页面内容选用支持的原生版式'}))};
 else if(task.kind==='review')result={verdict:'pass',summary:'确定性协议验证：已返回本次任务的结构化审校结果。',issues:[]};
 else if(task.kind==='edit'){const e=p.slide.elements.find(e=>e.type==='text'&&!e.locked&&e.role==='title');result={edits:[{elementId:e.id,text:'真实协议完成的单页修订'}],notes:'原生引擎通过本地确定性模型返回，其他页保持不变。'};}
 else if(task.kind==='fill')result={slides:p.template.map(s=>({id:s.id,edits:s.slots.filter(e=>e.role==='title').map(e=>({elementId:e.id,text:'原生模板填充标题'})),notes:s.notes}))};
 else throw Error('Unknown scripted PPT task '+task.kind);
 return {taskId:task.taskId,...result};
}
/** Test-only loopback model endpoint. A real installed Pi runs its native protocol and tools. */
export async function nativeProvider(){
 const calls=[];let stalled=false;
 const server=http.createServer((req,res)=>{
  if(req.method==='GET'&&req.url?.endsWith('/models')){res.setHeader('content-type','application/json');res.end(JSON.stringify({object:'list',data:[{id:'ppt-fixture',object:'model',owned_by:'local-test'}]}));return;}
  if(req.method!=='POST'||!req.url?.endsWith('/chat/completions')){res.writeHead(404);res.end();return;}
  let body='';req.on('data',chunk=>{body+=chunk;if(body.length>10*1024*1024)req.destroy();});req.on('end',()=>{
   let v;try{v=JSON.parse(body);}catch{res.writeHead(400);res.end();return;}
   const messages=v.messages??[],last=messages.findLastIndex(m=>m.role==='user'),text=textOf(messages[last]),marker=text.indexOf('[AEXUS_PPT_MAKER_TASK]'),id='chatcmpl-'+randomUUID();let output='OK',tools,kind='initialize';
   try{
    if(marker>=0){const task=JSON.parse(text.slice(marker).split('\n\n')[1]);kind=task.kind;output=JSON.stringify(answer(task));}
    else if(!messages.slice(last+1).some(m=>m.role==='tool')){const name=v.tools?.find(t=>t.function?.name?.includes('documentation'))?.function?.name;if(!name)throw Error('Real initialization did not receive documentation tool');output=null;tools=['identity','index'].map(operation=>({id:'call-'+randomUUID(),type:'function',function:{name,arguments:JSON.stringify({operation})}}));}
   }catch(e){calls.push({kind,error:e.message});res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:e.message,type:'invalid_request_error'}}));return;}
   calls.push({kind,model:v.model,toolCalls:tools?.map(t=>t.function.name)??[]});
   if(stalled&&marker>=0){res.writeHead(200,{'content-type':'text/event-stream'});res.write(': intentional test stall\n\n');return;}
   const usage={prompt_tokens:100,completion_tokens:100,total_tokens:200},finish=tools?'tool_calls':'stop';
   if(!v.stream){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id,object:'chat.completion',created:Math.floor(Date.now()/1000),model:'ppt-fixture',choices:[{index:0,message:{role:'assistant',content:output,...(tools?{tool_calls:tools}:{})},finish_reason:finish}],usage}));return;}
   res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});const chunk=(delta,reason=null)=>res.write('data: '+JSON.stringify({id,object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:'ppt-fixture',choices:[{index:0,delta,finish_reason:reason}]})+'\n\n');
   chunk({role:'assistant',...(tools?{tool_calls:tools.map((t,index)=>({...t,index}))}:{content:output})});chunk({},finish);res.write('data: '+JSON.stringify({id,object:'chat.completion.chunk',model:'ppt-fixture',choices:[],usage})+'\n\ndata: [DONE]\n\n');res.end();
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {url:'http://127.0.0.1:'+server.address().port+'/v1',calls,setStalled(v){stalled=v;},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
