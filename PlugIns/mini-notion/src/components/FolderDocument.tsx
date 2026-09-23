import { useEffect,useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Page } from '../types';
import { useWorkspace } from '../store';
import { parseCSV } from '../transfer';

export function FolderDocument({page}:{page:Page}) {
  const {api,navigate,workspace}=useWorkspace(),source=page.sourceFile!;
  const [document,setDocument]=useState<{content:string;hash:string}|null>(null),[draft,setDraft]=useState(''),[editing,setEditing]=useState(false),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  useEffect(()=>{let gone=false;if(editing){if(document&&source.hash!==document.hash)setError('文件已在外部修改；你的草稿已保留，保存时会校验冲突。');return}setDocument(null);setError('');if(['text','markdown','csv'].includes(source.kind))void Promise.all([api('fs.read',{path:source.path}),api('fs.draft-read',{key:source.path})]).then(([value,saved])=>{if(!gone){setDocument(saved?.base||value);setDraft(saved?.content??value.content);if(saved?.base)setEditing(true)}}).catch(e=>!gone&&setError(String(e.message)));return()=>{gone=true}},[source.path,source.hash,editing]);
  const url=(window.native?.workspaceURL?.(source.path)||'')+`?v=${source.hash}`;
  let rows:string[][]=[];let csvError='';if(source.kind==='csv'&&document)try{rows=parseCSV(document.content)}catch(e){csvError=String((e as Error).message)}
  const save=async()=>{setSaving(true);try{const value=await api('fs.write',{path:source.path,content:draft,hash:document?.hash});await api('fs.draft-write',{key:source.path,draft:null});setDocument(value);setEditing(false);setError('')}catch(e){setError(String((e as Error).message));throw e}finally{setSaving(false)}};
  useEffect(()=>window.native?.onFlush(async()=>{if(editing&&document)await save()}),[editing,draft,document,source.path]);
  const cancel=async()=>{await api('fs.draft-write',{key:source.path,draft:null});setEditing(false)};
  const link=(href:string)=>{if(/^(https?:|mailto:|data:)/i.test(href))return href;const dir=source.path.split('/').slice(0,-1).join('/');return window.native?.workspaceURL?.((dir?dir+'/':'')+href)||href};
  return <article className="folder-document"><header><div><small>WORKSPACE FILE</small><h1>{page.title}</h1><code>{source.path}</code></div>{document&&<button className="secondary-button" onClick={()=>editing?void cancel().catch(e=>setError(e.message)):setEditing(true)}>{editing?'取消编辑':'编辑文件'}</button>}</header>
    {error&&<div className="folder-file-error" role="alert">{error}</div>}
    {source.kind==='directory'?<div className="folder-directory">{workspace?.pages.filter(p=>p.parentId===page.id&&!p.trashedAt).map(p=><button key={p.id} onClick={()=>navigate(p.id)}>{p.sourceFile?.kind==='directory'?'▸':'↗'} {p.title}</button>)}</div>:
      editing?<><textarea className="folder-source-editor" aria-label="文件内容" value={draft} onChange={e=>{const content=e.target.value;setDraft(content);void api('fs.draft-write',{key:source.path,draft:{content,base:document}}).catch(error=>setError(error.message))}}/><button className="primary-button" disabled={saving} onClick={()=>void save().catch(()=>{})}>{saving?'保存中…':'保存文件'}</button></>:
      source.kind==='markdown'?<div className="folder-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={link}>{document?.content||''}</ReactMarkdown></div>:
      source.kind==='csv'&&document?<div className="folder-csv">{csvError&&<p role="alert">{csvError}</p>}<table><tbody>{rows.map((row,i)=><tr key={i}>{row.map((value,j)=>i===0?<th key={j}>{value}</th>:<td key={j}>{value}</td>)}</tr>)}</tbody></table></div>:
      source.kind==='image'?<img className="folder-image" src={url} alt={page.title}/>:
      source.kind==='pdf'?<object className="folder-pdf" data={url} type="application/pdf"><a href={url} download>下载 PDF</a></object>:
      document?<pre className="folder-plain">{document.content}</pre>:source.kind==='binary'?<p>此文件保留在工作文件夹中。<a href={url} download>下载原文件</a></p>:null}
  </article>;
}
