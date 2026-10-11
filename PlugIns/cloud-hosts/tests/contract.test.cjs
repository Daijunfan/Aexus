const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),{execFile}=require('node:child_process'),{promisify}=require('node:util')
test('independent CLI and runtime share the public host API; unknown methods fail closed',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-hosts-contract-')),old=process.env.AGENTS_COMPANY_HOME;process.env.AGENTS_COMPANY_HOME=home
 fs.writeFileSync(path.join(home,'control.token'),'fixture-control-token',{mode:0o600})
 const seen=[],server=net.createServer(socket=>{let data='';socket.on('data',chunk=>{data+=chunk;if(!data.includes('\n'))return;const request=JSON.parse(data.split('\n')[0]);assert.equal(request.auth,'fixture-control-token');seen.push(request);socket.end(JSON.stringify({ok:true,data:{method:request.cmd,args:request.args}})+'\n')})})
 await new Promise(r=>server.listen(path.join(home,'agents.sock'),r))
 try{
 const runtime=require('../runtime.cjs').createPlugin({workspace:home}),schema=require('../schema.json')
 for(const command of schema.commands){const r=await runtime.request({id:1,method:command.method,params:{id:'fixture'}});assert.equal(r.result.method,command.method.replace('hosts.','host.'))}
 assert.equal((await runtime.request({id:2,method:'host.delete-everything'})).error.code,-32601)
 const before=seen.length,output=await promisify(execFile)(process.execPath,[path.resolve(__dirname,'../cli.cjs'),'--workspace',home,'hosts.create','--data','{"name":"Cloud"}'],{env:process.env})
 assert.equal(JSON.parse(output.stdout).result.args.name,'Cloud');assert.equal(seen.length,before+1)
 }finally{await new Promise(r=>server.close(r));if(old===undefined)delete process.env.AGENTS_COMPANY_HOME;else process.env.AGENTS_COMPANY_HOME=old;fs.rmSync(home,{recursive:true,force:true})}
})
