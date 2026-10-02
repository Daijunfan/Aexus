import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fromWireResponse,type ApiResponse,type ServiceEvent} from '../core/protocol';
import {applyWorkspaceDelta} from '../core/stateDelta';
import type {Workspace} from '../types';

/** Optional host transport for CLIs whose OS sandbox denies local sockets. */
export async function hostRequest(directory:string,method:string,params:Record<string,unknown>,id:string|number=randomUUID(),stateMode?:'full'|'delta'|'none'):Promise<ApiResponse> {
  const key=randomUUID(),request=path.join(directory,key+'.request.json'),response=path.join(directory,key+'.response.json');
  if(!fs.existsSync(path.join(directory,'host.json')))throw new Error('工作空间插件服务未运行，请先在 Agents Company 中启动员工');
  fs.writeFileSync(request+'.tmp',JSON.stringify({jsonrpc:'2.0',id,method,params,stateMode,auth:process.env.AGENTS_COMPANY_TOKEN||fs.readFileSync(process.env.AGENTS_COMPANY_TOKEN_FILE||path.join(process.env.AGENTS_COMPANY_HOME||path.join(os.homedir(),'AgentsCompany'),'control.token'),'utf8').trim()}));fs.renameSync(request+'.tmp',request);
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
  const file=path.join(directory,'events.json');let sequence=0,stamp='',busy=false,closed=false;
  let workspace:Workspace|null=null;
  const refresh=async()=>{
    const response=await hostRequest(directory,'workspace.get',{},randomUUID(),'none');
    if(response.error)throw new Error(response.error.message);
    workspace=response.result;
    if(!closed)listener({type:'state',workspace,revision:response.revision});
  };
  const poll=async()=>{
    if(busy||closed)return;busy=true;
    try{
      const stat=fs.statSync(file,{throwIfNoEntry:false});if(!stat)return;
      const nextStamp=stat.mtimeMs+':'+stat.size;if(nextStamp===stamp)return;
      const state=JSON.parse(fs.readFileSync(file,'utf8'));
      if(sequence>state.sequence) { sequence=0;workspace=null; }
      if(!workspace||sequence<(state.firstSequence??state.events[0]?.seq??1)-1)await refresh();
      for(const packet of state.events){
        if(packet.seq<=sequence)continue;
        const event=packet.data as ServiceEvent;
        if(event.type==='delta'){
          let next=applyWorkspaceDelta(workspace,event.delta);
          if(!next){await refresh();next=applyWorkspaceDelta(workspace,event.delta)}
          if(next){workspace=next;if(!closed)listener({...event,type:'state',workspace:next})}
        }else{
          if(event.type==='state')workspace=event.workspace;
          if(!closed)listener(event);
        }
      }
      sequence=state.sequence;stamp=nextStamp;
    }catch { /* Atomic file replacement or host restart: retry without losing the cursor. */ }
    finally{busy=false}
  };
  void poll();const timer=setInterval(()=>void poll(),100);return()=>{closed=true;clearInterval(timer)};
}
