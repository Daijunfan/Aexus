const fs=require('node:fs'),net=require('node:net'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto'),schema=require('./schema.json')
const methods=new Set(schema.commands.map(c=>c.method))
function hostRequest(cmd,args){return new Promise((resolve,reject)=>{
 const home=process.env.AGENTS_COMPANY_HOME||path.join(os.homedir(),'AgentsCompany')
 let auth
 try{auth=process.env.AGENTS_COMPANY_TOKEN||fs.readFileSync(process.env.AGENTS_COMPANY_TOKEN_FILE||path.join(home,'control.token'),'utf8').trim()}catch(error){reject(error);return}
 const endpoint=process.platform==='win32'?'\\\\.\\pipe\\agents-company-'+createHash('sha256').update(path.resolve(home).toLowerCase()).digest('hex').slice(0,24):path.join(home,'agents.sock')
 const socket=net.connect(endpoint);let data='',answered=false
 socket.setEncoding('utf8')
 socket.setTimeout(cmd==='host.exec'?((Number(args.timeout)||120)+35)*1000:35000,()=>socket.destroy(new Error('主机操作超时')))
 socket.on('error',reject);socket.on('connect',()=>socket.write(JSON.stringify({cmd,args,auth})+'\n'))
 socket.on('close',()=>{if(!answered)reject(new Error('主机服务在返回结果前断开，请检查连接状态后重试'))})
 socket.on('data',chunk=>{data+=chunk;if(!data.includes('\n')||answered)return;answered=true;socket.end();try{const reply=JSON.parse(data.split('\n')[0]);if(!reply.ok)reject(new Error(reply.error));else resolve(reply.data)}catch(error){reject(error)}})
})}
exports.createPlugin=(context={})=>({async request({id,method,params={}}){
 try{
  if(!methods.has(method))return {jsonrpc:'2.0',id,error:{code:-32601,message:'Unknown Cloud Hosts method'}}
  if(!params||typeof params!=='object'||Array.isArray(params))throw Error('参数必须是 JSON 对象')
  const cmd='host.'+method.slice('hosts.'.length)
  return {jsonrpc:'2.0',id,result:await (context.requestHost?context.requestHost({cmd,args:params}):hostRequest(cmd,params))}
 }catch(error){return {jsonrpc:'2.0',id,error:{code:-32000,message:error.code==='ENOENT'?'请先启动 Agents Company 或运行 agents serve':error.message}}}
}})
