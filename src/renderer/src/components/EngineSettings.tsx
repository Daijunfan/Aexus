import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {useEffect,useState} from 'react'
import {api} from '../api'
import type {EngineHealth,EngineId} from '../../../shared/engines'
type Descriptor={engine:EngineId;label:string;target:string;configuration:{path?:string;baseUrl?:string;model?:string;hasApiKey:boolean}}
export function EngineSettings(){
  useI18n()

  const [engines,setEngines]=useState<Descriptor[]>([]),[error,setError]=useState('')
  useEffect(()=>{let active=true;void api.call<Descriptor[]>('engine.list').then(value=>{if(active)setEngines(value)}).catch(cause=>setError(cause.message));return()=>{active=false}},[])
  return <section className="settings-section" aria-label={uiText("Coding agent engines")}><h3>{uiText("Coding agent engines")}</h3><p className="workspace-note">{uiText("Programs are installed and model requests run on the Core host. Detection does not send inference tasks; authentication and actual quota are determined by the provider.")}</p>{error&&<p role="alert">{error}</p>}<div className="engine-health">{engines.map(engine=><EngineCard key={engine.engine} descriptor={engine}/>)}</div></section>
}
function EngineCard({descriptor}:{descriptor:Descriptor}){
  useI18n()

  const [health,setHealth]=useState<EngineHealth>(),[checking,setChecking]=useState(false),[error,setError]=useState('')
  const [editing,setEditing]=useState(false),[executable,setExecutable]=useState(descriptor.configuration.path??''),[baseUrl,setBaseUrl]=useState(descriptor.configuration.baseUrl??''),[apiKey,setApiKey]=useState(''),[model,setModel]=useState(descriptor.configuration.model??'')
  const [plan,setPlan]=useState<any>(),[job,setJob]=useState<any>(),[login,setLogin]=useState<any>(),[saving,setSaving]=useState(false)
  const [testPlan,setTestPlan]=useState(false),[testing,setTesting]=useState(false),[testModel,setTestModel]=useState(descriptor.engine==='codex'?'gpt-6-luna':''),[testResult,setTestResult]=useState<{text:string;model:string;elapsedMs:number}>()
  const probe=async()=>{setTesting(true);setTestPlan(false);setError('');setTestResult(undefined);try{setTestResult(await api.call('engine.probe',{engine:descriptor.engine,confirm:true,model:testModel||undefined}))}catch(cause){setError((cause as Error).message)}finally{setTesting(false)}}
  const check=async()=>{setChecking(true);setError('');try{setHealth(await api.call<EngineHealth>('engine.check',{engine:descriptor.engine,force:true}))}catch(cause){setError((cause as Error).message)}finally{setChecking(false)}}
  useEffect(()=>{void check()},[descriptor.engine])
  useEffect(()=>{
    if(job?.state!=='running')return
    let active=true,pending=false
    const timer=setInterval(()=>{if(pending)return;pending=true;void api.call('engine.install-status',{id:job.id}).then(value=>{if(active){setJob(value);if(value.state==='succeeded')setExecutable('');if(value.state!=='running')void check()}}).catch(cause=>{if(active)setError(cause.message)}).finally(()=>{pending=false})},1000)
    return()=>{active=false;clearInterval(timer)}
  },[job?.id,job?.state])
  useEffect(()=>{
    if(login?.state!=='running')return
    let active=true,pending=false
    const timer=setInterval(()=>{if(pending)return;pending=true;void api.call('engine.login-status',{id:login.id}).then(value=>{if(active){setLogin(value);if(value.state!=='running')void check()}}).catch(cause=>{if(active)setError(cause.message)}).finally(()=>{pending=false})},1000)
    return()=>{active=false;clearInterval(timer)}
  },[login?.id,login?.state])
  const save=async()=>{
    setSaving(true);setError('');setTestResult(undefined)
    try{await api.call('engine.configure',{engine:descriptor.engine,patch:{path:executable,baseUrl,...(['cline','pi'].includes(descriptor.engine)?{model:baseUrl?model:''}:{}),...(apiKey?{apiKey}:{})}});setApiKey('');setEditing(false);await check()}catch(cause){setError((cause as Error).message)}finally{setSaving(false)}
  }
  return <article data-engine-health={descriptor.engine}>
    <header><strong>{descriptor.label}</strong><span>{checking?uiText("Checking…"):testResult?uiText("Test call passed"):health?.ready?uiText("Configured · Call not yet verified"):health?.installed?health.protocol==='incompatible'?uiText("Incompatible version or protocol"):health.authentication==='not-signed-in'?uiText("Not authenticated"):uiText("Authentication needs checking"):uiText("Not installed")}</span></header>
    <small>{uiText("Execution host:")}{descriptor.target}</small>{health?.path&&<code>{health.path}</code>}{health?.version&&<small>{health.version}</small>}
    {health&&<small>{uiText("Protocol:")}{health.protocol}  {uiText("· Authentication:")}{health.authentication}  {uiText("· Checked at")} {new Date(health.checkedAt).toLocaleString()}</small>}
    {(error||health?.error)&&<small className="warn" role="alert">{error||health?.error}</small>}
    <div className="actions"><button type="button" disabled={checking} onClick={()=>void check()}>{uiText("Check again")}</button><button type="button" onClick={()=>setEditing(!editing)}>{uiText("Configure path and API key")}</button><button type="button" disabled={job?.state==='running'} onClick={()=>void api.call('engine.install-plan',{engine:descriptor.engine}).then(setPlan).catch(cause=>setError(cause.message))}>{uiText("Download / install")}</button>{descriptor.engine==='codex'&&<button type="button" disabled={!health?.installed||login?.state==='running'} onClick={()=>void api.call('engine.login',{engine:'codex'}).then(setLogin).catch(cause=>setError(cause.message))}>{uiText("Official device-code sign-in")}</button>}</div>
    <div className="actions"><button type="button" disabled={testing||!health?.installed} onClick={()=>setTestPlan(true)}>{testing?uiText("Testing…"):uiText("Test call")}</button></div>
    {testPlan&&<div><p>{uiText("This will send to")} {descriptor.target}  {uiText("one real model request asking only for OK. Charges may apply.")}</p><label>{uiText("Test model (leave empty for default)")}<input value={testModel} onChange={event=>setTestModel(event.target.value)}/></label><button type="button" onClick={()=>void probe()}>{uiText("Confirm test call")}</button><button type="button" onClick={()=>setTestPlan(false)}>{uiText("Cancel")}</button></div>}
    {testResult&&<p role="status">{uiText("Test passed ·")} {testResult.model} · {testResult.elapsedMs}  {uiText("ms · Reply:")}{testResult.text}</p>}
    {(descriptor.engine==='cline'||descriptor.engine==='pi')&&<small>{uiText(baseUrl?"Uses the configured compatible endpoint. Reasoning is controlled by the provider.":"Uses a DeepSeek API key; defaults to Flash with thinking off. Supports local working directories on the Core host.")}</small>}
    {descriptor.engine==='claude'&&<small>{uiText("Claude Agent uses an API key or an approved provider configuration. Existing native configuration stays unchanged; this app does not offer claude.ai subscription sign-in.")}</small>}
    {editing&&<div><label>{uiText("Backend executable path (leave empty to detect)")}<input aria-label={uiText("{0} executable path",[descriptor.label])} value={executable} onChange={event=>setExecutable(event.target.value)}/></label><label>{uiText("Provider URL (leave empty for the engine’s configuration)")}<input value={baseUrl} onChange={event=>setBaseUrl(event.target.value)} placeholder="https://…"/></label>{(['cline','pi'] as string[]).includes(descriptor.engine)&&baseUrl&&<label>{uiText("Compatible model ID")}<input aria-label={uiText("Compatible model ID")} value={model} onChange={event=>setModel(event.target.value)}/></label>}<label>{uiText("API key (leave empty to keep)")}<input aria-label={uiText("{0} API key",[descriptor.label])} type="password" autoComplete="new-password" value={apiKey} onChange={event=>setApiKey(event.target.value)}/></label><p><button type="button" disabled={saving} onClick={()=>void save()}>{saving?uiText("Saving…"):uiText("Save configuration")}</button></p></div>}
    {plan&&<div><p>{uiText("Install")} {plan.package}@{plan.version}  {uiText("to the backend application directory without changing the global PATH.")}</p><code>{plan.directory}</code>{!!plan.requires?.length&&<small>{uiText("Requirements:")}{plan.requires.join('；')}</small>}<p><button type="button" disabled={job?.state==='running'} onClick={()=>{setPlan(undefined);void api.call('engine.install',{engine:descriptor.engine,confirm:true}).then(setJob).catch(cause=>setError(cause.message))}}>{uiText("Confirm download and installation")}</button><button type="button" onClick={()=>setPlan(undefined)}>{uiText("Cancel")}</button></p></div>}
    {job&&<div><small>{uiText("Installation:")}{job.state}{job.error?' · '+job.error:''}</small><pre>{job.log}</pre>{job.state==='running'&&<button type="button" onClick={()=>void api.call('engine.cancel-install',{id:job.id}).then(setJob).catch(cause=>setError(cause.message))}>{uiText("Cancel installation")}</button>}</div>}
    {login&&<div><small>{uiText("Codex sign-in:")}{login.state}</small><pre>{login.log||uiText("Requesting a device code…")}</pre>{login.url&&<button type="button" onClick={()=>void api.openExternal(login.url)}>{uiText("Open the official authorization page")}</button>}{login.state==='running'&&<button type="button" onClick={()=>void api.call('engine.cancel-login',{id:login.id}).then(setLogin)}>{uiText("Cancel sign-in")}</button>}</div>}
  </article>
}
