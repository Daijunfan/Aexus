import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-utf8-')),text='受控验证🙂中文'.repeat(2000),response=Buffer.from(JSON.stringify({ok:true,data:{text}})+'\n'),split=response.indexOf(Buffer.from('受'))+1
const server=net.createServer(socket=>{socket.once('data',()=>{socket.write(response.subarray(0,split));setTimeout(()=>socket.end(response.subarray(split)),25)})})
await new Promise(resolve=>server.listen(path.join(temp,'agents.sock'),resolve))
const old=process.env.AGENTS_COMPANY_HOME;process.env.AGENTS_COMPANY_HOME=temp
try{
 const result=await promisify(execFile)(process.env.AGENTS_COMPANY_TEST_CLI||process.execPath,[...(process.env.AGENTS_COMPANY_TEST_CLI?[]:['bin/agents']),'status','--json'],{env:process.env});assert.equal(JSON.parse(result.stdout).data.text,text,'host CLI must decode complete UTF-8 codepoints across socket chunks')
 const require=createRequire(import.meta.url),runtime=require(process.env.AGENTS_COMPANY_TEST_PLUGIN_RUNTIME||'../PlugIns/cloud-hosts/runtime.cjs').createPlugin({workspace:temp})
 assert.equal((await runtime.request({jsonrpc:'2.0',id:1,method:'hosts.list'})).result.text,text,'plugin CLI must preserve UTF-8 too')
 console.log('PASS split multibyte Chinese and emoji survive large host CLI and plugin RPC responses byte-for-byte')
}finally{if(old===undefined)delete process.env.AGENTS_COMPANY_HOME;else process.env.AGENTS_COMPANY_HOME=old;await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true})}
