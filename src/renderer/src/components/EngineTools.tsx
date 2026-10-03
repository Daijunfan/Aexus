import {translate as uiText,useI18n,interfaceLocale,interfaceLanguage} from '../i18n'
import {AppSelect} from './AppSelect'
import {useEffect,useState} from 'react'
import {Icon} from './Icon'
import {BackButton} from './BackButton'
import {api} from '../api'
import {EngineData,RawData} from './EngineData'
import type {ViewState} from '../../../shared/view'
const sections={skills:'Skills and commands',mcp:'MCP services',account:'Account',usage:'Usage and quota',config:'Current configuration',export:'Export conversation',background:'Background processes'}
const hints={skills:'Browse available skills and run one in this conversation.',mcp:'Services, tools and authorization reported by this engine.',account:'Identity and subscription information reported by this engine.',usage:'Session usage and account limits reported by the native engine.',config:'This employee’s current model, permissions and working environment.',export:'Save the conversation to the employee workspace as Markdown or JSON.',background:'Inspect and stop background tasks started by this conversation.'}
const icons={skills:'sparkle',mcp:'plug',account:'account',usage:'dashboard',config:'settings-gear',export:'export',background:'terminal'}
export function EngineTools({id,section,onSection,onClose}:{id:string;section:NonNullable<ViewState['tools']>;onSection:(section:NonNullable<ViewState['tools']>)=>void;onClose:()=>void}){
  useI18n()

 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[prompt,setPrompt]=useState(''),[search,setSearch]=useState(''),[file,setFile]=useState('conversation.md'),[format,setFormat]=useState('markdown'),[running,setRunning]=useState(false)
 useEffect(()=>{let active=true;setLoading(true);setError('');setData(null);void api.call(section==='export'?'session.export':section==='background'?'session.background':'engine.inspect',section==='export'?{id,format}:{id,section}).then(value=>{if(active)setData(value)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[id,section,format])
 const skills=(Array.isArray(data?.data)?data.data:[]).filter((skill:any)=>`${skill.name} ${skill.description}`.toLowerCase().includes(search.toLowerCase()))
 return <section className="engine-tools" aria-label={uiText("Engine capabilities")}><header><BackButton onClick={onClose}/><small>{uiText("Workspace tools")}</small><nav>{Object.entries(sections).map(([key,label])=><button key={key} aria-pressed={section===key} onClick={()=>onSection(key as NonNullable<ViewState['tools']>)}><Icon name={icons[key as keyof typeof icons]}/>{uiText(label)}</button>)}</nav></header>
 <div className="engine-tool-content"><div className="engine-page-heading"><h2>{uiText(sections[section])}</h2><p>{uiText(hints[section])}</p></div>
 {error&&<p role="alert" className="workspace-error">{error}</p>}
 {loading?<p className="engine-empty" role="status">{uiText("Reading the native engine…")}</p>:<>
 {section==='skills'&&<><div className="skill-filters"><label>{uiText("Search skills")}<input aria-label={uiText("Search skills")} value={search} onChange={e=>setSearch(e.target.value)} placeholder={uiText("Name or keyword")}/></label><label>{uiText("Run arguments")}<input aria-label={uiText("Skill arguments")} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={uiText("Optional: describe the task")}/></label></div>{skills.map((skill:any)=><article className="engine-skill" key={skill.name}><div><strong>{skill.name}</strong><p className="skill-description">{skill.description}</p>{skill.description?.length>170&&<details><summary>{uiText("Full instructions")}</summary><p>{skill.description}</p></details>}</div><button disabled={running} onClick={async()=>{setRunning(true);try{await api.call('engine.skill',{id,name:skill.name,prompt});onClose()}catch(e){setError((e as Error).message)}finally{setRunning(false)}}}>{uiText("Run")}</button></article>)}{!skills.length&&<p className="engine-empty">{search?uiText("No matching skills"):uiText("No skills available")}</p>}{data?.note&&<p>{data.note}</p>}{data?.errors?.length>0&&<RawData data={data.errors}/>}</>}
 {section==='background'&&<>{(Array.isArray(data?.data)?data.data:[]).map((process:any)=><article className="engine-skill" key={process.processId}><div><strong>{process.command}</strong><p>{process.cwd} · PID {process.osPid??process.processId}</p></div><button onClick={async()=>{try{await api.call('session.background-stop',{id,processId:process.processId});setData(await api.call('session.background',{id}))}catch(e){setError((e as Error).message)}}}>{uiText("Stop")}</button></article>)}{!data?.data?.length&&<p className="engine-empty">{uiText("No background tasks are running.")}</p>}</>}
 {section==='export'&&<><div className="export-controls"><AppSelect aria-label={uiText("Export format")} value={format} onChange={e=>{setFormat(e.target.value);setFile(e.target.value==='json'?'conversation.json':'conversation.md')}}><option value="markdown">Markdown</option><option value="json">JSON</option></AppSelect><input aria-label={uiText("Export file name")} value={file} onChange={e=>setFile(e.target.value)}/><button onClick={async()=>{try{await api.call('session.export',{id,format,path:file});setError('');setData((old:any)=>({...old,saved:true}))}catch(e){setError((e as Error).message)}}}>{uiText("Save to the employee’s working directory")}</button>{data?.saved&&<span role="status">{uiText("Saved to workspace")}</span>}</div><pre>{data?.content}</pre></>}
 {!['skills','export','background'].includes(section)&&<>{section==='config'&&data?<Configuration data={data}/>:<EngineData data={section==='mcp'?data?.data??data:data}/>}{data&&<RawData data={data}/>}</>}
 </>}
 </div></section>
}

/** Keep common settings readable; unfamiliar engine fields remain available on demand. */
function Configuration({data}:{data:Record<string,unknown>}){
 const sections=[['Workspace and identity',['title','engine','cwd']],['Model and permissions',['model','effort','permissionMode','thinking','planMode','fastMode']],['Current activity',['busy','acknowledging']]] as const
 const shown=new Set<string>(sections.flatMap(([,fields])=>[...fields])),extra=Object.fromEntries(Object.entries(data).filter(([key])=>!shown.has(key)))
 return <><div className="engine-config-grid">{sections.map(([title,fields])=><section className="engine-config-card" key={title}><h3>{uiText(title)}</h3><EngineData data={Object.fromEntries(fields.filter(key=>key in data).map(key=>[key,data[key]]))}/></section>)}</div>{Object.keys(extra).length>0&&<details className="engine-technical"><summary>{uiText('Technical engine details')}</summary><EngineData data={extra}/></details>}</>
}
