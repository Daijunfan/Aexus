import {ENGINE_DEFINITIONS,type EngineId} from './engines.ts'
import type {EffortLevel} from './types'

export const EFFORT_LEVELS=['none','minimal','low','medium','high','xhigh','max','ultra'] as const
export type DefaultEffort=EffortLevel|'default'
export const REASONING_DEFAULTS={defaultCodexEffort:'high',defaultClaudeEffort:'low',defaultOpenCodeEffort:'low',defaultClaudeThinking:false} as const
export type ReasoningPreferences={defaultCodexEffort:DefaultEffort;defaultClaudeEffort:DefaultEffort;defaultOpenCodeEffort:DefaultEffort;defaultClaudeThinking:boolean}
export const effortPreference=(engine:EngineId)=>engine==='codex'?'defaultCodexEffort':engine==='claude'?'defaultClaudeEffort':engine==='opencode'?'defaultOpenCodeEffort':undefined
export const EFFORT_SCHEMA={type:'string',enum:['default',...EFFORT_LEVELS],description:'Exact level supported by this engine/model; default clears the override. Query engine.models for supportedEffortLevels.'}
export function validateEffort(value:unknown):asserts value is DefaultEffort{
 if(typeof value!=='string'||value!=='default'&&!(EFFORT_LEVELS as readonly string[]).includes(value))throw Error('Choose a supported effort level or default')
}
/** New employees snapshot defaults once. Reopening an employee must never call this. */
export function employeeReasoning(engine:EngineId,preferences:ReasoningPreferences,overrides:{effort?:unknown;thinking?:unknown}={}){
 const capabilities=ENGINE_DEFINITIONS[engine].capabilities,key=effortPreference(engine)
 const effort=overrides.effort??(key?preferences[key]:'default'),thinking=overrides.thinking??(engine==='claude'?preferences.defaultClaudeThinking:false)
 validateEffort(effort)
 if(typeof thinking!=='boolean')throw Error('thinking must be boolean')
 if(!capabilities.effort&&effort!=='default')throw Error(`${engine} does not support configurable effort`)
 if(!capabilities.thinking&&thinking)throw Error(`${engine} uses its native reasoning controls; a thinking toggle is not supported`)
 return {effort:effort==='default'?undefined:effort,thinking}
}
