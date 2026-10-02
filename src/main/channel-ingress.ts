import http from 'node:http'
import {channelCollectorRequest,getChannelSettings} from './channels'

let server:http.Server|undefined,signature='',pending=Promise.resolve(),state:{listening:boolean;url?:string;error?:string}={listening:false}
const requests=new Set<Promise<void>>()
export const channelIngressStatus=()=>({...state})
const failure=(message:string,status:number,code='REQUEST_FAILED')=>Object.assign(Error(message),{status,code})
const json=(res:http.ServerResponse,value:unknown,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value))}

/** This listener exposes only the collector capability; it cannot dispatch company/employee APIs. */
async function receive(req:http.IncomingMessage,res:http.ServerResponse){
 try{
  if(req.url!=='/api/channels/collector')throw failure('Unknown endpoint',404)
  if(req.method!=='POST')throw failure('Use POST for collector requests',405)
  const token=req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1]
  if(!token)throw failure('Collector authentication required',401,'UNAUTHENTICATED')
  if(req.headers.origin)throw failure('Collector credentials are for service connections',403)
  if(!req.headers['content-type']?.startsWith('application/json'))throw failure('Content-Type must be application/json',415)
  const limit=12*1024*1024,chunks:Buffer[]=[];let bytes=0
  for await(const part of req){bytes+=part.length;if(bytes>limit)throw failure('Collector request is too large',413);chunks.push(Buffer.from(part))}
  let request:any;try{request=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw failure('Invalid JSON',400)}
  if(!request||typeof request.cmd!=='string'||request.args!==undefined&&(!request.args||Array.isArray(request.args)||typeof request.args!=='object'))throw failure('Invalid collector request',400)
  json(res,{ok:true,data:await channelCollectorRequest(token,request.cmd,request.args??{})})
 }catch(cause){const error=cause as Error&{status?:number;code?:string};if(!res.headersSent)json(res,{ok:false,error:error.message,code:error.code??'REQUEST_FAILED'},error.status??400);else res.destroy()}
}
async function stop(){const old=server;server=undefined;signature='';state={listening:false};if(old){old.closeAllConnections();await new Promise<void>((resolve,reject)=>old.close(error=>error?reject(error):resolve()));await Promise.allSettled([...requests])}}
export function syncChannelIngress(){
 pending=pending.catch(()=>{}).then(async()=>{
  const settings=getChannelSettings(),next=JSON.stringify(settings)
  if(signature===next)return
  await stop();if(!settings.enabled){signature=next;return}
  const candidate=http.createServer((req,res)=>{const request=receive(req,res);requests.add(request);void request.finally(()=>requests.delete(request))})
  try{await new Promise<void>((resolve,reject)=>{candidate.once('error',reject);candidate.listen(settings.port,settings.host,()=>{candidate.off('error',reject);resolve()})});server=candidate;signature=next;state={listening:true,url:`http://${settings.host}:${settings.port}`}}
  catch(cause){state={listening:false,error:(cause as Error).message};throw cause}
 })
 return pending
}
export async function closeChannelIngress(){await pending.catch(()=>{});await stop()}
