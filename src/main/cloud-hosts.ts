// Shared host/CLI service; Cloud Hosts is a thin plugin client of this registry.
import {windowsAskpass} from './windows-askpass'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID,randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto'
import {APP_HOME,SOCKET_PATH} from '../shared/protocol'
import {remoteTarget,type RemoteTarget,type CloudHost} from '../shared/remote'
const directory=path.join(APP_HOME,'cloud-hosts'),file=path.join(directory,'hosts.json'),keyFile=path.join(directory,'credential.key')
type RecordHost=CloudHost&{secret?:string}
function load():RecordHost[]{return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[]}
function save(hosts:RecordHost[]){fs.mkdirSync(directory,{recursive:true,mode:0o700});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(hosts,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file)}
function key(){if(!fs.existsSync(keyFile)){fs.mkdirSync(directory,{recursive:true,mode:0o700});fs.writeFileSync(keyFile,randomBytes(32),{mode:0o600,flag:'wx'})}return fs.readFileSync(keyFile)}
function encrypt(password:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv),data=Buffer.concat([cipher.update(password,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64')}
const publicHost=({secret,...host}:RecordHost):CloudHost=>({...host,hasPassword:!!secret})
export const cloudHostSummary=({id,name,os,distribution,defaultDirectory,status,vm}:CloudHost)=>({id,name,os,distribution,defaultDirectory,sshConfigured:!vm||vm.access==='ssh',status})
export const listCloudHosts=()=>load().map(publicHost)
/** Registry discovery is read-only: it never starts SSH checks. */
export function queryCloudHosts({os,distribution}:{os?:string;distribution?:string}={}){
  if(os!==undefined&&!['linux','macos','windows'].includes(os))throw Error('os must be linux, macos or windows')
  const hosts=listCloudHosts().filter(host=>(!os||host.os===os)&&(!distribution||host.distribution===distribution.toLowerCase()))
  return hosts
}
/** Call only after role + host authorization; credentials are never added to stored/public host records. */
export function cloudHostCredentials(id:string,includeFiles=true){
  const host=getCloudHost(id),result:{id:string;password:string;files?:Record<string,{path:string;content:string}>}={id,password:cloudHostPassword(id)}
  if(includeFiles){result.files={};for(const field of ['identityFile','knownHosts','sshConfig'] as const)if(host[field])result.files[field]={path:host[field],content:fs.readFileSync(host[field],'utf8')}}
  return result
}
export function getCloudHost(id:string){const host=load().find(h=>h.id===id);if(!host)throw new Error('云主机不存在，请到 Cloud Hosts 插件选择或添加主机');return publicHost(host)}
export function cloudHostPassword(id:string){const host=load().find(h=>h.id===id);if(!host)throw new Error('Unknown cloud host');if(!host.secret)return '';const data=Buffer.from(host.secret,'base64'),decipher=createDecipheriv('aes-256-gcm',key(),data.subarray(0,12));decipher.setAuthTag(data.subarray(12,28));return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8')}
function fields(value:Record<string,any>,previous?:RecordHost):RecordHost{
  const data={...previous,...value},name=String(data.name??'').trim()
  if(!name)throw new Error('请填写云主机名称')
  const target=remoteTarget({...data,directory:data.defaultDirectory})!
  const {directory:defaultDirectory,credentialId:_credential,...connection}=target
  let vm=value.vm===null?undefined:value.vm?{...previous?.vm,...value.vm}:data.vm
  if(vm){if(!vm.hypervisorId||!vm.name||!vm.projectDirectory||!['running','stopped','paused','unknown'].includes(vm.state)||!['ssh','serial','rdp','unconfigured'].includes(vm.access))throw new Error('VM 需要 hypervisorId/name/projectDirectory/state/access');if(vm.hypervisorId===previous?.id)throw new Error('VM 不能以自己为宿主机');const parent=getCloudHost(vm.hypervisorId);remoteTarget({...parent,directory:vm.projectDirectory});vm={hypervisorId:vm.hypervisorId,name:String(vm.name),projectDirectory:String(vm.projectDirectory),state:vm.state,access:vm.access,...(vm.notes?{notes:String(vm.notes)}:{})}}
  const desktop=value.desktop===null?undefined:data.desktop
  if(desktop){
    if(!['rdp','vnc'].includes(desktop.protocol)||typeof desktop.address!=='string'||!/^[[\w.\]:-]+$/.test(desktop.address)||desktop.address.startsWith('-')||!Number.isInteger(desktop.port)||desktop.port<1||desktop.port>65535)throw Error('桌面需要有效的 protocol、address 和 port')
    if(desktop.username!==undefined&&(typeof desktop.username!=='string'||/[\r\n\0]/.test(desktop.username)))throw Error('无效桌面用户名')
    if(desktop.quality!==undefined&&!['balanced','sharp','fast'].includes(desktop.quality))throw Error('无效桌面画质')
    if(desktop.viaHostId)getCloudHost(desktop.viaHostId)
  }
  const desktopFields=desktop?{desktop:{protocol:desktop.protocol,address:desktop.address,port:desktop.port,...(desktop.viaHostId?{viaHostId:desktop.viaHostId}:{}),...(desktop.username?{username:desktop.username}:{}),quality:desktop.quality||'balanced'}}:{}
  return {...connection,...desktopFields,...(vm?{vm}:{}),id:previous?.id??randomUUID(),name,defaultDirectory,hasPassword:false,createdAt:previous?.createdAt??Date.now(),updatedAt:Date.now(),...(value.password===undefined?{secret:previous?.secret}:value.password?{secret:encrypt(String(value.password))}:{})}
}
export function createCloudHost(value:Record<string,any>){const hosts=load(),host=fields(value);if(host.vm&&hosts.some(h=>h.vm?.hypervisorId===host.vm!.hypervisorId&&h.vm?.name===host.vm!.name&&h.vm?.projectDirectory===host.vm!.projectDirectory))throw new Error('此虚拟机已登记，请更新现有记录');hosts.push(host);save(hosts);return publicHost(host)}
export function updateCloudHost(id:string,patch:Record<string,any>){const hosts=load(),at=hosts.findIndex(h=>h.id===id);if(at<0)throw new Error('Unknown cloud host');hosts[at]=fields(patch,hosts[at]);save(hosts);return publicHost(hosts[at])}
export function removeCloudHost(id:string){getCloudHost(id);if(load().some(h=>h.vm?.hypervisorId===id||h.id!==id&&h.desktop?.viaHostId===id))throw new Error('仍有虚拟机或桌面通道引用此宿主机');save(load().filter(h=>h.id!==id));fs.rmSync(path.join(directory,'askpass-'+id+'.py'),{force:true});fs.rmSync(path.join(directory,'known_hosts',id),{force:true});return {removed:true,id}}
export function cloudHostTarget(id:string,directoryOverride?:string):RemoteTarget{
  const host=getCloudHost(id)
  if(host.vm&&host.vm.access!=='ssh')throw new Error('虚拟机尚无已配置 SSH 管理入口；当前 access='+host.vm.access+'，不能冒充已连接主机')
  return remoteTarget({...host,directory:directoryOverride??host.defaultDirectory,...(host.hasPassword?{credentialId:id}:{})})!
}
/** Import existing Team connections once, deduplicating the host independently of its directory. */
export function importCloudHost(name:string,remote:RemoteTarget){
  const {directory:defaultDirectory,credentialId:_credential,...connection}=remote
  const signature=(value:any)=>JSON.stringify(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>String(a).localeCompare(String(b))))
  const hosts=load(),existing=hosts.find(({id,name,defaultDirectory,hasPassword,createdAt,updatedAt,secret,status,vm,desktop,...candidate})=>signature(candidate)===signature(connection))
  if(existing)return existing.id
  const host=fields({...connection,name,defaultDirectory});host.id='legacy-'+createHash('sha256').update(signature(connection)).digest('hex').slice(0,20);hosts.push(host);save(hosts);return host.id
}
/** SSH obtains a password on demand over the private local CLI socket. It never enters argv, target.json or model context. */
export function cloudHostAskpass(id:string,target:RemoteTarget){
  const host=getCloudHost(id)
  if(!host.hasPassword)return undefined
  for(const field of ['host','os','port','identityFile','knownHosts','sshConfig','jump'] as const)if(host[field]!==target[field])throw new Error('凭据只能用于其登记的云主机连接')
  if(process.platform==='win32')return windowsAskpass(id)
  const script=path.join(directory,'askpass-'+id+'.py')
  const source=`#!/usr/bin/env python3\nimport json,socket,sys\nfrom pathlib import Path\ns=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)\ns.settimeout(8)\ns.connect(${JSON.stringify(SOCKET_PATH)})\ns.sendall((json.dumps({'auth':Path(${JSON.stringify(path.join(APP_HOME,'control.token'))}).read_text().strip(),'cmd':'host.credentials','args':{'id':${JSON.stringify(id)},'files':False}})+'\\n').encode())\nr=json.loads(s.makefile().readline())\ns.close()\nif not r.get('ok'):sys.exit(1)\nprint(r['data']['password'])\n`
  if(!fs.existsSync(script)||fs.readFileSync(script,'utf8')!==source)fs.writeFileSync(script,source,{mode:0o700})
  return script
}

export function recordCloudHostHealth(id:string,status:NonNullable<CloudHost['status']>){const hosts=load(),host=hosts.find(h=>h.id===id);if(host){host.status=status;save(hosts)}return status}

const healthChecks=new Map<string,Promise<NonNullable<CloudHost['status']>>>()
const waitingHealthChecks:Array<()=>void>=[]
let activeHealthChecks=0
/** Shared Teams and windows reuse one probe; background checks leave SSH capacity for employees. */
export async function checkCloudHost(id:string){
  const existing=healthChecks.get(id);if(existing)return existing
  getCloudHost(id)
  const check=(async()=>{
    if(activeHealthChecks>=3)await new Promise<void>(resolve=>waitingHealthChecks.push(resolve))
    else activeHealthChecks++
    try{
      const host=getCloudHost(id)
      let status:NonNullable<CloudHost['status']>
      try{const {pingRemote}=await import('./tunnel');await pingRemote(cloudHostTarget(id));status={connected:true,checkedAt:Date.now(),environment:{os:host.os,distribution:host.distribution}}}
      catch(error){status={connected:false,checkedAt:Date.now(),error:(error as Error).message}}
      return recordCloudHostHealth(id,status)
    }finally{const next=waitingHealthChecks.shift();if(next)next();else activeHealthChecks--}
  })()
  healthChecks.set(id,check)
  try{return await check}finally{healthChecks.delete(id)}
}

export async function cloudHostFingerprints(id:string){
  const {execFile}=await import('node:child_process'),{promisify}=await import('node:util'),run=promisify(execFile),host=getCloudHost(id)
  const options=['-G',...(host.sshConfig?['-F',host.sshConfig.replace(/^~\//,process.env.HOME+'/')]:[]),...(host.port?['-p',String(host.port)]:[]),host.host]
  const config=(await run('ssh',options,{timeout:5000})).stdout.split('\n').map(line=>line.split(/\s+/,2)),get=(name:string)=>config.find(([key])=>key===name)?.[1]
  if(get('proxyjump')&&get('proxyjump')!=='none'||host.jump)throw new Error('跳板机指纹请先通过已有 SSH 工具确认并配置 known_hosts')
  if(get('hostkeyalias')&&get('hostkeyalias')!=='none')throw new Error('SSH HostKeyAlias 请使用已有 known_hosts 配置')
  const address=get('hostname')||host.host.split('@').at(-1)!,port=get('port')||'22'
  const result=await run('ssh-keyscan',['-T','5','-p',port,address],{timeout:10000,maxBuffer:128*1024})
  const keys=result.stdout.split('\n').filter(line=>line&&!line.startsWith('#')).map(line=>{const [,algorithm,encoded]=line.split(/\s+/);return {line,algorithm,fingerprint:'SHA256:'+createHash('sha256').update(Buffer.from(encoded,'base64')).digest('base64').replace(/=+$/,'')}})
  if(!keys.length)throw new Error('没有取得 SSH 主机指纹，请检查地址、端口及网络')
  return keys
}
export async function trustCloudHostFingerprint(id:string,fingerprint:string){
  const key=(await cloudHostFingerprints(id)).find(key=>key.fingerprint===fingerprint)
  if(!key)throw new Error('主机指纹已变化或不匹配，未信任。请核对服务器指纹后重试。')
  const directory_=path.join(directory,'known_hosts');fs.mkdirSync(directory_,{recursive:true,mode:0o700})
  const file_=path.join(directory_,id);fs.writeFileSync(file_,key.line+'\n',{mode:0o600});return file_
}

export function validateCloudHostPatch(id:string,patch:Record<string,any>){const previous=load().find(h=>h.id===id);if(!previous)throw new Error('Unknown cloud host');return publicHost(fields({...patch,password:undefined},previous))}
