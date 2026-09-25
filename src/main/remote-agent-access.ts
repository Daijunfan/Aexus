import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process'
import {createInterface} from 'node:readline'
import {agentCredential,authenticate} from './agent-access'
import {SOCKET_PATH} from '../shared/protocol'
import type {RemoteTarget} from '../shared/remote'
import {tunnelConfig,tunnelDirectory,python} from './tunnel'
import {childEnv} from './exec'

const gateways=new Map<string,{bin:string;close:()=>void}>()
export const remoteAgentBin=(id?:string)=>id?gateways.get(id)?.bin:undefined
export function closeRemoteAgentAccess(id:string){gateways.get(id)?.close();gateways.delete(id)}
/** A reverse tunnel terminates at an identity-bound gateway, never the operator socket. */
export async function prepareRemoteAgentAccess(employeeId:string,target:RemoteTarget){
  if(gateways.has(employeeId))return gateways.get(employeeId)!.bin
  const {token}=agentCredential(employeeId),sockets=new Set<net.Socket>()
  const server=net.createServer(client=>{
    sockets.add(client);client.on('error',()=>{});client.on('close',()=>sockets.delete(client))
    const core=net.connect(SOCKET_PATH);sockets.add(core);core.on('error',()=>client.destroy());core.on('close',()=>{sockets.delete(core);client.end()});core.pipe(client)
    const lines=createInterface({input:client});lines.on('line',line=>{try{const request=JSON.parse(line),context=authenticate(request.auth);if(context.principal.kind!=='agent'||context.principal.employeeId!==employeeId||request.auth!==token)throw Error('Wrong Agent gateway identity');core.write(JSON.stringify({...request,auth:token})+'\n')}catch(error){client.end(JSON.stringify({ok:false,error:(error as Error).message})+'\n')}});client.on('close',()=>{lines.close();core.destroy()})
  })
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
  let tunnel:ChildProcessWithoutNullStreams|undefined
  const close=()=>{tunnel?.kill('SIGTERM');for(const socket of sockets)socket.destroy();server.close()}
  try{
    const payload=Buffer.from(JSON.stringify({target:tunnelConfig(target),port:(server.address() as net.AddressInfo).port})).toString('base64url')
    tunnel=spawn(python(),[path.join(tunnelDirectory(),'agent_process.py'),'gateway',payload],{env:childEnv(),stdio:['pipe','pipe','pipe']})
    const port=await new Promise<number>((resolve,reject)=>{let error='';const timer=setTimeout(()=>{close();reject(Error('Remote Agent API tunnel timed out'))},20000);tunnel!.once('error',cause=>{clearTimeout(timer);reject(cause)});tunnel!.once('exit',()=>{clearTimeout(timer);reject(Error(error||'Remote API tunnel closed'))});tunnel!.stderr.on('data',chunk=>{error=(error+chunk).slice(-4000);const match=error.match(/Allocated port (\d+)/);if(match){clearTimeout(timer);resolve(Number(match[1]))}})})
    const paths=target.os==='windows'?path.win32:path.posix,base=paths.join(target.directory,'.agents-company','employees',employeeId),bin=paths.join(base,'bin'),quote=(value:string)=>"'"+value.replaceAll("'","'\\''")+"'"
    const launcher=target.os==='windows'?`@echo off\r\nset AGENTS_COMPANY_PORT=${port}\r\nset AGENTS_COMPANY_TOKEN_FILE=${paths.join(base,'token')}\r\nset AGENTS_COMPANY_TOKEN=\r\nnode "${paths.join(bin,'agents.cjs')}" %*\r\n`:`#!/bin/sh\nexport AGENTS_COMPANY_PORT=${port}\nexport AGENTS_COMPANY_TOKEN_FILE=${quote(paths.join(base,'token'))}\nunset AGENTS_COMPANY_TOKEN\nexport PATH="$PATH:$HOME/.local/bin:$HOME/.local/node-current/bin:/usr/local/bin"\nif ! command -v node >/dev/null 2>&1 && [ -f "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; fi\nexec node ${quote(paths.join(bin,'agents.cjs'))} "$@"\n`
    const files=[{path:paths.join(base,'token'),content:token,mode:0o600},{path:paths.join(bin,target.os==='windows'?'agents.cmd':'agents'),content:launcher,mode:0o700},{path:paths.join(bin,'agents.cjs'),content:fs.readFileSync(path.resolve(__dirname,'../../../bin/agents'),'utf8'),mode:0o600}]
    const guide=`Your Agents Company control CLI is ${paths.join(bin,target.os==='windows'?'agents.cmd':'agents')}. Run auth whoami, api docs, and management topology before managing staff. Your identity remains your own when other Agents send you tasks.`
    const bootstrap=spawn(python(),[path.join(tunnelDirectory(),'agent_process.py'),'access-bootstrap'],{env:childEnv(),stdio:['pipe','pipe','pipe']})
    await new Promise<void>((resolve,reject)=>{let error='';const timer=setTimeout(()=>{bootstrap.kill();reject(Error('Remote Agent CLI setup timed out'))},20000);bootstrap.stderr.on('data',value=>error+=value);bootstrap.once('error',cause=>{clearTimeout(timer);reject(cause)});bootstrap.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error(error||'Remote CLI setup failed'))});bootstrap.stdin.end(JSON.stringify({target:tunnelConfig(target),files,guide,employeeId}))})
    gateways.set(employeeId,{bin,close});tunnel.on('exit',()=>{if(gateways.get(employeeId)?.close===close){gateways.delete(employeeId);close()}})
    return bin
  }catch(error){close();throw error}
}
