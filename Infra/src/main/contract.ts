import catalog from '../../../Contract/commands.v1.json'
import {capabilityDomain} from '../../../Contract/policy'
import fs from 'node:fs'
import path from 'node:path'
import {CONTRACT_VERSION,requireVersion,contractError,type CommandDescriptor} from '../../../Contract/protocol'
import {validateEngineManifest,type EngineEntry} from '../../../Contract/engine'
import {COMMANDS} from '../shared/api-registry'
import {applicationRoot} from './resources'
import {requestContext} from './authorization'
export {capabilityDomain} from '../../../Contract/policy'
export function engineCapabilities():CommandDescriptor[]{return catalog.commands as CommandDescriptor[]}
export function installedEngines(){
 const root=path.join(applicationRoot(),'Engine'),engines:EngineEntry[]=[],errors:{directory:string;error:string}[]=[]
 if(!fs.existsSync(root))return {engines,errors}
 for(const dir of fs.readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  if(!dir.isDirectory()||dir.name.startsWith('.'))continue
  const file=path.join(root,dir.name,'engine.json');if(!fs.existsSync(file))continue
  try{const manifest=validateEngineManifest(JSON.parse(fs.readFileSync(file,'utf8')),dir.name);for(const entry of [manifest.ui,manifest.cli,...(manifest.runtime?[manifest.runtime]:[])])if(!fs.statSync(path.join(root,dir.name,entry)).isFile())throw Error('Missing Engine entry: '+entry);const supported=new Set(engineCapabilities().map(c=>c.name));for(const command of manifest.requiredCommands)if(!supported.has(command))throw Error('Unsupported capability: '+command);engines.push({...manifest,directory:dir.name})}catch(error){errors.push({directory:dir.name,error:(error as Error).message})}
 }
 return {engines,errors}
}
export async function contractRequest(command:string,args:Record<string,unknown>,invoke:(name:string,args:Record<string,unknown>)=>Promise<unknown>){
 requestContext() // never create a synthetic operator identity at the layer boundary
 if(command==='contract.info')return {contractVersion:CONTRACT_VERSION,product:'Aexus',transport:'authenticated-cli-json',mutations:'no automatic retries',authority:'original caller',domains:['company','messages','plan','files','runtime'],plugins:false}
 if(command==='contract.engines')return installedEngines()
 if(command==='infra.api'){if(args.domain&&!['company','messages','plan','files','runtime'].includes(String(args.domain)))throw Error('Choose a valid Infra domain');const list=COMMANDS.filter(c=>!c.name.startsWith('plugin.')&&!c.name.startsWith('contract.')&&!c.replacement&&(!args.domain||capabilityDomain(c.name)===args.domain));return args.command?list.find(c=>c.name===args.command)??(()=>{throw Error('Unknown Infra command')})():{commands:list,plugins:false}}
 requireVersion(args.version??(command==='contract.describe'?CONTRACT_VERSION:undefined))
 const capabilities=engineCapabilities()
 if(command==='contract.describe'){
  if(args.domain!==undefined&&!['company','messages','plan','files','runtime'].includes(String(args.domain)))throw contractError('CONTRACT_REQUEST_INVALID','Choose a valid Contract domain')
  if(args.command){const found=capabilities.find(c=>c.name===args.command);if(!found)throw contractError('CONTRACT_COMMAND_UNAVAILABLE','Command is not exported through Contract');return {contractVersion:CONTRACT_VERSION,command:found}}
  return {contractVersion:CONTRACT_VERSION,commands:capabilities.filter(c=>!args.domain||c.domain===args.domain)}
 }
 if(command==='contract.call'){
  const name=String(args.command),capability=capabilities.find(c=>c.name===name)
  if(!capability)throw contractError('CONTRACT_COMMAND_UNAVAILABLE','Command is not exported through Contract: '+name)
  if(capability.transport==='stream')throw contractError('CONTRACT_STREAM_REQUIRED','Use the Contract Node client follow() or the Infra streaming CLI')
  const input=args.args===undefined?{}:args.args;if(!input||typeof input!=='object'||Array.isArray(input))throw contractError('CONTRACT_REQUEST_INVALID','args must be a JSON object')
  if(name==='host.list'&&(input as Record<string,unknown>).credentials)throw contractError('CONTRACT_COMMAND_UNAVAILABLE','Raw host credentials are not exported through Contract')
  const data=await invoke(name,input as Record<string,unknown>);return {contractVersion:CONTRACT_VERSION,command:name,data}
 }
 throw contractError('CONTRACT_COMMAND_UNAVAILABLE','Unknown Contract operation')
}
