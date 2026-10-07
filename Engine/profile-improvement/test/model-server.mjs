import http from 'node:http'
import {randomUUID} from 'node:crypto'
import {scriptedResult} from './fixtures.mjs'
const textOf=message=>typeof message?.content==='string'?message.content:Array.isArray(message?.content)?message.content.filter(c=>c.type==='text').map(c=>c.text).join('\n'):''
/** Loopback OpenAI-compatible fixture for the real Pi program, never a paid provider. */
export async function modelServer(){
 const calls=[];let stall=false
 const server=http.createServer((request,response)=>{
  if(request.method==='GET'&&request.url?.endsWith('/models')){response.setHeader('content-type','application/json');response.end(JSON.stringify({object:'list',data:[{id:'fixture-model',object:'model',owned_by:'fixture'}]}));return}
  if(request.method!=='POST'||!request.url?.endsWith('/chat/completions')){response.writeHead(404);response.end();return}
  let body='';request.on('data',chunk=>{body+=chunk;if(body.length>8*1024*1024)request.destroy()});request.on('end',()=>{
   let value;try{value=JSON.parse(body)}catch{response.writeHead(400);response.end();return}
   const messages=value.messages??[],last=messages.findLastIndex(m=>m.role==='user'),text=textOf(messages[last]),marker=text.indexOf('[AEXUS_PROFILE_TASK]'),id='chatcmpl-'+randomUUID();let content='OK',tool_calls,kind='initialize'
   try{
    if(marker>=0){const input=JSON.parse(text.slice(marker).split('\n\n')[1]);kind=input.kind;content=JSON.stringify(scriptedResult(input))}
    else if(!messages.slice(last+1).some(m=>m.role==='tool')){
     const tool=value.tools?.find(t=>t.function?.name?.includes('documentation'))?.function?.name
     if(!tool)throw Error('The real native initialization did not receive its documentation tool')
     content=null;tool_calls=['identity','index'].map(operation=>({id:'call-'+randomUUID(),type:'function',function:{name:tool,arguments:JSON.stringify({operation})}}))
    }
   }catch(error){calls.push({kind,error:error.message,tools:value.tools?.map(t=>t.function?.name)});response.writeHead(400,{'content-type':'application/json'});response.end(JSON.stringify({error:{message:error.message,type:'invalid_request_error'}}));return}
   calls.push({kind,model:value.model,toolCalls:tool_calls?.map(t=>t.function.name)??[],promptHasContact:text.includes('alex@example.com')})
   if(stall&&marker>=0){response.writeHead(200,{'content-type':'text/event-stream'});response.write(': paused test fixture\n\n');return}
   const usage={prompt_tokens:100,completion_tokens:100,total_tokens:200},finish_reason=tool_calls?'tool_calls':'stop'
   if(!value.stream){response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({id,object:'chat.completion',created:Math.floor(Date.now()/1000),model:'fixture-model',choices:[{index:0,message:{role:'assistant',content, ...(tool_calls?{tool_calls}:{})},finish_reason}],usage}));return}
   response.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});const chunk=(delta,finish=null)=>response.write('data: '+JSON.stringify({id,object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:'fixture-model',choices:[{index:0,delta,finish_reason:finish}]})+'\n\n')
   chunk({role:'assistant',...(tool_calls?{tool_calls:tool_calls.map((call,index)=>({...call,index}))}:{content})});chunk({},finish_reason);response.write('data: '+JSON.stringify({id,object:'chat.completion.chunk',model:'fixture-model',choices:[],usage})+'\n\ndata: [DONE]\n\n');response.end()
  })
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 return {url:'http://127.0.0.1:'+server.address().port+'/v1',calls,setStall(value){stall=value},async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}
}
