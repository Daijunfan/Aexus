import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
import {nativeFixture} from './native-fixture.mjs'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-management-'))),run=promisify(execFile)
const fixture=path.join(temp,'codex');fs.writeFileSync(fixture,`#!/usr/bin/env node
let text='';process.stdin.on('data',c=>text+=c);process.stdin.on('end',()=>{if(text==='hold'){setInterval(()=>{},1000);return}console.log(JSON.stringify({type:'item.completed',item:{id:'reply',type:'agent_message',text:'Done '+text}}));});`,{mode:0o755})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins'),CODEX_BIN:nativeFixture(fixture)}
const service=spawn(process.execPath,[root+'/bin/agents','serve'],{env,stdio:['ignore','ignore','pipe']}),ended=new Promise(resolve=>service.once('exit',resolve));let log='';service.stderr.on('data',d=>log+=d)
const cliAs=async(token,...args)=>{const reply=JSON.parse((await run(process.execPath,[root+'/bin/agents',...args,'--json'],{env:{...env,...(token?{AGENTS_COMPANY_TOKEN:token}:{})},timeout:20000})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
const cli=(...args)=>cliAs(null,...args)
const until=async fn=>{for(let i=0;i<150;i++){const result=await fn();if(result)return result;await new Promise(resolve=>setTimeout(resolve,30))}throw Error('Timed out '+log)}
const denied=async work=>assert.rejects(work)
try{
 await until(async()=>{try{return await cli('status')}catch{return false}})
 for(const name of ['A','B'])await cli('group','add',name)
 const create=(title,group='A')=>cli('card','create','--title',title,'--group',group,'--model','gpt-6-luna','--effort','low')
 const manager=await create('Manager'),worker=await create('Worker'),peer=await create('Peer'),outsider=await create('Outside','B')
 await cli('card','management-role',manager.id,'manager')
 const token=(await cli('auth','agent-token',manager.id)).token,employeeToken=(await cli('auth','agent-token',worker.id)).token
 assert.equal((await cliAs(token,'auth','whoami')).principal.employeeId,manager.id)
 const forged=await new Promise(resolve=>{const socket=net.connect(path.join(env.AGENTS_COMPANY_HOME,'agents.sock'));socket.on('connect',()=>socket.write(JSON.stringify({auth:token,cmd:'card.create',args:{title:'Forged',group:'A',createdBy:{kind:'operator'},managementRole:'manager'}})+'\n'));socket.on('data',data=>{socket.end();resolve(JSON.parse(data.toString()))})});assert.equal(forged.ok,false);assert.ok(!(await cli('session','list')).sessions.some(card=>card.title==='Forged'))
 await denied(()=>cliAs(employeeToken,'management','request','--employee',peer.id))
 await denied(()=>cliAs(token,'host','list'))
 await denied(()=>cliAs(token,'card','management-role',worker.id,'manager'))
 await denied(()=>cliAs(token,'management','global',manager.id,'on'))
 await denied(()=>cliAs(token,'session','transcript','--employee',worker.id))
 const relation=await cliAs(token,'management','request','--employee',worker.id)
 await denied(()=>cliAs(token,'session','send','--employee',worker.id,'--text','hello'))
 await denied(()=>cliAs(token,'management','decide',relation.id,'approve'))
 await cli('management','decide',relation.id,'approve')
 const accepted=await cliAs(token,'session','send','--employee',worker.id,'--text','hello');assert.ok(accepted.messageId)
 await until(async()=>(await cliAs(token,'session','transcript','--employee',worker.id)).text.includes('Done hello'))
 await denied(()=>cliAs(token,'session','send','--employee',worker.id,'--text','/permissions bypassPermissions'))
 await denied(()=>cliAs(token,'session','send','--employee',worker.id,'--text','/fork escape'))
 await denied(()=>cliAs(token,'card','remove',worker.id))
 await denied(()=>cliAs(token,'management','request','--employee',outsider.id))
 await cli('card','management-role',peer.id,'manager');await denied(()=>cliAs(token,'management','request','--employee',peer.id))
 const listed=await cliAs(token,'session','list');assert.ok(listed.sessions.every(card=>[manager.id,worker.id].includes(card.id)))
 assert.ok(!(await cliAs(token,'api','list')).some(command=>command.name==='config.permission'))
 const child=await cliAs(token,'card','create','--title','Created','--group','A');assert.deepEqual(child.createdBy,{kind:'agent',employeeId:manager.id})
 assert.ok((await cliAs(token,'management','topology')).edges.some(r=>r.employeeId===child.id))
 await cliAs(token,'card','remove',child.id)
 const subset=await cli('team-view','create','--name','Empty filter','--teams','[]');assert.equal((await cliAs(token,'session','transcript','--employee',worker.id)).items.length>0,true)
 await cli('group','rename','A','Renamed A');assert.ok((await cliAs(token,'management','topology','--team','Renamed A')).edges.some(edge=>edge.id===relation.id))
 const schedule=await cliAs(token,'schedule','create','--name','Delegated','--employee',worker.id,'--prompt','scheduled','--every-seconds','3600','--paused')
 await cliAs(token,'session','send','--employee',worker.id,'--text','hold')
 await cliAs(token,'session','enqueue','--employee',worker.id,'--text','must not run')
 await cli('session','enqueue','--employee',worker.id,'--text','user survives')
 const follow=spawn(process.execPath,[root+'/bin/agents','session','follow','--employee',worker.id,'--raw','--json'],{env:{...env,AGENTS_COMPANY_TOKEN:token},stdio:['ignore','pipe','pipe']});let events='';follow.stdout.on('data',d=>events+=d);const closed=new Promise(resolve=>follow.once('exit',resolve))
 await until(async()=>events.includes('snapshot'));assert.equal(follow.exitCode,null)
 await cliAs(token,'management','unbind',relation.id)
 await closed;assert.ok(!events.includes('store:changed')&&!events.includes('hosts:changed'))
 await denied(()=>cliAs(token,'session','transcript','--employee',worker.id))
 assert.equal((await cli('schedule','get',schedule.id)).disabledReason,'authorization_revoked')
 await denied(()=>cliAs(token,'schedule','run',schedule.id))
 await until(async()=>!(await cli('session','status','--employee',worker.id))[0].busy)
 await until(async()=>(await cli('session','transcript','--employee',worker.id)).text.includes('Done user survives'))
 assert.ok(!(await cli('session','transcript','--employee',worker.id)).text.includes('must not run'))
 const again=await cliAs(token,'management','request','--employee',worker.id);assert.notEqual(again.id,relation.id)
 await cli('management','decide',again.id,'approve');await denied(()=>cliAs(token,'schedule','run',schedule.id))
 const hold=await cliAs(token,'schedule','create','--name','Active delegated schedule','--employee',worker.id,'--prompt','hold','--every-seconds','3600','--paused');const running=await cliAs(token,'schedule','run',hold.id)
 await until(async()=>(await cli('session','status','--employee',worker.id))[0].busy);await cliAs(token,'management','unbind',again.id)
 await until(async()=>(await cli('schedule','history',hold.id))[0]?.status==='cancelled')
 const clone=await cli('card','clone',manager.id,'--title','Unprivileged clone');assert.equal(clone.managementRole,'employee');assert.ok(!(await cli('management','topology')).edges.some(edge=>edge.managerId===clone.id))
 assert.ok(!(await cliAs(employeeToken,'api','docs')).markdown.includes('## host.credentials'))
 const raw=await new Promise(resolve=>{const socket=net.connect(path.join(env.AGENTS_COMPANY_HOME,'agents.sock'));socket.on('connect',()=>socket.write(JSON.stringify({cmd:'host.list',args:{role:'operator',managerId:manager.id}})+'\n'));socket.on('data',data=>{socket.end();resolve(JSON.parse(data.toString()))})});assert.equal(raw.ok,false)
 await cli('management','global',peer.id,'on');await cli('card','management-role',peer.id,'employee');await denied(()=>cliAs(token,'management','request','--employee',peer.id))
 await cli('auth','revoke',manager.id);await denied(()=>cliAs(token,'auth','whoami'))
 console.log('PASS authenticated CLI: pending/cross-Team/role/creator rules, slash denial, send+history, atomic creation, queue/schedule/follow revocation, credential revoke and filtered docs')
}finally{service.kill('SIGTERM');await ended;fs.rmSync(temp,{recursive:true,force:true})}
