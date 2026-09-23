import {Fragment,useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react'
import {PanelDivider} from './PanelDivider'
import {Icon} from './Icon'
import {api} from '../api'
import {onPluginFlush} from '../plugins'

type Entry={name:string;path:string;directory:boolean;symlink:boolean;bytes:number;modifiedAt:number}
type Document={path:string;content?:string;hash?:string;bytes:number;binary:boolean;mimeType?:string;data?:string}
export function FileWorkspace({team,employee,children,onAttachImage,explorerWidth=230}:{explorerWidth?:number;team?:string;employee?:string;children?:ReactNode;onAttachImage?:(path:string)=>void}) {
  const [widthDraft,setWidthDraft]=useState<number>()
  useEffect(()=>setWidthDraft(undefined),[explorerWidth])
  const [folder,setFolder]=useState(''),[entries,setEntries]=useState<Entry[]>([]),[selected,setSelected]=useState('')
  const [document,setDocument]=useState<Document|null>(null),[draft,setDraft]=useState(''),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[hidden,setHidden]=useState(false)
  const [create,setCreate]=useState<{kind:'file'|'folder'|'rename';path?:string;parent?:string}|null>(null),[name,setName]=useState(''),[trash,setTrash]=useState<{id:string;path:string}|null>(null)
  const committing=useRef(false)
  const [saving,setSaving]=useState(false),[showFile,setShowFile]=useState(false)
  const [expanded,setExpanded]=useState(new Set([''])),[branches,setBranches]=useState<Record<string,Entry[]>>({})
  const call=(op:string,args:Record<string,unknown>={})=>api.call('workspace.'+op,{team,employee,...args})
  const load=async()=>{const paths=employee?[...expanded]:[folder];return Promise.all(paths.map(async value=>[value,(await call('list',{path:value||'.',hidden})).entries] as const))}
  const refresh=async()=>{const result=await load();setLoadError('');if(employee)setBranches(Object.fromEntries(result));else setEntries(result[0][1])}
  useEffect(()=>{let active=true,pending=false;const poll=async()=>{if(pending)return;pending=true;try{const result=await load();if(active){setLoadError('');if(employee)setBranches(Object.fromEntries(result));else setEntries(result[0][1])}}catch(e){if(active)setLoadError((e as Error).message)}finally{pending=false}};void poll();const timer=setInterval(poll,2000);return()=>{active=false;clearInterval(timer)}},[folder,team,employee,hidden,expanded])
  const toggle=(entry:Entry)=>{setFolder(expanded.has(entry.path)?entry.path.split('/').slice(0,-1).join('/'):entry.path);setExpanded(previous=>{const next=new Set(previous);if(next.has(entry.path))next.delete(entry.path);else next.add(entry.path);return next})}
  const dirty=!!document&&!document.binary&&draft!==document.content
  const save=async()=>{
    if(!dirty||!document)return
    setSaving(true)
    try{await call('write',{path:document.path,content:draft,hash:document.hash});setDocument(await call('read',{path:document.path}));setError('');await refresh()}
    catch(e){setError((e as Error).message);throw e}finally{setSaving(false)}
  }
  useEffect(()=>onPluginFlush(save),[dirty,draft,document,team,employee])
  const open=async(entry:Entry)=>{
    try{await save();setError('');if(entry.directory){setFolder(entry.path);setSelected('');setDocument(null)}else{const data=await call(/\.(png|jpe?g|gif|webp)$/i.test(entry.path)?'image':'read',{path:entry.path});setFolder(entry.path.split('/').slice(0,-1).join('/'));setSelected(entry.path);setDocument(data);setDraft(data.content||'');setShowFile(true)}}catch(e){setError((e as Error).message)}
  }
  const up=async(value:string)=>{try{await save();setFolder(value);setSelected('');setDocument(null);setError('')}catch{}}
  const mutate=async(action:()=>Promise<void>)=>{try{setError('');await save();await action();if(employee)setExpanded(previous=>new Set(previous));else await refresh()}catch(e){setError((e as Error).message)}}
  const submit=async()=>{
    if(committing.current||!create)return
    if(!name.trim()){setCreate(null);return}
    committing.current=true
    await mutate(async()=>{
    const value=name.trim();if(!value||value.includes('/')||value==='.'||value==='..')throw new Error('请输入有效的文件名')
    const parent=create?.kind==='rename'?create.path?.split('/').slice(0,-1).join('/')??'':create?.parent??''
    const next=[parent,value].filter(Boolean).join('/')
    if(create?.kind==='rename'){await call('move',{path:create.path,to:next});if(employee){const old=create.path!;setExpanded(previous=>new Set([...previous].map(p=>p===old||p.startsWith(old+'/')?next+p.slice(old.length):p)));setFolder(previous=>previous===old||previous.startsWith(old+'/')?next+previous.slice(old.length):previous)};if(selected===create.path||selected.startsWith(create.path+'/')){const moved=next+selected.slice(create.path!.length);setSelected(moved);setDocument(await call('read',{path:moved}))}}
    else if(create?.kind==='folder')await call('mkdir',{path:next})
    else {await call('write',{path:next,content:'',create:true});setSelected(next);setDocument(await call('read',{path:next}));setDraft('');setShowFile(true)}
    setCreate(null);setName('')
    });committing.current=false
  }
  const beginCreate=(kind:'file'|'folder')=>{setCreate({kind,parent:folder});setName('');if(employee)setExpanded(previous=>new Set([...previous,folder]))}
  const inlineEditor=(depth:number)=><form className="file-inline-editor" style={{paddingLeft:depth*12+4}} onSubmit={e=>{e.preventDefault();void submit()}}><Icon name={create?.kind==='folder'?'folder':'file'}/><input autoFocus name="file-name" aria-label="文件名称" placeholder={create?.kind==='folder'?'文件夹名称':'文件名称'} value={name} onChange={e=>setName(e.target.value)} onFocus={e=>{if(create?.kind==='rename')e.target.select()}} onBlur={()=>{if(!committing.current)setCreate(null)}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setCreate(null)}}}/></form>
  const pieces=folder.split('/').filter(Boolean)
  const rows=(items:Entry[],depth=0,parent=employee?'':folder):ReactNode=><>{create&&create.kind!=='rename'&&create.parent===parent&&inlineEditor(depth)}{items.map(entry=><Fragment key={entry.path}><div className={`file-row ${selected===entry.path?'selected':''}`} data-file={entry.path} style={{paddingLeft:depth*12}}>{create?.kind==='rename'&&create.path===entry.path?inlineEditor(0):<button className="file-open" onClick={()=>employee&&entry.directory?toggle(entry):void open(entry)}><Icon name={entry.directory?(expanded.has(entry.path)?'chevron-down':'chevron-right'):entry.symlink?'link':'file'}/><span>{entry.name}<small>{entry.directory?'文件夹':entry.bytes<1024?`${entry.bytes} B`:`${Math.round(entry.bytes/1024)} KB`}</small></span></button>}{onAttachImage&&!entry.directory&&/\.(png|jpe?g|gif|webp)$/i.test(entry.path)&&<button className="file-action" aria-label={`附加图片 ${entry.name}`} title="附加到消息" onClick={()=>{onAttachImage(entry.path);setShowFile(false)}}><Icon name="add"/></button>}<button className="file-action" aria-label={`重命名 ${entry.name}`} onClick={()=>{setCreate({kind:'rename',path:entry.path});setName(entry.name)}}><Icon name="edit"/></button><button className="file-action" aria-label={`删除 ${entry.name}`} onClick={()=>void mutate(async()=>{setTrash(await call('trash',{path:entry.path}));if(entry.directory&&employee){setExpanded(previous=>new Set([...previous].filter(p=>p!==entry.path&&!p.startsWith(entry.path+'/'))));setFolder(previous=>previous===entry.path||previous.startsWith(entry.path+'/')?entry.path.split('/').slice(0,-1).join('/'):previous)};if(selected===entry.path||selected.startsWith(entry.path+'/')){setSelected('');setDocument(null)}})}><Icon name="trash"/></button></div>{employee&&entry.directory&&expanded.has(entry.path)&&rows(branches[entry.path]??[],depth+1,entry.path)}</Fragment>)}</>
  return <div className={`file-workspace ${employee?'employee-files':''}`} style={{'--explorer-width':`${widthDraft??explorerWidth}px`,'--pane-width':'clamp(140px,var(--explorer-width),45%)'} as CSSProperties}>
    {employee&&<PanelDivider axis="x" value={widthDraft??explorerWidth} min={140} max={520} label="调整文件栏宽度" onDraft={setWidthDraft} onCommit={value=>api.call('settings.set',{explorerWidth:value})}/>}
    <div className="file-toolbar"><nav aria-label="当前文件夹"><button onClick={()=>void up('')}><Icon name="files"/> 项目</button>{pieces.map((piece,index)=><span key={index}> / <button onClick={()=>void up(pieces.slice(0,index+1).join('/'))}>{piece}</button></span>)}</nav><div><button className="explorer-action" title="新建文件夹" aria-label={employee?"新建文件夹":"＋ 文件夹"} onClick={()=>beginCreate('folder')}><Icon name="new-folder"/></button><button className="explorer-action" title="新建文件" aria-label={employee?"新建文件":"＋ 文件"} onClick={()=>beginCreate('file')}><Icon name="new-file"/></button><button className="explorer-action" title="隐藏文件" aria-label="隐藏文件" onClick={()=>setHidden(!hidden)} aria-pressed={hidden}><Icon name="eye"/></button><button onClick={()=>void refresh().catch(e=>setLoadError(e.message))} aria-label="刷新目录"><Icon name="refresh"/></button></div></div>

    {(error||loadError)&&<div className="workspace-error" role="alert">{error||loadError}</div>}
    {trash&&<div className="file-undo">已移入回收站：{trash.path}<button onClick={()=>void mutate(async()=>{await call('restore',{id:trash.id});setTrash(null)})}>撤销</button></div>}
    <div className="file-split"><div className="file-list" role="list" aria-label="项目文件">
      {!create&&!error&&!loadError&&!(employee?branches['']:entries)?.length&&<p className="file-empty">这个文件夹还是空的。<br/>可以新建文件，或交给员工开始工作。</p>}
      {rows(employee?(branches['']??[]):entries)}
    </div><div className="file-preview">{children&&<div className="workbench-tabs"><button className={!showFile?'active':''} onClick={()=>setShowFile(false)}>会话</button>{document&&<button className={showFile?'active':''} onClick={()=>setShowFile(true)}>{document.path}{dirty?' •':''}</button>}</div>}{children&&<div className="conversation-chat" hidden={showFile&&!!document}>{children}</div>}{(!children||showFile)&&(document?<><header><strong>{document.path}</strong><span>{dirty?'有未保存修改':'已保存'}<button title="放弃当前未保存修改，重新读取文件" onClick={async()=>{try{const data=await call('read',{path:document.path});setDocument(data);setDraft(data.content||'');setError('')}catch(e){setError((e as Error).message)}}}>重新载入文件</button>{!document.binary&&<button disabled={!dirty||saving} onClick={()=>void save().catch(()=>{})}>{saving?'保存中…':'保存文件'}</button>}</span></header>{document.mimeType&&document.data?<img className="file-preview-image" alt={document.path} src={`data:${document.mimeType};base64,${document.data}`}/>:document.binary?<div className="file-empty">此文件暂不支持文本预览。<br/>{document.bytes.toLocaleString()} 字节 · 文件保留在原目录中。</div>:<textarea aria-label="文件内容" spellCheck={false} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();void save().catch(()=>{})}}}/>}</>:<div className="file-empty"><span className="file-empty-icon">▰</span><h3>Build your next idea.</h3><p>这里就是你的项目文件夹。<br/>选择文件开始编辑，或点击员工打开对话。</p></div>)}</div></div>
  </div>
}
