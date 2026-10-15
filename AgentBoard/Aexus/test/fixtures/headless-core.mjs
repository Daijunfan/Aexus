import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const {controlEndpoint}=createRequire(import.meta.url)('../../bin/platform.cjs')
export async function fixtureCore(overrides={},entry=process.env.AGENTS_COMPANY_TEST_CORE_ENTRY){
  const root=path.resolve(import.meta.dirname,'../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-layout-read-'))),control=path.join(temp,'fixture')
  fs.mkdirSync(control);fs.writeFileSync(path.join(control,'release-all'),'')
  const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins'),CODEX_BIN:path.join(root,'test/fixtures/initialization-codex.cjs'),CODEX_HOME:path.join(temp,'codex'),AC_INIT_FIXTURE:control,...overrides}
  for(const key of Object.keys(env))if(key.startsWith('AGENTS_COMPANY_TOKEN')||['AGENTS_COMPANY_EMPLOYEE','AGENTS_COMPANY_SOCKET','AGENTS_COMPANY_PORT','AGENTS_COMPANY_URL','AGENTS_COMPANY_CLIENT','AGENTS_COMPANY_ALLOW_INSECURE'].includes(key))delete env[key]
  let service,ended,log=''
  const raw=async(token,...args)=>{let stdout;try{stdout=(await promisify(execFile)(process.execPath,[root+'/bin/agents',...args,'--json'],{env:{...env,...(token?{AGENTS_COMPANY_TOKEN:token}:{})},timeout:20000,maxBuffer:8e6})).stdout}catch(error){stdout=error.stdout;if(!stdout)throw error}return JSON.parse(stdout)}
  const call=async(token,...args)=>{const value=await raw(token,...args);assert.ok(value.ok,[value.error,log&&'Core diagnostics: '+log].filter(Boolean).join('\n'));return value.data}
  const cli=(...args)=>call(null,...args)
  const until=async(check,label)=>{for(let i=0;i<250;i++){const result=await check();if(result)return result;await new Promise(resolve=>setTimeout(resolve,40))}throw Error('Timeout '+label+' '+log)}
  const status=async id=>(await cli('session','status','--employee',id))[0]
  const ready=id=>until(async()=>{const s=await status(id);if(s.initialization?.status==='failed')throw Error(s.initialization.error);return s.initialization?.status==='ready'},'ready')
  const start=async()=>{service=spawn(process.execPath,entry?[entry]:[root+'/bin/agents','serve'],{env,stdio:['ignore','ignore','pipe','ipc']});ended=new Promise(resolve=>service.once('exit',resolve));service.stderr.on('data',data=>log=(log+data).slice(-8000));await until(()=>cli('status').catch(()=>false),'daemon')}
  const stop=async()=>{if(service&&service.exitCode===null&&service.signalCode===null){
    const child=service;let timer
    if(child.connected)child.send({type:'agents-company:shutdown'});else child.kill('SIGTERM')
    try{await Promise.race([ended,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Disposable Core did not shut down gracefully: '+log)),20000)})])}
    catch(error){child.kill('SIGKILL');await ended;throw error}finally{clearTimeout(timer)}
  }}
  const create=async(title,group='A',role='employee')=>{const card=await cli('card','create','--title',title,'--group',group,'--management-role',role,'--engine','codex','--model','gpt-6-luna','--effort','low');await ready(card.id);return card}
  const received=(id,text)=>until(async()=>(await cli('session','transcript','--employee',id)).items.find(item=>item.role==='user'&&item.text===text),'accepted message: '+text.slice(0,80))
  const token=async id=>(await cli('auth','agent-token',id)).token
  const request=(auth,cmd,args)=>new Promise((resolve,reject)=>{
    const socket=net.connect(controlEndpoint(env.AGENTS_COMPANY_HOME));socket.setEncoding('utf8');let buffer=''
    socket.on('error',reject);socket.on('connect',()=>socket.write(JSON.stringify({auth:auth??fs.readFileSync(path.join(env.AGENTS_COMPANY_HOME,'control.token'),'utf8').trim(),cmd,args})+'\n'))
    socket.on('data',data=>{buffer+=data;if(buffer.includes('\n')){socket.end();resolve(JSON.parse(buffer.split('\n')[0]))}})
  })
  await start()
  return {root,temp,control,env,call,raw,cli,until,status,ready,create,received,token,request,start,stop,close:async()=>{await stop();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}}
}
