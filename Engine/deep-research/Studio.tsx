import {useEffect,useState} from 'react'
import type {WorkflowView,WorkflowFile} from '../../Contract/workflow'
import './studio.css'

export type MaterialProvenance={format:string;sha256:string;bytes:number;pages?:number;sheets?:number;characters:number;truncated:boolean;warnings:string[]}
export type ResearchMaterial={name:string;text:string;provenance?:MaterialProvenance}
export type PreparedFile={name:string;content:string;encoding:'base64'}
export type PrepareDocuments=(files:PreparedFile[])=>Promise<ResearchMaterial[]>
/** Browsers send selected bytes, never a client-local path. */
export async function selectedDocument(file:File):Promise<PreparedFile>{
 const bytes=new Uint8Array(await file.arrayBuffer());let binary=''
 for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384))
 return {name:file.name,encoding:'base64',content:btoa(binary)}
}
export async function checkedBytes(file:WorkflowFile&{content:string}):Promise<Uint8Array<ArrayBuffer>>{
 if(file.encoding!==undefined&&!['utf8','base64'].includes(file.encoding))throw Error('交付编码不受支持')
 const bytes=file.encoding==='base64'?Uint8Array.from(atob(file.content),char=>char.charCodeAt(0)):new TextEncoder().encode(file.content)
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('')
 if(bytes.length!==file.bytes||hash!==file.sha256)throw Error('下载内容未通过 SHA-256 校验；没有保存文件')
 return bytes
}
export function MaterialMetadata({material}:{material:ResearchMaterial}){
 const p=material.provenance
 return <div className="a-dr-material-detail"><span>{material.name}<small>{material.text.length.toLocaleString()} 字符{p?.pages?' · '+p.pages+' 页':''}{p?.sheets?' · '+p.sheets+' 个工作表':''}</small></span>{!!p?.warnings.length&&<details><summary>{p.truncated?'材料已截断，请核对范围':'查看提取范围与限制'}</summary>{p.warnings.map((warning,i)=><p key={i}>{warning}</p>)}<code>原始文件 SHA-256 {p.sha256}</code></details>}</div>
}
export function FinalFormats({busy,onExport}:{busy:boolean;onExport:(format:'docx'|'pdf')=>void}){
 return <div className="a-dr-final-formats" aria-label="报告导出格式"><div><small>PUBLICATION READY</small><strong>把研究带到下一步。</strong><p>同一份已审查正文，按需生成 Word 或分页 PDF；不重新调用模型。</p></div><div>{([['docx','W','Word 文档','可编辑 · 对照表 · 引用链接'],['pdf','P','PDF 报告','分页阅读 · 证据图 · 页码']] as const).map(([format,letter,title,caption])=><button type="button" key={format} disabled={busy} onClick={()=>onExport(format)} aria-label={'导出 '+title}><b>{letter}</b><span><strong>{title}</strong><small>{caption}</small></span><span aria-hidden="true">↓</span></button>)}</div></div>
}
export function FollowUp({job,busy,onSubmit}:{job:WorkflowView;busy:boolean;onSubmit:(topic:string,reuseMaterials:boolean)=>void}){
 const [topic,setTopic]=useState(''),[reuse,setReuse]=useState(false)
 useEffect(()=>{setTopic('');setReuse(false)},[job.id])
 return <section className="a-dr-card a-dr-followup"><div className="a-dr-section-heading"><div><small>NEXT QUESTION</small><h2>沿着证据，继续追问。</h2></div><span aria-hidden="true">↗</span></div><p>新研究保留与本报告的关联，重新检索和核验来源。当前报告及其下载文件保持不变。</p><form onSubmit={event=>{event.preventDefault();if(topic.trim())onSubmit(topic.trim(),reuse)}}><label htmlFor="research-follow-up">下一步要解决什么问题？</label><textarea id="research-follow-up" aria-label="后续研究问题" rows={3} maxLength={4000} required value={topic} onChange={event=>setTopic(event.target.value)} disabled={busy} placeholder="例如：针对首选方案补充最近的反例，深入比较部署成本与退出策略。"/>{!!job.summary.materials?.length&&<label className="a-dr-reuse-materials"><input type="checkbox" checked={reuse} onChange={event=>setReuse(event.target.checked)} disabled={busy}/>沿用这项研究的 {job.summary.materials.length} 份参考材料</label>}<footer><small>先确认新目标，再启动独立的多 Agent 研究。</small><button className="a-dr-primary" disabled={busy||!topic.trim()} type="submit">建立后续研究 <span aria-hidden="true">→</span></button></footer></form></section>
}
export function ResearchLineage({job,busy,onParent}:{job:WorkflowView;busy:boolean;onParent:(id:string)=>void}){
 if(!job.parent)return null
 return <div className="a-dr-lineage"><span><small>FOLLOW-UP RESEARCH</small>源自 {job.summary.priorResearch?.title??'已完成的研究报告'}</span><button disabled={busy} onClick={()=>onParent(job.parent!.id)}>查看原报告 ↗</button></div>
}
