import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { PluginRuntime } from '../../shared/plugins'

// Sandboxed CLIs can exchange JSON through their writable Team folder without
// granting network access. All requests still execute in the plugin runtime.
export async function openMailbox(directory:string,runtime:PluginRuntime,workspace:string) {
  fs.mkdirSync(directory,{recursive:true})
  const root=fs.realpathSync(directory),pending=new Set<string>()
  let closed=false,sequence=0
  const events:{seq:number;data:unknown}[]=[]
  const write=(name:string,value:unknown)=>{const file=path.join(root,name),temporary=path.join(root,randomUUID()+'.tmp');fs.writeFileSync(temporary,JSON.stringify(value),{flag:'wx',mode:0o600});fs.renameSync(temporary,file)}
  const consume=async(name:string)=>{
    if(closed||!/^[-a-f0-9]+\.request\.json$/.test(name)||pending.has(name))return
    const file=path.join(root,name)
    if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink())return
    pending.add(name)
    try{
      const request=JSON.parse(fs.readFileSync(file,'utf8'))
      if(request.jsonrpc!=='2.0'||typeof request.method!=='string')throw new Error('Invalid JSON RPC request')
      const result=await runtime.request(request)
      if(!closed)write(name.replace('.request.','.response.'),result)
    }catch(error){if(!closed)write(name.replace('.request.','.response.'),{jsonrpc:'2.0',id:null,error:{code:-32000,message:(error as Error).message}})}
    finally{fs.rmSync(file,{force:true});pending.delete(name)}
  }
  const watcher=fs.watch(root,(_event,name)=>{if(name)void consume(String(name))})
  const unsubscribe=await runtime.subscribe?.(data=>{if(closed)return;events.push({seq:++sequence,data});if(events.length>128)events.shift();write('events.json',{sequence,events})})
  write('host.json',{pid:process.pid,workspace})
  return ()=>{closed=true;watcher.close();unsubscribe?.();fs.rmSync(path.join(root,'host.json'),{force:true})}
}
