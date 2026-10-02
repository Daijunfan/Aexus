import {spawn} from 'node:child_process'
import path from 'node:path'
import {openDiscussionMcp} from '../discussion-mcp'
import {python,tunnelConfig,tunnelDirectory} from '../tunnel'
import {childEnv} from '../exec'
import type {Live} from '../sessions'

/** The native remote host receives only this random-path discussion MCP endpoint. */
export async function openCodexDiscussion(state:Live){
 const mcp=await openDiscussionMcp(state)
 if(!state.nativeRemote)return mcp
 let tunnel:ReturnType<typeof spawn>|undefined
 const close=async()=>{tunnel?.kill('SIGTERM');await mcp.close()}
 try{
  const url=new URL(mcp.url),payload=Buffer.from(JSON.stringify({target:tunnelConfig(state.nativeRemote),port:Number(url.port)})).toString('base64url')
  tunnel=spawn(python(),[path.join(tunnelDirectory(),'agent_process.py'),'gateway',payload],{env:childEnv(),stdio:['pipe','pipe','pipe']})
  const port=await new Promise<number>((resolve,reject)=>{
   let output=''
   const timer=setTimeout(()=>reject(Error('Remote discussion tool tunnel timed out')),20000)
   tunnel!.once('error',error=>{clearTimeout(timer);reject(error)})
   tunnel!.once('exit',()=>{clearTimeout(timer);reject(Error(output||'Remote discussion tool tunnel closed'))})
   tunnel!.stderr!.on('data',chunk=>{output=(output+chunk).slice(-4000);const match=output.match(/Allocated port (\d+)/);if(match){clearTimeout(timer);resolve(Number(match[1]))}})
  })
  url.port=String(port)
  return {url:url.href,close}
 }catch(error){await close();throw error}
}
