export type RemoteTarget = {
  host:string; directory:string; os:'linux'|'macos'|'windows'; port?:number
  identityFile?:string; knownHosts?:string; sshConfig?:string; jump?:string
}
export function remoteTarget(value:unknown):RemoteTarget|null {
  if(value===null||value===undefined)return null
  if(typeof value!=='object')throw new Error('无效的云主机配置')
  const input=value as Record<string,unknown>,host=String(input.host??'').trim(),directory=String(input.directory??'').trim(),os=String(input.os??'linux')
  if(!/^(?:[\w.-]+@)?[\w[\].:-]+$/.test(host)||host.startsWith('-'))throw new Error('请填写有效的 SSH 主机、IP 或 user@host')
  if(!['linux','macos','windows'].includes(os))throw new Error('请选择 Linux、macOS 或 Windows')
  if(/[\0\r\n]/.test(directory)||!(os==='windows'?/^[a-z]:[\\/]/i.test(directory):directory.startsWith('/')))throw new Error('请填写云主机工作文件夹的绝对路径')
  const result:RemoteTarget={host,directory,os:os as RemoteTarget['os']}
  if(input.port!==undefined&&input.port!==''){const port=Number(input.port);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('SSH 端口必须在 1–65535 之间');result.port=port}
  for(const key of ['identityFile','knownHosts','sshConfig','jump'] as const)if(input[key])result[key]=String(input[key]).trim()
  if(result.jump&&(!/^(?:[\w.-]+@)?[\w[\].:-]+$/.test(result.jump)||result.jump.startsWith('-')))throw new Error('无效的跳板机地址')
  return result
}
