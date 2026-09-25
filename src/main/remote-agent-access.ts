import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process'
import {createInterface} from 'node:readline'
import {agentCredential,authenticate} from './agent-access'
import {readStore} from './store'
import {employeeGuideFiles,employeeInstructions} from './plugins/documents'
import {assertManagementKind} from '../shared/management'
import {SOCKET_PATH} from '../shared/protocol'
import type {RemoteTarget} from '../shared/remote'
import {tunnelConfig,tunnelDirectory,python} from './tunnel'
import {childEnv} from './exec'

const gateways=new Map<string,{bin:string;close:()=>void;bootstrapKey:string}>()
export const remoteAgentBin=(id?:string)=>id?gateways.get(id)?.bin:undefined
export function closeRemoteAgentAccess(id:string){gateways.get(id)?.close();gateways.delete(id)}
/** A reverse tunnel terminates at an identity-bound gateway, never the operator socket. */
export async function prepareRemoteAgentAccess(employeeId:string,target:RemoteTarget){
  const store=readStore(),card=store.sessions.find(value=>value.id===employeeId&&!value.deleting)
  if(!card)throw Error('Unknown employee')
  const global=!!store.access?.globalManagerIds.includes(employeeId)
  assertManagementKind(card,global)
  if(card.kind==='cloud-native-worker'||card.managementRole!=='manager'&&!global)throw Error('Remote management CLI requires a local Manager')
  const guideFiles=employeeGuideFiles(card,store),bootstrapKey=JSON.stringify([target,card.group,card.managementRole,global])
  const prior=gateways.get(employeeId)
  if(prior?.bootstrapKey===bootstrapKey)return prior.bin
  if(prior)closeRemoteAgentAccess(employeeId)
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
    files.push(...remoteGuideEntries(base,paths,guideFiles))
    const guide=employeeInstructions(card,store,paths.join(bin,target.os==='windows'?'agents.cmd':'agents'))
    await writeRemoteGuide(target,employeeId,files,guide)
    gateways.set(employeeId,{bin,close,bootstrapKey});tunnel.on('exit',()=>{if(gateways.get(employeeId)?.close===close){gateways.delete(employeeId);close()}})
    return bin
  }catch(error){close();throw error}
}

type GuideFile={path:string;content:string;mode:number}
function remoteGuideEntries(base:string,paths:typeof path,guide:ReturnType<typeof employeeGuideFiles>):GuideFile[]{
  return [{path:paths.join(base,'API.md'),content:guide.api,mode:0o600},{path:paths.join(base,'PERMISSIONS.md'),content:guide.permissions,mode:0o600},...['AGENTS.md','CLAUDE.md'].map(name=>({path:paths.join(base,name),content:guide.instructions,mode:0o600}))]
}
async function writeRemoteGuide(target:RemoteTarget,employeeId:string,files:GuideFile[],guide:string){
  const bootstrap=spawn(python(),[path.join(tunnelDirectory(),'agent_process.py'),'access-bootstrap'],{env:childEnv(),stdio:['pipe','pipe','pipe']})
  await new Promise<void>((resolve,reject)=>{
    let error='';const timer=setTimeout(()=>{bootstrap.kill();reject(Error('Remote employee documentation setup timed out'))},20000)
    bootstrap.stderr.on('data',value=>error=(error+value).slice(-4000))
    bootstrap.once('error',cause=>{clearTimeout(timer);reject(cause)})
    bootstrap.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error(error||'Remote documentation setup failed'))})
    bootstrap.stdin.end(JSON.stringify({target:tunnelConfig(target),files,guide,employeeId}))
  })
}
/** Native employees get their hidden handbooks without receiving a Manager gateway or credential. */
export async function prepareRemoteEmployeeDocuments(employeeId:string,target:RemoteTarget){
  const store=readStore(),card=store.sessions.find(card=>card.id===employeeId&&!card.deleting)
  if(!card)throw Error('Unknown employee')
  const paths=target.os==='windows'?path.win32:path.posix,base=paths.join(target.directory,'.agents-company','employees',employeeId)
  const guide=employeeGuideFiles(card,store)
  await writeRemoteGuide(target,employeeId,remoteGuideEntries(base,paths,guide),guide.instructions)
}
