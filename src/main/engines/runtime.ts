import {openCline} from './cline-runtime'
import {openPi} from './pi-runtime'
import {openCodex} from './codex-runtime'
import {openClaude} from './claude-runtime'
import type {EngineStart} from './contract'
import type {EngineId} from '../../shared/engines'
const adapters:Record<EngineId,(context:EngineStart)=>Promise<{sessionId:string;cwd:string;engine:EngineId}>>={codex:openCodex,claude:openClaude,cline:openCline,pi:openPi}
export function openEngine(context:EngineStart){
  const adapter=adapters[context.engine]
  if(!adapter)throw Error('No runtime adapter for '+context.engine)
  return adapter(context)
}
