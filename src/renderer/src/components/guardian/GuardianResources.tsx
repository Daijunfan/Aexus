import {useEffect,useMemo,useState,type CSSProperties} from 'react'
import type {GuardianSnapshot} from '../../../../shared/guardian'
import {Icon} from '../Icon'
import {useDialogFocus} from '../../office/useDialogFocus'
import {GuardianCoreHeatmap,GuardianDonut,GuardianTimeSeries,GuardianTreemap} from './GuardianCharts'
import {bytes,memoryParts,palette,percent,pressureLabel,time} from './GuardianFormat'

type Process=GuardianSnapshot['processes'][number]
type Props={snapshot:GuardianSnapshot|null;minutes:1|5|15;onProcess:(pid:number)=>void}
export function GuardianCpu({snapshot,minutes,onProcess}:Props){
 const [core,setCore]=useState<number|null>(null)
 const cores=snapshot?.cpu.cores??[]
 const points=(snapshot?.history??[]).map(point=>({at:point.at,values:{cpu:core===null?point.cpuPercent:point.cores?.[core]??null}}))
 const processes=[...(snapshot?.processes??[])].sort((a,b)=>b.cpuPercent-a.cpuPercent).slice(0,8)
 const hottest=cores.length?cores.reduce((best,index,indexOf)=>index>cores[best]?indexOf:best,0):null
 const busyCores=cores.filter(value=>value>=80).length
 return <div className="g-domain g-compute-room" data-testid="guardian-cpu-panel">
  <div className="g-section-intro"><div><span className="g-eyebrow">SILICON OBSERVATORY</span><h2>处理器机舱</h2><p>看见每颗核心此刻有多忙，点选任一核心追踪变化，再深入具体进程。</p></div><div className="g-primary-value">{percent(core===null?snapshot?.cpu.usagePercent:cores[core])}<small>{core===null?'整机 CPU 使用率':`核心 ${core+1} 使用率`}</small></div></div>
  <section className="g-card g-silicon-panel">
   <header className="g-card-head"><div><span className="g-eyebrow">COMPUTE DECK / MAC</span><h3>核心阵列 · 负载实时映射</h3><p>{snapshot?.host.cpuModel??'正在读取处理器'} · {snapshot?.host.cpuCount??'—'} 核心</p></div><span className="g-silicon-sample">{snapshot?`采样于 ${time(snapshot.sampledAt)}`:'等待采样'}</span></header>
   <div className="g-silicon-layout">
    <div className="g-silicon-stage" data-testid="guardian-silicon-board" data-core-count={cores.length} style={{'--die-columns':Math.max(1,Math.min(6,Math.ceil(cores.length/3)))} as CSSProperties}>
     <div className="g-silicon-stage-caption">MAC / CORE ARRAY <span>{String(cores.length).padStart(2,'0')} CORES</span></div>
     <div className="g-silicon-chip">
      <div className="g-silicon-chip-heading"><span>CPU</span><span>ACTIVITY / %</span></div>
      <GuardianCoreHeatmap values={cores} selectedIndex={core} onSelect={setCore} label="选择 CPU 核心"/>
     </div>
     <div className="g-silicon-stage-footer">负载亮度 · 真实采样<span>0% — 100%</span></div>
    </div>
    <div className="g-silicon-console">
     <span className="g-silicon-overline">LIVE OBSERVATION</span>
     <strong className="g-silicon-total">{percent(snapshot?.cpu.usagePercent)}<small>整机 CPU 占用</small></strong>
     <div className="g-silicon-console-metrics"><div><small>高负载核心 ≥80%</small><strong>{cores.length?busyCores:'—'}<span> / {cores.length||'—'}</span></strong></div><div><small>当前最忙核心</small><strong>{hottest===null?'—':`#${String(hottest+1).padStart(2,'0')}`}</strong></div></div>
     <div className="g-silicon-console-selection"><span>{core===null?'正在观察整机':`正在观察 CPU ${String(core+1).padStart(2,'0')}`}</span><strong>{percent(core===null?snapshot?.cpu.usagePercent:cores[core])}</strong><p>{core===null?'选中芯片上的核心，下面的曲线会同步聚焦。':'下方趋势已切换为该核心的真实采样。'}</p></div>
     <div className="g-silicon-actions">{hottest!==null&&<button onClick={()=>setCore(hottest)}><Icon name="chip"/>聚焦最忙核心</button>}{core!==null&&<button onClick={()=>setCore(null)}>查看整机</button>}</div>
     {processes[0]&&<button className="g-silicon-top-process" onClick={()=>onProcess(processes[0].pid)}><span><small>当前 CPU 占用最高的可见进程</small><strong>{processes[0].name} · {percent(processes[0].cpuPercent)}</strong></span><Icon name="arrow-right"/></button>}
    </div>
   </div>
   <p className="g-silicon-disclaimer">芯片阵列为交互示意，非真实物理排布；色彩仅表达 CPU 负载，不代表温度或安全风险。</p>
  </section>
  <div className="g-two-columns g-compute-details">
   <section className="g-card"><header className="g-card-head"><div><h3>{core===null?'整机负载趋势':`核心 ${core+1} 的负载趋势`}</h3><p>点选芯片上的核心切换；用指针或方向键探索真实历史。</p></div><span className="g-tag">最近 {minutes} 分钟</span></header><GuardianTimeSeries points={points} series={[{key:'cpu',label:core===null?'CPU':`核心 ${core+1}`,color:palette[0]}]} domain={[0,100]} valueFormat={percent} windowMinutes={minutes} height={235} ariaLabel="CPU 历史趋势"/></section>
   <section className="g-card"><header className="g-card-head"><div><h3>谁在使用处理器</h3><p>单核口径统计，多核心进程可能超过 100%。点击查看进程。</p></div></header><div className="g-ranked-list">{processes.map(process=><button key={process.pid} onClick={()=>onProcess(process.pid)} aria-label={`查看进程 ${process.name} ${process.pid}`}><span className="g-process-badge">{process.name.slice(0,1)}</span><span className="g-ranked-name">{process.name}<small>PID {process.pid}</small></span><span className="g-ranked-track"><i style={{width:`${process.cpuPercent/Math.max(1,...processes.map(p=>p.cpuPercent))*100}%`}}/></span><strong>{percent(process.cpuPercent)}</strong><Icon name="chevron-right"/></button>)}</div></section>
  </div>
 </div>
}
export function GuardianMemory({snapshot,minutes,onProcess}:Props){
 const [part,setPart]=useState('wired'),[otherProcesses,setOtherProcesses]=useState<string[]>([])
 const memory=snapshot?.memory,parts=memoryParts(memory),selected=parts.find(item=>item.id===part)
 const processes=[...(snapshot?.processes??[])].sort((a,b)=>b.memoryBytes-a.memoryBytes)
 return <div className="g-domain" data-testid="guardian-memory-panel"><div className="g-section-intro"><div><span className="g-eyebrow">MEMORY</span><h2>看见内存怎样被使用。</h2><p>物理占用、可回收空间与进程驻留分开呈现，读懂数字背后的含义。</p></div><div className={`g-pressure ${memory?.pressure??'unknown'}`}><span/><strong>内存压力{memory?pressureLabel[memory.pressure]:'读取中'}</strong></div></div>
 <div className="g-two-columns"><section className="g-card"><header className="g-card-head"><div><h3>物理内存组成</h3><p>点击环形分区或图例，查看这部分内存的含义</p></div><strong>{bytes(memory?.totalBytes)}</strong></header><GuardianDonut items={parts} selectedId={part} onSelect={setPart} valueFormat={bytes} centerLabel="物理内存"/><div className="g-selection-note" aria-live="polite"><i style={{background:selected?.color}}/><div><strong>{selected?.label??'等待内存数据'} · {bytes(selected?.value)}</strong><p>{selected?.description??'采样完成后可查看内存组成。'}</p></div></div></section>
 <section className="g-card"><header className="g-card-head"><div><h3>内存随时间变化</h3><p>悬停查看物理驻留、压缩与可回收后可用空间</p></div></header><GuardianTimeSeries points={(snapshot?.history??[]).map(p=>({at:p.at,values:{used:p.memory?.usedBytes??null,available:p.memory?.availableBytes??null,compressed:p.memory?.compressedBytes??null}}))} series={[{key:'used',label:'物理驻留',color:palette[1]},{key:'available',label:'可回收后可用',color:palette[0]},{key:'compressed',label:'压缩',color:palette[2]}]} valueFormat={bytes} domain={[0,memory?.totalBytes??1]} windowMinutes={minutes} height={230} ariaLabel="内存历史趋势"/><div className="g-inline-facts"><span>可回收后可用 <b>{bytes(memory?.availableBytes)}</b></span><span>交换区 <b>{bytes(memory?.swapUsedBytes)} / {bytes(memory?.swapTotalBytes)}</b></span></div></section></div>
 <section className="g-card"><header className="g-card-head"><div><h3>进程内存地图</h3><p>矩形面积对应进程驻留内存。点选进程查看详情；共享内存页可能被多个进程重复统计。</p></div><span className="g-tag">{processes.length} 个进程</span></header><GuardianTreemap items={processes.map(process=>({id:String(process.pid),label:process.name,value:process.memoryBytes}))} valueFormat={bytes} height={290} maxItems={24} onSelect={(id,members)=>{if(id==='__other__')setOtherProcesses(members??[]);else onProcess(Number(id))}}/>{!!otherProcesses.length&&<div className="g-other-processes"><header><strong>其他 {otherProcesses.length} 个较小进程</strong><button onClick={()=>setOtherProcesses([])}>收起</button></header><div>{processes.filter(p=>otherProcesses.includes(String(p.pid))).slice(0,30).map(p=><button key={p.pid} onClick={()=>onProcess(p.pid)}><span>{p.name}</span><strong>{bytes(p.memoryBytes)}</strong></button>)}</div><small>展示其中最大的 30 个；在进程页可搜索全部 PID。</small></div>}<p className="g-caption">这是可见进程 RSS 的相对分布，不是整机物理内存分区；“其他”聚合了较小项。</p></section></div>
}
export function GuardianProcesses({snapshot,onProcess}:Omit<Props,'minutes'>){
 const [metric,setMetric]=useState<'cpu'|'memory'>('memory'),[search,setSearch]=useState(''),[limit,setLimit]=useState(30),[drillIds,setDrillIds]=useState<string[]|null>(null)
 const rows=useMemo(()=>[...(snapshot?.processes??[])].filter(p=>(!drillIds||drillIds.includes(String(p.pid)))&&`${p.name} ${p.pid}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>metric==='cpu'?b.cpuPercent-a.cpuPercent:b.memoryBytes-a.memoryBytes),[snapshot,search,metric,drillIds])
 useEffect(()=>{setLimit(30);setDrillIds(null)},[search,metric])
 const counts=new Map<number,number>();for(const connection of snapshot?.network.connections??[])if(connection.pid!==null)counts.set(connection.pid,(counts.get(connection.pid)??0)+1)
 return <div className="g-domain" data-testid="guardian-processes-panel"><div className="g-section-intro"><div><span className="g-eyebrow">PROCESSES</span><h2>从资源占用，找到具体进程。</h2><p>切换 CPU / 内存地图，搜索并查看进程的采样变化与网络连接。</p></div><div className="g-primary-value">{snapshot?.processes.length??'—'}<small>系统可见进程</small></div></div>
 <section className="g-card"><header className="g-card-head"><div className="g-segmented"><button aria-pressed={metric==='memory'} onClick={()=>setMetric('memory')}>驻留内存</button><button aria-pressed={metric==='cpu'} onClick={()=>setMetric('cpu')}>CPU 占用</button></div><label className="g-search"><Icon name="search"/><input aria-label="搜索进程" placeholder="搜索进程名称或 PID" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button aria-label="清除进程搜索" onClick={()=>setSearch('')}>×</button>}</label></header>{drillIds&&<div className="g-filter-row"><span>已展开 {drillIds.length} 个较小进程</span><button onClick={()=>setDrillIds(null)}>返回全部进程</button></div>}<GuardianTreemap items={rows.map(p=>({id:String(p.pid),label:p.name,value:metric==='cpu'?p.cpuPercent:p.memoryBytes}))} valueFormat={metric==='cpu'?percent:bytes} maxItems={24} height={300} onSelect={(id,members)=>{if(id==='__other__')setDrillIds(members??[]);else onProcess(Number(id))}}/><p className="g-caption">{metric==='cpu'?'面积按进程 CPU 相对占用分配，进程 CPU 使用单核口径，可超过 100%。':'面积按 RSS 相对占用分配，共享页可能重复计入各进程。'} 点击矩形查看详情。</p>
 <div className="g-table-wrap"><table className="g-table"><thead><tr><th>进程</th><th>PID</th><th>CPU</th><th>驻留内存</th><th>TCP 连接</th><th/></tr></thead><tbody>{rows.slice(0,limit).map(p=><tr key={p.pid} tabIndex={0} onClick={()=>onProcess(p.pid)} onKeyDown={e=>{if(e.key==='Enter')onProcess(p.pid)}} aria-label={`查看进程 ${p.name} ${p.pid}`}><td><strong>{p.name}</strong></td><td><code>{p.pid}</code></td><td>{percent(p.cpuPercent)}</td><td>{bytes(p.memoryBytes)}</td><td>{counts.get(p.pid)??0}</td><td><Icon name="chevron-right"/></td></tr>)}</tbody></table>{!rows.length&&<div className="g-empty">{snapshot?.issues.some(i=>i.startsWith('ps:'))?'进程数据暂不可读取':'没有匹配的进程'}<button onClick={()=>setSearch('')}>清除搜索</button></div>}</div><footer className="g-table-footer"><span>按{metric==='cpu'?'CPU':'内存'}排序 · {rows.length} 个进程</span>{rows.length>limit&&<button onClick={()=>setLimit(limit+50)}>加载更多</button>}</footer></section></div>
}
export function GuardianProcessInspector({process:initial,snapshot,onClose,onConnections,onInvestigate}:{process:Process;snapshot:GuardianSnapshot|null;onClose:()=>void;onConnections:(pid:number)=>void;onInvestigate?:(pid:number)=>void}){
 useDialogFocus('.g-process-inspector',true)
 const process=snapshot?.processes.find(p=>p.pid===initial.pid)??initial,present=!!snapshot?.processes.some(p=>p.pid===initial.pid)
 const [points,setPoints]=useState<{at:number;values:{cpu:number;memory:number}}[]>([]),[copied,setCopied]=useState('')
 useEffect(()=>{if(!snapshot||!present)return;setPoints(previous=>previous.at(-1)?.at===snapshot.sampledAt?previous:[...previous,{at:snapshot.sampledAt,values:{cpu:process.cpuPercent,memory:process.memoryBytes}}].slice(-120))},[snapshot?.sampledAt,present,process.cpuPercent,process.memoryBytes])
 const connections=(snapshot?.network.connections??[]).filter(c=>c.pid===process.pid)
 return <div className="g-modal-layer" onKeyDown={e=>{if(e.key==='Escape')onClose()}}><div className="g-modal-backdrop" onClick={onClose}/><section className="g-process-inspector" role="dialog" aria-modal="true" aria-label={`进程详情 ${process.name}`}><header><div><span className="g-eyebrow">PROCESS INSPECTOR</span><h2>{process.name}</h2><p>PID {process.pid} · {present?'当前采样可见':'已不在当前采样'}</p></div><button aria-label="关闭进程详情" onClick={onClose}><Icon name="close"/></button></header><div className="g-inspector-values"><div><span>CPU · 单核口径</span><strong>{percent(process.cpuPercent)}</strong></div><div><span>驻留内存</span><strong>{bytes(process.memoryBytes)}</strong></div><div><span>TCP 连接</span><strong>{connections.length}</strong></div></div><h3>选中后的 CPU 变化</h3><GuardianTimeSeries points={points} series={[{key:'cpu',label:'进程 CPU',color:palette[0]}]} valueFormat={percent} height={150} ariaLabel="进程 CPU 变化"/><h3>选中后的驻留内存</h3><GuardianTimeSeries points={points} series={[{key:'memory',label:'驻留内存',color:palette[1]}]} valueFormat={bytes} height={150} ariaLabel="进程内存变化"/><p className="g-caption">从打开详情时开始积累真实采样，不回填此前的进程历史。</p><div className="g-inspector-actions"><button className="g-primary" onClick={()=>onConnections(process.pid)}>查看此进程的网络连接 <Icon name="arrow-right"/></button>{onInvestigate&&<button onClick={()=>onInvestigate(process.pid)}>发起调查 <Icon name="arrow-right"/></button>}<button onClick={async()=>{try{await navigator.clipboard.writeText(String(process.pid));setCopied('PID 已复制')}catch{setCopied('复制失败，请手动选择 PID')}}}>{copied||'复制 PID'}</button></div></section></div>
}
