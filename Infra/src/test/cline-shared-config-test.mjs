import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {build} from 'esbuild'

const binary=process.env.AGENTS_TEST_CLINE_BIN
if(!binary){console.log('SKIP set AGENTS_TEST_CLINE_BIN for native Cline sharing test');process.exit(0)}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-cline-shared-')),native=path.join(temp,'native'),run=promisify(execFile)
process.env.AGENTS_COMPANY_HOME=path.join(temp,'state')
process.env.CLINE_DIR=native
process.env.CLINE_DATA_DIR=path.join(native,'data')
process.env.CLINE_BIN=binary
let requests=0,client
const server=http.createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk
 assert.equal(JSON.parse(body).model,'fixture-model');requests++
 res.writeHead(200,{'content-type':'text/event-stream'})
 for(const [delta,finish_reason] of [[{role:'assistant',content:'OK'},null],[{},'stop']])res.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:'fixture-model',choices:[{index:0,delta,finish_reason}]})+'\n\n')
 res.end('data: [DONE]\n\n')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const file=path.join(native,'data/settings/providers.json')
fs.mkdirSync(path.dirname(file),{recursive:true})
const settings={version:1,lastUsedProvider:'openai-compatible',providers:{'openai-compatible':{settings:{provider:'openai-compatible',apiKey:'fixture-key-not-real',model:'fixture-model',baseUrl:`http://127.0.0.1:${server.address().port}/v1`},updatedAt:new Date().toISOString()}}}
fs.writeFileSync(file,JSON.stringify(settings),{mode:0o600});const before=fs.readFileSync(file,'utf8')
const outfile=path.join(temp,'client.cjs')
await build({stdin:{contents:"export {clineClient} from './Infra/src/main/engines/cline-client';export {configureEngine} from './Infra/src/main/engines/configuration'",resolveDir:process.cwd()},outfile,bundle:true,platform:'node',format:'cjs'})
try{
 const {clineClient,configureEngine}=createRequire(import.meta.url)(outfile)
 configureEngine('cline',{sharedClineConfig:true})
 client=await clineClient({cwd:temp,directory:path.join(temp,'employee')})
 await client.call('initialize',{protocolVersion:1,clientCapabilities:{}})
 const session=await client.call('session/new',{cwd:temp,mcpServers:[]})
 await client.call('session/prompt',{sessionId:session.sessionId,prompt:[{type:'text',text:'Reply OK'}]},30000)
 await client.close();client=undefined
 const history=JSON.parse((await run(binary,['history','--json','--config',native],{env:process.env,timeout:10000})).stdout)
 assert.ok(history.some(item=>item.sessionId===session.sessionId),'Aexus ACP session must appear in ordinary native CLI history')
 client=await clineClient({cwd:temp,directory:path.join(temp,'second-client')})
 await client.call('initialize',{protocolVersion:1,clientCapabilities:{}})
 await client.call('session/load',{sessionId:session.sessionId,cwd:temp,mcpServers:[]})
 assert.equal(requests,1,'loading shared history must not start another model request')
 assert.equal(fs.readFileSync(file,'utf8'),before,'employee relay must not rewrite the shared provider configuration')
 console.log('PASS native Cline shared credentials, ACP-to-CLI history and same-session resume; loopback only')
}finally{await client?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true})}
