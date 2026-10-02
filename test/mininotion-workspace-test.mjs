// Real built-in plugin, Core CLI, employee credentials and mailbox; no model inference.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fixtureCore} from './fixtures/headless-core.mjs'

const f=await fixtureCore({AGENTS_COMPANY_PLUGIN_DIRS:''})
const {root,temp,env,cli}=f,run=promisify(execFile)
const base=path.join(env.AGENTS_COMPANY_WORKSPACES,'mini-notion-workspace'),team='共享知识团队'
const call=(method,params={},selector=[])=>cli('plugin','call','mininotion',method,...selector,'--params',JSON.stringify(params))
const teamCall=(method,params={})=>call(method,params,['--team',team])
let count=0
const pass=label=>{count++;console.log('PASS '+label)}
try{
  const descriptor=await cli('plugin','describe','mininotion')
  const version=JSON.parse(fs.readFileSync(path.join(root,'plugins.lock.json'),'utf8')).plugins.find(item=>item.directory==='mini-notion').version
  assert.equal(descriptor.plugin?.version??descriptor.version,version)
  for(const method of ['fs.path','fs.bind','fs.organize'])assert.equal(descriptor.api.commands.find(command=>command.method===method)?.agentAccess,'workspace')
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'build/plugins/mini-notion/agents-company.plugin.json'),'utf8'))
  assert.equal(manifest.defaultWorkspace,'collection')
  fs.mkdirSync(path.join(base,'default'),{recursive:true})
  fs.writeFileSync(path.join(base,'default','old.md'),'# Keep old default files\n')
  const view=await cli('plugin','view','mininotion')
  assert.equal(view.workspace,base)
  assert.ok((await call('page.list')).some(page=>page.sourceFile?.path==='default/old.md'))
  assert.equal((await call('fs.info',{},['--workspace',path.join(base,'default')])).root,path.join(base,'default'))
  await cli('plugin','close',view.id)
  pass('normal built-in discovery uses the locked version and collection view; old default scope remains explicit and unmoved')

  const personal=await call('page.create',{title:'用户直接创建',color:'white'})
  const creation=await cli('group','add',team,'--mode','work','--plugin','mininotion')
  assert.equal(creation.teamRoots[team],path.join(base,team))
  const main=await teamCall('page.create',{title:'项目文档',color:'white'})
  const other=await teamCall('page.create',{title:'研究资料',color:'white'})
  const location=await teamCall('fs.path',{pageId:main.id}),otherLocation=await teamCall('fs.path',{pageId:other.id})
  const pages=await call('page.list')
  for(const id of [personal.id,main.id,other.id])assert.equal(pages.filter(page=>page.id===id).length,1)
  assert.equal((await call('fs.path',{pageId:main.id})).absolutePath,location.absolutePath)
  assert.equal(path.basename(location.path),'index.mininotion.json')
  pass('default, Team and user pages reference the same physical documents rather than copied stores')

  const employee=await cli('card','create','--title','文档员工','--group',team,'--engine','codex','--model','gpt-6-luna','--directory-mode','bind','--cwd',location.absoluteDirectory)
  const second=await cli('card','create','--title','研究员工','--group',team,'--engine','codex','--model','gpt-6-luna','--directory-mode','bind','--cwd',otherLocation.absoluteDirectory)
  assert.equal(employee.cwd,location.absoluteDirectory)
  assert.equal(second.cwd,otherLocation.absoluteDirectory)
  for(const item of [employee,second]){
    await f.ready(item.id);await cli('workspace','docs','--employee',item.id)
    const auth=await f.token(item.id),guide=(await f.call(auth,'api','docs','plugin/mininotion/api')).markdown
    assert.equal(fs.existsSync(path.join(item.cwd,'.agents-company')),false,'documentation and runtime launchers stay outside working documents')
    assert.match(guide,/fs\.path/);assert.match(guide,/index\.mininotion\.json/)
    const schema=JSON.parse((await f.call(auth,'api','docs','plugin/mininotion/schema')).markdown)
    assert.equal(schema.version,version)
  }
  const token=await f.token(employee.id)
  const employeeCall=(method,params={})=>f.call(token,'plugin','call','mininotion',method,'--employee',employee.id,'--params',JSON.stringify(params))
  assert.equal((await employeeCall('page.get',{pageId:main.id})).id,main.id)
  assert.ok(!(await employeeCall('page.list')).some(page=>page.id===other.id))
  assert.equal((await f.raw(token,'plugin','call','mininotion','page.list','--team',team)).ok,false)
  assert.equal((await f.raw(token,'plugin','call','mininotion','page.list')).ok,false)
  pass('different real employees bind existing main folders, receive current docs and retain their actual API identities')

  // Opening a fixture-backed session prepares the authenticated mailbox. No task is sent.
  await cli('session','open',employee.id)
  const mailbox=path.join(env.AGENTS_COMPANY_HOME,'agent-access',employee.id,'ipc','mininotion')
  assert.ok(fs.existsSync(path.join(mailbox,'host.json')),'must use mailbox, not silently fall back to a local socket')
  const employeeEnv={...env,AGENTS_COMPANY_TOKEN:token,AGENTS_COMPANY_EMPLOYEE:employee.id,AGENTS_COMPANY_PLUGIN_RPC:mailbox}
  const launcher=process.platform==='win32'?process.execPath:path.join(env.AGENTS_COMPANY_HOME,'agent-access',employee.id,'bin','mininotion')
  const prefix=process.platform==='win32'?[path.join(root,'build/plugins/mini-notion/backend/cli.cjs'),'--workspace',employee.cwd]:[]
  const bound=async(method,params={})=>JSON.parse((await run(launcher,[...prefix,'api',method,'--data',JSON.stringify(params)],{cwd:employee.cwd,env:employeeEnv,timeout:30000,maxBuffer:8e6})).stdout)
  assert.equal((await bound('fs.info')).root,employee.cwd)
  const child=await bound('page.create',{title:'员工子页面',parentId:main.id,color:'white'})
  const grandchild=await bound('page.create',{title:'员工孙页面',parentId:child.id,color:'white'})
  await bound('block.append',{pageId:grandchild.id,text:'Authenticated mailbox content'})
  assert.equal((await call('page.get',{pageId:grandchild.id})).parentId,child.id)
  assert.equal((await call('fs.path',{pageId:grandchild.id})).absoluteDirectory,path.join(employee.cwd,'员工子页面','员工孙页面'))
  assert.equal((await call('fs.audit')).valid,true)
  await call('page.update',{pageId:grandchild.id,title:'用户继续编辑'})
  assert.equal((await bound('page.get',{pageId:grandchild.id})).title,'用户继续编辑')
  const db=await bound('database.create',{title:'员工看板',parentId:main.id,color:'blue',view:'board'})
  const row=await bound('record.create',{databaseId:db.id,title:'共享任务',color:'white',values:{status:'进行中'}})
  assert.equal((await call('record.list',{databaseId:db.id}))[0].id,row.id)
  await bound('file.export',{pageId:grandchild.id,type:'md',output:'Exports/note.md'})
  assert.match(fs.readFileSync(path.join(employee.cwd,'Exports/note.md'),'utf8'),/Authenticated mailbox content/)
  await assert.rejects(()=>bound('fs.write',{path:'../escape.txt',content:'no'}))
  assert.ok(!fs.existsSync(path.join(path.dirname(employee.cwd),'escape.txt')))
  pass('credentialed mailbox supports recursive pages, shared editing, board records and packaged export with no inference')

  await teamCall('page.update',{pageId:main.id,title:'修改显示标题'})
  assert.equal((await call('fs.path',{pageId:main.id})).absoluteDirectory,employee.cwd)
  const legacy={format:'mininotion.page/v1',page:{...await call('page.get',{pageId:personal.id}),id:randomUUID(),title:'旧布局页面',parentId:null}}
  const legacyFile=path.join(base,'default/Documents',legacy.page.id+'.mininotion.json');let bytes=JSON.stringify(legacy)+'\n'
  fs.mkdirSync(path.dirname(legacyFile),{recursive:true});fs.writeFileSync(legacyFile,bytes)
  assert.equal((await call('page.get',{pageId:legacy.page.id})).title,'旧布局页面')
  assert.equal(fs.readFileSync(legacyFile,'utf8'),bytes)
  assert.equal((await call('fs.path',{pageId:legacy.page.id})).legacy,true)
  await call('page.update',{pageId:legacy.page.id,title:'Edited legacy document stays in place'})
  assert.equal((await call('fs.path',{pageId:legacy.page.id})).absolutePath,legacyFile)
  bytes=fs.readFileSync(legacyFile,'utf8')
  assert.equal(JSON.parse(bytes).page.title,'Edited legacy document stays in place')
  const plan=await call('fs.organize',{dryRun:true},['--workspace',path.join(base,'default')])
  assert.ok(plan.moves.some(move=>move.pageId===legacy.page.id))
  assert.equal(fs.readFileSync(legacyFile,'utf8'),bytes)
  await f.stop();await f.start()
  assert.equal((await call('fs.path',{pageId:main.id})).absoluteDirectory,employee.cwd)
  assert.equal((await call('page.get',{pageId:grandchild.id})).title,'用户继续编辑')
  assert.equal((await cli('session','list')).sessions.find(item=>item.id===employee.id).cwd,employee.cwd)
  assert.equal(fs.readFileSync(legacyFile,'utf8'),bytes)
  pass('rename and Core restart preserve bound directories, shared content and unmigrated legacy files')

  const invalid=path.join(temp,'invalid-default-workspace')
  fs.cpSync(path.join(root,'examples/plugin-starter'),invalid,{recursive:true})
  const file=path.join(invalid,'agents-company.plugin.json'),bad=JSON.parse(fs.readFileSync(file,'utf8'));bad.defaultWorkspace='arbitrary-parent';fs.writeFileSync(file,JSON.stringify(bad))
  await assert.rejects(()=>cli('plugin','install',invalid))
  pass('invalid collection capability is rejected at the manifest boundary')
  console.log(`PASS=${count} FAIL=0 — normal built-in package, isolated Core, no model inference`)
}finally{await f.close()}
