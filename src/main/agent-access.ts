import fs from 'node:fs'
import path from 'node:path'
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {APP_HOME,SOCKET_PATH} from '../shared/protocol'
import type {RequestContext} from '../shared/management'
import {readStore} from './store'

const operatorFile=path.join(APP_HOME,'control.token'),directory=path.join(APP_HOME,'agent-access'),registry=path.join(directory,'tokens.json')
const hash=(token:string)=>createHash('sha256').update(token).digest('hex')
type Token={employeeId:string;hash:string}
function tokens():Token[]{return fs.existsSync(registry)?JSON.parse(fs.readFileSync(registry,'utf8')):[]}
function save(value:Token[]){fs.mkdirSync(directory,{recursive:true,mode:0o700});const temporary=registry+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value),{mode:0o600});fs.renameSync(temporary,registry)}
export function initializeAccessChannel(){fs.mkdirSync(APP_HOME,{recursive:true,mode:0o700});if(!fs.existsSync(operatorFile))fs.writeFileSync(operatorFile,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'})}
export function authenticate(token:unknown):RequestContext{
  if(typeof token!=='string'||!token)throw Error('Authentication required')
  const digest=hash(token)
  if(fs.existsSync(operatorFile)&&digest===hash(fs.readFileSync(operatorFile,'utf8').trim()))return {principal:{kind:'operator'},requestId:randomUUID()}
  const entry=tokens().find(value=>value.hash===digest)
  if(!entry||!readStore().sessions.some(card=>card.id===entry.employeeId&&!card.deleting))throw Error('Invalid or revoked Agent credential')
  return {principal:{kind:'agent',employeeId:entry.employeeId},requestId:randomUUID(),credentialHash:digest}
}
export function credentialActive(employeeId:string,digest:string){return tokens().some(value=>value.employeeId===employeeId&&value.hash===digest)}
export function agentCredential(employeeId:string){
  if(!readStore().sessions.some(card=>card.id===employeeId&&!card.deleting))throw Error('Unknown employee')
  const folder=path.join(directory,employeeId),file=path.join(folder,'token')
  if(fs.existsSync(file)){const token=fs.readFileSync(file,'utf8').trim();if(tokens().some(value=>value.employeeId===employeeId&&value.hash===hash(token)))return {token,file,folder}}
  const token=randomBytes(32).toString('hex');fs.mkdirSync(folder,{recursive:true,mode:0o700});fs.writeFileSync(file,token,{mode:0o600});save([...tokens().filter(value=>value.employeeId!==employeeId),{employeeId,hash:hash(token)}]);return {token,file,folder}
}
export function revokeAgentCredential(employeeId:string){save(tokens().filter(value=>value.employeeId!==employeeId));fs.rmSync(path.join(directory,employeeId,'token'),{force:true});return {revoked:true,employeeId}}
export function removeAgentAccessData(employeeId:string){revokeAgentCredential(employeeId);fs.rmSync(path.join(directory,employeeId),{recursive:true,force:true})}
export function agentEnvironment(employeeId:string){const credential=agentCredential(employeeId),store=readStore(),card=store.sessions.find(c=>c.id===employeeId)!,plugin=store.teamSettings?.[card.group]?.pluginId;return {...(plugin?{AGENTS_COMPANY_PLUGIN_RPC:path.join(card.cwd,'.agents-company','ipc',plugin,employeeId)}:{}),PATH:path.join(card.cwd,'.agents-company','bin')+path.delimiter+(process.env.PATH??''), AGENTS_COMPANY_URL:undefined,AGENTS_COMPANY_ALLOW_INSECURE:undefined,AGENTS_COMPANY_TOKEN:undefined,AGENTS_COMPANY_TOKEN_FILE:credential.file,AGENTS_COMPANY_SOCKET:SOCKET_PATH,AGENTS_COMPANY_HOME:APP_HOME,AGENTS_COMPANY_EMPLOYEE:employeeId}}
