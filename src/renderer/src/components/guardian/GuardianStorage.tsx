import {useEffect,useRef,useState} from 'react'
import type {GuardianSnapshot,GuardianStorageEntry,GuardianStorageScan} from '../../../../shared/guardian'
import {api} from '../../api'
import {Icon} from '../Icon'
import {GuardianDonut,GuardianTreemap} from './GuardianCharts'
import {bytes,percent,palette} from './GuardianFormat'
import '../../styles/guardian-storage.css'

type RootChoice='downloads'|'documents'|'home'|'custom'
type SavedView={scan:GuardianStorageScan|null;trail:string[];root:RootChoice;path:string}
let lastView:SavedView={scan:null,trail:[],root:'downloads',path:''}
const nameOf=(value:string)=>value.split('/').filter(Boolean).at(-1)||'磁盘根目录'
const statusLabel={running:'正在扫描',completed:'扫描完成',partial:'扫描部分完成',cancelled:'扫描已取消',failed:'扫描失败'}
const elapsed=(scan:GuardianStorageScan)=>{const seconds=Math.max(0,Math.round(((scan.finishedAt??scan.updatedAt)-scan.startedAt)/1000));return seconds<60?`${seconds} 秒`:`${Math.floor(seconds/60)} 分 ${seconds%60} 秒`}

export function GuardianStorage({snapshot}:{snapshot:GuardianSnapshot|null}){
  const [scan,setScan]=useState<GuardianStorageScan|null>(lastView.scan),[trail,setTrail]=useState(lastView.trail),[root,setRoot]=useState<RootChoice>(lastView.root),[manualPath,setManualPath]=useState(lastView.path),[busy,setBusy]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState<GuardianStorageEntry|null>(null),[showAll,setShowAll]=useState(false),[capacitySelection,setCapacitySelection]=useState<string|null>(null)
  const mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  useEffect(()=>{lastView={scan,trail,root,path:manualPath}},[scan,trail,root,manualPath])
  useEffect(()=>{
    if(!scan||scan.status!=='running')return
    let stopped=false,timer:ReturnType<typeof setTimeout>
    const poll=async()=>{try{const next=await api.call<GuardianStorageScan>('guardian.storage-status',{id:scan.id});if(!stopped){setScan(next);if(next.status==='running')timer=setTimeout(poll,500)}}catch(cause){if(!stopped)setError((cause as Error).message)}}
    timer=setTimeout(poll,400)
    return()=>{stopped=true;clearTimeout(timer)}
  },[scan?.id,scan?.status])
  const begin=async(input:{path?:string;root?:string},nextTrail?:string[])=>{
    if(busy)return
    setBusy(true);setError('');setSelected(null);setShowAll(false)
    try{
      if(scan?.status==='running')await api.call('guardian.storage-cancel',{id:scan.id})
      const next=await api.call<GuardianStorageScan>('guardian.storage-start',input),navigation=nextTrail??[next.path]
      lastView={scan:next,trail:navigation,root,path:manualPath}
      if(mounted.current){setScan(next);setTrail(navigation)}
    }catch(cause){if(mounted.current)setError((cause as Error).message)}finally{if(mounted.current)setBusy(false)}
  }
  const cancel=async()=>{if(!scan)return;setBusy(true);try{setScan(await api.call<GuardianStorageScan>('guardian.storage-cancel',{id:scan.id}));setError('')}catch(cause){setError((cause as Error).message)}finally{setBusy(false)}}
  const choose=async()=>{try{const result=await api.call<{path:string|null}>('workspace.choose',{path:manualPath||scan?.path});if(result.path){setRoot('custom');setManualPath(result.path)}}catch(cause){setError((cause as Error).message)}}
  const reveal=async(path:string)=>{try{await api.call('workspace.reveal',{from:{local:true,path}});setError('')}catch(cause){setError((cause as Error).message)}}
  const enter=(entry:GuardianStorageEntry)=>{if(entry.kind==='directory')void begin({path:entry.path},[...trail,entry.path]);else setSelected(entry)}
  const running=scan?.status==='running',disk=snapshot?.disk
  const entries=scan?.entries??[],currentSelected=entries.find(entry=>entry.path===selected?.path)??selected
  const items=entries.map((entry,index)=>({id:entry.path,label:entry.name,value:entry.bytes,color:palette[index%palette.length]}))
  if(scan?.otherBytes)items.push({id:'__scan_other__',label:`另外 ${scan.otherEntries} 项`,value:scan.otherBytes,color:'#abbfce'})
  const selectTile=(id:string)=>{if(id==='__other__'||id==='__scan_other__'){setShowAll(true);return}const entry=entries.find(item=>item.path===id);if(entry)enter(entry)}
  return <section className="guardian-storage" data-testid="guardian-storage" data-scan-id={scan?.id??''}>
    <div className="gs-overview">
      <article className="gs-card gs-capacity"><header><span className="gs-kicker">SYSTEM STORAGE</span><h2>磁盘容量</h2></header><GuardianDonut items={disk?[{id:'used',label:'已占用',value:disk.usedBytes,color:'#5485b9'},{id:'available',label:'可用',value:disk.availableBytes,color:'#d4e4e8'}]:[]} total={disk?.totalBytes} valueFormat={bytes} selectedId={capacitySelection} onSelect={setCapacitySelection} centerLabel={disk?`${percent(disk.usedPercent)} 已用`:'等待采样'} emptyLabel="正在读取磁盘容量"/><div className="gs-capacity-stats"><div><span>磁盘总量</span><strong>{bytes(disk?.totalBytes)}</strong></div><div><span>可用空间</span><strong>{bytes(disk?.availableBytes)}</strong></div></div><p className="gs-note">APFS 容器容量来自操作系统，与下方文件逻辑大小的口径不同。</p></article>
      <article className="gs-card gs-start"><header><div><span className="gs-kicker">SPACE EXPLORER</span><h2>每一份空间，都有去处</h2></div><Icon name="folder-opened"/></header><p>选择一个目录，展开真实的文件与文件夹占用。只有点击开始，才会扫描你选定的范围。</p><div className="gs-start-controls"><label>扫描范围<select data-testid="guardian-storage-root" value={root} onChange={event=>setRoot(event.target.value as RootChoice)} disabled={busy}><option value="downloads">下载 Downloads</option><option value="documents">文稿 Documents</option><option value="home">个人目录 Home</option><option value="custom">选择其他目录</option></select></label>{root==='custom'&&<label className="gs-path-label">本机绝对路径<div><input data-testid="guardian-storage-path" aria-label="要扫描的本机目录" value={manualPath} onChange={event=>setManualPath(event.target.value)} placeholder="/Users/你的用户名/目录"/><button onClick={()=>void choose()} disabled={busy} title="选择本机文件夹" aria-label="选择本机文件夹"><Icon name="folder-opened"/></button></div></label>}</div><div className="gs-start-actions"><button data-testid="guardian-storage-start" className="gs-primary" disabled={busy||(root==='custom'&&!manualPath.trim())} onClick={()=>void begin(root==='custom'?{path:manualPath.trim()}:{root})}><Icon name="search"/>{busy?'正在处理…':running?'扫描所选目录':'开始扫描'}</button>{running&&<button data-testid="guardian-storage-cancel" disabled={busy} onClick={()=>void cancel()}>取消扫描</button>}{scan&&!running&&<button data-testid="guardian-storage-rescan" disabled={busy} onClick={()=>void begin({path:scan.path},trail)}><Icon name="refresh"/>重新扫描</button>}</div><div className="gs-scope-promise"><Icon name="shield"/><span>只读元数据 · 不读取文件内容 · 不自动清理</span></div></article>
    </div>
    {error&&<div className="gs-error" role="alert"><Icon name="warning"/>{error}</div>}
    <article className="gs-card gs-inspector">
      <header className="gs-inspector-header"><div><span className="gs-kicker">DIRECTORY MAP</span><h2>{scan?nameOf(scan.path):'文件空间地图'}</h2></div>{scan&&<div className={`gs-status ${scan.status}`} data-testid="guardian-storage-status" data-status={scan.status} aria-live="polite"><i/>{statusLabel[scan.status]}</div>}</header>
      {scan?<>
        <nav className="gs-breadcrumb" aria-label="目录扫描路径">{trail.map((directory,index)=><span key={directory}>{index>0&&<Icon name="chevron-right"/>}<button data-storage-breadcrumb={index} title={directory} aria-current={index===trail.length-1?'location':undefined} disabled={busy||index===trail.length-1} onClick={()=>void begin({path:directory},trail.slice(0,index+1))}>{index===0&&<Icon name="folder"/>}{nameOf(directory)}</button></span>)}<button className="gs-reveal-root" title="在 Finder 中显示当前目录" aria-label="在 Finder 中显示当前目录" onClick={()=>void reveal(scan.path)}><Icon name="link-external"/></button></nav>
        <div className="gs-progress-summary"><div><span>{running?'已发现的文件大小':'已统计文件大小'}</span><strong data-testid="guardian-storage-bytes" data-bytes={scan.bytes}>{bytes(scan.bytes)}</strong></div><div><span>文件</span><strong>{scan.files.toLocaleString()}</strong></div><div><span>目录</span><strong>{scan.directories.toLocaleString()}</strong></div><div><span>{running?'待扫描目录':'扫描耗时'}</span><strong>{running?scan.pendingDirectories.toLocaleString():elapsed(scan)}</strong></div></div>
        {running&&<div className="gs-scanning"><div role="progressbar" aria-label="正在扫描目录，完整大小尚未知"/><span>正在发现文件，已扫描大小会持续增长。</span></div>}
        {scan.status==='partial'&&<div className="gs-warning"><Icon name="warning"/>有 {scan.errorCount} 处无法读取；图中仅包含已成功统计的数据。</div>}{scan.status==='cancelled'&&<div className="gs-warning">扫描已停止。当前仅展示取消前发现的内容。</div>}{scan.status==='failed'&&<div className="gs-warning">未能完成目录读取，请查看错误或选择其他目录。</div>}
        <div className="gs-space-grid"><div className="gs-map"><GuardianTreemap items={items} valueFormat={bytes} selectedId={currentSelected?.path} onSelect={selectTile} height={290} maxItems={28} emptyLabel={running?'正在建立空间地图…':scan.files?'已发现的文件大小为 0 字节':'此目录没有可统计的常规文件'}/><p className="gs-map-hint"><Icon name="info"/>方块面积对应文件逻辑大小。点击文件夹继续展开；点击文件查看详情。</p></div><div className="gs-breakdown"><h3>目录内占用</h3>{entries.slice(0,showAll?200:8).map((entry,index)=><div className={`gs-entry ${currentSelected?.path===entry.path?'selected':''}`} key={entry.path}><button data-storage-path={entry.path} title={entry.path} disabled={busy} onClick={()=>enter(entry)}><i style={{background:palette[index%palette.length]}}/><Icon name={entry.kind==='directory'?'folder':'file'}/><span><strong>{entry.name}</strong><small>{entry.kind==='directory'?`${entry.files.toLocaleString()} 个文件`:'文件'}{entry.partial?' · 部分读取':''}</small></span><b>{bytes(entry.bytes)}</b>{entry.kind==='directory'&&<Icon name="chevron-right"/>}</button></div>)}{entries.length>8&&<button className="gs-show-all" onClick={()=>setShowAll(!showAll)}>{showAll?'收起列表':`查看 ${entries.length} 项`}</button>}{scan.otherEntries>0&&<p className="gs-note">另 {scan.otherEntries.toLocaleString()} 项 · {bytes(scan.otherBytes)}，已计入总量。</p>}</div></div>
        {currentSelected&&<div className="gs-selection" data-testid="guardian-storage-selection"><Icon name="file"/><div><strong>{currentSelected.name}</strong><span>{bytes(currentSelected.bytes)} · {currentSelected.path}</span></div><button onClick={()=>void reveal(currentSelected.path)}><Icon name="link-external"/>在 Finder 中显示</button><button aria-label="关闭文件详情" onClick={()=>setSelected(null)}><Icon name="close"/></button></div>}
        {scan.largestFiles.length>0&&<section className="gs-largest"><header><h3>占用最大的文件</h3><span>最多显示 40 个已发现文件</span></header><div>{scan.largestFiles.map((file,index)=><button className="gs-largest-file" key={file.path} data-storage-file={file.path} title={`在 Finder 中显示 ${file.path}`} onClick={()=>void reveal(file.path)}><small>{String(index+1).padStart(2,'0')}</small><Icon name="file"/><span><strong>{file.name}</strong><em>{file.path.slice(scan.path.length+1)}</em></span><b>{bytes(file.bytes)}</b><Icon name="link-external"/></button>)}</div></section>}
        {scan.errorCount>0&&<details className="gs-errors"><summary>{scan.errorCount} 处读取错误 · 点击查看</summary>{scan.errors.map((item,index)=><div key={`${item.path}-${index}`}><code>{item.path}</code><p>{item.message}</p></div>)}{scan.errorCount>scan.errors.length&&<p>另有 {scan.errorCount-scan.errors.length} 处错误，当前显示前 100 条。</p>}</details>}
        <footer className="gs-scan-footer"><span>逻辑文件大小；隐藏文件已计入，硬链接按路径统计。</span><span>跳过 {scan.skippedSymlinks} 个软链接 · {scan.skippedSpecial} 个特殊文件</span></footer>
      </>:<div className="gs-empty"><div className="gs-empty-map" aria-hidden="true"><i/><i/><i/><i/></div><h3>从你关心的目录开始</h3><p>扫描后，这里会呈现可下钻的空间地图，帮助你找到大文件与目录。</p><span>建议先选择「下载」，结果更快，也便于理解。</span></div>}
    </article>
  </section>
}
