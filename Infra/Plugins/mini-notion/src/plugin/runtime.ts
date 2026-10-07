export { agentGuide } from '../core/agentGuide';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BackendClient } from '../backend/client';
import { withinFolder } from '../backend/folder';
import { assetPath, atomicWrite } from '../../electron/storage.cjs';
import { toWireResponse } from '../core/protocol';
import { requestAssistant, type RequestHost } from './assistant';
import { assistantCommands } from '../core/assistantCommands';
export { pluginCommands } from './catalog';
const mime=(file:string)=>({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.pdf':'application/pdf','.md':'text/plain; charset=utf-8','.json':'application/json','.txt':'text/plain; charset=utf-8','.csv':'text/csv'}[path.extname(file).toLowerCase()]||'application/octet-stream');
export function createPlugin(context:{workspace:string;workspaceBase?:string;pluginRoot:string;executable:string;requestHost?:RequestHost}) {
  if(context.workspaceBase){
    const marker=path.join(context.workspaceBase,'.mininotion','collection.json');
    if(!fs.existsSync(marker))atomicWrite(marker,{format:'mininotion.collection/v1'});
  }
  const client=new BackendClient({workspace:context.workspace,executable:context.executable,serverPath:path.join(context.pluginRoot,'backend/server.cjs'),clientId:`gui-plugin-${randomUUID()}`,ownerPid:process.pid});
  return {
    request:async(request:any)=>{
      if (assistantCommands.some(command => command.method === request.method)) {
        try { return { jsonrpc:'2.0', id:request.id, result:await requestAssistant(context.requestHost,request.method,request.params || {}) }; }
        catch(error) { return { jsonrpc:'2.0', id:request.id, error:{code:-32000,message:(error as Error).message} }; }
      }
      return toWireResponse(await client.request(request.method,request.params,request.id,request.stateMode));
    },
    subscribe:(listener:(event:any)=>void,options?:{stateMode?:'full'|'delta';initialState?:boolean})=>client.subscribe(listener,undefined,{delta:options?.stateMode==='delta',initialState:options?.initialState}),
    readAsset:async(value:string)=>{
      const file=value.startsWith('asset/')?assetPath(client.directory,`asset://local/${value.slice(6)}`,client.workspaceRoot):value.startsWith('workspace/')?withinFolder(client.workspaceRoot!,value.slice(10)):undefined;
      if(!file)throw new Error('Unknown asset namespace');
      const real=fs.realpathSync(file);
      if(!real.startsWith(client.workspaceRoot!+path.sep))throw new Error('Asset escapes workspace');
      return {bytes:fs.readFileSync(real),mimeType:mime(file)};
    },
    close:()=>client.close(),
  };
}
