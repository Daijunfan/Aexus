#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{createPlugin}=require('./runtime.cjs')
const args=process.argv.slice(2),option=key=>{const at=args.indexOf(key);return at<0?undefined:args[at+1]}
async function main(){
 const workspace=option('--workspace')||process.env.AGENTS_WORKSPACE,method=args.find(a=>a.startsWith('hosts.'))
 if(!workspace)throw new Error('Usage: cloud-hosts --workspace DIR hosts.list | hosts.create --data @host.json')
 const value=option('--data')||'{}',params=JSON.parse(value.startsWith('@')?fs.readFileSync(value.slice(1),'utf8'):value)
 const auth=process.env.AGENTS_COMPANY_TOKEN||fs.readFileSync(process.env.AGENTS_COMPANY_TOKEN_FILE||path.join(process.env.AGENTS_COMPANY_HOME||path.join(require('node:os').homedir(),'AgentsCompany'),'control.token'),'utf8').trim();const request={auth,jsonrpc:'2.0',id:randomUUID(),method,params};let reply
 // A sandboxed Worker uses its existing plugin mailbox; no extra filesystem or network grants.
 const mailbox=process.env.AGENTS_COMPANY_PLUGIN_RPC
 if(mailbox&&fs.existsSync(path.join(mailbox,'host.json'))){
  const out=path.join(mailbox,request.id+'.response.json'),file=path.join(mailbox,request.id+'.request.json'),tmp=file+'.tmp'
  fs.writeFileSync(tmp,JSON.stringify(request),{mode:0o600});fs.renameSync(tmp,file)
  const until=Date.now()+(method==='hosts.exec'?((Number(params.timeout)||120)+40)*1000:40000);while(!fs.existsSync(out)&&Date.now()<until)await new Promise(r=>setTimeout(r,50))
  if(!fs.existsSync(out))throw new Error('Cloud Hosts mailbox timed out')
  reply=JSON.parse(fs.readFileSync(out));fs.rmSync(out,{force:true})
 }else reply=await createPlugin({workspace}).request(request)
 console.log(JSON.stringify(reply));if(reply.error)process.exitCode=1
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
