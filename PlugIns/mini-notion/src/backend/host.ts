import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fromWireResponse,type ApiResponse,type ServiceEvent} from '../core/protocol';

/** Optional host transport for CLIs whose OS sandbox denies local sockets. */
export async function hostRequest(directory:string,method:string,params:Record<string,unknown>,id:string|number=randomUUID()):Promise<ApiResponse> {
  const key=randomUUID(),request=path.join(directory,key+'.request.json'),response=path.join(directory,key+'.response.json');
  if(!fs.existsSync(path.join(directory,'host.json')))throw new Error('工作空间插件服务未运行，请先在 Agents Company 中启动员工');
  fs.writeFileSync(request+'.tmp',JSON.stringify({jsonrpc:'2.0',id,method,params}));fs.renameSync(request+'.tmp',request);
  try{
    const deadline=Date.now()+120000;
    while(Date.now()<deadline){
      if(fs.existsSync(response))return fromWireResponse(JSON.parse(fs.readFileSync(response,'utf8')));
      if(!fs.existsSync(path.join(directory,'host.json')))throw new Error('宿主已停止，请重新启动员工');
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    throw new Error('插件 API 响应超时，请查询状态确认是否已完成');
  }finally{fs.rmSync(request,{force:true});fs.rmSync(response,{force:true})}
}
export function hostSubscribe(directory:string,listener:(event:ServiceEvent)=>void) {
  const file=path.join(directory,'events.json');let sequence=0;
  const poll=()=>{if(!fs.existsSync(file))return;const state=JSON.parse(fs.readFileSync(file,'utf8'));for(const event of state.events)if(event.seq>sequence)listener(event.data);sequence=state.sequence};
  poll();const timer=setInterval(poll,100);return()=>clearInterval(timer);
}
