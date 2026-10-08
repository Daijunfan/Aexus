import {Worker} from 'node:worker_threads'
import {workerURL} from './worker-path.mjs'
import {validateReport} from './model.mjs'

export async function exportReport(state,format,{signal}={}){
 if(!['pdf','docx'].includes(format))throw Error('支持的额外导出格式为 pdf、docx')
 if(state.phase!=='complete'||!state.report||state.reportReview?.verdict!=='pass')throw Error('只能导出已通过最终审查的报告')
 validateReport(state.report,state.sources,{language:state.language})
 signal?.throwIfAborted()
 const bytes=await new Promise((resolve,reject)=>{
  const worker=new Worker(workerURL('export-worker.mjs'),{workerData:{state,format},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256,maxYoungGenerationSizeMb:32}})
  let settled=false
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);void worker.terminate();error?reject(error):resolve(value)}
  const abort=()=>finish(signal.reason??Error('导出已取消'))
  const timer=setTimeout(()=>finish(Error('报告排版超过 25 秒；未生成不完整文件')),25000);timer.unref?.()
  worker.once('message',message=>message.ok?finish(null,Buffer.from(message.bytes)):finish(Error(message.error)))
  worker.once('error',error=>finish(error));worker.once('exit',code=>{if(!settled)finish(Error('报告排版进程提前结束（'+code+'）'))})
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
 })
 signal?.throwIfAborted()
 if(!bytes.length||bytes.length>8*1024*1024)throw Error('导出文件为空或超过 8 MiB')
 return {name:'research-report.'+format,mediaType:format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',description:format==='pdf'?'分页 PDF 报告，包含可点击引用、证据与限制。':'可编辑 Word 报告，包含目录、对照表、引用与来源。',encoding:'base64',content:bytes.toString('base64')}
}
