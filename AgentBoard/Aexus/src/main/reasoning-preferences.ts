import {effortPreference,validateEffort} from '../shared/reasoning-defaults'
import {mergePreferences,type PreferencesPatch} from '../shared/preferences'
import {activeModel,modelEfforts} from '../shared/engine-commands'
import {engineModels} from './engine-models'
import {getPreferences} from './store'

/** Validate against the configured provider; reading a catalogue never sends inference. */
export async function validateReasoningPreferences(patch:PreferencesPatch){
 const current=getPreferences(),next=mergePreferences(current,patch)
 for(const engine of ['codex','claude','opencode'] as const){
  const key=effortPreference(engine)!,modelKey=engine==='codex'?'defaultCodexModel':engine==='claude'?'defaultClaudeModel':'defaultOpenCodeModel'
  if(patch[key]===undefined&&patch[modelKey]===undefined||next[key]===current[key]&&next[modelKey]===current[modelKey])continue
  validateEffort(next[key])
  if(next[key]==='default')continue
  const catalog=await engineModels(engine),model=activeModel(catalog.models,next[modelKey]||catalog.defaultModel)
  if(!model)throw Error(`Cannot validate ${engine} default effort: choose a model from engine.models, or use default effort`)
  if(!modelEfforts(engine,model).includes(next[key]))throw Error(`${engine} model ${model.value} supports ${modelEfforts(engine,model).join(', ')||'no effort override'}; choose default to inherit the native model`)
 }
}
