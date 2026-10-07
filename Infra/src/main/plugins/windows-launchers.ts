import path from 'node:path'
import {windowsLauncher} from '../platform'
type Write=(root:string,file:string,content:string,executable?:boolean)=>void
export function writeWindowsCompanyLauncher(root:string,directory:string,cli:string,write:Write){
  if(process.platform!=='win32')return
  const guard='if not defined AGENTS_COMPANY_TOKEN_FILE if not defined AGENTS_COMPANY_TOKEN (echo Agent identity missing; reopen this employee. 1>&2 & exit /b 2)\r\n'
  const content=windowsLauncher(process.execPath,cli).replace('set "ELECTRON_RUN_AS_NODE=1"',guard+'set "ELECTRON_RUN_AS_NODE=1"')
  write(root,path.join(directory,'bin','agents.cmd'),content,true)
}
export function writeWindowsPluginLauncher(root:string,directory:string,teamRoot:string,id:string,cli:string,write:Write){
  if(process.platform!=='win32')return
  const script=path.join(directory,'bin',id+'-launcher.cjs')
  const content=`const {spawn}=require('node:child_process');
const args=process.argv.slice(2);if(args.some(arg=>arg==='--workspace'||arg.startsWith('--workspace='))){console.error('Workspace is bound to this employee');process.exit(2)}
const env={...process.env,ELECTRON_RUN_AS_NODE:'1',AGENTS_WORKSPACE:${JSON.stringify(root)},AGENTS_TEAM_ROOT:${JSON.stringify(teamRoot)}};
env.AGENTS_COMPANY_PLUGIN_RPC ||= ${JSON.stringify(path.join(directory,'ipc',id))};
const child=spawn(process.execPath,[${JSON.stringify(cli)},'--workspace',${JSON.stringify(root)},...args],{env,stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1});child.on('exit',code=>process.exitCode=code??1);
`
  write(root,script,content)
  write(root,path.join(directory,'bin',id+'.cmd'),windowsLauncher(process.execPath,script),true)
}
