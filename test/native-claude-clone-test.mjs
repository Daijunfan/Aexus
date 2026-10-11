// Native Claude transcript forking with /usage only: no model inference.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-native-claude-fork-')))
process.env.CLAUDE_CONFIG_DIR=path.join(temp,'config')
const {query,forkSession,getSessionMessages,getSessionInfo,deleteSession}=await import('@anthropic-ai/claude-agent-sdk')
let source,branch,release
const prompt=(async function*(){yield {type:'user',message:{role:'user',content:'/usage'},parent_tool_use_id:null,session_id:''};await new Promise(r=>release=r)})()
const q=query({prompt,options:{cwd:temp,settingSources:[],model:'haiku',pathToClaudeCodeExecutable:process.env.CLAUDE_BIN||path.join(os.homedir(),'.npm-global/bin/claude')}})
const timeout=setTimeout(()=>{release?.();q.close()},15000)
try{
 for await(const message of q){if(message.type==='system'&&message.subtype==='init')source=message.session_id;if(message.type==='result'){release?.();q.close();break}}
 assert.ok(source);const before=await getSessionMessages(source);assert.ok(before.length)
 branch=(await forkSession(source,{title:'Isolated clone verification'})).sessionId;assert.notEqual(branch,source)
 const after=await getSessionMessages(branch);assert.deepEqual(after.map(m=>m.message),before.map(m=>m.message));assert.equal((await getSessionInfo(branch)).customTitle,'Isolated clone verification')
 const newCwd=path.join(temp,'branch');fs.mkdirSync(newCwd);let releaseBranch,sawBranch=false
 const forkPrompt=(async function*(){yield {type:'user',message:{role:'user',content:'/usage'},parent_tool_use_id:null,session_id:''};await new Promise(r=>releaseBranch=r)})()
 const continuation=query({prompt:forkPrompt,options:{cwd:newCwd,resume:branch,settingSources:[],model:'haiku',pathToClaudeCodeExecutable:process.env.CLAUDE_BIN||path.join(os.homedir(),'.npm-global/bin/claude')}})
 try{for await(const message of continuation){if(message.type==='system'&&message.subtype==='init'){assert.equal(message.session_id,branch);assert.equal(message.cwd,newCwd);sawBranch=true}if(message.type==='result')break}}finally{releaseBranch?.();continuation.close()}
 assert.ok(sawBranch,'Native fork must resume in the new employee directory')
 await deleteSession(branch);branch=undefined;assert.deepEqual(await getSessionMessages(source),before)
 branch=(await forkSession(source,{title:'Surviving clone'})).sessionId;await deleteSession(source);source=undefined;assert.deepEqual((await getSessionMessages(branch)).map(m=>m.message),before.map(m=>m.message))
 console.log('PASS official Claude fork copies native context with an independent ID/title; deleting the fork preserves its source; no inference')
}finally{clearTimeout(timeout);release?.();q.close();if(branch)await deleteSession(branch);if(source)await deleteSession(source);fs.rmSync(temp,{recursive:true,force:true})}
