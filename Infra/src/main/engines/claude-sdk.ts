import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {engineConfiguration} from './configuration'
import {engineExecutable} from './executable'
const requireModule=createRequire(__filename)

/** Source development can reuse an installed SDK; public packages load the user's managed copy. */
export function claudeSdkPath(){
  const configured=engineConfiguration('claude').sdkPath
  if(configured&&fs.existsSync(configured))return configured
  try{return requireModule.resolve('@anthropic-ai/claude-agent-sdk')}catch{}
  const executable=engineExecutable('claude',true)
  if(path.isAbsolute(executable)&&fs.existsSync(executable)){
    const directory=path.dirname(fs.realpathSync(executable)),managed=path.join(directory,'sdk','sdk.mjs')
    if(fs.existsSync(managed))return managed
    try{return requireModule.resolve('@anthropic-ai/claude-agent-sdk',{paths:[directory]})}catch{}
  }
  return undefined
}
export function exposeClaudeSdk(){
  const file=claudeSdkPath()
  if(file){process.env.AGENTS_COMPANY_CLAUDE_SDK=file;process.env.AGENTS_COMPANY_CLAUDE_BIN=engineExecutable('claude',true)}
  else {delete process.env.AGENTS_COMPANY_CLAUDE_SDK;delete process.env.AGENTS_COMPANY_CLAUDE_BIN}
}
export async function loadClaudeSdk():Promise<typeof import('@anthropic-ai/claude-agent-sdk')>{
  const file=claudeSdkPath()
  if(!file)throw Error('Claude Agent SDK 尚未安装；请在设置 → Coding Agent 引擎中确认下载，或配置已有 SDK 路径')
  return import(pathToFileURL(file).href)
}
