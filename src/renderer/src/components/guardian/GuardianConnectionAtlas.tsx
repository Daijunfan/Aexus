import type {GuardianConnection} from '../../../../shared/guardian'
import {Icon} from '../Icon'
import '../../styles/guardian-network-atlas.css'

const scopes=['public','private','loopback','listening'] as const
const labels={public:'公网',private:'局域网',loopback:'回环',listening:'监听'}

type Owner={pid:number;names:Set<string>;count:number;scopes:Record<GuardianConnection['scope'],number>;inbound:number}
type Props={connections:GuardianConnection[];loaded:boolean;failed:boolean;activePid:number|null;onFocus:(pid:number|null)=>void}

export function GuardianConnectionAtlas({connections,loaded,failed,activePid,onFocus}:Props){
 const owners=new Map<number,Owner>()
 let unknown=0
 for(const connection of connections){
  if(connection.pid===null){unknown++;continue}
  const owner=owners.get(connection.pid)??{pid:connection.pid,names:new Set<string>(),count:0,scopes:{public:0,private:0,loopback:0,listening:0},inbound:0}
  owner.names.add(connection.process)
  owner.count++
  owner.scopes[connection.scope]++
  if(connection.direction==='inbound')owner.inbound++
  owners.set(connection.pid,owner)
 }
 const ranked=[...owners.values()].sort((a,b)=>b.count-a.count||a.pid-b.pid)
 const displayed=activePid===null?ranked.slice(0,6):[...ranked.filter(item=>item.pid===activePid),...ranked.filter(item=>item.pid!==activePid)].slice(0,6)
 const maximum=Math.max(1,...ranked.map(item=>item.count))
 const remainder=connections.length-unknown-displayed.reduce((total,item)=>total+item.count,0)
 return <section className="g-card gn-atlas" data-testid="guardian-network-atlas" data-total={connections.length} data-owned={connections.length-unknown} data-unowned={unknown}>
  <header className="gn-atlas-head">
   <div><span className="g-eyebrow">PROCESS / TCP CONNECTION ATLAS</span><h3>这台 Mac 的连接关联</h3><p>按系统采样的 PID 汇总端点；点击进程，联动下方 TCP 列表与地球筛选。</p></div>
   <div className="gn-atlas-metrics"><span>已关联 PID <strong>{loaded&&!failed?connections.length-unknown:'—'}</strong></span><span>归属未知 <strong>{loaded&&!failed?unknown:'—'}</strong></span></div>
  </header>
  <div className="gn-atlas-body">
   <div className="gn-atlas-host">
    <div className="gn-atlas-orbit"><i/><i/><div className="gn-atlas-core"><Icon name="device-desktop"/><strong>{loaded&&!failed?connections.length:'—'}</strong><small>TCP 端点</small></div></div>
    <button aria-label="显示全部进程的网络连接" aria-pressed={activePid===null} onClick={()=>onFocus(null)}>这台 Mac <Icon name="arrow-right"/></button>
    <small>关联示意 · 不代表物理网络路径</small>
   </div>
   <div className="gn-atlas-owners" role="group" aria-label="按 PID 排序的 TCP 连接关联">
    {displayed.map(item=><button key={item.pid} data-pid={item.pid} data-count={item.count} aria-pressed={activePid===item.pid} aria-label={`查看 PID ${item.pid} 的 ${item.count} 个 TCP 端点`} onClick={()=>onFocus(item.pid)}>
     <span className="gn-atlas-wire"><i style={{width:item.count/maximum*100+'%'}}/></span>
     <span className="gn-atlas-owner"><strong>{item.names.size===1?[...item.names][0]:item.names.size+' 个进程标签'}</strong><small>PID {item.pid}{item.inbound?' · '+item.inbound+' 个入站匹配':''}</small></span>
     <span className="gn-atlas-scopes" aria-label={scopes.map(scope=>labels[scope]+item.scopes[scope]).join('、')}>{scopes.map(scope=><i key={scope} className={scope} style={{width:item.scopes[scope]/item.count*100+'%'}} title={labels[scope]+' '+item.scopes[scope]}/>)}</span>
     <b>{item.count}</b><Icon name="arrow-right"/>
    </button>)}
    {loaded&&!failed&&!ranked.length&&<div className="gn-atlas-empty">当前没有可归属到 PID 的 TCP 端点；未知连接仍可在下方列表查看。</div>}
    {loaded&&!failed&&remainder>0&&<p className="gn-atlas-rest">其余 {ranked.length-displayed.length} 个 PID · {remainder} 个 TCP 端点，可在下方列表搜索</p>}
    {(!loaded||failed)&&<p className="gn-atlas-rest">{failed?'网络采样暂不可用':'等待首次网络采样'}</p>}
   </div>
  </div>
  <footer className="gn-atlas-foot"><span>端点范围</span>{scopes.map(scope=><span key={scope}><i className={scope}/>{labels[scope]}</span>)}<small>数量来自当前 TCP 快照，未采集连接内容或逐连接吞吐。</small></footer>
 </section>
}
