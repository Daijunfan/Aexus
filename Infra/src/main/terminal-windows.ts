import {createRequire} from 'node:module'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import type {ChildProcessWithoutNullStreams} from 'node:child_process'
import type {RemoteTarget} from '../shared/remote'
import {childEnv,resolveBinary} from './exec'
import {tunnelConfig} from './tunnel'
const requireModule=createRequire(__filename)
/** A ConPTY driver exposes the same JSON-line contract as the POSIX broker. */
export function windowsTerminal(cwd:string,remote:RemoteTarget|undefined,cols:number,rows:number):ChildProcessWithoutNullStreams{
  let pty:typeof import('node-pty')
  try{pty=requireModule('node-pty')}catch{throw Error('Windows 交互终端需要 node-pty / ConPTY。请安装本机平台发行包或运行 npm rebuild node-pty；不会回退成无交互命令。')}
  const env={...childEnv(),TERM:'xterm-256color'} as Record<string,string>
  for(const key of Object.keys(env))if(env[key]===undefined)delete env[key]
  let command=resolveBinary('powershell'),args=['-NoLogo','-NoProfile']
  if(remote){
    const target=tunnelConfig(remote)
    command=resolveBinary('ssh');args=['-tt','-o','StrictHostKeyChecking=yes','-o','ServerAliveInterval=15','-o','ConnectTimeout=10']
    for(const [field,flag] of [['port','-p'],['identity_file','-i'],['known_hosts','-o'],['ssh_config','-F'],['proxy_jump','-J']])if(target[field])args.push(flag,field==='known_hosts'?'UserKnownHostsFile='+target[field]:String(target[field]))
    if(target.askpass){env.SSH_ASKPASS=String(target.askpass);env.SSH_ASKPASS_REQUIRE='force';env.DISPLAY='agents-company'}
    args.push(remote.host)
    if(remote.os==='windows'){
      const script="try { Set-Location -LiteralPath '"+remote.directory.replaceAll("'","''")+"' -ErrorAction Stop } catch { Write-Error $_; exit 1 }"
      args.push('powershell.exe -NoLogo -NoProfile -NoExit -EncodedCommand '+Buffer.from(script,'utf16le').toString('base64'))
    }else args.push("cd -- '"+remote.directory.replaceAll("'","'\\''")+"' && exec \"${SHELL:-/bin/bash}\" -l")
  }
  const native=pty.spawn(command,args,{name:'xterm-256color',cwd,cols,rows,env})
  const broker=new EventEmitter() as any
  broker.pid=native.pid;broker.stdin=new PassThrough();broker.stdout=new PassThrough();broker.stderr=new PassThrough()
  let buffer='',ended=false
  native.onData(data=>broker.stdout.write(JSON.stringify({data:Buffer.from(data,'utf8').toString('base64')})+'\n'))
  native.onExit(({exitCode})=>{if(ended)return;ended=true;broker.stdout.write(JSON.stringify({exitCode})+'\n');broker.stdout.end();broker.stderr.end();broker.emit('close',exitCode)})
  broker.stdin.on('data',(data:Buffer)=>{
    buffer+=data.toString('utf8')
    for(;;){const end=buffer.indexOf('\n');if(end<0)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+1)
      try{const request=JSON.parse(line);if(request.op==='input')native.write(request.data);else if(request.op==='resize')native.resize(request.cols,request.rows)}catch(error){broker.emit('error',error)}
    }
  })
  broker.kill=()=>{native.kill();return true}
  return broker as ChildProcessWithoutNullStreams
}
