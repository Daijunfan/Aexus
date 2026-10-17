import {useEffect,useState} from 'react'
import {api} from '../api'
import {translate as uiText} from '../i18n'
import {AppSelect} from './AppSelect'
import {activeModel,modelEfforts} from '../../../shared/engine-commands'
import type {Preferences} from '../../../shared/preferences'
import {effortPreference,type DefaultEffort,type ReasoningPreferences} from '../../../shared/reasoning-defaults'
import type {ModelInfo} from '../../../shared/types'

function EffortDefault({engine,value,onChange}:{engine:'codex'|'claude'|'opencode';value:Preferences;onChange:(patch:Partial<ReasoningPreferences>)=>void}){
 const key=effortPreference(engine)!,model=engine==='codex'?value.defaultCodexModel:engine==='claude'?value.defaultClaudeModel:value.defaultOpenCodeModel
 const [choices,setChoices]=useState<string[]>([]),[error,setError]=useState('')
 useEffect(()=>{let active=true;setChoices([]);setError('');void api.call<{models:ModelInfo[];defaultModel?:string}>('engine.models',{engine}).then(catalog=>{if(active)setChoices(modelEfforts(engine,activeModel(catalog.models,model||catalog.defaultModel)))}).catch(cause=>{if(active)setError(cause.message)});return()=>{active=false}},[engine,model])
 return <label>{engine==='codex'?'Codex':engine==='claude'?'Claude Agent':'OpenCode'} · {uiText('Default effort')}<AppSelect name={key} value={value[key]} onChange={event=>onChange({[key]:event.target.value as DefaultEffort})}>
  <option value="default">{uiText('Use model default')}</option>{!choices.includes(value[key])&&value[key]!=='default'&&<option value={value[key]}>{value[key]} · {uiText('Current configuration')}</option>}{choices.map(level=><option key={level} value={level}>{level}</option>)}
 </AppSelect>{error&&<small role="alert">{uiText('Unable to load models. Check the engine’s installation and configuration.')}</small>}</label>
}
export function ReasoningDefaults({value,onChange}:{value:Preferences;onChange:(patch:Partial<ReasoningPreferences>)=>void}){
 return <><EffortDefault engine="codex" value={value} onChange={onChange}/><EffortDefault engine="claude" value={value} onChange={onChange}/><EffortDefault engine="opencode" value={value} onChange={onChange}/><label className="settings-toggle"><span>{uiText('Claude default thinking')}</span><input type="checkbox" name="defaultClaudeThinking" checked={value.defaultClaudeThinking} onChange={event=>onChange({defaultClaudeThinking:event.target.checked})}/></label><small>{uiText('Reasoning defaults apply to new employees in every role. Existing employees keep their settings. Cline and Pi do not expose effort controls.')}</small></>
}
