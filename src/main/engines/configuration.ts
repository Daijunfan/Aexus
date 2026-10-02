import fs from 'node:fs'
import path from 'node:path'
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto'
import {APP_HOME} from '../../shared/protocol'
import {isEngine,type EngineId} from '../../shared/engines'
import {atomicJson,readJson} from '../atomic-file'
type Config={path?:string;managedPath?:string;sdkPath?:string;baseUrl?:string;model?:string;secret?:string}
const directory=path.join(APP_HOME,'engines'),file=path.join(directory,'settings.json'),keyFile=path.join(directory,'credential.key')
const all=()=>readJson<Partial<Record<EngineId,Config>>>(file,()=>({}))
function key(){if(!fs.existsSync(keyFile)){fs.mkdirSync(directory,{recursive:true,mode:0o700});fs.writeFileSync(keyFile,randomBytes(32),{mode:0o600,flag:'wx'})};return fs.readFileSync(keyFile)}
export const engineConfiguration=(engine:EngineId)=>all()[engine]??{}
export function processProvider(engine:'cline'|'pi'){
  const config=engineConfiguration(engine),custom=!!config.baseUrl
  return {provider:custom?(engine==='cline'?'openai-compatible':'agents-company'):'deepseek',model:custom?config.model||'deepseek-flash':'deepseek-flash',baseUrl:config.baseUrl,managedReasoning:custom}
}
export function publicEngineConfiguration(engine:EngineId){const {secret,...config}=engineConfiguration(engine);return {...config,hasApiKey:!!secret}}
export function configureEngine(engine:EngineId,patch:{path?:string;sdkPath?:string;baseUrl?:string;model?:string;apiKey?:string}){
  if(!isEngine(engine)||!patch||Object.keys(patch).some(k=>!['path','sdkPath','baseUrl','model','apiKey'].includes(k)))throw Error('Invalid engine configuration')
  const data=all(),value={...data[engine]}
  if(patch.path!==undefined){if(patch.path&&(!path.isAbsolute(patch.path)||!fs.existsSync(patch.path)||!fs.statSync(patch.path).isFile()))throw Error('Choose an existing executable on the Core host');value.path=patch.path||undefined}
  if(patch.sdkPath!==undefined){if(engine!=='claude'||patch.sdkPath&&(!path.isAbsolute(patch.sdkPath)||!fs.existsSync(patch.sdkPath)||!fs.statSync(patch.sdkPath).isFile()))throw Error('Choose an existing Claude Agent SDK module on the Core host');value.sdkPath=patch.sdkPath||undefined}
  if(patch.baseUrl!==undefined){if(patch.baseUrl){const url=new URL(patch.baseUrl);if(url.username||url.password||url.search||url.hash||url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Provider URL must use HTTPS (HTTP is allowed only for loopback development)')};value.baseUrl=patch.baseUrl||undefined}
  if(patch.model!==undefined){if(!['cline','pi'].includes(engine)||typeof patch.model!=='string'||patch.model.length>160||/[\x00-\x1f]/.test(patch.model))throw Error('Invalid compatible model ID');value.model=patch.model.trim()||undefined}
  if(['cline','pi'].includes(engine)){
    if(value.baseUrl&&!value.model)throw Error('Provide the exact model ID for this compatible endpoint')
    if(!value.baseUrl)delete value.model
  }
  if(patch.apiKey!==undefined){
    if(typeof patch.apiKey!=='string'||patch.apiKey.length>8192)throw Error('Invalid API key')
    if(patch.apiKey){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv),bytes=Buffer.concat([cipher.update(patch.apiKey,'utf8'),cipher.final()]);value.secret=Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64')}
    else delete value.secret
  }
  data[engine]=value;atomicJson(file,data,true);return publicEngineConfiguration(engine)
}
export function setManagedEngine(engine:EngineId,executable:string,sdkPath?:string){const data=all();data[engine]={...data[engine],path:undefined,managedPath:executable,...(sdkPath?{sdkPath}:{})};atomicJson(file,data,true)}
export function engineEnvironment(engine:EngineId):NodeJS.ProcessEnv{
  const config=engineConfiguration(engine),env:NodeJS.ProcessEnv={}
  if(config.baseUrl)env[engine==='claude'?'ANTHROPIC_BASE_URL':'OPENAI_BASE_URL']=config.baseUrl
  if(config.secret){const bytes=Buffer.from(config.secret,'base64'),cipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));const secret=Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8');env[engine==='cline'?'CLINE_API_KEY':engine==='pi'?'DEEPSEEK_API_KEY':engine==='claude'?'ANTHROPIC_API_KEY':'OPENAI_API_KEY']=secret;if(engine==='claude')env.ANTHROPIC_AUTH_TOKEN=''}
  return env
}
