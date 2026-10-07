import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {useEffect,useState} from 'react'
import type {Engine,EmployeeKind,ModelInfo} from '../../../shared/types'
import {api} from '../api'
import {AppSelect} from './AppSelect'

export function ModelSelect({engine,kind='worker',team,value='',onChange,label,preference=false}:{engine:Engine;kind?:EmployeeKind;team?:string;value?:string;onChange:(value:string)=>void;label?:string;preference?:boolean}){
  useI18n()

  const [catalog,setCatalog]=useState<{models:ModelInfo[];defaultModel?:string}>({models:[]}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  useEffect(()=>{
    let active=true;setCatalog({models:[]});setError('');setLoading(true)
    if(kind==='cloud-native-worker'&&!team){setLoading(false);return}
    void api.call<typeof catalog>('engine.models',{engine,kind,team}).then(result=>{if(active)setCatalog(result)}).catch(cause=>{if(active)setError(cause.message)}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[engine,kind,team,retry])
  return <label>{label??uiText('Model')}<AppSelect name={preference?`default-${engine}-model`:'model'} value={value} onChange={event=>onChange(event.target.value)} disabled={loading||kind==='cloud-native-worker'&&!team}>
    <option value="">{loading?uiText("Loading available models…"):preference?uiText("Use system default"):uiText("Default {0}",[catalog.defaultModel?` · ${catalog.models.find(model=>model.value===catalog.defaultModel)?.displayName??catalog.defaultModel}`:''])}</option>
    {value&&!catalog.models.some(model=>model.value===value)&&<option value={value}>{value} {uiText("(Current configuration)")}</option>}
    {catalog.models.map(model=><option key={model.value} value={model.value}>{model.displayName}</option>)}
  </AppSelect>{error&&<small className="model-catalog-error" role="alert"><span>{uiText("Unable to load models. Check the engine’s installation and configuration.")}</span><details><summary>{uiText("Technical details")}</summary><pre>{error}</pre></details><button type="button" onClick={()=>setRetry(value=>value+1)}>{uiText("Reload")}</button></small>}</label>
}
