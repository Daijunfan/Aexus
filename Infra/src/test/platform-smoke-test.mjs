import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fixtureCore} from './fixtures/headless-core.mjs'

const f=await fixtureCore(),results=[]
const pass=name=>{results.push(name);console.log('PASS '+name)}
const rpc=async(cmd,args)=>{const reply=await f.request(null,cmd,args);assert.ok(reply.ok,JSON.stringify(reply));return reply.data}
let terminal
try{
  const info=await rpc('system.info')
  assert.equal(info.os,process.platform==='darwin'?'macos':process.platform==='win32'?'windows':'linux')
  await f.cli('group','add','Platform Team')
  const employee=await f.create('Unicode 员工','Platform Team')
  assert.ok(fs.statSync(employee.cwd).isDirectory());pass('Core-host OS, IPC and Unicode workspace')
  const token=await f.token(employee.id)
  assert.equal((await f.call(token,'auth','whoami')).principal.employeeId,employee.id)
  assert.equal((await f.raw(token,'group','remove','Platform Team')).ok,false);pass('employee identity and denied global operation')
  const filename='跨平台 file.txt',text='兼容 Unicode\nsecond line\n'
  await rpc('workspace.write',{employee:employee.id,path:filename,content:text,create:true})
  const read=await rpc('workspace.read',{employee:employee.id,path:filename})
  assert.equal(read.content,text);assert.equal(fs.readFileSync(path.join(employee.cwd,filename),'utf8'),text)
  assert.equal((await f.request(null,'workspace.write',{employee:employee.id,path:'../escape.txt',content:'denied'})).ok,false)
  pass('file bytes, path separators and traversal protection')
  await f.cli('session','send','--employee',employee.id,'Reply using the deterministic test engine')
  await f.until(async()=>JSON.stringify(await f.cli('session','transcript','--employee',employee.id)).includes('VISIBLE_REPLY'),'fixture reply')
  assert.equal((await f.status(employee.id)).busy,false);pass('engine adapter process and normalized completion')
  terminal=await rpc('terminal.open',{employee:employee.id,cols:100,rows:24})
  await rpc('terminal.resize',{id:terminal.id,cols:90,rows:28})
  const command=process.platform==='win32'?"Write-Output ('PTY_'+'OK')\r":"printf 'PTY_%s\\n' OK\n"
  await rpc('terminal.input',{id:terminal.id,data:command})
  // The command constructs this token, so its echoed source cannot satisfy the
  // check. Login shells may put ANSI prompt-control sequences around the result.
  let terminalOutput=''
  try{await f.until(async()=>{terminalOutput=(await rpc('terminal.read',{id:terminal.id})).output;return terminalOutput.includes('PTY_OK')},'interactive PTY response')}
  catch(error){throw Error((error.message??String(error))+'; terminal tail='+JSON.stringify(terminalOutput.slice(-2000)))}
  await rpc('terminal.close',{id:terminal.id});terminal=undefined;pass('real interactive terminal input, resize and cleanup')
  const plugins=await rpc('plugin.list')
  for(const id of ['cloud-hosts','mininotion','margin-reader']){
    assert.ok(plugins.some(p=>p.id===id),'Missing bundled plugin '+id)
    const view=await rpc('plugin.open',{id});assert.ok(view.url);await rpc('plugin.dismiss',{id:view.id})
  }
  pass('all three bundled plugin runtimes open and close without a desktop')
  await f.stop();await f.start()
  assert.equal((await rpc('workspace.read',{employee:employee.id,path:filename})).content,text)
  assert.ok(JSON.stringify(await f.cli('session','transcript','--employee',employee.id)).includes('VISIBLE_REPLY'))
  pass('restart preserves workspace, employee and public transcript')
  const report={platform:process.platform,arch:process.arch,node:process.versions.node,osRelease:os.release(),checks:results,passed:results.length,model:'local protocol fixture; no billed model',temporaryData:true}
  const output=path.join(f.root,'artifacts');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'platform-smoke.json'),JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report))
}finally{if(terminal)await rpc('terminal.close',{id:terminal.id}).catch(()=>{});await f.close()}
