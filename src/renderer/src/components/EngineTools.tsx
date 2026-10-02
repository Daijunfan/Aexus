import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {AppSelect} from './AppSelect'
import {useEffect,useState} from 'react'
import {Icon} from './Icon'
import {api} from '../api'
import {EngineData,RawData} from './EngineData'
import type {ViewState} from '../../../shared/view'
const sections={skills:'技能与命令',mcp:'MCP 服务',account:'账号',usage:'用量与额度',config:'当前配置',export:'导出会话',background:'后台进程'}
const hints={skills:'浏览引擎可用的技能，选择一项在当前会话中运行。',mcp:'当前引擎连接的服务、工具与授权状态。',account:'当前引擎使用的身份与订阅信息。',usage:'原生引擎报告的会话用量和账户额度。',config:'这个员工当前使用的模型、权限与工作环境。',export:'将会话保存到员工工作目录，支持 Markdown 和 JSON。',background:'查看和停止当前会话启动的后台任务。'}
const icons={skills:'sparkle',mcp:'plug',account:'account',usage:'dashboard',config:'settings-gear',export:'export',background:'terminal'}
export function EngineTools({id,section,onSection,onClose}:{id:string;section:NonNullable<ViewState['tools']>;onSection:(section:NonNullable<ViewState['tools']>)=>void;onClose:()=>void}){
  useI18n()

 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[prompt,setPrompt]=useState(''),[search,setSearch]=useState(''),[file,setFile]=useState('conversation.md'),[format,setFormat]=useState('markdown'),[running,setRunning]=useState(false)
 useEffect(()=>{let active=true;setLoading(true);setError('');setData(null);void api.call(section==='export'?'session.export':section==='background'?'session.background':'engine.inspect',section==='export'?{id,format}:{id,section}).then(value=>{if(active)setData(value)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[id,section,format])
 const skills=(data?.data??[]).filter((skill:any)=>`${skill.name} ${skill.description}`.toLowerCase().includes(search.toLowerCase()))
 return <section className="engine-tools" aria-label={uiText("Engine capabilities")}><header><small>{uiText("Workspace tools")}</small><nav>{Object.entries(sections).map(([key,label])=><button key={key} aria-pressed={section===key} onClick={()=>onSection(key as NonNullable<ViewState['tools']>)}><Icon name={icons[key as keyof typeof icons]}/>{uiText(label)}</button>)}</nav><button onClick={onClose}>{uiText("Back to conversation")}</button></header>
 <div className="engine-tool-content"><div className="engine-page-heading"><h2>{sections[section]}</h2><p>{hints[section]}</p></div>
 {error&&<p role="alert" className="workspace-error">{error}</p>}
 {loading?<p className="engine-empty" role="status">{uiText("Reading the native engine…")}</p>:<>
 {section==='skills'&&<><div className="skill-filters"><label>{uiText("Search skills")}<input aria-label={uiText("Search skills")} value={search} onChange={e=>setSearch(e.target.value)} placeholder={uiText("Name or keyword")}/></label><label>{uiText("Run arguments")}<input aria-label={uiText("Skill arguments")} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={uiText("Optional: describe the task")}/></label></div>{skills.map((skill:any)=><article className="engine-skill" key={skill.name}><div><strong>{skill.name}</strong><p className="skill-description">{skill.description}</p>{skill.description?.length>170&&<details><summary>{uiText("Full instructions")}</summary><p>{skill.description}</p></details>}</div><button disabled={running} onClick={async()=>{setRunning(true);try{await api.call('engine.skill',{id,name:skill.name,prompt});onClose()}catch(e){setError((e as Error).message)}finally{setRunning(false)}}}>{uiText("Run")}</button></article>)}{!skills.length&&<p className="engine-empty">{search?uiText("No matching skills"):uiText("No skills available")}</p>}{data?.note&&<p>{data.note}</p>}{data?.errors?.length>0&&<RawData data={data.errors}/>}</>}
 {section==='background'&&<>{(data?.data??[]).map((process:any)=><article className="engine-skill" key={process.processId}><div><strong>{process.command}</strong><p>{process.cwd} · PID {process.osPid??process.processId}</p></div><button onClick={async()=>{try{await api.call('session.background-stop',{id,processId:process.processId});setData(await api.call('session.background',{id}))}catch(e){setError((e as Error).message)}}}>{uiText("Stop")}</button></article>)}{!data?.data?.length&&<p className="engine-empty">{uiText("No background tasks are running.")}</p>}</>}
 {section==='export'&&<><div className="export-controls"><AppSelect aria-label={uiText("Export format")} value={format} onChange={e=>{setFormat(e.target.value);setFile(e.target.value==='json'?'conversation.json':'conversation.md')}}><option value="markdown">Markdown</option><option value="json">JSON</option></AppSelect><input aria-label={uiText("Export file name")} value={file} onChange={e=>setFile(e.target.value)}/><button onClick={async()=>{try{await api.call('session.export',{id,format,path:file});setError('');setData((old:any)=>({...old,saved:true}))}catch(e){setError((e as Error).message)}}}>{uiText("Save to the employee’s working directory")}</button>{data?.saved&&<span role="status">{uiText("Saved to workspace")}</span>}</div><pre>{data?.content}</pre></>}
 {!['skills','export','background'].includes(section)&&<><EngineData data={data}/>{data&&<RawData data={data}/>}</>}
 </>}
 </div></section>
}
