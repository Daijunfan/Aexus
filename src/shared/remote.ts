export type RemoteTarget = {
  cliBin?:string
  host:string; directory:string; os:'linux'|'macos'|'windows'; port?:number
  credentialId?:string
  distribution?:string
  identityFile?:string; knownHosts?:string; sshConfig?:string; jump?:string
}
export type RemoteEnvironment = {os:string;hostname?:string;distribution?:string;distributionName?:string}
export type RemoteCheck = {info:string;environment:RemoteEnvironment}
export type RemoteHealth = {connected:boolean;environment?:RemoteEnvironment}
export function remoteTarget(value:unknown):RemoteTarget|null {
  if(value===null||value===undefined)return null
  if(typeof value!=='object')throw new Error('无效的云主机配置')
  const input=value as Record<string,unknown>,host=String(input.host??'').trim(),directory=String(input.directory??'').trim(),os=String(input.os??'linux')
  if(!/^(?:[\w.-]+@)?[\w[\].:-]+$/.test(host)||host.startsWith('-'))throw new Error('请填写有效的 SSH 主机、IP 或 user@host')
  if(!['linux','macos','windows'].includes(os))throw new Error('请选择 Linux、macOS 或 Windows')
  if(/[\0\r\n]/.test(directory)||!(os==='windows'?/^[a-z]:[\\/]/i.test(directory):directory.startsWith('/')))throw new Error('请填写云主机工作文件夹的绝对路径')
  const result:RemoteTarget={host,directory,os:os as RemoteTarget['os']}
  if(input.credentialId){if(!/^[a-z0-9-]+$/i.test(String(input.credentialId)))throw new Error('无效凭据引用');result.credentialId=String(input.credentialId)}
  if(input.distribution){
    const distribution=String(input.distribution).trim().toLowerCase()
    if(os!=='linux'||!/^[a-z0-9][a-z0-9._-]*$/.test(distribution))throw new Error('Linux 发行版标识无效')
    result.distribution=distribution
  }
  if(input.port!==undefined&&input.port!==''){const port=Number(input.port);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('SSH 端口必须在 1–65535 之间');result.port=port}
  for(const key of ['identityFile','knownHosts','sshConfig','jump'] as const)if(input[key])result[key]=String(input[key]).trim()
  if(result.jump&&(!/^(?:[\w.-]+@)?[\w[\].:-]+$/.test(result.jump)||result.jump.startsWith('-')))throw new Error('无效的跳板机地址')
  return result
}

export type VirtualMachine = {hypervisorId:string;name:string;projectDirectory:string;state:'running'|'stopped'|'paused'|'unknown';access:'ssh'|'serial'|'rdp'|'unconfigured';notes?:string}
export type CloudHost = Omit<RemoteTarget,'directory'|'credentialId'> & {id:string;name:string;vm?:VirtualMachine;defaultDirectory:string;hasPassword:boolean;createdAt:number;updatedAt:number;status?:RemoteHealth&{checkedAt:number;error?:string}}
