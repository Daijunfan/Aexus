// Real CLI -> isolated Core persistence; deterministic initialization, no paid models or shared build.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {fixtureCore} from './fixtures/headless-core.mjs'

const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-schedule-enabled-')),entry=path.join(temp,'daemon.cjs')
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
let f
try{
 await build({entryPoints:[path.join(root,'Infra/src/main/daemon.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
 f=await fixtureCore({},entry)
 await f.cli('group','add','Schedule flags')
 const employee=await f.create('Disabled task owner','Schedule flags'),token=await f.token(employee.id),created=[]
 const flags=['--name','Disabled task','--employee','self','--prompt','THIS_DISABLED_TASK_MUST_NOT_RUN','--after-seconds','1']
 for(const state of [['--enabled','false'],['--enabled','off'],['--paused']]){
  const job=await f.call(token,'schedule','create',...flags,...state)
  assert.equal(job.enabled,false);assert.equal(job.action.employeeId,employee.id)
  assert.equal((await f.call(token,'schedule','get',job.id)).enabled,false)
  created.push(job)
 }
 const spec={name:'JSON disabled task',action:{type:'agent',employeeId:'self',prompt:'THIS_DISABLED_TASK_MUST_NOT_RUN'},afterSeconds:1,enabled:false}
 const fromSpec=await f.call(token,'schedule','create','--spec',JSON.stringify(spec));assert.equal(fromSpec.enabled,false);created.push(fromSpec)
 // The timer is genuinely running; cross every disabled job's due instant plus several ticks.
 assert.equal((await f.cli('schedule','status')).running,true)
 const due=Math.max(...created.map(job=>Date.parse(job.rule.at)))
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,due-Date.now())+750))
 for(const job of created){
  const saved=await f.call(token,'schedule','get',job.id)
  assert.equal(saved.enabled,false);assert.equal(saved.occurrences,0)
  assert.deepEqual(await f.call(token,'schedule','history',job.id),[])
 }
 assert.deepEqual((await f.cli('session','transcript',employee.id)).items,[])
 assert.equal(fs.existsSync(path.join(f.control,employee.id+'-work.json')),false)
 console.log('PASS false/off/paused and JSON disabled creation remain disabled after their due time; no run or native work')

 // Default/explicit enabling still works, without allowing these distant jobs to execute.
 for(const state of [[],['--enabled','true'],['--enabled','on']]){
  const job=await f.call(token,'schedule','create','--name','Future enabled task','--employee','self','--prompt','Future task','--after-seconds','86400',...state)
  assert.equal(job.enabled,true);assert.equal((await f.call(token,'schedule','get',job.id)).enabled,true)
  await f.call(token,'schedule','pause',job.id)
 }
 const before=await f.call(token,'schedule','list')
 for(const state of [['--enabled'],['--enabled','maybe'],['--enabled','0'],['--paused','false'],['--enabled','true','--paused'],['--enabled','false','--paused']]){
  const result=await f.raw(token,'schedule','create',...flags,...state)
  assert.equal(result.ok,false,JSON.stringify(state));assert.match(result.error,/--enabled|--paused/)
 }
 for(const state of [['--enabled','false'],['--paused']]){
  const result=await f.raw(token,'schedule','create','--spec',JSON.stringify({...spec,enabled:true}),...state)
  assert.equal(result.ok,false);assert.match(result.error,/inside --spec/)
 }
 assert.deepEqual(await f.call(token,'schedule','list'),before,'invalid or conflicting flags never create a schedule')
 console.log('PASS default/true/on enabled semantics retained; invalid, missing and conflicting flags fail without mutation')

 const governor=await f.create('Governor task owner','Schedule flags','governor'),governorToken=await f.token(governor.id),view=await f.cli('team-view','create','--name','Schedule target','--teams',JSON.stringify(['Schedule flags']))
 const governorJob=await f.call(governorToken,'schedule','create',...flags,'--view',view.id,'--enabled','false')
 assert.equal(governorJob.enabled,false);assert.equal(governorJob.action.viewId,view.id)
 assert.equal((await f.call(governorToken,'schedule','get',governorJob.id)).action.viewId,view.id)
 const missingView=await f.raw(governorToken,'schedule','create',...flags,'--enabled','false');assert.equal(missingView.ok,false);assert.match(missingView.error,/view/i)
 const described=await f.call(governorToken,'api','describe','schedule.create','--all')
 for(const option of ['--enabled true|false|on|off','--paused','--view VIEW_ID'])assert.ok(described.args.includes(option),option+' must be discoverable')
 assert.match(described.summary,/Governor requires --view/)
 await f.stop();await f.start()
 for(const job of [...created,governorJob]){assert.equal((await f.cli('schedule','get',job.id)).enabled,false);assert.deepEqual(await f.cli('schedule','history',job.id),[])}
 console.log('PASS Governor --view requirement and CLI discovery; disabled state survives Core restart')
}finally{await f?.close();fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
