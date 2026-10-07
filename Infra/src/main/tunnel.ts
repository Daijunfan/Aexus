import {directoryName} from '../shared/directory-names'
import {applicationRoot} from './resources'
import {terminateTree} from './platform'
import {cloudHostAskpass} from './cloud-hosts'
import {createHash,randomUUID} from 'node:crypto'
import {teamSettings,employeeSettings,type Store} from '../shared/types'
import {chooseEmployeeWorkspace,cloudDirectory,cloudRelative} from './workspaces'
import fs from 'node:fs'
import path from 'node:path'
import {homedir} from 'node:os'
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process'
import {createInterface} from 'node:readline'
import {APP_HOME} from '../shared/protocol'
import {remoteTarget,type RemoteTarget} from '../shared/remote'
import {childEnv,resolveBinary} from './exec'
import type {Engine} from '../shared/types'

export function tunnelDirectory(){return process.env.AGENTS_COMPANY_TUNNEL_DIR||(process.resourcesPath&&fs.existsSync(path.join(process.resourcesPath,'Modules/Tunnel'))?path.join(process.resourcesPath,'Modules/Tunnel'):path.join(applicationRoot(),'Infra/src/tunnel'))}
export const python=()=>{const candidate=resolveBinary('python3',process.env.AGENTS_COMPANY_PYTHON);return process.platform==='win32'&&candidate==='python3'?resolveBinary('python',process.env.AGENTS_COMPANY_PYTHON):candidate}
export function tunnelConfig(target:RemoteTarget){
  const value:Record<string,unknown>={host:target.host,directory:target.directory,os:target.os,cli_bin:target.cliBin,port:target.port,proxy_jump:target.jump}
  for(const [key,field] of [['identityFile','identity_file'],['knownHosts','known_hosts'],['sshConfig','ssh_config']] as const){
    const file=target[key];if(!file)continue
    if(!path.isAbsolute(file)&&!file.startsWith('~/'))throw new Error('SSH 文件配置必须使用绝对路径或 ~/')
    const resolved=file.startsWith('~/')?path.join(homedir(),file.slice(2)):file
    if(!fs.existsSync(resolved))throw new Error(`SSH ${key==='identityFile'?'私钥':key==='knownHosts'?'主机信任文件':'配置文件'}不存在：${resolved}。请在 Cloud Hosts 修复文件路径；这不是员工管理权限错误。`)
    value[field]=resolved
  }
  if(target.credentialId)value.askpass=cloudHostAskpass(target.credentialId,target)
  return value
}
export type RemoteLaunch={cwd:string;args:string[];server:{command:string;args:string[]};instructions:string}
function remoteError(message:string){
  const missing=message.match(/Target working directory does not exist: ([^\r\n]+)/)
  return new Error(missing?`云端工作目录不存在：${missing[1]}。请在员工资料中重新绑定已有目录，或恢复原目录后重试连接。重试不会自动恢复已删除的文件。`:message)
}
function bridge(operation:string,input:Record<string,unknown>):Promise<any>{
  return new Promise((resolve,reject)=>{
    const child=spawn(python(),[path.join(tunnelDirectory(),'bridge.py'),operation],{env:childEnv(),stdio:['pipe','pipe','pipe']});let out='',error=''
    const timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('SSH 连接超时，请检查主机、密钥和 known_hosts'))},25000)
    child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>error+=v);child.stdin.on('error',()=>{})
    child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(remoteError(error.trim()||'Tunnel 连接失败'));try{resolve(JSON.parse(out))}catch{reject(new Error('Tunnel 返回无效响应'))}})
    child.stdin.end(JSON.stringify(input))
  })
}
export function checkRemote(value:unknown){const target=remoteTarget(value);if(!target)throw new Error('请先配置云主机');return bridge('check',{target:tunnelConfig(target)})}
export function pingRemote(value:unknown){const target=remoteTarget(value);if(!target)throw new Error('请先配置云主机');return bridge('ping',{target:tunnelConfig(target)})}
export function prepareRemote(id:string,engine:Engine,target:RemoteTarget):Promise<RemoteLaunch>{
  return bridge('prepare',{engine,target:tunnelConfig(target),session:path.join(APP_HOME,'tunnel',id)})
}
/** One SSH-backed RPC connection per employee's file browser, separate from agent cwd changes. */
class RemoteFiles {
  child:ChildProcessWithoutNullStreams
  sequence=0;pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();error='';ready:Promise<any>
  constructor(launch:RemoteLaunch){
    this.child=spawn(launch.server.command,launch.server.args,{env:childEnv(),stdio:['pipe','pipe','pipe'],detached:true})
    this.child.stderr.on('data',v=>this.error=(this.error+v).slice(-4000));this.child.stdin.on('error',e=>this.fail(e))
    this.child.on('error',e=>this.fail(e));this.child.on('close',()=>this.fail(remoteError(this.error.trim()||'SSH 连接已断开')))
    createInterface({input:this.child.stdout}).on('line',line=>{try{const reply=JSON.parse(line),pending=this.pending.get(reply.id);if(!pending)return;clearTimeout(pending.timer);this.pending.delete(reply.id);if(reply.error)pending.reject(new Error(reply.error.message));else pending.resolve(reply.result)}catch{}})
    this.ready=this.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'agents-company-files',version:'1'}})
  }
  fail(error:Error){for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(error)}this.pending.clear()}
  request(method:string,params:Record<string,unknown>,timeout=25000):Promise<any>{return new Promise((resolve,reject)=>{const id=++this.sequence,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('远程文件操作超时'));this.close()},timeout);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')})}
  async call(operation:string,args:Record<string,unknown>){await this.ready;return this.request('tools/call',{name:'workspace',arguments:{operation,args}})}
  close(){terminateTree(this.child);this.fail(new Error('SSH 文件连接已关闭'))}
}
const connections=new Map<string,{key:string;client:Promise<RemoteFiles>}>()
export async function remoteFiles(id:string,target:RemoteTarget,operation:string,args:Record<string,unknown>){
  const key=JSON.stringify(target);let item=connections.get(id)
  if(item?.key!==key){closeRemote(id);const client=prepareRemote(id+'-files','codex',target).then(launch=>new RemoteFiles(launch));item={key,client};connections.set(id,item)}
  let reply:any
  try{reply=await (await item!.client).call(operation,args)}catch(error){closeRemote(id);throw error}
  const value=JSON.parse(reply.content[0].text);if(reply.isError)throw remoteError(value.error||'远程文件操作失败');return value
}
export function closeRemote(id:string){const item=connections.get(id);connections.delete(id);if(item)void item.client.then(client=>client.close()).catch(()=>{})}
export function closeRemoteFiles(){for(const id of connections.keys())closeRemote(id)}

export const teamConnectionId=(name:string)=>'team-'+createHash('sha256').update(name).digest('hex').slice(0,20)
/** Employee creation uses the same directory contract locally and through SSH. */
export async function resolveEmployeeWorkspace(store:Store,group:string,title:string,input?:string,mode?:string,id?:string,preview=false,workEnvironment?:import('../shared/types').WorkEnvironment):Promise<string>{
  workEnvironment??=store.sessions.find(card=>card.id===id)?.workEnvironment
  if(workEnvironment!==undefined&&!['team','local'].includes(workEnvironment))throw Error('工作环境必须为 team 或 local')
  if(workEnvironment==='local'&&teamSettings(store,group).mode==='work')throw Error('插件员工必须使用所属插件工作区')
  const config=employeeSettings(store,{group,workEnvironment})
  if(config.mode!=='cloud')return chooseEmployeeWorkspace(store,group,title,input,mode,id,preview,workEnvironment)
  if(!store.groups.includes(group)||!config.remote)throw new Error('请先配置云主机 Team')
  if(mode!==undefined&&!['default','bind','create','existing'].includes(mode))throw new Error('请选择默认生成或绑定已有文件夹')
  const generated=mode==='default'||(!mode&&!input)
  const name=directoryName(title,'employee')
  if(!generated&&!input?.trim())throw new Error('请选择云端工作文件夹，绑定团队根目录请使用 .')
  if(generated&&(!name||name==='.'||name==='..'||/[\\/\0]/.test(name)))throw new Error('默认文件夹必须与员工同名，名字不能包含路径分隔符')
  const target=cloudDirectory(config,generated?name:input||''),own=store.sessions.some(c=>c.id===id&&c.group===group&&c.cwd===target)
  if(generated&&input&&cloudDirectory(config,input)!==target)throw new Error('默认工作目录由员工名字生成')
  const result=await remoteFiles(teamConnectionId(group),config.remote,'directory',{path:cloudRelative(config,target),create:generated||mode==='create',exclusive:!own,preview})
  return result.path
}

/** A fresh remote MCP connection per management command; no local shell or fallback. */
export async function executeRemote(target:RemoteTarget,command:string,timeout=120){
  if(!command.trim()||!Number.isFinite(timeout)||timeout<.1||timeout>600)throw new Error('command 非空，timeout 必须为 0.1–600 秒')
  const id='host-command-'+randomUUID();let client:RemoteFiles|undefined
  try{
    client=new RemoteFiles(await prepareRemote(id,'codex',target));await client.ready
    const reply=await client.request('tools/call',{name:'execute',arguments:{command,timeout}},(timeout+10)*1000)
    const result=JSON.parse(reply.content[0].text);if(reply.isError&&typeof result.exit_code!=='number')throw remoteError(result.error||'远程命令失败');return result
  }finally{client?.close();fs.rmSync(path.join(APP_HOME,'tunnel',id),{recursive:true,force:true})}
}

/** Engine-owned MCP connection, separate from the file browser and host commands. */
export async function openTunnelTools(launch:RemoteLaunch){
  const allowed=['execute','read_file','write_file','edit_file','list_files']
  let client:RemoteFiles|undefined,closed=false,queue:Promise<unknown>=Promise.resolve()
  const connection=async()=>{if(closed)throw Error('Tunnel connection closed');const current=client??(client=new RemoteFiles(launch));await current.ready;return current}
  const close=()=>{closed=true;const current=client;client=undefined;current?.close()}
  try{
    const catalog=await (await connection()).request('tools/list',{})
    const tools=(catalog.tools as {name:string;description:string;inputSchema:Record<string,unknown>}[]).filter(tool=>allowed.includes(tool.name))
    if(allowed.some(name=>!tools.some(tool=>tool.name===name)))throw Error('Tunnel workspace tools are missing')
    const perform=async(name:string,args:Record<string,unknown>,signal?:AbortSignal)=>{
      if(!allowed.includes(name))throw Error('Only Tunnel workspace tools are permitted')
      if(signal?.aborted)throw Error('Interrupted')
      const current=await connection()
      if(signal?.aborted)throw Error('Interrupted')
      let cancelled=false
      const cancel=()=>{
        if(cancelled)return;cancelled=true
        if(client===current)client=undefined
        // Deliver cancellation before closing SSH. The ordered ping acknowledges
        // that the remote command settled; a later call starts a fresh connection.
        try{current.child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/cancelled',params:{}})+'\n');void current.request('ping',{},2500).catch(()=>{}).finally(()=>current.close())}catch{current.close()}
      }
      signal?.addEventListener('abort',cancel,{once:true})
      try{return await current.request('tools/call',{name,arguments:args},name==='execute'?(Math.min(600,Math.max(.1,Number(args.timeout)||120))+10)*1000:30000)}
      catch(error){cancel();throw error}
      finally{signal?.removeEventListener('abort',cancel)}
    }
    // The remote workspace has a shared cwd. Queue here so aborted operations
    // never reach the remote server after an earlier command is cancelled.
    return {tools,close,call(name:string,args:Record<string,unknown>,signal?:AbortSignal){const result=queue.then(()=>perform(name,args,signal));queue=result.catch(()=>{});return result}}
  }catch(error){close();throw error}
}
