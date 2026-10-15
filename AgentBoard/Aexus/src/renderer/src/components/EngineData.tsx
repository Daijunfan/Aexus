import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {Fragment} from 'react'

const labels:Record<string,string>={account:'账户信息',type:'类型',email:'邮箱',planType:'订阅计划',requiresOpenaiAuth:'需要 OpenAI 身份验证',rateLimits:'额度',primary:'主要额度',secondary:'次要额度',usedPercent:'已使用',windowDurationMins:'统计窗口（分钟）',resetsAt:'重置时间',credits:'点数',hasCredits:'可用点数',unlimited:'无限额度',balance:'余额',usage:'本次会话用量',inputTokens:'输入 Token',outputTokens:'输出 Token',cachedInputTokens:'缓存输入 Token',totalTokens:'总 Token',model:'模型',effort:'思考程度',engine:'引擎',cwd:'工作目录',permissionMode:'权限模式',fastMode:'Fast 模式',planMode:'计划模式',thinking:'深度思考',title:'会话名称',name:'名称',status:'状态',version:'版本',tools:'工具',resources:'资源',resourceTemplates:'资源模板',authStatus:'授权状态',note:'说明',command:'命令',rateLimitsUnavailable:'额度读取状态',sessionId:'会话 ID',threadId:'原生会话 ID',cost:'费用',totalCostUsd:'费用（USD）',apiKeySource:'API Key 来源',tokenSource:'Token 来源',subscriptionType:'订阅',organization:'组织'}
const label=(key:string)=>labels[key]?uiText(labels[key]):key.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ').replace(/^./,character=>character.toUpperCase())
const display=(key:string,value:unknown)=>{
 if(value===null||value===undefined)return uiText('Not provided')
 if(typeof value==='boolean')return uiText(value?'Yes':'No')
 if(key==='resetsAt'&&typeof value==='number')return new Date(value*1000).toLocaleString()
 return String(value)+(key==='usedPercent'?'%':'')
}
// Present protocol values without discarding unfamiliar fields from newer engines.
export function EngineData({data,depth=0}:{data:unknown;depth?:number}){
  useI18n()

 if(data===null||data===undefined)return <p className="engine-empty">{uiText("No data")}</p>
 if(typeof data!=='object')return <p>{String(data)}</p>
 if(Array.isArray(data))return <div className="data-view">{data.length?data.map((value,i)=><div className="data-group" key={i}><EngineData data={value} depth={depth+1}/></div>):<p className="engine-empty">{uiText("No entries")}</p>}</div>
 const entries=Object.entries(data),scalar=entries.filter(([,v])=>v===null||typeof v!=='object'),nested=entries.filter(([,v])=>v!==null&&typeof v==='object')
 return <div className="data-view">
  {!!scalar.length&&<dl className="data-fields">{scalar.map(([key,value])=><Fragment key={key}><dt title={key}>{label(key)}</dt><dd>{display(key,value)}</dd></Fragment>)}</dl>}
  {nested.map(([key,value])=>depth>1||['commands','models','terminalCommands'].includes(key)?<details className="data-nested" key={key}><summary>{label(key)}{Array.isArray(value)?` · ${value.length}`:''}</summary><EngineData data={value} depth={depth+1}/></details>:<section className="data-group" key={key}><h3>{label(key)}</h3>{typeof value.usedPercent==='number'&&<div className="usage-meter"><span>{uiText("Quota usage")}<b>{value.usedPercent}%</b></span><meter min={0} max={100} value={value.usedPercent} aria-label={uiText("{0} usage",[label(key)])}/></div>}<EngineData data={value} depth={depth+1}/></section>)}
  {!entries.length&&<p className="engine-empty">{uiText("No data")}</p>}
 </div>
}
export function RawData({data}:{data:unknown}){
  useI18n()
return <details className="data-raw"><summary>{uiText("View raw data")}</summary><pre>{JSON.stringify(data,null,2)}</pre></details>}
