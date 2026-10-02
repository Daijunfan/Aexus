import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {APP_HOME,SOCKET_PATH} from '../shared/protocol'
import {applicationRoot} from './resources'
import {atomicJson} from './atomic-file'
/** Build from the shipped, auditable source using the OS .NET compiler; no download or elevation. */
export function windowsAskpass(hostId:string){
  if(!/^[a-zA-Z0-9-]+$/.test(hostId))throw Error('Invalid credential host ID')
  const resources=process.resourcesPath
  const source=resources&&fs.existsSync(path.join(resources,'Modules/Tunnel/windows/askpass.cs'))?path.join(resources,'Modules/Tunnel/windows/askpass.cs'):path.join(applicationRoot(),'Modules/Tunnel/windows/askpass.cs')
  const hash=createHash('sha256').update(fs.readFileSync(source)).digest('hex').slice(0,16)
  const directory=path.join(APP_HOME,'cloud-hosts'),binary=path.join(directory,'askpass-'+hash+'.exe')
  fs.mkdirSync(directory,{recursive:true,mode:0o700})
  if(!fs.existsSync(binary)){
    const system=process.env.SystemRoot??'C:\\Windows'
    const csc=['Framework64','Framework'].map(name=>path.join(system,'Microsoft.NET',name,'v4.0.30319','csc.exe')).find(file=>fs.existsSync(file))
    if(!csc)throw Error('Windows OpenSSH password login requires the Windows .NET Framework compiler. Use an SSH key until it is installed; no unknown host is trusted automatically.')
    const stage=binary+'.building.exe'
    try{execFileSync(csc,['/nologo','/target:exe','/reference:System.Web.Extensions.dll','/out:'+stage,source],{timeout:30000,windowsHide:true,stdio:'pipe'});fs.renameSync(stage,binary)}finally{fs.rmSync(stage,{force:true})}
  }
  const helper=path.join(directory,'askpass-'+hostId+'-'+hash+'.exe')
  if(!fs.existsSync(helper))fs.copyFileSync(binary,helper,fs.constants.COPYFILE_EXCL)
  const config=helper+'.json'
  if(!fs.existsSync(config))atomicJson(config,{endpoint:SOCKET_PATH,tokenFile:path.join(APP_HOME,'control.token'),hostId})
  return helper
}
