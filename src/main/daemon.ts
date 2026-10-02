import {startRuntime} from './runtime'
import {SOCKET_PATH} from '../shared/protocol'
let stopRuntime:(()=>Promise<void>)|undefined
let web:{url:string;close:()=>Promise<void>}|undefined
let stopping=false
async function shutdown(){
  if(stopping)return
  stopping=true
  try{await web?.close();await stopRuntime?.()}finally{process.exitCode=0}
}
async function main(){
  stopRuntime=startRuntime()
  console.log(`Agents Company CLI service: ${SOCKET_PATH}`)
  if(process.env.AGENTS_COMPANY_WEB==='1'){
    const {startWebServer}=await import('./web/server')
    web=await startWebServer({host:process.env.AGENTS_COMPANY_WEB_HOST,port:process.env.AGENTS_COMPANY_WEB_PORT===undefined?undefined:Number(process.env.AGENTS_COMPANY_WEB_PORT),publicUrl:process.env.AGENTS_COMPANY_WEB_PUBLIC_URL,allowInsecure:process.env.AGENTS_COMPANY_WEB_ALLOW_INSECURE==='1'})
    console.log(`Agents Company Web: ${web.url}\nAccess token: run \`agents web token\` locally on the Core host.`)
  }
}
const requestShutdown=()=>{void shutdown().then(()=>process.exit(0),error=>{console.error('Core shutdown:',error);process.exit(1)})}
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,requestShutdown)
// Node's kill(SIGTERM) is a hard termination on Windows. A supervising parent
// can request the same orderly cleanup over its private inherited IPC channel.
if(process.send)process.on('message',message=>{if(message&&typeof message==='object'&&(message as {type?:string}).type==='agents-company:shutdown')requestShutdown()})
void main().catch(async error=>{console.error((error as Error).message);await shutdown();process.exitCode=1})
