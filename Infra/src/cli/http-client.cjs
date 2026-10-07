// Remote CLI transport. Never send a local operator credential to an implicit host.
const fs=require('node:fs');
exports.send=async function send(request,{stream=false,onEvent=()=>{}}={}){
  const base=new URL(process.env.AGENTS_COMPANY_URL);
  if(base.username||base.password||base.hash||base.pathname!=='/')throw Error('AGENTS_COMPANY_URL must be a server origin without credentials or path');
  if(base.protocol!=='https:'&&!(base.protocol==='http:'&&(['localhost','127.0.0.1','[::1]'].includes(base.hostname)||process.env.AGENTS_COMPANY_ALLOW_INSECURE==='1')))throw Error('Remote CLI requires HTTPS; plaintext HTTP is only enabled explicitly for a trusted private network');
  let token=process.env.AGENTS_COMPANY_TOKEN;
  if(!token&&process.env.AGENTS_COMPANY_TOKEN_FILE)token=fs.readFileSync(process.env.AGENTS_COMPANY_TOKEN_FILE,'utf8').trim();
  if(!token)throw Error('Set AGENTS_COMPANY_TOKEN_FILE or AGENTS_COMPANY_TOKEN for the selected remote server');
  const controller=new AbortController();
  const response=await fetch(new URL(stream?'/api/follow':'/api/rpc',base),{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token,'x-request-id':require('node:crypto').randomUUID(),...(process.env.AGENTS_COMPANY_CLIENT?{'x-agents-client':process.env.AGENTS_COMPANY_CLIENT}:{})},body:JSON.stringify({cmd:request.cmd,args:request.args,...(Object.hasOwn(request,'engineScope')?{engineScope:request.engineScope}:{})}),signal:controller.signal}).catch(()=>{throw Error('Connection interrupted; operation result is unknown. Query the server before repeating a mutation.');});
  if(!response.ok||!stream){const reply=await response.json();if(!reply.ok)throw Object.assign(Error(reply.error),{code:reply.code});return reply.data;}
  return new Promise((resolve,reject)=>{
    let initial=false,buffer='';const decoder=new TextDecoder();
    void(async()=>{
      try{
        for await(const bytes of response.body){
          buffer+=decoder.decode(bytes,{stream:true});
          if(buffer.length>64*1024*1024)throw Error('Follow response exceeds safety limit');
          for(;;){const end=buffer.indexOf('\n');if(end<0)break;const text=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!text.trim())continue;const message=JSON.parse(text);
            if(!initial){if(!message.ok)throw Object.assign(Error(message.error),{code:message.code});initial=true;resolve({initial:message.data,stream:{end:()=>controller.abort()}});}
            else if(message.type==='event')onEvent(message);
            else if(message.type==='done'){controller.abort();return;}
          }
        }
        if(!initial)throw Error('Stream ended before the initial snapshot');
      }catch(error){if(controller.signal.aborted)return;if(!initial)reject(error);else console.error('Follow disconnected: '+error.message);}
    })();
  });
};
