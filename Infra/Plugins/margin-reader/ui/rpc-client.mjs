function error(code,message,details){return Object.assign(new Error(message),{code,details});}
export async function requestRpc(url,method,params={},options={}){
 const fetcher=options.fetch||globalThis.fetch,id=options.id||globalThis.crypto.randomUUID(),timeout=options.timeoutMs??300000;
 if(!Number.isFinite(timeout)||timeout<=0||timeout>300000)throw error('INVALID_PARAMS','Invalid request timeout.');
 const controller=new AbortController(),details={requestId:id,method,mayHaveCompleted:true};let timer;
 const work=(async()=>{
  const response=await fetcher(url,{method:'POST',credentials:'same-origin',signal:controller.signal,headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
  if(!response.ok)throw error('TRANSPORT_ERROR',`阅读器连接失败（HTTP ${response.status}）。`,details);
  let reply;try{reply=await response.json();}catch{throw error('INVALID_RESPONSE','阅读器返回了无法解析的响应，请检查操作状态后再重试。',details);}
  const valid=reply&&typeof reply==='object'&&!Array.isArray(reply)&&reply.jsonrpc==='2.0'&&reply.id===id&&Object.hasOwn(reply,'result')!==Object.hasOwn(reply,'error');
  if(!valid)throw error('INVALID_RESPONSE','阅读器响应与请求不匹配，未认定为操作成功。',details);
  if(Object.hasOwn(reply,'error')){
   if(!reply.error||typeof reply.error.message!=='string'||!Number.isFinite(reply.error.code))throw error('INVALID_RESPONSE','阅读器错误响应格式无效。',details);
   throw error(reply.error.data?.code||'REMOTE_ERROR',reply.error.message,reply.error.data?.details);
  }
  return reply.result;
 })();
 try{
  return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{reject(error('REQUEST_TIMEOUT','阅读器请求超时。操作可能已经完成，请检查状态；不会自动重试。',details));controller.abort();},timeout);})]);
 }catch(e){if(e.code)throw e;throw error('TRANSPORT_ERROR',e.message||'无法连接阅读器。',details);}
 finally{clearTimeout(timer);}
}
