import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {resolveBinary} from '../exec'
import {engineConfiguration} from './configuration'
import type {EngineId} from '../../shared/engines'
const requireModule=createRequire(__filename)
export function bundledClaudeBinary(from?:string){
  const suffix=process.platform==='linux'&&!(process.report.getReport() as any).header?.glibcVersionRuntime?'-musl':''
  const name=`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}${suffix}`
  const leaf=process.platform==='win32'?'claude.exe':'claude'
  try{return requireModule.resolve(`${name}/${leaf}`,from?{paths:[from]}:undefined).replace('.asar/','.asar.unpacked/')}catch{return undefined}
}
/** Resolve at call time: install/configure never requires restarting the company. */
export function engineExecutable(engine:EngineId,preferPaired=engine==='claude'):string{
  const config=engineConfiguration(engine)
  const override=process.env[engine.toUpperCase()+'_BIN']
  if(override)return override
  if(config.path)return config.path
  if(config.managedPath&&fs.existsSync(config.managedPath))return config.managedPath
  const sdkRoot=config.sdkPath&&fs.existsSync(config.sdkPath)?path.dirname(fs.realpathSync(config.sdkPath)):undefined
  if(engine==='claude'&&preferPaired){const bundled=bundledClaudeBinary(sdkRoot);if(bundled)return bundled}
  const external=resolveBinary(engine)
  if(path.isAbsolute(external)&&fs.existsSync(external))return external
  return engine==='claude'?bundledClaudeBinary(sdkRoot)??external:external
}
