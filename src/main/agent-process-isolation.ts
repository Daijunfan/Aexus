import {applicationRoot} from './resources'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type {SpawnOptionsWithoutStdio,ChildProcessWithoutNullStreams} from 'node:child_process'
import spawn from 'cross-spawn'
import {APP_HOME} from '../shared/protocol'
import {readStore} from './store'
import {employeeSettings} from '../shared/types'
import {agentCredential,agentEnvironment} from './agent-access'

const canonical=(value:string)=>fs.realpathSync(value)
export function employeeProcessOptions(employeeId:string){
  const card=readStore().sessions.find(c=>c.id===employeeId&&!c.deleting);if(!card)throw Error('Employee no longer exists')
  const env=agentEnvironment(employeeId)
  if(card.accessMode!=='isolated')return {env,profile:undefined}
  if(process.platform!=='darwin'||!fs.existsSync('/usr/bin/sandbox-exec')||employeeSettings(readStore(),card).mode==='cloud')throw Error('Strict process isolation is unavailable for this execution target; choose a separately isolated OS account or explicitly use trusted mode')
  const sourceRoot=applicationRoot();if(sourceRoot===card.cwd||sourceRoot.startsWith(card.cwd+path.sep))throw Error('Strict employees cannot modify the running host source; use a separate checkout')
  const runtime=agentCredential(employeeId).folder,quote=(value:string)=>JSON.stringify(value)
  for(const engine of ['codex','claude']){
    const target=path.join(runtime,engine);fs.mkdirSync(target,{recursive:true,mode:0o700})
    for(const file of engine==='codex'?['auth.json','config.toml','models_cache.json']:['.credentials.json']){const source=path.join((engine==='codex'?process.env.CODEX_HOME:process.env.CLAUDE_CONFIG_DIR)||path.join(os.homedir(),'.'+engine),file),copy=path.join(target,file);if(fs.existsSync(source)&&!fs.existsSync(copy))fs.copyFileSync(source,copy)}
  }
  const store=readStore(),workRoot=store.teamSettings?.[card.group]?.mode==='work'?store.teamRoots?.[card.group]:undefined
  const writable=card.engine==='claude'||!card.planMode&&['acceptEdits','dontAsk','bypassPermissions'].includes(card.permissionMode??'default')
  const profile=`(version 1)
(deny default)
(allow file-read* (require-all (require-not (subpath ${quote(canonical(APP_HOME))})) ${workRoot?`(require-not (subpath ${quote(canonical(workRoot))}) )`: ''}))
(allow file-read* (subpath ${quote(canonical(card.cwd))}))
(allow file-read* (subpath ${quote(canonical(runtime))}))
(allow file-read* (subpath ${quote(path.join(canonical(APP_HOME),'cli'))}))
(allow file-read-metadata (subpath ${quote(canonical(APP_HOME))}))
(allow file-write* (require-all (require-any ${writable?`(subpath ${quote(canonical(card.cwd))})`: ''} (subpath ${quote(canonical(os.tmpdir()))}) (literal "/dev/null")) (require-not (subpath ${quote(canonical(APP_HOME))}))))
(allow file-write* (subpath ${quote(canonical(runtime))}))
(allow process-exec) (allow process-fork) (allow sysctl-read) (allow signal (target same-sandbox))
(allow network-outbound)
`
  return {profile,env:{...env,CODEX_HOME:path.join(runtime,'codex'),CLAUDE_CONFIG_DIR:path.join(runtime,'claude')}}
}
export function spawnEmployeeProcess(employeeId:string|undefined,command:string,args:string[],options:SpawnOptionsWithoutStdio={}){
  const access=employeeId?employeeProcessOptions(employeeId):undefined
  return spawn(access?.profile?'/usr/bin/sandbox-exec':command,access?.profile?['-p',access.profile,command,...args]:args,{...options,env:{...options.env,...access?.env,...(access?{PATH:access.env.PATH+path.delimiter+(options.env?.PATH??'')}: {})},stdio:['pipe','pipe','pipe']}) as ChildProcessWithoutNullStreams
}
