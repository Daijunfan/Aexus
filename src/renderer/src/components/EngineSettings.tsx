import {useEffect,useState} from 'react'
import {api} from '../api'
import type {EngineHealth,EngineId} from '../../../shared/engines'
type Descriptor={engine:EngineId;label:string;target:string;configuration:{path?:string;baseUrl?:string;hasApiKey:boolean}}
export function EngineSettings(){
  const [engines,setEngines]=useState<Descriptor[]>([]),[error,setError]=useState('')
  useEffect(()=>{let active=true;void api.call<Descriptor[]>('engine.list').then(value=>{if(active)setEngines(value)}).catch(cause=>setError(cause.message));return()=>{active=false}},[])
  return <section className="settings-section" aria-label="Coding Agent 引擎"><h3>Coding Agent 引擎</h3><p className="workspace-note">程序安装和模型请求发生在 Core 所在主机。检测不发送推理任务；认证与实际额度仍由服务商决定。</p>{error&&<p role="alert">{error}</p>}<div className="engine-health">{engines.map(engine=><EngineCard key={engine.engine} descriptor={engine}/>)}</div></section>
}
function EngineCard({descriptor}:{descriptor:Descriptor}){
  const [health,setHealth]=useState<EngineHealth>(),[checking,setChecking]=useState(false),[error,setError]=useState('')
  const [editing,setEditing]=useState(false),[executable,setExecutable]=useState(descriptor.configuration.path??''),[baseUrl,setBaseUrl]=useState(descriptor.configuration.baseUrl??''),[apiKey,setApiKey]=useState('')
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
    try{await api.call('engine.configure',{engine:descriptor.engine,patch:{path:executable,baseUrl,...(apiKey?{apiKey}:{})}});setApiKey('');setEditing(false);await check()}catch(cause){setError((cause as Error).message)}finally{setSaving(false)}
  }
  return <article data-engine-health={descriptor.engine}>
    <header><strong>{descriptor.label}</strong><span>{checking?'正在检测…':testResult?'测试调用通过':health?.ready?'已配置 · 调用尚未验证':health?.installed?health.protocol==='incompatible'?'版本／协议不兼容':health.authentication==='not-signed-in'?'尚未认证':'需要检查认证':'尚未安装'}</span></header>
    <small>执行主机：{descriptor.target}</small>{health?.path&&<code>{health.path}</code>}{health?.version&&<small>{health.version}</small>}
    {health&&<small>协议：{health.protocol} · 认证：{health.authentication} · 检测于 {new Date(health.checkedAt).toLocaleString()}</small>}
    {(error||health?.error)&&<small className="warn" role="alert">{error||health?.error}</small>}
    <div className="actions"><button type="button" disabled={checking} onClick={()=>void check()}>重新检测</button><button type="button" onClick={()=>setEditing(!editing)}>配置路径与 API Key</button><button type="button" disabled={job?.state==='running'} onClick={()=>void api.call('engine.install-plan',{engine:descriptor.engine}).then(setPlan).catch(cause=>setError(cause.message))}>下载／安装</button>{descriptor.engine==='codex'&&<button type="button" disabled={!health?.installed||login?.state==='running'} onClick={()=>void api.call('engine.login',{engine:'codex'}).then(setLogin).catch(cause=>setError(cause.message))}>官方设备码登录</button>}</div>
    <div className="actions"><button type="button" disabled={testing||!health?.installed} onClick={()=>setTestPlan(true)}>{testing?'测试调用中…':'测试调用'}</button></div>
    {testPlan&&<div><p>将在 {descriptor.target} 发起一次真实模型请求，仅要求回复 OK，可能产生费用。</p><label>测试模型（留空使用默认）<input value={testModel} onChange={event=>setTestModel(event.target.value)}/></label><button type="button" onClick={()=>void probe()}>确认测试调用</button><button type="button" onClick={()=>setTestPlan(false)}>取消</button></div>}
    {testResult&&<p role="status">测试通过 · {testResult.model} · {testResult.elapsedMs} ms · 回复：{testResult.text}</p>}
    {descriptor.engine==='claude'&&<small>Claude Agent 使用 API Key 或获准的服务商配置。已有原生引擎配置保持不变；本应用不提供 claude.ai 订阅登录。</small>}
    {editing&&<div><label>后端程序路径（留空自动发现）<input aria-label={`${descriptor.label} 程序路径`} value={executable} onChange={event=>setExecutable(event.target.value)}/></label><label>服务商地址（留空使用引擎原配置）<input value={baseUrl} onChange={event=>setBaseUrl(event.target.value)} placeholder="https://…"/></label><label>API Key（留空保留）<input aria-label={`${descriptor.label} API Key`} type="password" autoComplete="new-password" value={apiKey} onChange={event=>setApiKey(event.target.value)}/></label><p><button type="button" disabled={saving} onClick={()=>void save()}>{saving?'保存中…':'保存配置'}</button></p></div>}
    {plan&&<div><p>安装 {plan.package}@{plan.version} 到后端应用目录，不修改全局 PATH。</p><code>{plan.directory}</code><p><button type="button" disabled={job?.state==='running'} onClick={()=>{setPlan(undefined);void api.call('engine.install',{engine:descriptor.engine,confirm:true}).then(setJob).catch(cause=>setError(cause.message))}}>确认下载并安装</button><button type="button" onClick={()=>setPlan(undefined)}>取消</button></p></div>}
    {job&&<div><small>安装：{job.state}{job.error?' · '+job.error:''}</small><pre>{job.log}</pre>{job.state==='running'&&<button type="button" onClick={()=>void api.call('engine.cancel-install',{id:job.id}).then(setJob).catch(cause=>setError(cause.message))}>取消安装</button>}</div>}
    {login&&<div><small>Codex 登录：{login.state}</small><pre>{login.log||'正在请求设备码…'}</pre>{login.url&&<button type="button" onClick={()=>void api.openExternal(login.url)}>打开官方授权页面</button>}{login.state==='running'&&<button type="button" onClick={()=>void api.call('engine.cancel-login',{id:login.id}).then(setLogin)}>取消登录</button>}</div>}
  </article>
}
