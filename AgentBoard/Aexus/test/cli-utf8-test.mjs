import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-utf8-')),text='受控验证🙂中文'.repeat(2000),response=Buffer.from(JSON.stringify({ok:true,data:{text}})+'\n'),split=response.indexOf(Buffer.from('受'))+1
const server=net.createServer(socket=>{socket.once('data',()=>{socket.write(response.subarray(0,split));setTimeout(()=>socket.end(response.subarray(split)),25)})})
fs.writeFileSync(path.join(temp,'control.token'),'fixture-control-credential');
await new Promise(resolve=>server.listen(path.join(temp,'agents.sock'),resolve))
const old=process.env.AGENTS_COMPANY_HOME;process.env.AGENTS_COMPANY_HOME=temp
try{
 const result=await promisify(execFile)(process.env.AGENTS_COMPANY_TEST_CLI||process.execPath,[...(process.env.AGENTS_COMPANY_TEST_CLI?[]:['bin/agents']),'status','--json'],{env:process.env});assert.equal(JSON.parse(result.stdout).data.text,text,'host CLI must decode complete UTF-8 codepoints across socket chunks')
 console.log('SKIP removed Cloud Hosts plugin RPC UTF-8 case; real host socket split-codepoint assertion is retained')
 console.log('PASS split multibyte Chinese and emoji survive large host CLI responses byte-for-byte')
}finally{if(old===undefined)delete process.env.AGENTS_COMPANY_HOME;else process.env.AGENTS_COMPANY_HOME=old;await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true})}
