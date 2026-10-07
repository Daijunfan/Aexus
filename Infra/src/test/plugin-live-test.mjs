// Opt-in paid engine acceptance. Codex is always Luna / low, with no fallback.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import assert from 'node:assert/strict'
const run=promisify(execFile),root=path.resolve(import.meta.dirname,'../../..'),temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'agents-plugin-live-')))
const workspace=path.join(temp,'mini-notion-workspace'),home=path.join(temp,'home');fs.mkdirSync(workspace);fs.writeFileSync(path.join(workspace,'restricted.txt'),'scope test fixture')
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_WORKSPACES:temp}
const service=spawn(process.execPath,['Infra/src/cli/agents','serve'],{cwd:root,env,stdio:['ignore','pipe','pipe']}),done=new Promise(r=>service.once('exit',r))
let log='';service.stderr.on('data',d=>log+=d)
const cli=async(...args)=>{const reply=JSON.parse((await run(process.execPath,['Infra/src/cli/agents',...args,'--json'],{cwd:root,env,timeout:30000,maxBuffer:8<<20})).stdout);assert.ok(reply.ok,reply.error);return reply.data}
try{
  for(let i=0;i<100&&!fs.existsSync(path.join(home,'agents.sock'));i++)await new Promise(r=>setTimeout(r,50))
  await cli('group','add','CLI Plugin Team','--root',workspace,'--mode','work','--plugin','mininotion')
  for(const engine of (process.env.AGENTS_COMPANY_TEST_ENGINES||'codex,claude').split(',')){
    assert.ok(['codex','claude'].includes(engine))
    const model=engine==='codex'?'gpt-5.6-luna':'haiku'
    const {sessionId:id}=await cli('session','new','--group','CLI Plugin Team','--cwd',engine,'--engine',engine,'--model',model,'--effort','low','--permission','acceptEdits')
    const before=await cli('session','info',id)
    if(engine==='codex'){assert.equal(before.model,'gpt-5.6-luna');assert.equal(before.effort,'low')}
    const expected=`CLI_PLUGIN_${engine.toUpperCase()}_OK`
    await cli('session','send',id,`Integration test in a disposable workspace. Read ./AGENTS.md, .agents-company/README.md, and ONLY the first 60 lines of .agents-company/plugins/mininotion/API.md. Use .agents-company/bin/mininotion (the documented Team CLI launcher, not direct filesystem writing) to write plugin-check.md relative to your own workspace with the exact content ${expected}. Use mininotion to read it back. Also run this exact Node command in your cwd to check the permission boundary: node -e 'try { require("fs").readFileSync("../restricted.txt"); console.log("SCOPE_LEAK"); } catch(e) { if (!["EPERM","EACCES"].includes(e.code)) throw e; console.log("SCOPE_DENIED"); }'. This test file exists, but is outside your authorized folder. Do not use shell variables for the probe. Then reply DONE. If a command fails, stop and report its error without retries. Do not browse, spawn other agents, install anything, or change other files.`)
    const deadline=Date.now()+120000
    while(Date.now()<deadline){const state=await cli('session','info',id);if(!state.busy)break;assert.ok(!(state.approvals||[]).length,'unexpected permission request');await new Promise(r=>setTimeout(r,500))}
    const state=await cli('session','snapshot',id)
    assert.ok(!state.busy,'engine did not finish');assert.ok(!state.error,state.error)
    const transcript=await cli('session','transcript',id)
    fs.writeFileSync(path.join(root,`.aexus/artifacts/plugin-${engine}-live.json`),JSON.stringify(transcript,null,2))
    assert.ok(transcript.items.some(item=>item.role==='assistant'&&item.blocks.some(block=>block.kind==='tool'&&block.result?.includes('SCOPE_DENIED'))),'real tool output must demonstrate scope denial')
    assert.equal(fs.readFileSync(path.join(workspace,engine,'plugin-check.md'),'utf8').trim(),expected)
    const pages=await cli('plugin','call','mininotion','page.list','--employee',id)
    assert.ok(pages.some(p=>p.sourceFile?.path==='plugin-check.md'))
    console.log(`PASS ${engine}: docs discovery, generated CLI, actual workspace file, shared plugin API (${model} / low)`)
    await cli('session','close',id)
  }
}catch(error){console.error(log.slice(-4000));throw error}finally{service.kill('SIGTERM');await done;fs.rmSync(temp,{recursive:true,force:true})}
