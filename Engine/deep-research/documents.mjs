import {Worker} from 'node:worker_threads'
import {workerURL} from './worker-path.mjs'
import {createHash} from 'node:crypto'

export const DOCUMENT_LIMITS=Object.freeze({files:6,fileBytes:4*1024*1024,totalBytes:4*1024*1024,characters:80000,totalCharacters:200000,pages:200})
const supported=/\.(txt|md|csv|json|pdf|docx|xlsx|pptx)$/i
function filesFor(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='files'))throw Error('文档准备仅接受 files')
 if(!Array.isArray(input.files)||!input.files.length||input.files.length>DOCUMENT_LIMITS.files)throw Error('一次可添加 1–6 份参考材料')
 let total=0
 return input.files.map(file=>{
  if(!file||Object.keys(file).some(key=>!['name','content','encoding'].includes(key))||typeof file.name!=='string'||!file.name.trim()||file.name.length>160||/[\\/\x00-\x1f]/.test(file.name)||!supported.test(file.name))throw Error('支持 TXT、Markdown、CSV、JSON、PDF、DOCX、XLSX、PPTX；文件名不能包含路径')
  if(file.encoding!=='base64'||typeof file.content!=='string'||!file.content.length||file.content.length>Math.ceil(DOCUMENT_LIMITS.fileBytes/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content))throw Error('文档需要有效 base64 内容；单份最多 4 MiB')
  const bytes=Buffer.from(file.content,'base64');total+=bytes.length
  if(!bytes.length||bytes.length>DOCUMENT_LIMITS.fileBytes||total>DOCUMENT_LIMITS.totalBytes)throw Error('一次上传的原始文档合计最多 4 MiB')
  return {name:file.name.trim(),data:bytes,sha256:createHash('sha256').update(bytes).digest('hex')}
 })
}

/** Parsing runs in a disposable bounded worker; never executes document code or reads a caller path. */
export async function prepare(input,{signal}={}){
 signal?.throwIfAborted()
 const files=filesFor(input)
 const result=await new Promise((resolve,reject)=>{
  const worker=new Worker(workerURL('document-worker.mjs'),{workerData:{files,limits:DOCUMENT_LIMITS},execArgv:[],env:{},resourceLimits:{maxOldGenerationSizeMb:192,maxYoungGenerationSizeMb:32}})
  let settled=false
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);void worker.terminate();error?reject(error):resolve(value)}
  const abort=()=>finish(signal.reason??Error('文档解析已取消'))
  const timer=setTimeout(()=>finish(Error('文档解析超过 20 秒；请拆分文档后重试')),20000);timer.unref?.()
  worker.once('message',message=>message.ok?finish(null,message.materials):finish(Error(message.error)))
  worker.once('error',error=>finish(Error('文档解析失败：'+error.message)))
  worker.once('exit',code=>{if(!settled)finish(Error('文档解析进程提前结束（'+code+'）'))})
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
 })
 signal?.throwIfAborted()
 return {materials:result}
}
