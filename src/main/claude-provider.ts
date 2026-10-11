import {engineProcessEnvironment} from './engines/configuration'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type {Options} from '@anthropic-ai/claude-agent-sdk'
import type {EffortLevel,ModelInfo} from '../shared/types'

export function claudeUserSettings(){
  const file=path.join(process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude'),'settings.json')
  return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{}
}

/** Detect the provider, including gateways that keep Claude IDs but label the routed models. */
export function deepSeekProvider(cwd?:string){
  let settings=claudeUserSettings()
  for(const name of cwd?['settings.json','settings.local.json']:[]){
    const file=path.join(cwd!,'.claude',name)
    if(fs.existsSync(file)){const local=JSON.parse(fs.readFileSync(file,'utf8'));settings={...settings,...local,env:{...settings.env,...local.env}}}
  }
  const env=engineProcessEnvironment('claude',{...settings.env,...process.env})
  const deepseek=/api\.deepseek\.com/i.test(env.ANTHROPIC_BASE_URL??'')||Object.entries(env).some(([key,value])=>/^ANTHROPIC_.*MODEL(?:_NAME)?$/.test(key)&&/^deepseek-/i.test(String(value)))
  return deepseek?{env,defaultModel:settings.model as string|undefined}:undefined
}
export type DeepSeekProvider=NonNullable<ReturnType<typeof deepSeekProvider>>
export const deepSeekModels:ModelInfo[]=[
  {value:'deepseek-flash',displayName:'DeepSeek Flash',description:'Text & image input · 1M context · Thinking: off / low / high / max',inputModalities:['text','image']},
  {value:'deepseek-v4-pro',displayName:'DeepSeek V4 Pro',description:'Text only · 1M context · Thinking: off / low / high / max',inputModalities:['text']}
].map(m=>({...m,supportsEffort:true,supportedEffortLevels:['low','high','max'],defaultEffort:'high',supportsAdaptiveThinking:true,supportsFastMode:false}))

export function deepSeekModel(provider:DeepSeekProvider,model?:string):string{
  let value=(model&&model!=='default'?model:provider.env.ANTHROPIC_MODEL||provider.defaultModel||'opus').replace(/\[1m\]$/i,'')
  for(const alias of ['haiku','sonnet','opus','fable']){
    const prefix='ANTHROPIC_DEFAULT_'+alias.toUpperCase()+'_MODEL'
    if(value===alias||value===String(provider.env[prefix]??'').replace(/\[1m\]$/i,'')||value.startsWith('claude-'+alias)){
      value=provider.env[prefix+'_NAME']||provider.env[prefix]||(alias==='haiku'?'deepseek-flash':'deepseek-v4-pro');break
    }
  }
  if(/deepseek-(?:v4(?:\.1)?-)?flash/i.test(value)||value.startsWith('claude-haiku'))return 'deepseek-flash'
  if(/deepseek-v4-pro/i.test(value)||/^claude-(opus|sonnet|fable)/.test(value))return 'deepseek-v4-pro'
  throw new Error('DeepSeek 仅支持 deepseek-flash 和 deepseek-v4-pro')
}
export function deepSeekEffort(effort?:EffortLevel):EffortLevel|undefined{
  if(effort===undefined)return undefined
  return ['max','ultra'].includes(effort)?'max':['minimal','low'].includes(effort)?'low':'high'
}
/** Native model handling controls effort support; the outgoing model ID stays DeepSeek. */
export const deepSeekPicker:NonNullable<Options['settings']&object>={modelPicker:{replaceBuiltInOptions:true,options:deepSeekModels.map(m=>({model:m.value,label:m.displayName,description:m.description,behavesAs:'claude-opus-4-6'}))}}
