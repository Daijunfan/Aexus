import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BackendClient } from '../backend/client';
import { withinFolder } from '../backend/folder';
import { assetPath } from '../../electron/storage.cjs';
import { toWireResponse } from '../core/protocol';
import { commands } from '../core/catalog';
export const pluginCommands=commands.filter(c=>!c.method.startsWith('agent.')&&!['workspace.replace','backup.restore','backup.export'].includes(c.method));
const mime=(file:string)=>({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.pdf':'application/pdf','.md':'text/plain; charset=utf-8','.json':'application/json','.txt':'text/plain; charset=utf-8','.csv':'text/csv'}[path.extname(file).toLowerCase()]||'application/octet-stream');
export function createPlugin(context:{workspace:string;pluginRoot:string;executable:string}) {
  const client=new BackendClient({workspace:context.workspace,executable:context.executable,serverPath:path.join(context.pluginRoot,'backend/server.cjs'),clientId:`gui-plugin-${randomUUID()}`});
  return {
    request:async(request:any)=>toWireResponse(await client.request(request.method,request.params,request.id)),
    subscribe:(listener:(event:any)=>void)=>client.subscribe(listener),
    readAsset:async(value:string)=>{
      const file=value.startsWith('asset/')?assetPath(client.directory,`asset://local/${value.slice(6)}`,client.workspaceRoot):value.startsWith('workspace/')?withinFolder(client.workspaceRoot!,value.slice(10)):undefined;
      if(!file)throw new Error('Unknown asset namespace');
      const real=fs.realpathSync(file);
      if(!real.startsWith(client.workspaceRoot!+path.sep))throw new Error('Asset escapes workspace');
      return {bytes:fs.readFileSync(real),mimeType:mime(file)};
    },
    close:async()=>{
      if(!await client.ping())return;
      const status=await client.call('status');
      if(status.guiClients||status.desktopClients)return;
      await client.call('service.stop');
      // Wait for the owned service to release its workspace before Core exits.
      // Windows keeps a process's current working directory locked until exit.
      for(let attempt=0;attempt<60;attempt++){
        if(!await client.ping())return;
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      throw new Error('MiniNotion service has not completed shutdown');
    },
  };
}
