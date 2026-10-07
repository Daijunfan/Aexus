// Real shared Core, socket and CLI; deterministic native-engine protocols, no inference.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn,execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {build} from 'esbuild'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-controls-')),run=promisify(execFile),log=path.join(temp,'calls.jsonl'),sdk=path.join(temp,'sdk.mjs'),bin=path.join(temp,'codex')
const model={id:'luna',model:'gpt-5.6-luna',displayName:'Luna official catalog',description:'fixture',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'medium'}],defaultReasoningEffort:'low',serviceTiers:[{id:'priority',name:'Fast',description:'1.5x speed, increased usage'}]}
fs.writeFileSync(bin,`#!/usr/bin/env node
const fs=require('fs'),readline=require('readline'),args=process.argv.slice(2),log=${JSON.stringify(log)};
const record=data=>fs.appendFileSync(log,JSON.stringify(data)+'\\n'),emit=data=>process.stdout.write(JSON.stringify(data)+'\\n');
record({engine:'codex',args});
if(args.includes('app-server'))readline.createInterface({input:process.stdin}).on('line',line=>{
 const q=JSON.parse(line);record({method:q.method,params:q.params,...(q.result?{answer:q.result}:{})});if(q.id===undefined)return;if(q.id===700&&!q.method){emit({method:'item/completed',params:{item:{type:'agentMessage',text:'User answered '+JSON.stringify(q.result)}}});emit({method:'turn/completed',params:{turn:{status:'completed'}}});return}
 if(q.method==='turn/start'&&q.params.input[0]?.text==='server reject'){emit({id:q.id,error:{message:'Rejected before turn start'}});return}\n const result=q.method==='model/list'?{data:[${JSON.stringify(model)}]}:q.method==='skills/list'?{data:[{skills:[{name:'sample',description:'Sample skill',path:q.params.cwds[0]+'/sample/SKILL.md',enabled:true}]}]}:q.method==='mcpServerStatus/list'?{data:[{name:'fixture',status:'connected'}]}:q.method==='account/read'?{account:{type:'chatgpt',email:'fixture@example.invalid'}}:q.method==='account/rateLimits/read'?{rateLimits:{primary:{usedPercent:12}}}:q.method==='thread/resume'||q.method==='thread/start'?{thread:{id:'fixture-thread'}}:['review/start','turn/start'].includes(q.method)?{turn:{id:'review'}}:{};emit({id:q.id,result});
 if(q.method==='thread/compact/start')emit({method:'item/completed',params:{item:{type:'contextCompaction'}}});
 if(q.method==='turn/start'){emit({method:'turn/started',params:{turn:{id:'planned'}}});const done=()=>{emit({method:'thread/tokenUsage/updated',params:{tokenUsage:{total:{totalTokens:24}}}});emit({method:'item/completed',params:{item:{type:'agentMessage',text:q.params.collaborationMode?.mode==='plan'?'Native planning completed':'fixture reply'}}});emit({method:'turn/completed',params:{turn:{status:'completed'}}});};if(q.params.input[0]?.text==='ask user'){emit({id:700,method:'tool/requestUserInput',params:{questions:[{id:'choice',header:'选择',question:'选择一种方案',isOther:false,options:[{label:'A'},{label:'B'}]}]}})}else if(q.params.input[0]?.text==='slow')setTimeout(done,1800);else done();}\n if(q.method==='review/start'){emit({method:'item/completed',params:{item:{type:'agentMessage',text:'Native review complete'}}});emit({method:'turn/completed',params:{turn:{status:'completed'}}});}
});else{let prompt='';process.stdin.on('data',v=>prompt+=v);process.stdin.on('end',async()=>{record({prompt});if(prompt==='slow')await new Promise(r=>setTimeout(r,1800));emit({type:'thread.started',thread_id:'fixture-thread'});emit({type:'item.completed',item:{type:'agent_message',id:'reply',text:'fixture reply'}});emit({type:'turn.completed'});});}
`,{mode:0o755})
fs.writeFileSync(sdk,`import fs from 'node:fs';const record=(method,args)=>fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({engine:'claude',method,args})+'\\n');
export const deleteSession=async()=>{};export const forkSession=async()=>{throw new Error('Fork is not used by this fixture')};
export function query({prompt,options}){record('start',options.settings);return {supportedCommands:async()=>[{name:'clear',description:'New native context',argumentHint:''},{name:'usage',description:'Native usage',argumentHint:'',aliases:['cost']},{name:'compact',description:'Native compact',argumentHint:''}],supportedModels:async()=>[{value:'fixture-claude',displayName:'Claude',description:'',supportsEffort:true,supportedEffortLevels:['low'],supportsFastMode:true}],mcpServerStatus:async()=>[{name:'sdk',status:'connected'}],accountInfo:async()=>({email:'fixture@example.invalid'}),setModel:async v=>record('setModel',v),setPermissionMode:async()=>{},setMaxThinkingTokens:async()=>{},applyFlagSettings:async v=>record('settings',v),close(){},async *[Symbol.asyncIterator](){yield {type:'system',subtype:'init',model:'fixture-claude',session_id:'fixture-claude-id',slash_commands:['usage','compact'],terminal_slash_commands:['model','theme']};for await(const item of prompt){record('prompt',item.message.content);if(item.message.content==='/clear')yield {type:'conversation_reset',new_conversation_id:'fixture-claude-new',session_id:'fixture-claude-id'};yield {type:'system',subtype:'local_command_output',content:'Official command result: '+item.message.content};yield {type:'system',subtype:'commands_changed',commands:[{name:'clear',description:'New native context',argumentHint:''},{name:'usage',description:'Native usage',argumentHint:'',aliases:['cost']},{name:'project-skill',description:'Discovered during session',argumentHint:'<text>'}]};yield {type:'result',subtype:'success'};}}}}`)
const entry=path.join(temp,'daemon.cjs');await build({entryPoints:['Infra/src/main/daemon.ts'],bundle:true,platform:'node',format:'cjs',outfile:entry,alias:{'@anthropic-ai/claude-agent-sdk':sdk},logLevel:'silent'})
const env={...process.env,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),CLAUDE_CONFIG_DIR:path.join(temp,'claude'),CODEX_BIN:bin,CODEX_HOME:path.join(temp,'codex-home')}
const service=spawn(process.execPath,[entry],{env,stdio:'ignore'}),done=new Promise(r=>service.once('exit',r))
const cli=async(...args)=>{const r=JSON.parse((await run(process.execPath,[path.join(root,'Infra/src/cli/agents'),...args,'--json'],{env,timeout:12000})).stdout);assert.ok(r.ok,r.error);return r.data}
const until=async(fn)=>{for(let n=0;n<100;n++){if(await fn())return;await new Promise(r=>setTimeout(r,40))}throw new Error('Timed out')}
const calls=()=>fs.readFileSync(log,'utf8').trim().split('\n').map(JSON.parse)
try{
 await until(async()=>{try{return (await cli('status')).running}catch{return false}})
 await cli('group','add','Test');const card=await cli('card','create','--title','Luna','--group','Test','--engine','codex')
 let id=(await cli('session','open',card.id)).sessionId
 await until(async()=>(await cli('session','info',id)).models[0]?.displayName===model.displayName)
 assert.deepEqual((await cli('session','info',id)).models[0].supportedEffortLevels,['low','medium'])
 await assert.rejects(()=>cli('config','effort',id,'max'))
 assert.ok((await cli('commands','list',id)).some(c=>c.name==='model'));await cli('commands','run',id,'/fast on');await cli('session','send',id,'/status')
 assert.equal(calls().filter(c=>c.method==='turn/start').length,0);assert.match((await cli('session','transcript',id)).text,/"fastMode": true/)
 await cli('session','send',id,'hello');await until(async()=>!(await cli('session','snapshot',id)).busy)
 assert.equal(calls().filter(c=>c.method==='turn/start').at(-1).params.serviceTier,'priority')
 await cli('commands','run',id,'/compact');await until(async()=>!(await cli('session','snapshot',id)).busy)
 assert.ok(calls().some(c=>c.method==='thread/compact/start'));assert.ok(!calls().some(c=>c.prompt==='/compact'))
 await cli('commands','run',id,'/review');await until(async()=>!(await cli('session','snapshot',id)).busy)
 assert.ok(calls().some(c=>c.method==='review/start'));assert.match((await cli('session','transcript',id)).text,/Native review complete/)
 await cli('session','review',id,'--base','main');await until(async()=>!(await cli('session','snapshot',id)).busy);assert.deepEqual(calls().filter(c=>c.method==='review/start').at(-1).params.target,{type:'baseBranch',branch:'main'})
 await cli('session','close',id);id=(await cli('session','open',card.id)).sessionId
 assert.equal((await cli('session','info',id)).fastMode,true)
 await cli('commands','run',id,'/fast off');await cli('config','effort',id,'default');await cli('session','close',id);id=(await cli('session','open',card.id)).sessionId
 assert.equal((await cli('session','info',id)).effort,undefined)
 await cli('config','effort',id,'low');await cli('session','send',id,'standard');await until(async()=>!(await cli('session','snapshot',id)).busy)
 assert.equal(calls().filter(c=>c.method==='turn/start').at(-1).params.serviceTier,null)
 await cli('commands','run',id,'/clear');const reset=(await cli('session','list')).sessions.find(c=>c.id===card.id);assert.equal(reset.threadId,undefined);assert.ok(reset.nativeSessions.some(ref=>ref.id==='fixture-thread'));assert.ok(!(await cli('session','transcript',id)).text.includes('fixture reply'))
 await assert.rejects(()=>cli('session','send',id,'/not-an-official-command'))
 await cli('config','plan',id,'on');await cli('session','send',id,'planning');await until(async()=>!(await cli('session','snapshot',id)).busy)
 assert.equal(calls().filter(c=>c.method==='turn/start').at(-1).params.collaborationMode.mode,'plan');assert.equal((await cli('session','info',id)).usage.total.totalTokens,24);await cli('commands','run',id,'/normal')
 assert.equal((await cli('engine','inspect',id,'skills')).data[0].name,'sample');assert.equal((await cli('engine','inspect',id,'mcp')).data[0].name,'fixture');assert.equal((await cli('engine','inspect',id,'account')).account.type,'chatgpt');assert.equal((await cli('engine','inspect',id,'usage')).rateLimits.primary.usedPercent,12)
 await cli('engine','skill',id,'sample','explain');await until(async()=>!(await cli('session','snapshot',id)).busy);assert.ok(calls().some(c=>c.method==='turn/start'&&c.params.input.some(i=>i.text==='$sample explain')))
 await cli('session','send',id,'ask user');await until(async()=>(await cli('approval','list',id)).length>0);const question=(await cli('approval','list',id))[0];await assert.rejects(()=>cli('approval','respond',id,question.id,'allow'));await cli('approval','respond',id,question.id,'allow','--answers','{"choice":["A"]}');await until(async()=>!(await cli('session','snapshot',id)).busy);assert.ok(calls().some(c=>c.answer?.answers?.choice?.answers[0]==='A'))
 await cli('session','send',id,'server reject');await until(async()=>!(await cli('session','snapshot',id)).busy);assert.match((await cli('session','transcript',id)).text,/Rejected before turn start/)
 await cli('session','send',id,'recovered');await until(async()=>!(await cli('session','snapshot',id)).busy)
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP+kAAAAASUVORK5CYII=';fs.writeFileSync(path.join(card.cwd,'design.png'),Buffer.from(png,'base64'))
 const image=await cli('workspace','image','design.png','--employee',card.id);assert.equal(image.mimeType,'image/png');assert.equal(image.data,png)
 await cli('session','send',id,'inspect image','--images','["design.png"]');await until(async()=>!(await cli('session','snapshot',id)).busy);const request=calls().filter(c=>c.method==='turn/start').at(-1);assert.equal(request.params.input[1].url,'data:image/png;base64,'+png);assert.ok(!JSON.stringify(request.params.input).includes(card.cwd));assert.match((await cli('session','transcript',id)).text,/\[图片\] design.png/)
 await assert.rejects(()=>cli('workspace','image','../escape.png','--employee',card.id))
 await cli('session','send',id,'slow');const first=await cli('session','enqueue',id,'first queued');const drop=await cli('session','enqueue',id,'do not run');await cli('session','enqueue',id,'/status');await cli('session','enqueue',id,'last queued');await cli('session','dequeue',id,drop.id);assert.equal((await cli('session','queue',id)).length,3)
 await until(async()=>!(await cli('session','snapshot',id)).busy&&(await cli('session','queue',id)).length===0)
 assert.ok(calls().some(c=>c.method==='turn/start'&&c.params.input.some(i=>i.text==='first queued')));assert.ok(calls().some(c=>c.method==='turn/start'&&c.params.input.some(i=>i.text==='last queued')));assert.ok(!calls().some(c=>c.method==='turn/start'&&c.params.input.some(i=>i.text==='do not run')))
 const text=(await cli('session','export',id)).content;assert.ok(text.includes('last queued'));await cli('session','export',id,'--path','history.md');assert.equal(fs.readFileSync(path.join(card.cwd,'history.md'),'utf8'),text);await assert.rejects(()=>cli('session','export',id,'--path','history.md'));await assert.rejects(()=>cli('session','export',id,'--path','../escape.md'))
 console.log('PASS native plan mode, Skills/MCP/account/usage, ordered message queue and scoped export')
 console.log('PASS Codex official catalog, validation, Fast parameters/persistence, command dispatch, compact and review without prompt simulation')
 const claude=await cli('card','create','--title','Claude','--group','Test','--engine','claude');const cid=(await cli('session','open',claude.id)).sessionId
 await until(async()=>(await cli('commands','list',cid)).some(c=>c.name==='usage'))
 assert.ok((await cli('commands','list',cid)).some(c=>c.name==='model'))
 await cli('commands','run',cid,'/cost');await until(async()=>!(await cli('session','snapshot',cid)).busy)
 assert.match((await cli('session','transcript',cid)).text,/Official command result: \/cost/)
 assert.ok((await cli('commands','list',cid)).some(c=>c.name==='project-skill'))
 await cli('config','fast',cid,'on');assert.ok(calls().some(c=>c.engine==='claude'&&c.method==='settings'&&c.args.fastMode===true))
 await cli('config','effort',cid,'low');await assert.rejects(()=>cli('config','effort',cid,'medium'))
 await cli('commands','run',cid,'/clear');await until(async()=>!(await cli('session','snapshot',cid)).busy);const newClaude=(await cli('session','list')).sessions.find(c=>c.id===claude.id);assert.equal(newClaude.claudeSessionId,'fixture-claude-new');assert.ok(newClaude.nativeSessions.some(ref=>ref.id==='fixture-claude-id'))
 console.log('PASS Claude SDK command aliases, dynamic discovery, native output and settings use shared CLI/Core')
}finally{service.kill('SIGTERM');await done;fs.rmSync(temp,{recursive:true,force:true})}
